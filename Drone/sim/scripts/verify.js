#!/usr/bin/env node
// Verification loop for Drone_Simulator.html.
// Loads the SAME simulation core the web page runs, flies every scenario over many seeds,
// checks pass/fail rules, writes sim/results/verify_latest.md, exits 1 if any rule fails.
//   node sim/scripts/verify.js            (10 seeds)
//   node sim/scripts/verify.js --seeds 40   (numbers in README.md)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'Drone_Simulator.html'), 'utf8');
const core = html.match(/<script id="sim-core">([\s\S]*?)<\/script>/)[1];
const m = { exports: {} }; new Function('module', core)(m); const Sim = m.exports;

const argSeeds = process.argv.indexOf('--seeds');
const NSEED = argSeeds > 0 ? +process.argv[argSeeds + 1] : 10;
const seeds = Array.from({ length: NSEED }, (_, i) => 101 + i);
const med = a => { const b = a.filter(v => v != null && !isNaN(v)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };

function runSet(base, over = {}, seedList = seeds) {
  return seedList.map(seed => {
    const p = Object.assign({}, base, over, { seed });
    const t0 = Date.now(); const s = Sim.runToEnd(p); const a = Sim.analyze(s);
    return { seed, phase: s.phase, tAir: s.tAir, td: s.touch ? s.touch.speed : NaN, posErr: s.maxPosErr,
      rmse: a ? a.rmse : NaN, found: a ? a.found : 0, total: a ? a.totalObs : 0, falseObs: a ? a.falseObs : 0,
      sandCov: a ? a.sandCov : null, sandFalse: a ? a.sandFalse : null, iou: a ? a.iou : {}, ic: a ? a.iouCounts : null, ms: Date.now() - t0 };
  });
}
function stats(rs) {
  const n = rs.length, landed = rs.filter(r => r.phase === 'landed').length;
  // pooled IoU: add up intersections and unions over all flights (a per-flight median punishes flights with no sand at all)
  const pool = c => { let I = 0, U = 0; for (const r of rs) if (r.ic) { I += r.ic[c].I; U += r.ic[c].U; } return U ? I / U : NaN; };
  return { n, landed, landRate: landed / n, crashRate: 1 - landed / n, rmse: med(rs.map(r => r.rmse)), found: med(rs.map(r => r.total ? r.found / r.total : NaN)),
    sandCov: med(rs.map(r => r.sandCov)), sandFalse: med(rs.map(r => r.sandFalse)), td: med(rs.map(r => r.td)), posErr: med(rs.map(r => r.posErr)),
    iouSand: pool('sand'), iouObst: pool('obstacle'), iouSteep: pool('steep'), iouNogo: pool('nogo'), iouClear: pool('clear'),
    ms: med(rs.map(r => r.ms)) };
}

const S = Sim.SCENARIOS, results = {}, checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const f = (v, d = 2) => (v == null || isNaN(v)) ? '–' : v.toFixed(d);

results.normal = stats(runSet(S.normal));
results.gusty = stats(runSet(S.gusty));
results.gustyNoTilt = stats(runSet(S.gusty, { tilt: false }));
results.gustyNoLoop = stats(runSet(S.gusty, { loop: false }));
results.f72 = stats(runSet(S.f72));
results.f72fix = stats(runSet(S.f72fix));
results.f72stopOnly = stats(runSet(S.f72, { stop: true }));

const r = results;
check('normal: lands every time', r.normal.landRate === 1, `${r.normal.landed}/${r.normal.n}`);
check('normal: map error < 10 cm', r.normal.rmse < 0.10, `${f(r.normal.rmse * 100, 1)} cm`);
check('normal: finds ≥ 85% of obstacles', r.normal.found >= 0.85, f(r.normal.found));
check('normal: finds ≥ 90% of sand', r.normal.sandCov >= 0.90, f(r.normal.sandCov));
check('normal: false sand ≤ 15%', r.normal.sandFalse <= 0.15, f(r.normal.sandFalse));
check('gusty: lands ≥ 90%', r.gusty.landRate >= 0.9, `${r.gusty.landed}/${r.gusty.n}`);
check('gusty: map error < 10 cm', r.gusty.rmse < 0.10, `${f(r.gusty.rmse * 100, 1)} cm`);
check('tilt correction matters (error ×2 without it)', r.gustyNoTilt.rmse > 2 * r.gusty.rmse, `${f(r.gustyNoTilt.rmse * 100, 1)} vs ${f(r.gusty.rmse * 100, 1)} cm`);
// measured over 40 seeds: replay crashes 45%, fixes 7.5%, stop rule alone 42% (see README.md)
check('flight 72 replay crashes ≥ 30%', r.f72.crashRate >= 0.3, f(r.f72.crashRate));
check('flight 72 + fixes crashes ≤ 15%', r.f72fix.crashRate <= 0.15, f(r.f72fix.crashRate));
check('fixes at least halve the crash rate', r.f72fix.crashRate <= r.f72.crashRate / 2, `${f(r.f72fix.crashRate)} vs ${f(r.f72.crashRate)}`);
check('fixes beat stop rule alone', r.f72fix.landRate > r.f72stopOnly.landRate, `${f(r.f72fix.landRate)} vs ${f(r.f72stopOnly.landRate)}`);
check('fixes keep the position error small (< 1 m median)', r.f72fix.posErr < 1, `${f(r.f72fix.posErr)} m vs replay ${f(r.f72.posErr)} m`);

// determinism: same seed, same answer (needed to trust any comparison)
const a1 = Sim.runToEnd(Object.assign({}, S.gusty, { seed: 7 })), a2 = Sim.runToEnd(Object.assign({}, S.gusty, { seed: 7 }));
check('deterministic for a given seed', a1.x === a2.x && a1.pts.length === a2.pts.length, `x ${f(a1.x, 4)} / ${f(a2.x, 4)}`);

// real route flights (USGS DEM along Curiosity's path), if the terrain file exists
const RF = path.join(ROOT, 'sim', 'data', 'route_flights.json');
if (fs.existsSync(RF)) {
  const flights = JSON.parse(fs.readFileSync(RF, 'utf8')).flights;
  const rs = []; const few = seeds.slice(0, Math.max(3, Math.round(NSEED / 3)));
  for (const fl of flights) rs.push(...runSet(S.real || S.normal, { terrain: fl.terrain, route: [fl.scout, 0] }, few));
  results.real_route = stats(rs);
  const rn = results.real_route;
  check('real route: lands ≥ 90%', rn.landRate >= 0.9, `${rn.landed}/${rn.n}`);
  check('real route: map error < 15 cm', rn.rmse < 0.15, `${f(rn.rmse * 100, 1)} cm`);
  check('real route: obstacle IoU ≥ 0.4', rn.iouObst >= 0.4 || isNaN(rn.iouObst), f(rn.iouObst));
  check('real route: slope 15–25° IoU ≥ 0.5', rn.iouSteep >= 0.5 || isNaN(rn.iouSteep), f(rn.iouSteep));
  check('real route: slope ≥ 25° IoU ≥ 0.5', rn.iouNogo >= 0.5 || isNaN(rn.iouNogo), f(rn.iouNogo));
  check('real route (hand rule): sand IoU recorded', true, f(rn.iouSand) + ' (known weak; the ML checks below)');

  // ML sand model on route segments it never saw in training (different seeds than training too)
  const MF = path.join(ROOT, 'sim', 'data', 'sand_model.json');
  if (fs.existsSync(MF)) {
    const M = JSON.parse(fs.readFileSync(MF, 'utf8'));
    const held = (M.trained_on.match(/except ([A-Z0-9,]+)/) || [, ''])[1].split(',');
    const heldFlights = flights.filter(fl => held.includes(fl.id));
    const rule = [], ml = [];
    const hs = [201, 202, 203];
    for (const fl of heldFlights) rule.push(...runSet(S.real, { terrain: fl.terrain, route: [fl.scout, 0], ml: false }, hs));
    Sim.setModel(M);
    for (const fl of heldFlights) ml.push(...runSet(S.real, { terrain: fl.terrain, route: [fl.scout, 0] }, hs));
    Sim.setModel(null);
    results.heldout_rule = stats(rule); results.heldout_ml = stats(ml);
    const hr = results.heldout_rule, hm = results.heldout_ml;
    // v2 (rover-frame DEM): 3 of the 5 held-out segments have no sand, so absolute IoU is low; we test the relative claims
    const fa = rs => rs.reduce((t, r) => t + (r.ic ? r.ic.sand.FA : 0), 0);
    check('ML at least doubles sand IoU vs the rule on unseen segments', hm.iouSand >= 2 * hr.iouSand, `${f(hm.iouSand)} vs ${f(hr.iouSand)}, segments ${held.join(' ')}`);
    check('ML cuts false sand alarms by ≥ 50% on unseen segments', fa(ml) <= 0.5 * fa(rule), `${fa(ml)} vs ${fa(rule)} bins`);
    check('ML keeps obstacle and slope IoU (rule-based) unchanged', [['iouObst'], ['iouSteep'], ['iouNogo']].every(([k]) => (isNaN(hm[k]) && isNaN(hr[k])) || Math.abs(hm[k] - hr[k]) < 1e-9), `${f(hm.iouObst)}/${f(hm.iouSteep)}`);
    Sim.setModel(M); results.normal_ml = stats(runSet(S.normal)); Sim.setModel(null);
    check('ML does not break the invented world (sand IoU within 0.1 of rule)', results.normal_ml.iouSand >= results.normal.iouSand - 0.1, `${f(results.normal_ml.iouSand)} vs ${f(results.normal.iouSand)}`);
  }
}

const failed = checks.filter(c => !c.ok);
const rows = Object.entries(results).map(([k, v]) => `| ${k} | ${v.landed}/${v.n} | ${f(v.rmse * 100, 1)} | ${f(v.found)} | ${f(v.sandCov)} | ${f(v.sandFalse)} | ${f(v.iouObst)} | ${f(v.iouSteep)} | ${f(v.iouNogo)} | ${f(v.iouSand)} | ${f(v.td)} | ${f(v.posErr)} | ${v.ms} |`).join('\n');
const md = `# Simulator verification: ${failed.length ? 'FAIL' : 'PASS'}

Run: ${new Date().toISOString()} · ${NSEED} seeds per set · core loaded from Drone_Simulator.html

## Checks
${checks.map(c => `- ${c.ok ? 'PASS' : 'FAIL'} · ${c.name}: ${c.detail}`).join('\n')}

## Medians per set
| set | landed | map error cm | obstacles found | sand found | false sand | IoU obstacle (pooled) | IoU slope 15–25° (pooled) | IoU slope ≥ 25° (pooled) | IoU sand (pooled) | touchdown m/s | max pos err m | ms/flight |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows}
`;
fs.mkdirSync(path.join(ROOT, 'sim', 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'sim', 'results', 'verify_latest.md'), md);
console.log(md);
process.exit(failed.length ? 1 : 0);
