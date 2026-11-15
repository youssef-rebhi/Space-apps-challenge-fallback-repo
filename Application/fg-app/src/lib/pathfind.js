// Safest walking path between two points (Dijkstra on a ~6 m grid).
// Data: slope classes from the team DEM (USGS MSL Gale 1 m, slope on 3 m) + our AI at Curiosity stops
// + Curiosity's own path. All weights below are TEAM ASSUMPTIONS, not NASA rules.
import { dist } from "./mission.js";

export const WEIGHTS = {
  GO: 1,          // slope < 15°
  CAUTION: 4,     // slope 15-25°: allowed, but costs 4× (slow, careful)
  NOGO: Infinity, // slope >= 25°: never crossed
  UNKNOWN: 6,     // no slope data
  ROVER_PATH: 0.7,// within ~12 m of Curiosity's path: the rover drove there, ground proven
  SAND_RED: Infinity, // < 15 m from a stop where our AI found > 30% sand or big rocks
  SAND_ORANGE: 3, // < 15 m from a stop with 10-30% sand
};

class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

// build the cost grid once (2×2 blocks of the slope raster, worst class wins)
let cached = null;
export function costGrid(geo, stops) {
  if (cached && cached.stops === stops) return cached;
  const G = geo.slopeAt.grid, F = 2, W = Math.floor(G.W / F), H = Math.floor(G.H / F);
  const cls = new Uint8Array(W * H), w = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let worst = 0, unknown = false;
    for (let dy = 0; dy < F; dy++) for (let dx = 0; dx < F; dx++) {
      const k = G.data[(y * F + dy) * G.W + x * F + dx];
      if (k === 0) unknown = true; else if (k > worst) worst = k;
    }
    const c = worst || (unknown ? 0 : 1);
    cls[y * W + x] = c;
    w[y * W + x] = c === 1 ? WEIGHTS.GO : c === 2 ? WEIGHTS.CAUTION : c === 3 ? WEIGHTS.NOGO : WEIGHTS.UNKNOWN;
  }
  const lonOf = (x) => G.w + ((x + 0.5) / W) * (G.e - G.w), latOf = (y) => G.n - ((y + 0.5) / H) * (G.n - G.s);
  const cellOf = (lat, lon) => [Math.min(W - 1, Math.max(0, Math.floor(((lon - G.w) / (G.e - G.w)) * W))), Math.min(H - 1, Math.max(0, Math.floor(((G.n - lat) / (G.n - G.s)) * H)))];
  const cellM = dist({ lat: latOf(0), lon: lonOf(0) }, { lat: latOf(0), lon: lonOf(1) });
  const stamp = (lat, lon, rM, fn) => {
    const [cx, cy] = cellOf(lat, lon), r = Math.ceil(rM / cellM);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < W && y < H && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) fn(y * W + x);
  };
  // Curiosity's path: proven ground (only where the slope is not NO-GO)
  (geo.traverse || []).forEach(([la, lo], k, arr) => {
    const nxt = arr[k + 1]; const steps = nxt ? Math.max(1, Math.ceil(dist({ lat: la, lon: lo }, { lat: nxt[0], lon: nxt[1] }) / cellM)) : 1;
    for (let t = 0; t < steps; t++) {
      const lat = nxt ? la + ((nxt[0] - la) * t) / steps : la, lon = nxt ? lo + ((nxt[1] - lo) * t) / steps : lo;
      stamp(lat, lon, 12, (i) => { if (Number.isFinite(w[i])) w[i] = Math.min(w[i], WEIGHTS.ROVER_PATH); });
    }
  });
  // our AI at the stops
  stops.forEach((s) => {
    if (s.sand_pct == null) return;
    if (s.sand_pct > 0.3 || s.bigrock_pct > 0.02) stamp(s.lat, s.lon, 15, (i) => { w[i] = WEIGHTS.SAND_RED; });
    else if (s.sand_pct >= 0.1) stamp(s.lat, s.lon, 15, (i) => { if (Number.isFinite(w[i])) w[i] = Math.max(w[i], WEIGHTS.SAND_ORANGE); });
  });
  cached = { stops, W, H, cls, w, lonOf, latOf, cellOf, cellM };
  return cached;
}

export const DRONE_SAND_W = 8; // a stretch the drone flagged as sand (SIMULATED) costs 8×
export const SURE = 0.75;       // AI certainty needed to call the ground "known"
export const NEAR_M = 30;       // AI result counts within 30 m of a Curiosity photo stop

export function safestPath(geo, stops, a, b, drone = {}) {
  const C = costGrid(geo, stops), { W, H, cls, cellM } = C;
  const w = C.w.slice();
  for (const k in drone) if (drone[k] === "sand" && Number.isFinite(w[k])) w[k] = Math.max(w[k], DRONE_SAND_W);
  const [ax, ay] = C.cellOf(a.lat, a.lon), [bx, by] = C.cellOf(b.lat, b.lon);
  const start = ay * W + ax, goal = by * W + bx;
  const cost = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
  // the walker may stand on a flagged cell: let them step off it (cells within ~20 m of A or B cost 50 instead of blocked)
  const esc = Math.ceil(20 / cellM), nearEnd = (i) => { const x = i % W, y = (i / W) | 0; return (Math.abs(x - ax) <= esc && Math.abs(y - ay) <= esc) || (Math.abs(x - bx) <= esc && Math.abs(y - by) <= esc); };
  const wt = (i) => (Number.isFinite(w[i]) ? w[i] : nearEnd(i) ? 50 : Infinity);
  const h = new Heap(); cost[start] = 0; h.push([0, start]);
  const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (h.size) {
    const [c, i] = h.pop();
    if (i === goal) break;
    if (c > cost[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy, d] of N) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx, wj = wt(j); if (!Number.isFinite(wj)) continue;
      const nc = c + d * cellM * (wt(i) + wj) / 2;
      if (nc < cost[j]) { cost[j] = nc; prev[j] = i; h.push([nc, j]); }
    }
  }
  if (!Number.isFinite(cost[goal])) return null;
  const cells = []; for (let i = goal; i !== -1; i = prev[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => ({ lat: C.latOf((i / W) | 0), lon: C.lonOf(i % W) }));
  pts[0] = { lat: a.lat, lon: a.lon }; pts[pts.length - 1] = { lat: b.lat, lon: b.lon };
  let len = 0, caution = 0, unknown = 0, rover = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = dist(pts[k - 1], pts[k]); len += d;
    const c = cls[cells[k]], wk = w[cells[k]];
    if (c === 2) caution += d; else if (c === 0) unknown += d;
    if (wk === WEIGHTS.ROVER_PATH) rover += d;
  }
  const straight = dist(a, b);
  // which stretches is the ground NOT known on? (no confident AI photo within 30 m, not scanned by the drone)
  const known = knownMask(C, stops);
  const unsure = cells.map((i) => !known[i] && !drone[i]);
  let unsureM = 0; for (let k = 1; k < pts.length; k++) if (unsure[k]) unsureM += dist(pts[k - 1], pts[k]);
  return { pts, cells, unsure, len, straight, caution, unknown, rover, unsureM, droneN: Object.keys(drone).length };
}

// keep a few points along the path (every ~stepM) to send to the helmet
export function samplePath(pts, stepM = 120) {
  const out = [pts[0]]; let acc = 0;
  for (let k = 1; k < pts.length - 1; k++) { acc += dist(pts[k - 1], pts[k]); if (acc >= stepM) { out.push(pts[k]); acc = 0; } }
  out.push(pts[pts.length - 1]);
  return out;
}

let knownCache = null;
function knownMask(C, stops) {
  if (knownCache && knownCache.C === C) return knownCache.m;
  const m = new Uint8Array(C.W * C.H), r = Math.ceil(NEAR_M / C.cellM);
  stops.forEach((s) => {
    if (s.sand_pct == null) return;
    const cert = s.certainty ?? 1;
    if (cert < SURE) return;
    const [cx, cy] = C.cellOf(s.lat, s.lon);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < C.W && y < C.H && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * C.W + x] = 1;
  });
  knownCache = { C, m };
  return m;
}

// SIMULATED drone scan of the unsure cells of a path (and a 1-cell band around them).
// Real part: the terrain (team DEM). Model part: sand sits in hollows (cell > 1 m lower than its ~40 m
// surroundings), the same idea as the team drone simulator. Returns { cellIndex: "sand" | "clear" | "steep" }.
export function droneScan(geo, stops, path, elevAtFn) {
  const C = costGrid(geo, stops), out = {};
  const E = geo.elev, near = (arr, v) => { let k = 0, d = 1e9; arr.forEach((q, j) => { const dd = Math.abs(q - v); if (dd < d) { d = dd; k = j; } }); return k; };
  const relief = (lat, lon) => {
    if (!E) return 0;
    const i = near(E.lat, lat), j = near(E.lon, lon); let s = 0, n = 0;
    for (let y = i - 2; y <= i + 2; y++) for (let x = j - 2; x <= j + 2; x++) { const v = E.z[y]?.[x]; if (v != null) { s += v; n++; } }
    const z = E.z[i]?.[j]; return z == null || !n ? 0 : z - s / n;
  };
  path.cells.forEach((c, k) => {
    if (!path.unsure[k]) return;
    const x0 = c % C.W, y0 = (c / C.W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= C.W || y >= C.H) continue;
      const i = y * C.W + x; if (out[i]) continue;
      out[i] = C.cls[i] === 3 ? "steep" : relief(C.latOf(y), C.lonOf(x)) < -1 ? "sand" : "clear";
    }
  });
  return out;
}
export const cellLatLon = (geo, stops, i) => { const C = costGrid(geo, stops); return [C.latOf((i / C.W) | 0), C.lonOf(i % C.W)]; };
