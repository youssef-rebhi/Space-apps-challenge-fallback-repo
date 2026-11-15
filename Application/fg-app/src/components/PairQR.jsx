import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import { publish } from "../lib/live.js";

// Tablet → helmet pairing.
// With server.py: the route is stored under a 4-letter code, so the QR code is small and easy to scan
// (and the code can be typed by hand). Without the server: the whole route goes in the link (big QR).
const token = (p) => (p.sol != null && !p.grey && !p.custom ? String(p.sol) : `${p.via ? "v" : "p"}${p.lat.toFixed(6)}_${p.lon.toFixed(6)}`);
const base = () => location.href.split("?")[0].split("#")[0];
export function helmetLink(routePts, evaMin = 240) {
  const url = new URL(base());
  url.searchParams.set("view", "helmet");
  url.searchParams.set("stops", routePts.map(token).join(","));
  url.searchParams.set("eva", evaMin);
  return url.href;
}
const codeOf = (str) => { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let c = ""; for (let k = 0; k < 4; k++) { c += A[h % A.length]; h = Math.floor(h / A.length); } return c; };

export default function PairQR({ routePts, evaMin = 240, why = "" }) {
  const stops = routePts.map(token).join(",");
  const code = codeOf(stops + "|" + evaMin + "|" + why);
  const [stored, setStored] = useState(false);
  useEffect(() => {
    if (routePts.length < 2) return;
    setStored(false);
    const e = { type: "pair", code, stops, eva: evaMin, why };
    publish(e);
    // check the server kept it (server.py); if not, fall back to the long link
    const t = setTimeout(() => fetch("api/pair?c=" + code).then((r) => setStored(r.ok)).catch(() => setStored(false)), 600);
    return () => clearTimeout(t);
  }, [code]);
  if (routePts.length < 2) return <p className="muted">Add at least 2 stops to the route to pair the helmet.</p>;
  const short = base() + "?h=" + code;
  const link = stored ? short : helmetLink(routePts, evaMin);
  const qr = qrcode(0, "L"); qr.addData(link); qr.make();
  return (
    <div className="pair">
      <div className="qr" dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: stored ? 7 : 5, margin: 4 }) }} />
      <div>
        <p>Scan with the helmet phone ⬅</p>
        {stored && <p>or type on the phone: <b className="paircode">{short.replace(/^https?:\/\//, "")}</b></p>}
        <a href={link} target="_blank" rel="noreferrer">Open helmet here</a>
      </div>
    </div>
  );
}
