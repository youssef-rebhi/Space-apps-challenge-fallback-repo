import { colourOf, COLOURS } from "../lib/mission.js";

// Simple SVG map of the rover stops (lon/lat → x/y). Mohamed's Leaflet map is the real map;
// this one is for the scout demo and works offline.
export default function MiniMap({ stops, greys = [], route, selected, onSelect, drone, laser, scouted, colourFor = colourOf }) {
  if (!stops.length) return null;
  const W = 520, H = 520, P = 30;
  const lons = stops.map((s) => s.lon), lats = stops.map((s) => s.lat);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const span = Math.max(x1 - x0, y1 - y0) || 1e-3;
  const X = (lon) => P + ((lon - x0) / span) * (W - 2 * P);
  const Y = (lat) => H - P - ((lat - y0) / span) * (H - 2 * P);
  const routePts = route;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="minimap" role="img" aria-label="Map of Curiosity's boxwork stops coloured by our AI">
      <rect x="0" y="0" width={W} height={H} fill="#1d1712" rx="12" />
      {greys.map((g) => {
        const w = (g.cell / span) * (W - 2 * P), c = colourFor(g), isSel = selected?.id === g.id;
        return (
          <rect key={g.id} x={X(g.lon) - w / 2} y={Y(g.lat) - w / 2} width={w - 1} height={w - 1} rx="3"
            fill={COLOURS[c]} opacity={scouted[g.id] ? 0.75 : 0.28} stroke={isSel ? "#fff" : "none"} strokeWidth="2"
            onClick={() => onSelect(g)} style={{ cursor: "pointer" }} />
        );
      })}
      {routePts.length > 1 && (
        <polyline points={routePts.map((s) => `${X(s.lon)},${Y(s.lat)}`).join(" ")} fill="none" stroke="#7fb3ff" strokeWidth="3" strokeDasharray="6 5" />
      )}
      {stops.map((s) => {
        const c = colourFor(s), isSel = !selected?.grey && selected?.sol === s.sol;
        return (
          <g key={s.sol + "-" + s.lon} onClick={() => onSelect(s)} style={{ cursor: "pointer" }}>
            {isSel && <circle cx={X(s.lon)} cy={Y(s.lat)} r="13" fill="none" stroke="#fff" strokeWidth="2" />}
            <circle cx={X(s.lon)} cy={Y(s.lat)} r="7" fill={COLOURS[c]} stroke="#000" strokeWidth="1" />
            {scouted[s.sol] && <text x={X(s.lon) + 9} y={Y(s.lat) - 8} fontSize="12" fill="#fff">🎤</text>}
          </g>
        );
      })}
      {drone && (
        <g>
          {laser && selected && (
            <line x1={X(drone.lon)} y1={Y(drone.lat) - 14} x2={X(selected.lon)} y2={Y(selected.lat)} stroke="#ff3b3b" strokeWidth="3" className="laser" />
          )}
          <text x={X(drone.lon)} y={Y(drone.lat) - 14} fontSize="22" textAnchor="middle">🚁</text>
        </g>
      )}
      <text x={P} y={H - 8} fontSize="12" fill="#bbb">Curiosity boxwork stops · colours = our AI · not to scale</text>
    </svg>
  );
}
