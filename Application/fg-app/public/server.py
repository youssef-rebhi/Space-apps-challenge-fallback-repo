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

    def log_message(self, *a): pass

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print("Firm Ground on http://0.0.0.0:8000  (Ctrl+C to stop)")
    ThreadingHTTPServer(("0.0.0.0", 8000), H).serve_forever()
