// Unexplored ("grey") areas next to Curiosity's route: map cells with NO Curiosity photo.
// Team rule: grey = not discovered yet → send the scout. Cells are only made close to the route.
import { dist } from "./mission.js";

export const keyOf = (s) => s.id ?? s.sol;

export function greyCells(stops, n = 14) {
  if (!stops.length) return [];
  const lons = stops.map((s) => s.lon), lats = stops.map((s) => s.lat);
  const x0 = Math.min(...lons), y0 = Math.min(...lats);
  const span = Math.max(Math.max(...lons) - x0, Math.max(...lats) - y0) || 1e-3;
  const cell = span / n, cells = [];
  const has = new Set(stops.map((s) => `${Math.floor((s.lon - x0) / cell)},${Math.floor((s.lat - y0) / cell)}`));
  for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) {
    if (has.has(`${i},${j}`)) continue;
    const c = { lon: x0 + (i + 0.5) * cell, lat: y0 + (j + 0.5) * cell };
    let near = null, nd = Infinity;
    for (const s of stops) { const d = (s.lon - c.lon) ** 2 + (s.lat - c.lat) ** 2; if (d < nd) { nd = d; near = s; } }
    if (Math.sqrt(nd) > cell * 1.6) continue; // keep only cells beside the route
    cells.push({ id: `g${i}_${j}`, grey: true, ...c, cell, nearest: near, metres: Math.round(dist(c, near)) });
  }
  return cells;
}
