// Route options between A and B, like a maps app ("faster" / "safer" / "with science").
// Grid: team slope classes (USGS MSL Gale DEM 1 m, slope on 3 m), 2×2 blocks ≈ 6 m, worst class wins.
// Extra data: Curiosity's path (proven ground) and our AI sand at the Curiosity stops.
// All weights are TEAM ASSUMPTIONS, not NASA rules.
import { dist } from "./mission.js";

export const PROFILES = {
  fastest: { label: "Shortest", colour: "#4da3ff", GO: 1, CAUTION: 1.6, UNKNOWN: 1.5, ROVER: 1, SAND_ORANGE: 1.5 },
  safest: { label: "Safest", colour: "#3cff8f", GO: 1, CAUTION: 5, UNKNOWN: 8, ROVER: 0.6, SAND_ORANGE: 6 },
};
export const RULES = "Never crossed: slope ≥ 25° and 15 m around stops where our AI found > 30% sand or big rocks.";
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
  const G = geo.slopeAt.grid, F = 2, W = Math.floor(G.W / F), H = Math.floor(G.H / F), N = W * H;
  const cls = new Uint8Array(N), rover = new Uint8Array(N), red = new Uint8Array(N), orange = new Uint8Array(N), known = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let worst = 0, unk = false;
    for (let dy = 0; dy < F; dy++) for (let dx = 0; dx < F; dx++) { const k = G.data[(y * F + dy) * G.W + x * F + dx]; if (k === 0) unk = true; else if (k > worst) worst = k; }
    cls[y * W + x] = worst || (unk ? 0 : 1);
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
    if ((s.certainty ?? 1) >= 0.75) stamp(s.lat, s.lon, AI_NEAR_M, known);
  });
  cache = { geo, stops, W, H, cls, rover, red, orange, known, lonOf, latOf, cellOf, cellM, bounds: G };
  return cache;
}

export function inBox(geo, lat, lon) {
  const G = geo.slopeAt.grid; return lat >= G.s && lat <= G.n && lon >= G.w && lon <= G.e;
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
  return { pts, ...st, minutes: st.len / SPEED / 60, science: [...new Set(science)], unknownGround: st.len - st.known };
}

// Main entry: options A → B. via = a stop to pass by for science (optional; "auto" picks the best detour).
export function routeOptions(geo, stops, a, b, via = "auto") {
  const C = grid(geo, stops), out = [];
  for (const [id, P] of Object.entries(PROFILES)) {
    const cells = dijkstra(C, weightFn(C, P), a, b);
    if (cells) out.push({ id, label: P.label, colour: P.colour, ...describe(C, cells, a, b, stops) });
  }
  // science route: safest profile through one Curiosity stop (rover's science sites on the boxwork)
  const safeW = weightFn(C, PROFILES.safest);
  const passed = new Set(out.flatMap((o) => o.science));
  let cands;
  if (via !== "auto") cands = stops.filter((s) => s.sol === +via);
  else cands = stops.filter((s) => !passed.has(s.sol) && inBox(geo, s.lat, s.lon))
    .map((s) => ({ s, detour: dist(a, s) + dist(s, b) - dist(a, b) })).sort((p, q) => p.detour - q.detour).slice(0, 4).map((x) => x.s);
  let best = null;
  for (const s of cands) {
    const c1 = dijkstra(C, safeW, a, s), c2 = c1 && dijkstra(C, safeW, s, b);
    if (!c1 || !c2) continue;
    const r = describe(C, [...c1, ...c2.slice(1)], a, b, stops);
    if (!best || r.len < best.len) best = { ...r, viaSol: s.sol };
  }
  if (best) out.push({ id: "science", label: `Science · via sol ${best.viaSol}`, colour: "#c58bff", ...best });
  // tags like a maps app
  if (out.length) {
    const minLen = Math.min(...out.map((o) => o.len)), minRisk = Math.min(...out.map((o) => 3 * o.caution + o.unknownGround + 4 * o.sandNear));
    out.forEach((o) => {
      o.tags = [];
      if (o.len === minLen) o.tags.push("shortest");
      if (3 * o.caution + o.unknownGround + 4 * o.sandNear === minRisk) o.tags.push("least risk");
      if (o.id === "science") o.tags.push(`+${Math.round(o.len - minLen)} m for science`);
      o.warn = [];
      if (o.caution > 20) o.warn.push(`${Math.round(o.caution)} m on 15–25° slopes`);
      if (o.sandNear > 5) o.warn.push(`${Math.round(o.sandNear)} m near sand our AI saw`);
      if (o.unknownGround > 50) o.warn.push(`${Math.round(o.unknownGround)} m where the ground is not known (no AI photo)`);
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
