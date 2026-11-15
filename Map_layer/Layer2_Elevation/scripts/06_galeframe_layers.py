"""Item 5 (decision applied) + item 6. Builds the box layers in the chosen
reference frame = USGS MSL Gale mosaic frame (rover waypoints are native to it).
Outputs (derived/):
  elevation_box_1m_GALEFRAME.tif          USGS MSL Gale DEM 1 m v3 cropped to the box (PRIMARY elevation)
  hirise_dtm_box_GALEFRAME.tif            our HiRISE DTM, georeference shifted by the measured offset (heights unchanged)
  hirise_red_c_box_GALEFRAME.tif          HiRISE RED_C 1 m orthoimage, same shift (base map consistent with rover)
  slope_box_3m_GALEFRAME.tif              Horn slope (deg) on the DEM averaged to 3 m (ASSUMPTION: 3 m baseline)
  slope_classes_box_3m_GALEFRAME.tif      1 GO / 2 caution / 3 NO-GO / 0 unknown (thresholds = ASSUMPTIONS below)
Run: python -I scripts/06_galeframe_layers.py
"""
import os, json, math
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.warp import reproject, Resampling
from pyproj import CRS, Transformer
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ROOT = os.path.dirname(HERE)
DER = os.path.join(HERE, "derived")
GEO = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")
BOX = (137.36, -4.83, 137.40, -4.78)
tests = json.load(open(os.path.join(DER, "frame_datum_tests.json")))
SHIFT_X = tests["galeDEM_minus_hiriseDTM_horizontal"]["east_m_eqc_grid"]   # grid metres
SHIFT_Y = tests["galeDEM_minus_hiriseDTM_horizontal"]["north_m"]
# ---- ASSUMPTIONS (team must confirm with a mentor; recorded in METADATA.md) ----
SLOPE_GO_MAX = 15.0       # deg: below = GO (green)
SLOPE_NOGO_MIN = 25.0     # deg: at/above = NO-GO (red); between = caution (orange)
BASELINE_M = 3.0          # slope computed on DEM block-averaged to 3 m
PROF = dict(driver="GTiff", compress="DEFLATE", tiled=True, blockxsize=256, blockysize=256)

def write(name, arr, tr, crs, nodata, desc, unit=None, dtype=None):
    p = os.path.join(DER, name)
    with rasterio.open(p, "w", width=arr.shape[1], height=arr.shape[0], count=1, dtype=dtype or arr.dtype,
                       crs=crs, transform=tr, nodata=nodata, **PROF) as d:
        d.write(arr.astype(dtype or arr.dtype), 1); d.set_band_description(1, desc)
        if unit: d.set_band_unit(1, unit)
    print("wrote", name, arr.shape); return p

# 1. Primary elevation: USGS Gale DEM cropped to box
with rasterio.open(os.path.join(HERE, "raw", "msl_gale_dem_1m_box.tif")) as g:
    t = Transformer.from_crs(GEO, g.crs, always_xy=True)
    xs, ys = t.transform([BOX[0], BOX[2]], [BOX[1], BOX[3]])
    w = from_bounds(min(xs), min(ys), max(xs), max(ys), g.transform).round_offsets().round_lengths()
    z = g.read(1, window=w).astype("float32"); gtr = g.window_transform(w); gcrs = g.crs
z[z < -1e30] = np.nan
write("elevation_box_1m_GALEFRAME.tif", np.nan_to_num(z, nan=-9999), gtr, gcrs, -9999,
      "Elevation m above Mars areoid, USGS MSL Gale DEM Mosaic 1m v3", "m", "float32")

# 2. HiRISE DTM + RED_C shifted into the Gale frame (pure georeference shift, values untouched)
def shifted_copy(src, name, desc, unit=None, clip=True):
    with rasterio.Env(GDAL_PAM_ENABLED="NO"), rasterio.open(src) as s:
        if clip:
            tt = Transformer.from_crs(GEO, s.crs, always_xy=True)
            xs2, ys2 = tt.transform([BOX[0] - 0.002, BOX[2] + 0.002], [BOX[1] - 0.002, BOX[3] + 0.002])
            ww = from_bounds(min(xs2), min(ys2), max(xs2), max(ys2), s.transform).round_offsets().round_lengths()
            ww = ww.intersection(rasterio.windows.Window(0, 0, s.width, s.height))
            a = s.read(1, window=ww); tr0 = s.window_transform(ww)
        else:
            a = s.read(1); tr0 = s.transform
        tr1 = rasterio.Affine(tr0.a, tr0.b, tr0.c + SHIFT_X, tr0.d, tr0.e, tr0.f + SHIFT_Y)
        return write(name, a, tr1, s.crs, s.nodata, desc, unit)
shifted_copy(os.path.join(ROOT, "data", "clean", "geology", "dtm_box.tif"), "hirise_dtm_box_GALEFRAME.tif",
             f"HiRISE DTEEC_019698_1750_019988_1750 heights (unchanged), position shifted {SHIFT_X:.1f} m E(grid), {SHIFT_Y:.1f} m N", "m", clip=False)
shifted_copy(os.path.join(ROOT, "data", "raw", "geology", "hirise", "ESP_019698_1750_RED_C_01_ORTHO.JP2"),
             "hirise_red_c_box_GALEFRAME.tif", "HiRISE ESP_019698_1750 RED_C 1 m ortho, shifted into Gale frame")

# 3. Slope at 3 m baseline (block average) with the repo-style Horn kernel, then classes
k = int(round(BASELINE_M / abs(gtr.a)))
H, W = (z.shape[0] // k) * k, (z.shape[1] // k) * k
z3 = np.nanmean(z[:H, :W].reshape(H // k, k, W // k, k), axis=(1, 3))
px = abs(gtr.a) * k
pxg = px * math.cos(math.radians(-4.805))  # eqc x metres -> ground metres at box latitude
p = np.pad(z3, 1, constant_values=np.nan)
dzdx = ((p[:-2, 2:] + 2*p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2*p[1:-1, :-2] + p[2:, :-2])) / (8 * pxg)
dzdy = ((p[2:, :-2] + 2*p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2*p[:-2, 1:-1] + p[:-2, 2:])) / (8 * px)
slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy))).astype("float32")
tr3 = rasterio.Affine(gtr.a * k, 0, gtr.c, 0, gtr.e * k, gtr.f)
write("slope_box_3m_GALEFRAME.tif", np.nan_to_num(slope, nan=-9999), tr3, gcrs, -9999, "Slope deg, Horn 3x3 on 3 m block-mean DEM", "deg")
cls = np.zeros(slope.shape, "uint8")
cls[slope < SLOPE_GO_MAX] = 1; cls[(slope >= SLOPE_GO_MAX) & (slope < SLOPE_NOGO_MIN)] = 2; cls[slope >= SLOPE_NOGO_MIN] = 3
cls[~np.isfinite(slope)] = 0
write("slope_classes_box_3m_GALEFRAME.tif", cls, tr3, gcrs, 255, "Slope class 1 GO / 2 caution / 3 NO-GO / 0 unknown (ASSUMED thresholds)")
v = slope[np.isfinite(slope)]
stats = {"baseline_m": BASELINE_M, "thresholds_deg_ASSUMPTION": [SLOPE_GO_MAX, SLOPE_NOGO_MIN],
         "fraction": {"GO": float((cls == 1).mean()), "caution": float((cls == 2).mean()), "NO-GO": float((cls == 3).mean()), "unknown": float((cls == 0).mean())},
         "slope_deg": {"median": float(np.median(v)), "p90": float(np.percentile(v, 90)), "p99": float(np.percentile(v, 99))},
         "shift_applied_to_hirise_grid_m": [SHIFT_X, SHIFT_Y]}
json.dump(stats, open(os.path.join(DER, "slope_classes_stats.json"), "w"), indent=1); print(json.dumps(stats, indent=1))
