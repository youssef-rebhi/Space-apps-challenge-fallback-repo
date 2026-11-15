// Checks mars24.js against the two worked examples on NASA GISS's Mars24 algorithm page.
// Run: node mars24_check.mjs   (exit code 1 if any value is off)
import { marsTime, sunAtMoment, sunAtLTST } from "./mars24.js";

let bad = 0;
const near = (name, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) bad++;
  console.log(`${ok ? "ok " : "BAD"} ${name.padEnd(14)} got ${got.toFixed(5).padStart(11)}  page ${want}`);
};

// Example 1: 2000-01-06 00:00:00 UTC, 0 W, 0 N; the page uses TT-UTC = 64.184 s for this date.
let r = sunAtMoment(947116800000, 0, 0, 64.184);
console.log("Example 1");
near("dt J2000", r.dt, 4.50074, 1e-5); near("M", r.M, 21.74558, 1e-4); near("alphaFMS", r.aFMS, 272.74566, 1e-4);
near("PBS", r.pbs, 0.00142, 1e-5); near("nu-M", r.nuM, 4.44193, 1e-4); near("Ls", r.Ls, 277.18758, 1e-4);
near("EOT deg", r.eot, -5.18774, 1e-4); near("MST h", r.mst, 23.99425, 1e-4); near("LTST h", r.ltst, 23.6484, 1e-4);
near("subsolar lon", r.subsolarLonW, 174.726, 1e-3); near("decl", r.decl, -25.22825, 1e-4);
near("RM AU", r.RM, 1.39358, 1e-5);
near("zenith", r.zenith, 154.26182, 1e-3); near("azimuth", r.azimuth, 191.03905, 1e-3);

// Example 2: Spirit landing, 2004-01-03 13:46:31 UTC, 184.702 W, -14.640 N.
r = sunAtMoment(1073137591000, -14.64, 184.702, 64.184);
console.log("Example 2");
near("Ls", r.Ls, 327.32416, 1e-4); near("EOT deg", r.eot, -12.77553, 1e-4); near("MST h", r.mst, 13.16537, 1e-4);
near("LMST h", r.lmst, 0.8519, 1e-4); near("LTST h", r.ltst, 0.00025, 2e-4);
// The page's D-1 formula applied to the page's own Ls (327.32416) gives -13.42040; the page prints -13.42065.
// The 0.00025 deg (about 1 arc-second) gap is inside the page's example, not in this code.
near("decl", r.decl, -13.42065, 3e-4);
near("zenith", r.zenith, 151.93895, 1e-3); near("azimuth", r.azimuth, 179.99383, 1e-3);
near("RM AU", r.RM, 1.47767, 1e-5);

// The LTST shortcut must give the same Sun as the full method.
const s = sunAtLTST(1073137591000, r.ltst, -14.64, 64.184);
near("LTST shortcut Z", s.zenith, r.zenith, 1e-3);

// Our site at the team's EVA start (09:00 LTST), on 2026-11-15.
const g = sunAtLTST(Date.UTC(2026, 10, 15, 12), 9.0, -4.862);
console.log(`Gale box, 2026-11-15, 09:00 LTST: Ls ${g.Ls.toFixed(1)}, Sun elevation ${g.elevation.toFixed(1)} deg, azimuth ${g.azimuth.toFixed(1)} deg`);
process.exit(bad ? 1 : 0);
