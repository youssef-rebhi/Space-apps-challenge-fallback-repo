// Geo layers made by Youssef & Malek (Map_layer/Layer2_Elevation):
// USGS MSL Gale DEM 1 m (same frame as the rover waypoints), slope classes, whole-crater elevation.
// Combined GO/NO-GO map (Map_layer/martian_map, Youssef): worst of slope, roughness, terrain unit, ground truth.
// Slope thresholds GO < 15°, caution 15-25°, NO-GO >= 25° are TEAM ASSUMPTIONS (METADATA.md item 6).
import { DATA } from "./mission.js";
export const GEO = DATA + "geo/";

let cache = null;
export function loadGeo() {
  if (cache) return cache;
  cache = (async () => {
    const r = await fetch(GEO + "leaflet_bounds.json");
    if (!r.ok) throw new Error("no geo layers");
    const b = await r.json();
    const [trav, elev] = await Promise.all([
      fetch(GEO + "traverse.json").then((x) => (x.ok ? x.json() : [])).catch(() => []),
      fetch(GEO + "elevation_hi.json").then((x) => (x.ok ? x.json() : fetch(GEO + "elevation_120.json").then((y) => (y.ok ? y.json() : null)))).catch(() => null),
    ]);
    const slope = await readClasses("slope_classes_box.png", b.overlays["slope_classes_box.png"].bounds, SLOPE_RGB);
    // Youssef's combined GO/NO-GO map (crew on foot): the grid the route planner uses
    const gk = "gonogo_foot.png";
    const mapAt = b.overlays[gk] ? await readClasses(gk, b.overlays[gk].bounds, GONOGO_RGB, true).catch(() => null) : null;
    return { bounds: b.overlays, traverse: trav, elev, slopeAt: slope, mapAt };
  })().catch((e) => { cache = null; throw e; });
  return cache;
}

// read the slope-class PNG once, then look up the class at any lat/lon
const SLOPE_RGB = [[128, 128, 128, 0], [26, 150, 65, 1], [253, 174, 97, 2], [215, 25, 28, 3]];
const GONOGO_RGB = [[158, 158, 158, 0], [26, 152, 80, 1], [244, 196, 48, 2], [215, 48, 39, 3]];
async function readClasses(file, bounds, CLASS_RGB, keepUnknown = false) {
  const img = new Image(); img.src = GEO + file;
  await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const [[s, w], [n, e]] = bounds;
  const classAt = (i) => {
    if (px[i + 3] === 0) return 0;
    let best = 0, bd = 1e9;
    for (const [r, g, bl, k] of CLASS_RGB) { const d = (px[i] - r) ** 2 + (px[i + 1] - g) ** 2 + (px[i + 2] - bl) ** 2; if (d < bd) { bd = d; best = k; } }
    return best;
  };
  // class grid for path finding (0 unknown, 1 GO, 2 caution, 3 NO-GO)
  const grid = new Uint8Array(c.width * c.height);
  for (let k = 0; k < grid.length; k++) grid[k] = classAt(k * 4);
  lookup.grid = { W: c.width, H: c.height, data: grid, s, w, n, e };
  return lookup;
  function lookup(lat, lon) {
    const x = Math.floor(((lon - w) / (e - w)) * c.width), y = Math.floor(((n - lat) / (n - s)) * c.height);
    if (x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
    const i = (y * c.width + x) * 4;
    const k = classAt(i);
    return k === 0 ? (keepUnknown ? 0 : null) : k; // 0 unknown, 1 GO, 2 caution, 3 NO-GO
  }
}

export const MAP_TXT = { 0: "UNKNOWN (send the scout)", 1: "GO", 2: "CAUTION", 3: "NO-GO" };
export const SLOPE_TXT = { 1: "slope < 15°", 2: "slope 15–25°", 3: "slope ≥ 25°" };

// elevation at a point from the 120×120 grid (nearest cell)
export function elevAt(elev, lat, lon) {
  if (!elev) return null;
  const nearest = (arr, v) => { let k = 0, d = 1e9; arr.forEach((a, j) => { const dd = Math.abs(a - v); if (dd < d) { d = dd; k = j; } }); return k; };
  return elev.z[nearest(elev.lat, lat)]?.[nearest(elev.lon, lon)] ?? null;
}
