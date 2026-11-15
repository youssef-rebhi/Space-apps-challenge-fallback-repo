// Route options between A and B, like a maps app ("faster" / "safer" / "with science").
// Grid: team combined GO/NO-GO map (Map_layer/martian_map, 3 m cells), full 3 m cells (same grid as the map), worst class wins.
// Extra data: Curiosity's path (proven ground) and our AI sand at the Curiosity stops.
// All weights are TEAM ASSUMPTIONS, not NASA rules.
import { dist } from "./mission.js";

export const PROFILES = {
  fastest: { label: "Shortest", colour: "#4da3ff", GO: 1, CAUTION: 1.6, UNKNOWN: 1.5, ROVER: 1, SAND_ORANGE: 1.5 },
  safest: { label: "Safest", colour: "#3cff8f", GO: 1, CAUTION: 5, UNKNOWN: 8, ROVER: 0.6, SAND_ORANGE: 6 },
};
export const RULES = "Grid: the team's combined GO/NO-GO map (slope, roughness, geology, Curiosity's path, our AI stops). Never crossed: NO-GO cells, incl. 15 m around stops with > 30% sand or big rocks.";
const AI_NEAR_M = 30, SAND_R = 15, ROVER_R = 12, SPEED = 0.8;

class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

let cache = null;
function grid(geo, stops) {
  if (cache && cache.stops === stops && cache.geo === geo) return cache;
  const G = (geo.mapAt || geo.slopeAt).grid, F = geo.mapAt ? 1 : 2, W = Math.floor(G.W / F), H = Math.floor(G.H / F), N = W * H;
  const RANK = [2, 0, 1, 3]; // worst-of order, as in the combined map: GO < CAUTION < UNKNOWN < NO-GO
  const cls = new Uint8Array(N), rover = new Uint8Array(N), red = new Uint8Array(N), orange = new Uint8Array(N), known = new Uint8Array(N), unsure = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let worst = 1;
    for (let dy = 0; dy < F; dy++) for (let dx = 0; dx < F; dx++) { const k = G.data[(y * F + dy) * G.W + x * F + dx]; if (RANK[k] > RANK[worst]) worst = k; }
    cls[y * W + x] = worst;
  }
  const lonOf = (x) => G.w + ((x + 0.5) / W) * (G.e - G.w), latOf = (y) => G.n - ((y + 0.5) / H) * (G.n - G.s);
  const cellOf = (lat, lon) => [Math.floor(((lon - G.w) / (G.e - G.w)) * W), Math.floor(((G.n - lat) / (G.n - G.s)) * H)];
  const cellM = dist({ lat: latOf(0), lon: lonOf(0) }, { lat: latOf(0), lon: lonOf(1) });
  const stamp = (lat, lon, rM, arr) => {
    const [cx, cy] = cellOf(lat, lon), r = Math.ceil(rM / cellM);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < W && y < H && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) arr[y * W + x] = 1;
  };
  (geo.traverse || []).forEach(([la, lo], k, a) => {
    const n = a[k + 1]; if (!n) return stamp(la, lo, ROVER_R, rover);
    const steps = Math.max(1, Math.ceil(dist({ lat: la, lon: lo }, { lat: n[0], lon: n[1] }) / cellM));
    for (let t = 0; t < steps; t++) stamp(la + ((n[0] - la) * t) / steps, lo + ((n[1] - lo) * t) / steps, ROVER_R, rover);
  });
  stops.forEach((s) => {
    if (s.sand_pct == null) return;
    if (s.sand_pct > 0.3 || s.bigrock_pct > 0.02) stamp(s.lat, s.lon, SAND_R, red);
    else if (s.sand_pct >= 0.1) stamp(s.lat, s.lon, SAND_R, orange);
    if ((s.certainty ?? 1) >= 0.75) stamp(s.lat, s.lon, AI_NEAR_M, known); else stamp(s.lat, s.lon, AI_NEAR_M, unsure);
  });
  cache = { geo, stops, W, H, cls, rover, red, orange, known, unsure, lonOf, latOf, cellOf, cellM, bounds: G };
  return cache;
}

export function inBox(geo, lat, lon) {
  const G = (geo.mapAt || geo.slopeAt).grid; return lat >= G.s && lat <= G.n && lon >= G.w && lon <= G.e;
}

function weightFn(C, P) {
  return (i) => {
    if (C.red[i] || C.cls[i] === 3) return Infinity;
    let w = C.cls[i] === 1 ? P.GO : C.cls[i] === 2 ? P.CAUTION : P.UNKNOWN;
    if (C.orange[i]) w = Math.max(w, P.SAND_ORANGE);
    if (C.rover[i]) w = Math.min(w, P.ROVER * (C.cls[i] === 2 ? P.CAUTION / 2 : 1));
    return w;
  };
}

function dijkstra(C, wt, a, b) {
  const { W, H, cellM } = C;
  const [ax, ay] = C.cellOf(a.lat, a.lon), [bx, by] = C.cellOf(b.lat, b.lon);
  const start = ay * W + ax, goal = by * W + bx, esc = Math.ceil(20 / cellM);
  const near = (i) => { const x = i % W, y = (i / W) | 0; return (Math.abs(x - ax) <= esc && Math.abs(y - ay) <= esc) || (Math.abs(x - bx) <= esc && Math.abs(y - by) <= esc); };
  const w = (i) => { const v = wt(i); return Number.isFinite(v) ? v : near(i) ? 50 : Infinity; };
  const cost = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1), h = new Heap();
  cost[start] = 0; h.push([0, start]);
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (h.size) {
    const [c, i] = h.pop(); if (i === goal) break; if (c > cost[i]) continue;
    const x = i % W, y = (i / W) | 0, wi = w(i);
    for (const [dx, dy, d] of NB) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx, wj = w(j); if (!Number.isFinite(wj)) continue;
      const nc = c + d * cellM * (wi + wj) / 2; if (nc < cost[j]) { cost[j] = nc; prev[j] = i; h.push([nc, j]); }
    }
  }
  if (!Number.isFinite(cost[goal])) return null;
  const cells = []; for (let i = goal; i !== -1; i = prev[i]) cells.push(i);
  return cells.reverse();
}

function describe(C, cells, a, b, stops) {
  const pts = cells.map((i) => ({ lat: C.latOf((i / C.W) | 0), lon: C.lonOf(i % C.W) }));
  pts[0] = { lat: a.lat, lon: a.lon }; pts[pts.length - 1] = { lat: b.lat, lon: b.lon };
  const st = { len: 0, caution: 0, unknown: 0, sandNear: 0, rover: 0, known: 0 };
  for (let k = 1; k < pts.length; k++) {
    const d = dist(pts[k - 1], pts[k]), i = cells[k]; st.len += d;
    if (C.cls[i] === 2) st.caution += d; if (C.cls[i] === 0) st.unknown += d;
    if (C.orange[i]) st.sandNear += d; if (C.rover[i]) st.rover += d; if (C.known[i]) st.known += d;
  }
  // Curiosity science stops the route passes (within 30 m)
  const science = stops.filter((s) => pts.some((p, k) => k % 3 === 0 && dist(p, s) < AI_NEAR_M)).map((s) => s.sol);
  return { pts, cells, ...st, minutes: st.len / SPEED / 60, science: [...new Set(science)], unknownGround: st.len - st.known };
}

// Main entry: options A → B. via = a stop to pass by for science (optional; "auto" picks the best detour).
export function routeOptions(geo, stops, a, b, via = "auto", targets = []) {
  const C = grid(geo, stops), out = [];
  for (const [id, P] of Object.entries(PROFILES)) {
    const cells = dijkstra(C, weightFn(C, P), a, b);
    if (cells) out.push({ id, label: P.label, colour: P.colour, ...describe(C, cells, a, b, stops) });
  }
  // science route: safest profile through one Curiosity stop (rover's science sites on the boxwork)
  const safeW = weightFn(C, PROFILES.safest);
  const passed = new Set(out.flatMap((o) => o.science));
  let cands;
  if (via !== "auto") cands = targets.filter((t) => t.key === via).concat(stops.filter((s) => "s" + s.sol === via));
  else {
    // science targets first (ridges / hollows); without targets, any Curiosity stop
    // only detours that are worth it: at most 400 m or half the direct distance (TEAM ASSUMPTION)
    const maxDetour = Math.max(400, 0.5 * dist(a, b));
    const near = (pool) => pool.filter((s) => inBox(geo, s.lat, s.lon))
      .map((s) => ({ s, detour: dist(a, s) + dist(s, b) - dist(a, b) })).filter((x) => x.detour <= maxDetour)
      .sort((p, q) => p.detour - q.detour).slice(0, 4).map((x) => x.s);
    cands = near(targets.filter((t) => t.lat != null));
    if (!cands.length) cands = near(stops.filter((s) => !passed.has(s.sol))); // else the nearest Curiosity science stop
  }
  let best = null;
  for (const s of cands) {
    const c1 = dijkstra(C, safeW, a, s), c2 = c1 && dijkstra(C, safeW, s, b);
    if (!c1 || !c2) continue;
    const r = describe(C, [...c1, ...c2.slice(1)], a, b, stops);
    if (!best || r.len < best.len) best = { ...r, viaSol: s.key ? null : s.sol, viaPt: { lat: s.lat, lon: s.lon }, viaT: s.key ? s : null };
  }
  if (best) {
    const t = best.viaT;
    out.push({ id: "science", label: `Science · ${t ? t.name : `Curiosity stop sol ${best.viaSol}`}`, colour: "#c58bff", target: t, ...best });
  }
  // tags like a maps app
  if (out.length) {
    const minLen = Math.min(...out.map((o) => o.len)), minRisk = Math.min(...out.map((o) => 3 * o.caution + o.unknownGround + 4 * o.sandNear));
    out.forEach((o) => {
      o.tags = [];
      if (o.len === minLen) o.tags.push("shortest");
      if (3 * o.caution + o.unknownGround + 4 * o.sandNear === minRisk) o.tags.push("least risk");
      if (o.id === "science") o.tags.push(`+${Math.round(o.len - minLen)} m for science`);
      o.warn = [];
      o.goPct = Math.round(100 * (1 - (o.caution + o.unknown) / o.len));
      if (o.caution > 20) o.warn.push(`${Math.round(o.caution)} m on CAUTION ground (team map: slope 15–25°, rough, sand or hollow fill)`);
      if (o.unknown > 5) o.warn.push(`${Math.round(o.unknown)} m on UNKNOWN cells: send the scout first`);
      if (o.sandNear > 5) o.warn.push(`${Math.round(o.sandNear)} m near sand our AI saw`);
      if (o.unknownGround > 50) o.warn.push(`${Math.round(o.unknownGround)} m seen only from orbit (no Curiosity photo within 30 m)`);
    });
  }
  // drop a duplicate (same length within 2%)
  return out.filter((o, k) => !out.slice(0, k).some((p) => Math.abs(p.len - o.len) / o.len < 0.02 && p.id !== "science" && o.id !== "science"));
}

export function samplePts(pts, stepM = 200) {
  const out = [pts[0]]; let acc = 0;
  for (let k = 1; k < pts.length - 1; k++) { acc += dist(pts[k - 1], pts[k]); if (acc >= stepM) { out.push(pts[k]); acc = 0; } }
  out.push(pts[pts.length - 1]); return out;
}


// ── Drone scout (SIMULATED) ─────────────────────────────────────────────
// Two jobs on the chosen route (TEAM RULES):
//   unknown   = discovery: map class UNKNOWN, or no Curiosity photo within 30 m
//   uncertain = confirmation: CAUTION on the team map, near an orange AI stop, or near a stop with AI certainty < 0.75
export function scoutNeeds(geo, stops, opt) {
  const C = grid(geo, stops), segs = [], tot = { unknown: 0, uncertain: 0 };
  const why = (i) => (C.cls[i] === 2 || C.orange[i] || C.unsure[i] ? "uncertain" : C.cls[i] === 0 || !C.known[i] ? "unknown" : null);
  let cur = null;
  for (let k = 1; k < opt.pts.length; k++) {
    const r = why(opt.cells[k]), d = dist(opt.pts[k - 1], opt.pts[k]);
    if (r) tot[r] += d;
    if (r && cur && cur.reason === r) cur.pts.push(opt.pts[k]);
    else { if (cur) segs.push(cur); cur = r ? { reason: r, pts: [opt.pts[k - 1], opt.pts[k]] } : null; }
  }
  if (cur) segs.push(cur);
  return { segs, ...tot };
}

// Mohamed's simulated drone flights (Drone/sim, along Curiosity's route), indexed on the route grid
const HZ = { clear: "clear", sand: "sand", slope_caution: "caution", slope_nogo: "steep", obstacle: "obstacle", obstacle_point: "obstacle" };
const RANK_HZ = { clear: 0, caution: 1, sand: 2, obstacle: 3, steep: 3 };
let hzIdx = null;
async function droneIndex(geo, stops) {
  if (hzIdx && hzIdx.C === grid(geo, stops)) return hzIdx;
  const C = grid(geo, stops), m = new Map();
  try {
    const d = await (await fetch("data/geo/drone_hazards.geojson")).json();
    const put = (lon, lat, h) => { const [x, y] = C.cellOf(lat, lon); if (x < 0 || y < 0 || x >= C.W || y >= C.H) return; const i = y * C.W + x, old = m.get(i); if (!old || RANK_HZ[h] > RANK_HZ[old]) m.set(i, h); };
    d.features.forEach((f) => { const h = HZ[f.properties.hazard]; if (!h) return; const g = f.geometry; (g.type === "Point" ? [g.coordinates] : g.coordinates).forEach(([lo, la]) => put(lo, la, h)); });
  } catch { /* no drone layer */ }
  hzIdx = { C, m };
  return hzIdx;
}

// fly the drone over the cells that need it (3 m corridor each side) and read the ground
export async function scoutRun(geo, stops, opt) {
  const C = grid(geo, stops), { m } = await droneIndex(geo, stops), E = geo.elev;
  const need = scoutNeeds(geo, stops, opt), scan = {}, src = { sim: 0, dem: 0 };
  const nearest = (arr, v) => { let k = 0, d = 1e9; arr.forEach((q, j) => { const dd = Math.abs(q - v); if (dd < d) { d = dd; k = j; } }); return k; };
  const relief = (lat, lon) => { // DEM method: a hollow > 1 m below its surroundings collects sand (team assumption)
    if (!E) return 0; const i = nearest(E.lat, lat), j = nearest(E.lon, lon); let s2 = 0, n = 0;
    for (let y = i - 2; y <= i + 2; y++) for (let x = j - 2; x <= j + 2; x++) { const v = E.z[y]?.[x]; if (v != null) { s2 += v; n++; } }
    const z = E.z[i]?.[j]; return z == null || !n ? 0 : z - s2 / n;
  };
  const want = new Set(need.segs.flatMap((sg) => sg.pts.map((q) => { const [x, y] = C.cellOf(q.lat, q.lon); return y * C.W + x; })));
  for (const c of want) {
    const x0 = c % C.W, y0 = (c / C.W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= C.W || y >= C.H) continue;
      const i = y * C.W + x; if (scan[i]) continue;
      if (m.has(i)) { scan[i] = { r: m.get(i), src: "sim" }; src.sim++; continue; }
      const r = C.cls[i] === 3 ? "steep" : relief(C.latOf(y), C.lonOf(x)) < -1 ? "sand" : C.cls[i] === 2 ? "caution" : "clear";
      scan[i] = { r, src: "dem" }; src.dem++;
    }
  }
  return { scan, src, need };
}

// plan again with what the drone saw: confirmed ground counts as GO, sand costs 8×, steep / obstacles are never crossed
export const DRONE_SAND_W = 8;
export function rerouteScanned(geo, stops, a, b, scan, profile = "safest") {
  const C = grid(geo, stops), P = PROFILES[profile], base = weightFn(C, P);
  const wt = (i) => {
    const s = scan[i]; if (!s) return base(i);
    if (C.red[i] || s.r === "steep" || s.r === "obstacle") return Infinity;
    if (s.r === "sand") return Math.max(P.CAUTION, DRONE_SAND_W);
    if (s.r === "caution") return P.CAUTION;
    return C.rover[i] ? P.ROVER : P.GO;
  };
  const cells = dijkstra(C, wt, a, b);
  if (!cells) return null;
  const o = describe(C, cells, a, b, stops);
  const st = { confirmed: 0, sand: 0, caution: 0, go: 0 };
  for (let k = 1; k < o.pts.length; k++) {
    const s = scan[cells[k]], d = dist(o.pts[k - 1], o.pts[k]);
    if (s ? s.r === "clear" : C.cls[cells[k]] === 1) st.go += d;
    if (!s) { if (C.cls[cells[k]] === 2) st.caution += d; continue; }
    if (s.r === "clear") st.confirmed += d; else if (s.r === "sand") st.sand += d; else if (s.r === "caution") st.caution += d;
  }
  return { ...o, droneStat: st };
}
export const cellCentre = (geo, stops, i) => { const C = grid(geo, stops); return { lat: C.latOf((i / C.W) | 0), lon: C.lonOf(i % C.W) }; };

// dense safe path between two points (Safest weights) — used by the helmet copilot
export function safePath(geo, stops, a, b) {
  const C = grid(geo, stops), cells = dijkstra(C, weightFn(C, PROFILES.safest), a, b);
  if (!cells) return null;
  const pts = cells.map((i) => ({ lat: C.latOf((i / C.W) | 0), lon: C.lonOf(i % C.W) }));
  pts[0] = { lat: a.lat, lon: a.lon }; pts[pts.length - 1] = { lat: b.lat, lon: b.lon };
  return pts;
}
