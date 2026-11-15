"""Items 4 + 5: which horizontal frame are the rover waypoints in, and where
does the 12-15 m height gap come from?
Inputs (read-only): data/clean/geology/dtm_box.tif (HiRISE DTM, our frame),
raw/msl_gale_dem_1m_box.tif (USGS MSL Gale DEM 1 m v3, the orthophoto mosaic's DEM),
raw/mola_463m_gale.tif, raw/hrsc_mola_blend_200m_gale.tif, data/raw/geology/rover/MSL_waypoints.json
Output: derived/frame_datum_tests.json (+ console)
Run: python -I scripts/04_frame_and_datum_tests.py
"""
import os, json, math
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from pyproj import CRS, Transformer
from scipy.ndimage import gaussian_filter, map_coordinates

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(HERE)
HI = os.path.join(ROOT, "data", "clean", "geology", "dtm_box.tif")
GD = os.path.join(HERE, "raw", "msl_gale_dem_1m_box.tif")
MOLA = os.path.join(HERE, "raw", "mola_463m_gale.tif")
HRSC = os.path.join(HERE, "raw", "hrsc_mola_blend_200m_gale.tif")
WP = os.path.join(ROOT, "data", "raw", "geology", "rover", "MSL_waypoints.json")
GEO = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")
out = {}

def load(p):
    with rasterio.Env(GDAL_PAM_ENABLED="NO"), rasterio.open(p) as d:
        a = d.read(1).astype("float64"); nd = d.nodata
        if nd is not None: a[a == nd] = np.nan
        a[a < -1e30] = np.nan
        return a, d.transform, d.crs

gd, gtr, gcrs = load(GD)
hi, htr, hcrs = load(HI)

# --- HiRISE DTM resampled onto the Gale DEM grid (1 m, eqc lon_0=0)
hi_on = np.full(gd.shape, np.nan)
with rasterio.Env(GDAL_PAM_ENABLED="NO"):
    reproject(np.nan_to_num(hi, nan=-9999), hi_on, src_transform=htr, src_crs=hcrs, dst_transform=gtr,
              dst_crs=gcrs, src_nodata=-9999, dst_nodata=np.nan, resampling=Resampling.bilinear)

# --- Horizontal offset DEM-to-DEM: correlate high-passed (local relief) surfaces
def hp(a):
    v = np.isfinite(a); f = np.where(v, a, np.nanmean(a))
    r = f - gaussian_filter(f, 15); r = gaussian_filter(r, 1.5)
    r[~v] = 0; return (r - r[v].mean()) / r[v].std(), v
valid = np.isfinite(gd) & np.isfinite(hi_on)
ys, xs = np.where(valid); y0, y1, x0, x1 = ys.min() + 60, ys.max() - 60, xs.min() + 60, xs.max() - 60
A, _ = hp(gd[y0:y1, x0:x1]); B, _ = hp(hi_on[y0:y1, x0:x1])
h, w = A.shape; win = np.outer(np.hanning(h), np.hanning(w))
c = np.fft.fftshift(np.fft.ifft2(np.fft.fft2(A * win) * np.conj(np.fft.fft2(B * win))).real)
cy, cx = h // 2, w // 2; S = 120
sub = c[cy-S:cy+S+1, cx-S:cx+S+1]; iy, ix = np.unravel_index(np.argmax(sub), sub.shape)
def para(v, i):
    d = v[i-1] - 2*v[i] + v[i+1]; return i + (0.5*(v[i-1]-v[i+1])/d if d else 0)
fy, fx = para(sub[:, ix], iy) - S, para(sub[iy, :], ix) - S
lat0 = -4.805; px = abs(gtr.a)  # eqc lat_ts=0: x metres are equatorial metres; ground = x * cos(lat)
dE_eqc, dN = fx * px, -fy * px
dE_ground = dE_eqc * math.cos(math.radians(lat0))
out["galeDEM_minus_hiriseDTM_horizontal"] = {
    "east_m_ground": dE_ground, "north_m": dN, "total_m": math.hypot(dE_ground, dN),
    "east_m_eqc_grid": dE_eqc, "note": "+ = feature appears further east/north in the USGS Gale DEM than in our HiRISE DTM"}

# --- Shift HiRISE onto Gale frame and get vertical difference statistics
hi_shift = np.full(gd.shape, np.nan)
sh_tr = rasterio.Affine(htr.a, htr.b, htr.c + dE_eqc, htr.d, htr.e, htr.f + dN)  # both eqc on same sphere; lon_0 differs only by a constant x offset
with rasterio.Env(GDAL_PAM_ENABLED="NO"):
    reproject(np.nan_to_num(hi, nan=-9999), hi_shift, src_transform=sh_tr, src_crs=hcrs, dst_transform=gtr,
              dst_crs=gcrs, src_nodata=-9999, dst_nodata=np.nan, resampling=Resampling.bilinear)
for k, arr in (("as_is", hi_on), ("after_horizontal_shift", hi_shift)):
    d = (arr - gd)[np.isfinite(arr - gd)]
    out[f"hiriseDTM_minus_galeDEM_vertical_{k}"] = {"mean": d.mean(), "median": float(np.median(d)), "std": d.std(),
        "p05": float(np.percentile(d, 5)), "p95": float(np.percentile(d, 95)), "n": int(d.size)}

# --- Waypoints: sample both DEMs
feats = json.load(open(WP))["features"]
to_g = Transformer.from_crs(GEO, gcrs, always_xy=True); to_h = Transformer.from_crs(GEO, hcrs, always_xy=True)
def sample(a, tr, x, y):
    col, row = ~tr * (x, y)
    v = map_coordinates(a, [[row - 0.5], [col - 0.5]], order=1, mode="nearest", cval=np.nan)[0]
    return float(v)
rows = []
for f in feats:
    p = f["properties"]; lon, lat = f["geometry"]["coordinates"][:2]
    if not (137.36 <= lon <= 137.40 and -4.83 <= lat <= -4.78) or p.get("elev_geoid") is None: continue
    xg, yg = to_g.transform(lon, lat); xh, yh = to_h.transform(lon, lat)
    rows.append(dict(sol=p["sol"], rover=p["elev_geoid"], east=p.get("easting"), north=p.get("northing"), xg=xg, yg=yg,
                     gale=sample(gd, gtr, xg, yg), hirise=sample(hi, htr, xh, yh),
                     hirise_shifted=sample(hi, htr, xh - dE_eqc, yh - dN)))
R = {k: np.array([r[k] for r in rows], float) for k in ("rover", "gale", "hirise", "hirise_shifted", "east", "north", "xg", "yg")}
def st(d):
    d = d[np.isfinite(d)]; return {"mean": d.mean(), "median": float(np.median(d)), "std": d.std(),
                                   "max_abs": float(np.abs(d).max()), "n": int(d.size)}
out["waypoints_in_box"] = len(rows)
out["waypoint_easting_northing_minus_projected_lonlat_m"] = {"east": st(R["east"] - R["xg"]), "north": st(R["north"] - R["yg"])}
out["galeDEM_minus_rover_at_waypoints"] = st(R["gale"] - R["rover"])
out["hiriseDTM_minus_rover_at_waypoints_as_given"] = st(R["hirise"] - R["rover"])
out["hiriseDTM_minus_rover_at_waypoints_shifted_into_hirise_frame"] = st(R["hirise_shifted"] - R["rover"])
out["examples"] = [{k: r[k] for k in ("sol", "rover", "gale", "hirise", "hirise_shifted")} for r in rows if r["sol"] in (4534, 4600, 4709, 5073)]

# --- Absolute vertical reference: MOLA and HRSC/MOLA box means vs both 1 m DEMs
def box_mean(path):
    a, tr, crs = load(path); t = Transformer.from_crs(GEO, crs, always_xy=True)
    xs_, ys_ = t.transform([137.36, 137.40], [-4.83, -4.78]); c0, r0 = ~tr * (min(xs_), max(ys_)); c1, r1 = ~tr * (max(xs_), min(ys_))
    return float(np.nanmean(a[int(r0):int(math.ceil(r1)), int(c0):int(math.ceil(c1))]))
inner = (slice(60, -60), slice(60, -60))
out["box_mean_elevation_m"] = {"MOLA_463m": box_mean(MOLA), "HRSC_MOLA_200m": box_mean(HRSC),
                               "USGS_Gale_DEM_1m": float(np.nanmean(gd[inner])), "HiRISE_DTM_1m": float(np.nanmean(hi))}
json.dump(out, open(os.path.join(HERE, "derived", "frame_datum_tests.json"), "w"), indent=1, default=float)
print(json.dumps(out, indent=1, default=float))
