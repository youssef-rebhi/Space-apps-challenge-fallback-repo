#!/usr/bin/env node
// Fly every real-route flight once (ML sand detector on) and turn the drone's hazard map into a
// GeoJSON layer for the Leaflet map: one LineString per stretch of the same hazard class, plus obstacle points.
// Each flight owns its scout up to where the next flight takes off; the last flight owns all of it.
// Output: sim/out/drone_hazards.geojson, sim/out/layer_entry.json (snippet for layers.json)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'Drone_Simulator.html'), 'utf8');
const m = { exports: {} }; new Function('module', html.match(/<script id="sim-core">([\s\S]*?)<\/script>/)[1])(m); const Sim = m.exports;
const route = JSON.parse(fs.readFileSync(path.join(ROOT, 'sim/data/route_flights.json'), 'utf8'));
Sim.setModel(JSON.parse(fs.readFileSync(path.join(ROOT, 'sim/data/sand_model.json'), 'utf8')));

const NAMES = ['clear', 'sand', 'slope_caution', 'obstacle', 'slope_nogo'];  // label index -> name (slopes as in team Layer 2: 15-25 / >=25 deg)
const feats = [], summary = [];
function lonlatAt(fl, x) { // x metres along this flight's path -> [lon, lat] (geo has a point every 1 m)
  const L = fl.geo.lonlat, f = Math.max(0, Math.min(L.length - 1, x)), i = Math.min(L.length - 2, Math.floor(f)), t = f - i;
  return [+(L[i][0] + (L[i + 1][0] - L[i][0]) * t).toFixed(7), +(L[i][1] + (L[i + 1][1] - L[i][1]) * t).toFixed(7)];
}
route.flights.forEach((fl, k) => {
  const own = k < route.flights.length - 1 ? route.flights[k + 1].route_m - fl.route_m : fl.scout;   // up to where the next flight takes off
  const s = Sim.runToEnd(Object.assign({}, Sim.SCENARIOS.real, { terrain: fl.terrain, route: [fl.scout, 0], seed: 500 + k }));
  const a = Sim.analyze(s);
  const counts = [0, 0, 0, 0, 0];
  let cur = null;
  const flush = () => { if (cur && cur.pts.length > 1) feats.push({ type: 'Feature', properties: { hazard: NAMES[cur.c], flight: fl.id, near_sol: fl.near_sol, length_m: +(cur.x1 - cur.x0).toFixed(1), source: 'drone sim (ML sand)' }, geometry: { type: 'LineString', coordinates: cur.pts } }); cur = null; };
  a.x.forEach((x, i) => {
    const c = a.label[i];
    if (c < 0 || x < 0 || x > own) { flush(); return; }
    counts[c]++;
    if (!cur || cur.c !== c) { flush(); cur = { c, x0: x, x1: x, pts: [] }; }
    cur.x1 = x; cur.pts.push(lonlatAt(fl, x));
  });
  flush();
  for (const d of a.dets) if (d.x >= 0 && d.x <= own) feats.push({ type: 'Feature', properties: { hazard: 'obstacle_point', height_m: +d.h.toFixed(2), flight: fl.id, near_sol: fl.near_sol }, geometry: { type: 'Point', coordinates: lonlatAt(fl, d.x) } });
  summary.push({ id: fl.id, near_sol: fl.near_sol, phase: s.phase, rmse_cm: +(a.rmse * 100).toFixed(1), metres: counts.map(n => +(n * 0.2).toFixed(1)) });
});
const fc = { type: 'FeatureCollection', name: 'drone_hazards', properties: { note: 'Simulated drone scouting along Curiosity\'s route; base terrain USGS MSL Gale 1 m DEM (rover frame), rocks and ripples synthetic. Not real observations.' }, features: feats };
fs.mkdirSync(path.join(ROOT, 'sim/out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'sim/out/drone_hazards.geojson'), JSON.stringify(fc));
const all = feats.flatMap(f => f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates);
const bb = all.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const entry = { id: 'drone_hazards', type: 'geojson', url: 'ov/drone_hazards.geojson', bounds: [[+bb[1].toFixed(6), +bb[0].toFixed(6)], [+bb[3].toFixed(6), +bb[2].toFixed(6)]],
  style: { clear: '#3ecf8e', sand: '#ffb020', slope_caution: '#b57cff', slope_nogo: '#6a1fd1', obstacle: '#ff5a5a', obstacle_point: '#ff5a5a' },
  legend: 'Drone laser scout (simulated): red obstacle > 30 cm, purple slope 15–25°, dark purple slope ≥ 25°, orange sand ripples, green clear' };
fs.writeFileSync(path.join(ROOT, 'sim/out/layer_entry.json'), JSON.stringify(entry, null, 1));
const tot = summary.reduce((t, s) => t.map((v, i) => v + s.metres[i]), [0, 0, 0, 0, 0]);
console.log(JSON.stringify({ features: feats.length, flights: summary.length, landed: summary.filter(s => s.phase === 'landed').length, metres: Object.fromEntries(NAMES.map((n, i) => [n, +tot[i].toFixed(1)])) }));
summary.forEach(s => console.log(`${s.id} sol ${s.near_sol} ${s.phase} rmse ${s.rmse_cm} cm  clear/sand/caution/obst/nogo m: ${s.metres.join(' / ')}`));
