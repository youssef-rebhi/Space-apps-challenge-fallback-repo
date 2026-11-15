# Firm Ground server: serves the app AND relays scout reports tablet -> helmet.
# Run from this folder:  python3 server.py   then open http://<this-PC-IP>:8000
# Standard library only.
import json, os, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

EVENTS, LOCK, NEXT = [], threading.Lock(), [1]
PAIRS = {}  # short pairing code -> route (so the QR code stays small)

class H(SimpleHTTPRequestHandler):
    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/api/events"):
            since = 0
            if "since=" in self.path:
                try: since = int(self.path.split("since=")[1].split("&")[0])
                except ValueError: pass
            with LOCK: out = [e for e in EVENTS if e["id"] > since]
            return self._json({"events": out})
        if self.path.startswith("/api/phone-url"):  # the address the helmet phone should open (QR code)
            return self._json({"url": PHONE_URL[0]})
        if self.path.startswith("/api/pair"):
            c = self.path.split("c=")[1].split("&")[0].upper() if "c=" in self.path else ""
            with LOCK: e = PAIRS.get(c)
            return self._json(e or {"error": "unknown code"}, 200 if e else 404)
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/events"):
            n = int(self.headers.get("Content-Length", 0))
            try: e = json.loads(self.rfile.read(n) or b"{}")
            except ValueError: return self._json({"ok": False}, 400)
            with LOCK:
                if e.get("type") == "pair" and e.get("code"): PAIRS[str(e["code"]).upper()] = e
                e["id"] = NEXT[0]; NEXT[0] += 1; EVENTS.append(e); del EVENTS[:-200]
            return self._json({"ok": True, "id": e["id"]})
        self.send_error(404)

    def end_headers(self):  # rebuilds keep the same file names: the browser re-checks each file (a quick 304 if unchanged)
        self.send_header("Cache-Control", "no-cache"); super().end_headers()
    # /mars/... = the Martian Map web views (3D walk view, phone portal) from Map_layer/martian_map/web
    def translate_path(self, path):
        if path.startswith("/mars/") and os.path.isdir(MARS_WEB):
            rel = path[len("/mars/"):].split("?")[0].split("#")[0]
            return os.path.join(MARS_WEB, *[p for p in rel.split("/") if p not in ("", ".", "..")])
        return super().translate_path(path)

    def log_message(self, *a): pass

HERE = os.path.dirname(os.path.abspath(__file__))
MARS_WEB = os.path.normpath(os.path.join(HERE, "..", "..", "Map_layer", "martian_map", "web"))

PHONE_URL = [None]   # https://<this PC's Wi-Fi address>:8443/ when https runs, else None

def lan_ip():
    # the address of the network card that leads to other devices; connecting a UDP socket sends nothing
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(("192.0.2.1", 9)); return s.getsockname()[0]   # 192.0.2.1 = documentation address, never contacted
    except OSError: return None
    finally: s.close()

if __name__ == "__main__":
    # python server.py                 -> http://0.0.0.0:8000, plus https://0.0.0.0:8443 when certs/ exists
    #                                     (one process, so tablet, helmet and portal share pairing codes and live data)
    # python server.py --port 8770     -> another http port (tests); --https-port N changes 8443
    # Phone sensors, camera and WebXR AR need https: certs/cert.pem + certs/key.pem (self-signed, made on
    # this PC, never in git). The tablet's QR code then always sends the phone to the https address.
    import sys, ssl, threading as th
    os.chdir(HERE)
    arg = lambda k, d: int(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
    port, sport = arg("--port", 8000), arg("--https-port", 8443)
    cert, key = os.path.join(HERE, "certs", "cert.pem"), os.path.join(HERE, "certs", "key.pem")
    servers = [ThreadingHTTPServer(("0.0.0.0", port), H)]
    print(f"Firm Ground on http://0.0.0.0:{port}")
    if os.path.exists(cert) and os.path.exists(key):
        try:
            s = ThreadingHTTPServer(("0.0.0.0", sport), H)
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(cert, key)
            s.socket = ctx.wrap_socket(s.socket, server_side=True)
            servers.append(s)
            ip = lan_ip(); PHONE_URL[0] = f"https://{ip}:{sport}/" if ip else None
            print(f"           and https://0.0.0.0:{sport}  (phone: {PHONE_URL[0]})")
        except OSError as e:
            print(f"https not started on port {sport}: {e}")
    else:
        print("no certs/ folder: https off (phone sensors and AR need it)")
    print("(Ctrl+C to stop)")
    for s in servers[1:]: th.Thread(target=s.serve_forever, daemon=True).start()
    servers[0].serve_forever()
