import { useEffect, useRef, useState } from "react";
import { COLOURS } from "../lib/mission.js";
import { GEO, loadGeo, elevAt } from "../lib/geo.js";

// 3D terrain of the boxwork box: team DEM (USGS MSL Gale 1 m, resampled 120×120), draped with the
// team's elevation or slope map, lit by a low sun. Heights ×EXAG for display.
// Drag = turn · Shift+drag or right-drag = tilt · wheel = zoom · click = check that spot (like 2D).
const M_PER_DEG = 3396190 * Math.PI / 180;
const SKINS = { gonogo: { file: "gonogo_photo_box.webp", key: "gonogo_photo_box.webp", label: "GO / NO-GO over photo" }, photo: { file: "photo_box.webp", key: "photo_box.webp", label: "Photo" }, elevation: { file: "elevation_box.webp", key: "elevation_box.png", label: "Elevation" }, slope: { file: "slope_classes_box.png", key: "slope_classes_box.png", label: "Slope GO / caution / NO-GO" } };

function sampler(src, bounds) {
  return new Promise((ok) => {
    const img = new Image(); img.src = src;
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, [[s, w], [n, e]] = bounds;
      ok((lat, lon) => {
        const px = Math.floor(((lon - w) / (e - w)) * c.width), py = Math.floor(((n - lat) / (n - s)) * c.height);
        if (px < 0 || py < 0 || px >= c.width || py >= c.height) return null;
        const i = (py * c.width + px) * 4; return d[i + 3] ? [d[i], d[i + 1], d[i + 2]] : null;
      });
    };
    img.onerror = () => ok(() => null);
  });
}

export default function Terrain3D({ stops, route, picks = [], pathPts, pathUnsure, selected, onSelect, onPick, colourFor, onFail }) {
  const cv = useRef(null), hits = useRef({ pins: [], cells: [] }), drag = useRef(null);
  const [g, setG] = useState(null);
  const [skin, setSkin] = useState("gonogo");
  const [tex, setTex] = useState({});
  const [view, setView] = useState({ yaw: -0.5, tilt: 0.9, zoom: 1, exag: 3 });

  useEffect(() => { loadGeo().then((x) => (x.elev ? setG(x) : onFail?.())).catch(() => onFail?.()); }, []);
  useEffect(() => {
    if (!g || tex[skin]) return;
    sampler(GEO + SKINS[skin].file, g.bounds[SKINS[skin].key].bounds).then((f) => setTex((t) => ({ ...t, [skin]: f })));
  }, [g, skin]);

  // pre-compute colours + normals once per skin
  const [mesh, setMesh] = useState(null);
  useEffect(() => {
    if (!g || !tex[skin]) return;
    const E = g.elev, n = E.lat.length, m = E.lon.length, col = [], sh = [];
    const dx = Math.abs(E.lon[1] - E.lon[0]) * M_PER_DEG, dy = Math.abs(E.lat[1] - E.lat[0]) * M_PER_DEG;
    const sun = [-0.55, 0.55, 0.63]; // from the north-west, 40° up
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < m - 1; j++) {
      const z00 = E.z[i][j], z01 = E.z[i][j + 1], z10 = E.z[i + 1][j];
      if (z00 == null || z01 == null || z10 == null) { col.push(null); sh.push(1); continue; }
      const gx = (z01 - z00) / dx, gy = (z00 - z10) / dy; // east, north gradients
      const nx = -gx, ny = -gy, nz = 1, L = Math.hypot(nx, ny, nz);
      sh.push(Math.max(0.25, (nx * sun[0] + ny * sun[1] + nz * sun[2]) / L));
      col.push(tex[skin]((E.lat[i] + E.lat[i + 1]) / 2, (E.lon[j] + E.lon[j + 1]) / 2) || [150, 110, 80]);
    }
    setMesh({ col, sh });
  }, [g, tex, skin]);

  useEffect(() => {
    const c = cv.current; if (!c || !g || !mesh) return;
    const ctx = c.getContext("2d"), W = c.width, H = c.height, E = g.elev, { yaw, tilt, zoom, exag } = view;
    const lat0 = (E.lat[0] + E.lat[E.lat.length - 1]) / 2, lon0 = (E.lon[0] + E.lon[E.lon.length - 1]) / 2;
    const zs = E.z.flat().filter((v) => v != null), zmin = Math.min(...zs), zmax = Math.max(...zs), zmid = (zmin + zmax) / 2;
    const halfM = Math.max(Math.abs(E.lon[0] - lon0), Math.abs(E.lat[0] - lat0)) * M_PER_DEG;
    const S = ((W * 0.42) / halfM) * zoom;
    const P = (lon, lat, z) => {
      const x = (lon - lon0) * M_PER_DEG, y = (lat - lat0) * M_PER_DEG, h = ((z ?? zmid) - zmid) * exag;
      const xr = x * Math.cos(yaw) - y * Math.sin(yaw), yr = x * Math.sin(yaw) + y * Math.cos(yaw);
      return [W / 2 + xr * S, H * 0.55 - yr * Math.cos(tilt) * S - h * Math.sin(tilt) * S, yr];
    };
    const Z = (lat, lon) => elevAt(E, lat, lon);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#3a2418"); sky.addColorStop(0.5, "#7a4a2e"); sky.addColorStop(1, "#1a120c");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // terrain quads, far first
    const n = E.lat.length, m = E.lon.length, quads = [];
    let q = 0;
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < m - 1; j++, q++) {
      const cc = mesh.col[q]; if (!cc) continue;
      const z11 = E.z[i + 1][j + 1] ?? E.z[i][j];
      const a = P(E.lon[j], E.lat[i], E.z[i][j]), b = P(E.lon[j + 1], E.lat[i], E.z[i][j + 1]), c3 = P(E.lon[j + 1], E.lat[i + 1], z11), d = P(E.lon[j], E.lat[i + 1], E.z[i + 1][j]);
      quads.push([a, b, c3, d, (a[2] + c3[2]) / 2, cc, mesh.sh[q], i, j]);
    }
    quads.sort((p1, p2) => p2[4] - p1[4]);
    const cells = [];
    for (const [a, b, c3, d, , cc, sh, i, j] of quads) {
      ctx.fillStyle = `rgb(${(cc[0] * sh) | 0},${(cc[1] * sh) | 0},${(cc[2] * sh) | 0})`;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c3[0], c3[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6; ctx.stroke(); // hide seams
      cells.push({ x: (a[0] + c3[0]) / 2, y: (a[1] + c3[1]) / 2, lat: (E.lat[i] + E.lat[i + 1]) / 2, lon: (E.lon[j] + E.lon[j + 1]) / 2 });
    }
    hits.current.cells = cells;
    const line = (pts, style, lift = 3) => {
      ctx.beginPath(); pts.forEach((p, k) => { const s = P(p.lon, p.lat, Z(p.lat, p.lon)); k ? ctx.lineTo(s[0], s[1] - lift) : ctx.moveTo(s[0], s[1] - lift); });
      Object.assign(ctx, style); ctx.stroke(); ctx.setLineDash([]);
    };
    // Curiosity path
    line(g.traverse.map(([la, lo]) => ({ lat: la, lon: lo })), { strokeStyle: "#ffffffbb", lineWidth: 1.5 }, 2);
    // safest path (green known / yellow unsure)
    if (pathPts?.length > 1) {
      line(pathPts, { strokeStyle: "#000a", lineWidth: 7 });
      let run = [pathPts[0]], un = pathUnsure?.[0];
      const flush = () => { if (run.length > 1) { if (un) ctx.setLineDash([6, 5]); line(run, { strokeStyle: un ? "#ffe14d" : "#3cff8f", lineWidth: 4 }); } };
      for (let k = 1; k < pathPts.length; k++) { const u = !!pathUnsure?.[k]; run.push(pathPts[k]); if (u !== !!un) { flush(); run = [pathPts[k]]; un = u; } }
      flush();
    }
    // route
    if (route.length > 1) { ctx.setLineDash([9, 6]); line(route, { strokeStyle: "#7fb3ff", lineWidth: 3.5 }, 6); }
    // pins: route points, picks, selected
    const pinSet = [...new Set([...route, ...picks.filter((p) => p === selected), ...(selected && !selected.grey ? [selected] : [])])];
    const pins = pinSet.map((s) => { const p = P(s.lon, s.lat, s.elev ?? Z(s.lat, s.lon)); return { s, x: p[0], y: p[1], d: p[2] }; }).sort((a, b) => b.d - a.d);
    pins.forEach(({ s, x, y }) => {
      const sel = selected === s, h = sel ? 26 : 16;
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
      ctx.fillStyle = COLOURS[colourFor(s)]; ctx.beginPath(); ctx.arc(x, y - h, sel ? 8 : (s.via ? 3 : 6), 0, 7); ctx.fill(); ctx.stroke();
      if (sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y - h, 13, 0, 7); ctx.stroke(); }
    });
    hits.current.pins = pins.map(({ s, x, y }) => ({ s, x, y: y - (selected === s ? 26 : 16) }));
    // north arrow + text
    const nA = P(lon0, lat0 + 0.004, zmax), nB = P(lon0, lat0, zmax);
    const ang = Math.atan2(nA[1] - nB[1], nA[0] - nB[0]);
    ctx.save(); ctx.translate(W - 50, 50); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = "#ff8080"; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.fillStyle = "#fff"; ctx.font = "bold 13px system-ui"; ctx.fillText("N", W - 54, 92);
    ctx.fillStyle = "#eee"; ctx.font = "13px system-ui";
    ctx.fillText(`USGS MSL Gale DEM 1 m · ${SKINS[skin].label} · heights ×${exag} · ${Math.round(zmax - zmin)} m low to high`, 14, H - 14);
  }, [g, mesh, stops, route, picks, pathPts, pathUnsure, selected, view, colourFor, skin]);

  const pos = (e) => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.current.width, ((e.clientY - r.top) / r.height) * cv.current.height]; };
  if (!g) return <p className="muted">Loading 3D terrain…</p>;
  return (
    <div className="t3d">
      <canvas ref={cv} width="1100" height="760" className="minimap map3d" role="img" aria-label="3D terrain of the boxwork area"
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => { e.preventDefault(); setView((v) => ({ ...v, zoom: Math.max(0.6, Math.min(6, v.zoom * (e.deltaY < 0 ? 1.15 : 0.87))) })); }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false, v: view, tiltMode: e.shiftKey || e.button === 2 }; }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          setView({ ...d.v, yaw: d.v.yaw + (d.tiltMode ? 0 : dx * 0.008), tilt: Math.max(0.25, Math.min(1.5, d.v.tilt + dy * 0.006)) });
        }}
        onPointerUp={(e) => {
          const d = drag.current; drag.current = null;
          if (!d || d.moved) return;
          const [x, y] = pos(e);
          let best = null, bd = 300; hits.current.pins.forEach((p) => { const dd = (p.x - x) ** 2 + (p.y - y) ** 2; if (dd < bd) { bd = dd; best = p.s; } });
          if (best) return onSelect(best);
          let cell = null, cd = 900; hits.current.cells.forEach((c) => { const dd = (c.x - x) ** 2 + (c.y - y) ** 2; if (dd < cd) { cd = dd; cell = c; } });
          if (cell && onPick) onPick(cell.lat, cell.lon);
        }}
        onPointerLeave={() => { drag.current = null; }} />
      <div className="baseSwitch">
        {Object.entries(SKINS).map(([k, s]) => <button key={k} className={skin === k ? "on" : ""} onClick={() => setSkin(k)}>{s.label}</button>)}
        <button onClick={() => setView((v) => ({ ...v, exag: v.exag === 3 ? 1 : v.exag === 1 ? 5 : 3 }))}>Height ×{view.exag}</button>
        <button onClick={() => setView({ yaw: -0.5, tilt: 0.9, zoom: 1, exag: 3 })}>Reset view</button>
      </div>
      <small className="muted">Drag to turn · Shift+drag (or right-drag) to tilt · scroll to zoom · click the ground to check that spot</small>
    </div>
  );
}
