// Helmet copilot: turn-by-turn on the safe path, danger look-ahead, "why this route".
// Everything is computed on the device from the mission data (team map, AI, drone). No internet, no LLM.
// Thresholds are TEAM ASSUMPTIONS (ASSUMPTIONS.md).
import { dist } from "./mission.js";
import { bearing } from "./live.js";
import { safePath } from "./routes.js";

export const STEP_LEN = 0.75;   // metres per walking step used in the spoken directions (assumption)
export const TURN_DEG = 30;     // a bend of 30° or more is announced as a turn
export const LOOK_M = 20;       // danger look-ahead along the path
export const OFF_M = 20;        // more than 20 m from the path = off route

// Douglas–Peucker simplification (tolerance in metres) so tiny grid zig-zags are not "turns"
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const M = 3396190 * Math.PI / 180, c = Math.cos((pts[0].lat * Math.PI) / 180);
  const xy = pts.map((p) => [p.lon * M * c, p.lat * M]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = -1, bd = tol;
    const [ax, ay] = xy[a], [bx, by] = xy[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let k = a + 1; k < b; k++) { const d = Math.abs((bx - ax) * (ay - xy[k][1]) - (ax - xy[k][0]) * (by - ay)) / L; if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// the walking path through all route points; legEnd[k] = path index of route point k
export function buildPath(geo, stops, route) {
  const out = [], legEnd = [0];
  for (let k = 1; k < route.length; k++) {
    const seg = safePath(geo, stops, route[k - 1], route[k]) || [route[k - 1], route[k]];
    const s = simplify(seg, 3);
    (out.length ? s.slice(1) : s).forEach((p) => out.push(p));
    legEnd.push(out.length - 1);
  }
  if (!out.length && route[0]) out.push(route[0]);
  return { pts: out, legEnd };
}

const turnAt = (pts, k) => { // signed bend at vertex k (+ right, − left)
  const b1 = bearing(pts[k - 1], pts[k]), b2 = bearing(pts[k], pts[k + 1]);
  return ((b2 - b1 + 540) % 360) - 180;
};

// idx = the path vertex I am walking to (the helmet keeps it as I move). Returns the next real turn and how far off I am.
const segDist = (p, a, b) => { // metres from p to segment a-b (local flat approx)
  const M = 3396190 * Math.PI / 180, c = Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lon - p.lon) * M * c, ay = (a.lat - p.lat) * M, bx = (b.lon - p.lon) * M * c, by = (b.lat - p.lat) * M;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2));
  return Math.hypot(ax + t * dx, ay + t * dy);
};
export function navigate(path, pos, idx) {
  const P = path.pts; if (P.length < 2 || idx >= P.length) return null;
  const off = idx > 0 ? segDist(pos, P[idx - 1], P[idx]) : dist(pos, P[0]);
  let acc = dist(pos, P[idx]), turn = null;
  for (let k = Math.max(1, idx); k < P.length - 1 && acc < 400; k++) {
    const a = turnAt(P, k);
    if (Math.abs(a) >= TURN_DEG) { turn = { m: acc, deg: a, k }; break; }
    acc += dist(P[k], P[k + 1]);
  }
  return { off, turn };
}

export function turnWords(t) {
  if (!t) return "Keep straight.";
  const side = t.deg > 0 ? "right" : "left", kind = Math.abs(t.deg) >= 120 ? "Turn sharp " : Math.abs(t.deg) >= 60 ? "Turn " : "Bear ";
  const steps = Math.max(1, Math.round(t.m / STEP_LEN));
  return t.m < 6 ? `${kind}${side} now.` : `In about ${steps} steps, ${kind.trim().toLowerCase()} ${side}.`;
}

// worst map class in the next LOOK_M metres along the path (team GO/NO-GO map + drone readings)
export function lookAhead(geo, path, pos, idx, droneCells = []) {
  if (!geo?.mapAt) return null;
  const P = path.pts; let acc = 0, prev = pos, worst = null;
  const check = (q, m) => {
    let k = geo.mapAt(q.lat, q.lon); let src = "team map";
    const dr = droneCells.find((h) => dist(h, q) < 6); if (dr) { k = dr.r === "steep" ? 3 : 2; src = dr.r === "steep" ? "drone: steep" : "drone: sand"; }
    if (k === 3 || k === 2 || k === 0) { const rank = { 3: 3, 0: 2, 2: 1 }[k]; if (!worst || rank > worst.rank) worst = { k, m, rank, src }; }
  };
  for (let k = idx; k < P.length && acc <= LOOK_M; k++) {
    const d = dist(prev, P[k]), n = Math.max(1, Math.ceil(d / 3));
    for (let s = 1; s <= n; s++) { const t = s / n, q = { lat: prev.lat + (P[k].lat - prev.lat) * t, lon: prev.lon + (P[k].lon - prev.lon) * t }; const m = acc + d * t; if (m > LOOK_M) break; check(q, m); }
    acc += d; prev = P[k];
  }
  return worst;
}
