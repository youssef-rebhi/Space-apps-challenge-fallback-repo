// Sun position on Mars with NASA GISS's Mars24 algorithm.
// Source: "Mars24 Sunclock - Algorithm and Worked Examples", https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
// (Allison 1997, GRL 24, 1967-1970; Allison & McEwen 2000, Planet. Space Sci. 48, 215-235).
// Longitudes are WEST-positive, as on that page. Step names (A-2 ... D-6) follow the page.
// Checked against both worked examples on the page: run `node mars24_check.mjs`.

const D = Math.PI / 180;
const mod = (a, n) => ((a % n) + n) % n;

// B-3 perturbers: [A (deg), tau (Julian years), phi (deg)]
const PERT = [
  [0.0071, 2.2353, 49.409], [0.0057, 2.7543, 168.173], [0.0039, 1.1177, 191.837], [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704], [0.0020, 2.4694, 95.528], [0.0018, 32.8493, 49.095],
];

// TT - UTC = (TAI - UTC) + 32.184 s. TAI - UTC has been 37 s since 2017-01-01 (the page's example);
// there has been no leap second since. Pass another value if IERS adds one.
export const TT_MINUS_UTC = 69.184;

export function marsTime(ms, lonWest = 0, ttMinusUtc = TT_MINUS_UTC) {
  const jdut = 2440587.5 + ms / 8.64e7;                                     // A-2
  const jdtt = jdut + ttMinusUtc / 86400;                                    // A-5
  const dt = jdtt - 2451545.0;                                               // A-6
  const M = 19.3871 + 0.52402073 * dt;                                       // B-1
  const aFMS = 270.3871 + 0.524038496 * dt;                                  // B-2
  let pbs = 0;                                                               // B-3
  for (const [A, tau, phi] of PERT) pbs += A * Math.cos(D * ((0.985626 * dt) / tau + phi));
  const m = M * D;
  const nuM = (10.691 + 3.0e-7 * dt) * Math.sin(m) + 0.623 * Math.sin(2 * m) + 0.05 * Math.sin(3 * m)
    + 0.005 * Math.sin(4 * m) + 0.0005 * Math.sin(5 * m) + pbs;              // B-4
  const Ls = mod(aFMS + nuM, 360);                                           // B-5
  const l = Ls * D;
  const eot = 2.861 * Math.sin(2 * l) - 0.071 * Math.sin(4 * l) + 0.002 * Math.sin(6 * l) - nuM; // C-1 (deg)
  const mst = mod(24 * ((jdtt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626), 24);           // C-2
  const lmst = mod(mst - lonWest / 15, 24);                                  // C-3
  const ltst = mod(lmst + eot / 15, 24);                                     // C-4
  const subsolarLonW = mod(mst * 15 + eot + 180, 360);                       // C-5
  const decl = Math.asin(0.42565 * Math.sin(l)) / D + 0.25 * Math.sin(l);    // D-1
  const RM = 1.52367934 * (1.00436 - 0.09309 * Math.cos(m) - 0.004336 * Math.cos(2 * m)
    - 0.00031 * Math.cos(3 * m) - 0.00003 * Math.cos(4 * m));               // D-2, Mars-Sun distance (AU)
  return { jdtt, dt, M: mod(M, 360), aFMS: mod(aFMS, 360), pbs, nuM, Ls, eot, mst, lmst, ltst, subsolarLonW, decl, RM };
}

// D-5, D-6: Sun zenith, elevation and azimuth (degrees clockwise from north) for hour angle H (deg).
export function sunFromHourAngle(latPg, declDeg, H) {
  const p = latPg * D, d = declDeg * D, h = H * D;
  const cz = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(h);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cz))) / D;
  const azimuth = mod(Math.atan2(Math.sin(h), Math.cos(p) * Math.tan(d) - Math.sin(p) * Math.cos(h)) / D, 360);
  return { zenith, elevation: 90 - zenith, azimuth };
}

// Sun for a lander at a real moment: H = lon - subsolar lon (both west-positive).
export function sunAtMoment(ms, latPg, lonWest, ttMinusUtc = TT_MINUS_UTC) {
  const t = marsTime(ms, lonWest, ttMinusUtc);
  return { ...t, ...sunFromHourAngle(latPg, t.decl, lonWest - t.subsolarLonW) };
}

// Sun at a chosen local true solar time (hours) on the sol that contains `ms`.
// From C-3..C-5: H = lon - subsolar lon = 15 * (12 - LTST) (mod 360).
export function sunAtLTST(ms, ltstHours, latPg, ttMinusUtc = TT_MINUS_UTC) {
  const t = marsTime(ms, 0, ttMinusUtc);
  return { Ls: t.Ls, decl: t.decl, RM: t.RM, ltst: ltstHours, ...sunFromHourAngle(latPg, t.decl, 15 * (12 - ltstHours)) };
}

// Apparent diameter of the Sun (deg) at distance RM (AU). IAU nominal solar radius 695,700 km
// (IAU 2015 Resolution B3) and the IAU 2012 astronomical unit, 149,597,870.7 km.
export function sunDiameterDeg(RM) {
  return (2 * Math.atan(695700 / (RM * 149597870.7))) / D;
}

// Planetocentric -> planetographic latitude on the IAU 2000 Mars ellipsoid (3396.19 x 3376.20 km;
// Seidelmann et al. 2002, Celest. Mech. Dyn. Astron. 82, 83-110). Mars24 uses planetographic latitude.
export function planetographic(latPcDeg) {
  const k = (3396.19 / 3376.2) ** 2;
  return Math.atan(Math.tan(latPcDeg * D) * k) / D;
}
