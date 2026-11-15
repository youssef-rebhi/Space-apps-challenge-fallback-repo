// Map sections: cut one piece out of the Mount Sharp box, for every layer at once.
//
// All layers share one frame (web/terrain/terrain.json):
//   x = metres east of the box's west edge, y = metres north of its south edge (eqc grid metres).
// The CRS is equirectangular (+proj=eqc +lat_ts=0, Mars sphere R = 3396190 m), so lon/lat <-> x/y is linear.
// A section is therefore only numbers:
//   {cx, cy, w, h, rot}  centre (m), width and height (m), rot = bearing of the section's "up" side,
//                        in degrees clockwise from north (0 = north up).
// Extra fields: kind, label, spec (the text that makes it again), path ([[x, y], ...] when made from a path).
//
// No three.js, no DOM: the team app can import this file as it is.
// Display numbers (margin, minimum size, point radius) are ASSUMPTIONS A31-A33 in docs/ASSUMPTIONS.md.

export const DEFAULTS = {
  margin: 100,   // m added around a path (A31)
  min: 300,      // m, smallest section side (A32)
  radius: 200,   // m, half-size of a section around one point (A33)
};

// ---------------------------------------------------------------- frame: lon/lat <-> local metres
export function makeFrame(terrain) {
  const [W, H] = terrain.size_m;
  const [lonW, latS, lonE, latN] = terrain.lonlat_bounds;
  const f = {
    W, H, lonW, latS, lonE, latN,
    // true ground distance east-west = grid metres x cos(lat) (terrain.json local_frame)
    ewGround: Math.cos(((latS + latN) / 2) * Math.PI / 180),
    toXY(p) {
      if (Array.isArray(p)) return [+p[0], +p[1]];
      if (p && p.lat != null && p.lon != null) return [(p.lon - lonW) / (lonE - lonW) * W, (p.lat - latS) / (latN - latS) * H];
      if (p && p.x != null && p.y != null) return [+p.x, +p.y];
      throw new Error('point needs {lat, lon}, {x, y} or [x, y]');
    },
    toLatLon(x, y) { return {lat: latS + y / H * (latN - latS), lon: lonW + x / W * (lonE - lonW)}; },
    inBox(x, y) { return x >= 0 && x <= W && y >= 0 && y <= H; },
    groundDist(a, b) { return Math.hypot((b[0] - a[0]) * f.ewGround, b[1] - a[1]); },
  };
  return f;
}

// ---------------------------------------------------------------- geometry of a section
const RAD = Math.PI / 180;
export const axes = sec => {                       // unit vectors in (east, north)
  const t = (sec.rot || 0) * RAD;
  return {right: [Math.cos(t), -Math.sin(t)], up: [Math.sin(t), Math.cos(t)]};
};
export function toSection(sec, x, y) {             // local metres -> metres from the centre along right / up
  const {right, up} = axes(sec), dx = x - sec.cx, dy = y - sec.cy;
  return {u: dx * right[0] + dy * right[1], v: dx * up[0] + dy * up[1]};
}
export function fromSection(sec, u, v) {
  const {right, up} = axes(sec);
  return [sec.cx + u * right[0] + v * up[0], sec.cy + u * right[1] + v * up[1]];
}
export function contains(sec, x, y, pad = 0) {
  const {u, v} = toSection(sec, x, y);
  return Math.abs(u) <= sec.w / 2 + pad && Math.abs(v) <= sec.h / 2 + pad;
}
export function corners(sec) {                     // bottom-left, bottom-right, top-right, top-left
  const a = sec.w / 2, b = sec.h / 2;
  return [fromSection(sec, -a, -b), fromSection(sec, a, -b), fromSection(sec, a, b), fromSection(sec, -a, b)];
}
export function bounds(sec) {                      // north-up box around the section
  const c = corners(sec), xs = c.map(p => p[0]), ys = c.map(p => p[1]);
  return {x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys)};
}
export const share = (frame, sec) => (sec.w * sec.h) / (frame.W * frame.H);   // share of the box area
export function cellWindow(sec, frame, cols, rows, pad = 1) {                 // heightmap / raster cells that cover it (row 0 = north)
  const b = bounds(sec), cw = frame.W / cols, ch = frame.H / rows, cl = (v, n) => Math.max(0, Math.min(n - 1, v));
  return {c0: cl(Math.floor(b.x0 / cw) - pad, cols), c1: cl(Math.ceil(b.x1 / cw) + pad, cols),
          r0: cl(Math.floor((frame.H - b.y1) / ch) - pad, rows), r1: cl(Math.ceil((frame.H - b.y0) / ch) + pad, rows)};
}

// grow the short side so w / h matches a screen shape, then keep the section on the map
function finish(frame, sec, o = {}) {
  const min = o.min ?? DEFAULTS.min;
  sec.w = Math.max(sec.w, min); sec.h = Math.max(sec.h, min);
  const asp = parseAspect(o.aspect);
  if (asp) { if (sec.w / sec.h < asp) sec.w = sec.h * asp; else sec.h = sec.w / asp; }
  if (!sec.rot) {                                  // north up: shift inside the box, never larger than the box
    sec.w = Math.min(sec.w, frame.W); sec.h = Math.min(sec.h, frame.H);
    sec.cx = Math.min(frame.W - sec.w / 2, Math.max(sec.w / 2, sec.cx));
    sec.cy = Math.min(frame.H - sec.h / 2, Math.max(sec.h / 2, sec.cy));
  } else {                                         // turned: parts outside the box are shown empty
    sec.cx = Math.min(frame.W, Math.max(0, sec.cx)); sec.cy = Math.min(frame.H, Math.max(0, sec.cy));
  }
  for (const k of ['cx', 'cy', 'w', 'h']) sec[k] = Math.round(sec[k] * 10) / 10;
  sec.rot = Math.round((sec.rot || 0) * 10) / 10;
  return sec;
}
function parseAspect(a) {
  if (!a) return 0;
  if (typeof a === 'number') return a > 0 ? a : 0;
  const m = String(a).match(/^(\d+(?:\.\d+)?)(?:[:x/](\d+(?:\.\d+)?))?$/);
  return m ? (+m[1]) / (m[2] ? +m[2] : 1) : 0;
}

// ---------------------------------------------------------------- the four ways to make a section
// 1. A path from A to B (the route the astronaut chose). heading: true turns it so A is at the bottom, B at the top.
export function sectionFromPath(frame, pts, o = {}) {
  const P = pts.map(p => frame.toXY(p)).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!P.length) throw new Error('empty path');
  const margin = o.margin ?? DEFAULTS.margin, A = P[0], B = P[P.length - 1];
  const rot = o.heading && (B[0] !== A[0] || B[1] !== A[1]) ? Math.atan2(B[0] - A[0], B[1] - A[1]) / RAD : 0;
  const tmp = {cx: A[0], cy: A[1], w: 0, h: 0, rot};
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of P) { const {u, v} = toSection(tmp, p[0], p[1]); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const [cx, cy] = fromSection(tmp, (u0 + u1) / 2, (v0 + v1) / 2);
  return finish(frame, {kind: 'path', cx, cy, w: u1 - u0 + 2 * margin, h: v1 - v0 + 2 * margin, rot, path: P, label: o.label || 'Path A → B'}, o);
}
// 2. A point and a radius (base, a POI, an EVA stop)
export function sectionFromPoint(frame, p, r = DEFAULTS.radius, o = {}) {
  const [x, y] = frame.toXY(p);
  return finish(frame, {kind: 'point', cx: x, cy: y, w: 2 * r, h: 2 * r, rot: o.rot || 0, point: [x, y], label: o.label || 'Point'}, o);
}
// 3. Any rectangle in local metres (or two {lat, lon} corners)
export function sectionFromBox(frame, a, b, o = {}) {
  const [x0, y0] = frame.toXY(a), [x1, y1] = frame.toXY(b);
  return finish(frame, {kind: 'box', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), rot: 0, label: o.label || 'Box'}, {...o, min: o.min ?? 0});
}
export const wholeBox = frame => ({kind: 'whole', cx: frame.W / 2, cy: frame.H / 2, w: frame.W, h: frame.H, rot: 0, label: 'Whole box', spec: 'whole'});

// 4. Ready-made: one section per route leg and per POI pin (needs web/overlays.json)
export function presets(frame, overlays, profile = 'foot', o = {}) {
  const out = [];
  for (const r of overlays.routes.filter(r => r.profile === profile)) {
    const spec = `route:${profile}:${r.leg.replace('->', '-')}`;
    out.push({spec, group: 'Route legs', label: `Sol ${r.leg.replace('->', ' → ')}`, section: parse(frame, spec, {overlays}, o)});
  }
  for (const s of overlays.poi_sites) {
    const spec = `poi:${s.site}`;
    out.push({spec, group: 'Points of interest', label: `${s.site}. ${s.names.join(', ')}`, section: parse(frame, spec, {overlays}, o)});
  }
  return out;
}

// ---------------------------------------------------------------- text form, for URLs (?section=...)
//   route:foot:4718-5050   one route leg (pipeline routes in overlays.json)
//   path:lat,lon;lat,lon   any path, as the team app's {lat, lon} points (lat negative = south)
//   pathxy:x,y;x,y         the same in local metres
//   poi:3 | poi:L5-0011    a POI pin (site number) or a POI id; size from o.radius
//   point:lat,lon | xy:x,y one point; size from o.radius
//   box:x0,y0,x1,y1        local metres;  boxll:lat0,lon0,lat1,lon1
//   sec:cx,cy,w,h,rot      exact section (what encode() writes)
//   whole                  the whole box
// Options o: margin, min, radius, heading (bool), aspect ('4:3'), label.
const nums = s => s.split(',').map(Number);
const pairs = s => s.split(/[;|]/).filter(Boolean).map(nums);
export function parse(frame, spec, data = {}, o = {}) {
  spec = String(spec || 'whole').trim();
  const i = spec.indexOf(':'), kind = i < 0 ? spec : spec.slice(0, i), rest = i < 0 ? '' : spec.slice(i + 1);
  const r = o.radius ?? DEFAULTS.radius;
  let sec;
  switch (kind) {
    case 'whole': sec = wholeBox(frame); break;
    case 'route': {
      const parts = rest.split(':'), leg = parts.pop(), prof = parts[0] || o.profile || 'foot';
      const R = data.overlays?.routes.find(x => x.profile === prof && x.leg.replace('->', '-') === leg.replace('->', '-'));
      if (!R) throw new Error(`no route leg "${leg}" for ${prof}`);
      sec = sectionFromPath(frame, R.xyz.map(p => [p[0], p[1]]), {...o, label: o.label || `Route sol ${R.leg.replace('->', ' → ')} (${prof === 'rover' ? 'rover' : 'crew on foot'})`});
      sec.route = {profile: prof, leg: R.leg, props: R.props};
      break;
    }
    case 'path': sec = sectionFromPath(frame, pairs(rest).map(([lat, lon]) => ({lat, lon})), o); break;
    case 'pathxy': sec = sectionFromPath(frame, pairs(rest), o); break;
    case 'poi': {
      const S = data.overlays?.poi_sites.find(s => String(s.site) === rest || s.poi_ids.includes(rest));
      const P = S || data.overlays?.pois.find(p => p.poi_id === rest);
      if (!P) throw new Error(`no POI "${rest}"`);
      sec = sectionFromPoint(frame, [P.x, P.y], r, {...o, label: o.label || (S ? `${S.site}. ${S.names.join(', ')}` : P.name)});
      sec.site = S ? S.site : null;
      break;
    }
    case 'point': { const [lat, lon] = nums(rest); sec = sectionFromPoint(frame, {lat, lon}, r, o); break; }
    case 'xy': sec = sectionFromPoint(frame, nums(rest), r, o); break;
    case 'box': { const [x0, y0, x1, y1] = nums(rest); sec = sectionFromBox(frame, [x0, y0], [x1, y1], o); break; }
    case 'boxll': { const [a, b, c, d] = nums(rest); sec = sectionFromBox(frame, {lat: a, lon: b}, {lat: c, lon: d}, o); break; }
    case 'sec': { const [cx, cy, w, h, rot = 0] = nums(rest); sec = finish(frame, {kind: 'sec', cx, cy, w, h, rot, label: o.label || 'Section'}, {min: 0}); break; }
    default: throw new Error(`unknown section "${kind}"`);
  }
  if (![sec.cx, sec.cy, sec.w, sec.h].every(Number.isFinite)) throw new Error(`bad numbers in "${spec}"`);
  sec.spec = spec;
  return sec;
}
// read ?section=...&margin=&min=&r=&heading=1&aspect= from a URL query
export function fromQuery(frame, q, data = {}, extra = {}) {
  const num = k => (q.get(k) != null && q.get(k) !== '' && Number.isFinite(+q.get(k)) ? +q.get(k) : undefined);
  const o = {margin: num('margin'), min: num('min'), radius: num('r'), heading: q.get('heading') === '1', aspect: q.get('aspect') || undefined, ...extra};
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return q.get('section') ? parse(frame, q.get('section'), data, o) : null;
}
export const encode = sec => `sec:${[sec.cx, sec.cy, sec.w, sec.h, sec.rot || 0].map(v => +(+v).toFixed(1)).join(',')}`;
