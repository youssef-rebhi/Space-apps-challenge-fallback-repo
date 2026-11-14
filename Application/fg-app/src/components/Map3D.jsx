import { useEffect, useRef, useState } from "react";
import { COLOURS } from "../lib/mission.js";

// 3D view of the stops: drag to turn, wheel to tilt. Bar height = sand + big rock % from our AI
// (taller = more dangerous). The terrain shape is NOT shown here (no elevation in our data);
// the real terrain is in Mohamed's map.
export default function Map3D({ stops, route, selected, onSelect, colourFor }) {
  const cv = useRef(null), pts = useRef([]);
  const [yaw, setYaw] = useState(-0.6), [tilt, setTilt] = useState(0.9);
  const drag = useRef(null);

  useEffect(() => {
    const c = cv.current; if (!c || !stops.length) return;
    const ctx = c.getContext("2d"), W = c.width, H = c.height;
    const lons = stops.map((s) => s.lon), lats = stops.map((s) => s.lat);
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2, cy = (Math.min(...lats) + Math.max(...lats)) / 2;
    const span = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats)) || 1e-3;
    const S = (W * 0.42) / (span / 2);
    const proj = (lon, lat, z = 0) => {
      const x = (lon - cx) * S, y = (lat - cy) * S;
      const xr = x * Math.cos(yaw) - y * Math.sin(yaw), yr = x * Math.sin(yaw) + y * Math.cos(yaw);
      return [W / 2 + xr, H * 0.55 - yr * Math.cos(tilt) - z * Math.sin(tilt)];
    };
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#1d1712"; ctx.fillRect(0, 0, W, H);
    // ground grid
    ctx.strokeStyle = "#ffffff14"; ctx.lineWidth = 1;
    for (let k = -5; k <= 5; k++) {
      const d = (span / 2) * 1.15 * (k / 5), e = (span / 2) * 1.15;
      let [a, b] = proj(cx + d, cy - e), [p, q] = proj(cx + d, cy + e);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(p, q); ctx.stroke();
      [a, b] = proj(cx - e, cy + d); [p, q] = proj(cx + e, cy + d);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(p, q); ctx.stroke();
    }
    // route
    const rp = route.map((sol) => stops.find((s) => s.sol === sol)).filter(Boolean);
    if (rp.length > 1) {
      ctx.strokeStyle = "#7fb3ff"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath();
      rp.forEach((s, k) => { const [x, y] = proj(s.lon, s.lat); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    // bars, far ones first
    const items = stops.map((s) => {
      const risk = Math.min(1, (s.sand_pct ?? 0) + (s.bigrock_pct ?? 0) * 5);
      const [x, y] = proj(s.lon, s.lat), [, yt] = proj(s.lon, s.lat, 8 + risk * 120);
      return { s, x, y, yt };
    }).sort((a, b) => a.y - b.y);
    items.forEach(({ s, x, y, yt }) => {
      const col = COLOURS[colourFor(s)];
      ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fillRect(x - 4, yt, 8, y - yt); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x, yt, 6, 0, 7); ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();
      if (selected?.sol === s.sol) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, yt, 12, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
    });
    pts.current = items.map(({ s, x, yt }) => ({ s, x, y: yt }));
    ctx.fillStyle = "#bbb"; ctx.font = "13px system-ui";
    ctx.fillText("3D · bar height = sand + big rock (our AI) · drag to turn · terrain shape not shown", 14, H - 12);
  }, [stops, route, selected, yaw, tilt, colourFor]);

  const pos = (e) => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.current.width, ((e.clientY - r.top) / r.height) * cv.current.height]; };
  return (
    <canvas
      ref={cv} width="900" height="680" className="minimap map3d"
      role="img" aria-label="3D view of the stops; bar height shows sand and rock percentage"
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false, yaw, tilt }; }}
      onPointerMove={(e) => {
        const d = drag.current; if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        setYaw(d.yaw + dx * 0.008); setTilt(Math.max(0.2, Math.min(1.4, d.tilt + dy * 0.006)));
      }}
      onPointerUp={(e) => {
        const d = drag.current; drag.current = null;
        if (d && !d.moved) {
          const [x, y] = pos(e);
          let best = null, bd = 400;
          pts.current.forEach((p) => { const dd = (p.x - x) ** 2 + (p.y - y) ** 2; if (dd < bd) { bd = dd; best = p.s; } });
          if (best) onSelect(best);
        }
      }}
      onPointerLeave={() => { drag.current = null; }}
    />
  );
}
