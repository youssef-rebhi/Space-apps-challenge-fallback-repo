import qrcode from "qrcode-generator";

// Tablet → helmet pairing: the route is just a link, shown as a QR code. No server needed.
const token = (p) => (p.sol != null && !p.grey && !p.custom ? String(p.sol) : `${p.via ? "v" : "p"}${p.lat.toFixed(6)}_${p.lon.toFixed(6)}`);
export function helmetLink(routePts, evaMin = 240) {
  const url = new URL(location.href.split("?")[0].split("#")[0]);
  url.searchParams.set("view", "helmet");
  url.searchParams.set("stops", routePts.map(token).join(","));
  url.searchParams.set("eva", evaMin);
  return url.href;
}

export default function PairQR({ routePts }) {
  if (routePts.length < 2) return <p className="muted">Add at least 2 stops to the route to pair the helmet.</p>;
  const link = helmetLink(routePts);
  const qr = qrcode(0, "M"); qr.addData(link); qr.make();
  return (
    <div className="pair">
      <div className="qr" dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 5, margin: 2 }) }} />
      <div>
        <p>Scan with the helmet phone ⬅</p>
        <a href={link} target="_blank" rel="noreferrer">Open helmet here</a>
      </div>
    </div>
  );
}
