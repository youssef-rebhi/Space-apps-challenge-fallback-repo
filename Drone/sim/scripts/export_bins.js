#!/usr/bin/env node
// Fly many simulated scouting flights and export one row per 20 cm map bin for machine learning.
// Features come from the simulator core itself (SimCore.features), so training and the web page match.
// Output: sim/data/ml_bins.csv  (group = real route segment F00..F17, or SYN for the invented world)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'Drone_Simulator.html'), 'utf8');
const m = { exports: {} }; new Function('module', html.match(/<script id="sim-core">([\s\S]*?)<\/script>/)[1])(m); const Sim = m.exports;

const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'sim/data/route_flights.json'), 'utf8')).flights;
const aug = JSON.parse(fs.readFileSync(path.join(ROOT, 'sim/data/route_flights_aug.json'), 'utf8')).flights;
const out = [['set', 'group', 'flight', 'seed', 'x', ...Sim.FEATURES, 'truth', 'rule'].join(',')];
let nFlights = 0;
function add(set, group, flight, seed, params) {
  const s = Sim.runToEnd(Object.assign({}, params, { seed, ml: false }));
  const a = Sim.analyze(s); if (!a) return;
  const F = Sim.features(a.x, a.z, a.C);
  a.x.forEach((x, i) => {
    if (!F[i] || a.truthLabel[i] < 0) return;
    out.push([set, group, flight, seed, x.toFixed(2), ...F[i].map(v => Number.isFinite(v) ? +v.toFixed(5) : ''), a.truthLabel[i], a.labelRule[i]].join(','));
  });
  nFlights++;
}
const R = Sim.SCENARIOS.real;
for (const f of base) for (const seed of [1, 2, 3]) add('base', f.group || f.id.slice(0, 3), f.id, seed, Object.assign({}, R, { terrain: f.terrain, route: [f.scout, 0] }));
for (const f of aug) for (const seed of [4, 5]) add('aug', f.group, f.id, seed, Object.assign({}, R, { terrain: f.terrain, route: [f.scout, 0] }));
for (const k of ['normal', 'gusty']) for (const seed of [1, 2, 3, 4, 5]) add('syn', 'SYN', k, seed, Sim.SCENARIOS[k]);
fs.writeFileSync(path.join(ROOT, 'sim/data/ml_bins.csv'), out.join('\n'));
console.log(`flights ${nFlights}, rows ${out.length - 1}`);
