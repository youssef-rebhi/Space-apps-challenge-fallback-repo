"""Item 7: exports for the app (all in the chosen Gale frame).
exports/web/*.tif       GeoTIFFs in +proj=longlat +R=3396190 (2D map / Leaflet source)
exports/leaflet/*.png   coloured overlays + leaflet_bounds.json ([[S,W],[N,E]] planetocentric deg)
exports/plotly/*.json   300 x 300 grids for the Plotly 3D surface (box and whole crater)
exports/rover/waypoints_box.geojson  waypoints in box (already in Gale frame)
Also: derived/check_shifted_redc_vs_mosaic.json
Run: .venv/Scripts/python.exe -I scripts/08_exports.py
"""
import os, json, math
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling, calculate_default_transform
from rasterio.transform import array_bounds
from pyproj import CRS
from PIL import Image
from scipy.ndimage import gaussian_filter
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ROOT = os.path.dirname(HERE)
DER = os.path.join(HERE, "derived"); EX = os.path.join(HERE, "exports")
for s in ("web", "leaflet", "plotly", "rover"): os.makedirs(os.path.join(EX, s), exist_ok=True)
GEO = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")
BOX = (137.36, -4.83, 137.40, -4.78)
PROF = dict(driver="GTiff", compress="DEFLATE", tiled=True, blockxsize=256, blockysize=256)

def to_geo(src, dst, resampling, res_deg=None):
    with rasterio.open(src) as s:
        tr, w, h = calculate_default_transform(s.crs, GEO, s.width, s.height, *s.bounds,
                                              resolution=res_deg) if res_deg else calculate_default_transform(s.crs, GEO, s.width, s.height, *s.bounds)
        a = np.full((h, w), s.nodata if s.nodata is not None else 0, s.dtypes[0])
        reproject(rasterio.band(s, 1), a, dst_transform=tr, dst_crs=GEO, resampling=resampling,
                  src_nodata=s.nodata, dst_nodata=s.nodata)
        with rasterio.open(dst, "w", width=w, height=h, count=1, dtype=s.dtypes[0], crs=GEO, transform=tr, nodata=s.nodata, **PROF) as d:
            d.write(a, 1); d.set_band_description(1, s.descriptions[0] or "")
    return a, tr, s.nodata

deg1m = 1.0 / 3396190 * 180 / math.pi
web = os.path.join(EX, "web")
E, Etr, End = to_geo(os.path.join(DER, "elevation_box_1m_GALEFRAME.tif"), os.path.join(web, "elevation_box_1m_lonlat.tif"), Resampling.bilinear, (deg1m, deg1m))
Hs, Htr, _ = to_geo(os.path.join(DER, "hillshade_box_1m_GALEFRAME.tif"), os.path.join(web, "hillshade_box_1m_lonlat.tif"), Resampling.bilinear, (deg1m, deg1m))
C, Ctr, _ = to_geo(os.path.join(DER, "slope_classes_box_3m_GALEFRAME.tif"), os.path.join(web, "slope_classes_box_3m_lonlat.tif"), Resampling.nearest, (3 * deg1m, 3 * deg1m))
R, Rtr, Rnd = to_geo(os.path.join(DER, "regional_gale_elevation_200m.tif"), os.path.join(web, "regional_gale_elevation_200m_lonlat.tif"), Resampling.bilinear)

# ---- Leaflet PNG overlays
def ramp(t):  # simple terrain ramp (blue-green-yellow-brown-white), t in 0..1
    stops = np.array([[0, 43, 131, 186], [0.25, 171, 221, 164], [0.5, 255, 255, 191], [0.75, 215, 120, 60], [1, 255, 255, 255]], float)
    out = np.zeros(t.shape + (3,))
    for c in range(3): out[..., c] = np.interp(t, stops[:, 0], stops[:, c + 1])
    return out
def elev_png(a, nd, hs, path):
    v = np.isfinite(a) & (a != nd); lo, hi = np.percentile(a[v], (1, 99))
    rgb = ramp(np.clip((a - lo) / (hi - lo), 0, 1))
    if hs is not None: rgb *= (0.45 + 0.55 * (hs[..., None] / 255.0))
    rgba = np.dstack([rgb.clip(0, 255), np.where(v, 255, 0)]).astype("uint8")
    Image.fromarray(rgba, "RGBA").save(path); return float(lo), float(hi)
bounds = {}
def lb(a, tr):
    w, s, e, n = array_bounds(a.shape[0], a.shape[1], tr)[0], array_bounds(a.shape[0], a.shape[1], tr)[1], array_bounds(a.shape[0], a.shape[1], tr)[2], array_bounds(a.shape[0], a.shape[1], tr)[3]
    return [[s, w], [n, e]]
hs_on = Hs if Hs.shape == E.shape else None
lo, hi = elev_png(E, End, hs_on, os.path.join(EX, "leaflet", "elevation_box.png")); bounds["elevation_box.png"] = {"bounds": lb(E, Etr), "range_m": [lo, hi]}
lo, hi = elev_png(R.astype(float), Rnd, None, os.path.join(EX, "leaflet", "regional_gale_elevation.png")); bounds["regional_gale_elevation.png"] = {"bounds": lb(R, Rtr), "range_m": [lo, hi]}
pal = np.array([[128, 128, 128, 160], [26, 150, 65, 150], [253, 174, 97, 170], [215, 25, 28, 190]], "uint8")
Cc = np.where(C == 255, 0, C); Image.fromarray(pal[Cc], "RGBA").save(os.path.join(EX, "leaflet", "slope_classes_box.png"))
bounds["slope_classes_box.png"] = {"bounds": lb(C, Ctr), "classes": {"0": "grey unknown", "1": "green GO", "2": "orange caution", "3": "red NO-GO"}}
json.dump({"crs": "planetocentric lon/lat, east-positive, Mars sphere R=3396190 (use with L.CRS.Simple or EPSG:4326-style lon/lat axes; NOT Earth)",
           "overlays": bounds}, open(os.path.join(EX, "leaflet", "leaflet_bounds.json"), "w"), indent=1)

# ---- Plotly 300 x 300 grids
def grid300(a, tr, nd, name, src, step_note):
    a = a.astype("float64"); a[(a == nd) | ~np.isfinite(a)] = np.nan
    ri = np.linspace(0, a.shape[0] - 1, 300).round().astype(int); ci = np.linspace(0, a.shape[1] - 1, 300).round().astype(int)
    sm = gaussian_filter(np.nan_to_num(a, nan=np.nanmean(a)), sigma=max(a.shape) / 600)  # anti-alias before decimation
    sm[~np.isfinite(a)] = np.nan
    z = sm[np.ix_(ri, ci)]
    lon = [tr.c + (c + 0.5) * tr.a for c in ci]; lat = [tr.f + (r + 0.5) * tr.e for r in ri]
    R_ = 3396190; lat0 = np.mean(lat)
    x = [math.radians(l - lon[0]) * R_ * math.cos(math.radians(lat0)) for l in lon]; y = [math.radians(l - lat[-1]) * R_ for l in lat]
    json.dump({"name": name, "source": src, "frame": "USGS MSL Gale mosaic frame (rover waypoints native)" if "box" in name else "MOLA/HRSC global",
               "crs": "+proj=longlat +R=3396190", "units": "m above Mars areoid", "note": step_note,
               "lon": lon, "lat": lat, "x_m": x, "y_m": y,
               "z": [[None if not np.isfinite(v) else round(float(v), 2) for v in row] for row in z]},
              open(os.path.join(EX, "plotly", f"{name}_300x300.json"), "w"))
grid300(E, Etr, End, "elevation_box", "USGS MSL Gale DEM Mosaic 1m v3", "Gaussian anti-alias then 300x300 sample (~8x10 m spacing); 3D guide says exaggerate height x3 for display")
grid300(R, Rtr, Rnd, "regional_gale", "MOLA-HRSC Blended DEM 200m v2", "~630 m spacing")

# ---- Rover waypoints in box (unchanged coordinates; explicit Mars CRS note)
wp = json.load(open(os.path.join(ROOT, "data", "raw", "geology", "rover", "MSL_waypoints.json")))
fs = [f for f in wp["features"] if BOX[0] <= f["geometry"]["coordinates"][0] <= BOX[2] and BOX[1] <= f["geometry"]["coordinates"][1] <= BOX[3]]
json.dump({"type": "FeatureCollection", "name": "MSL_waypoints_box",
           "crs_note": "lon/lat planetocentric east-positive on Mars sphere R=3396190. GeoJSON readers assume WGS84: override to +proj=longlat +R=3396190 in QGIS.",
           "features": fs}, open(os.path.join(EX, "rover", "waypoints_box.geojson"), "w"))

# ---- Check: shifted RED_C vs USGS 25 cm mosaic window from the trial (should now align)
mos_p = os.path.join(ROOT, "trials", "nasa_data_trial", "output", "mosaic25cm_sol4534_geographic_TRIAL_DRAFT.tif")
chk = {}
if os.path.exists(mos_p):
    with rasterio.open(mos_p) as m:
        mos = m.read(1).astype(float); mtr = m.transform; mcrs = m.crs
    red = np.zeros(mos.shape, "float32")
    with rasterio.open(os.path.join(DER, "hirise_red_c_box_GALEFRAME.tif")) as h:
        reproject(rasterio.band(h, 1), red, dst_transform=mtr, dst_crs=mcrs, dst_nodata=0, resampling=Resampling.bilinear)
    def hp(a): a = a - gaussian_filter(a, 16); a = gaussian_filter(a, 3); return (a - a.mean()) / a.std()
    A, B = hp(mos[100:-100, 100:-100]), hp(red[100:-100, 100:-100].astype(float))
    hh, ww = A.shape; win = np.outer(np.hanning(hh), np.hanning(ww))
    cc = np.fft.fftshift(np.fft.ifft2(np.fft.fft2(A * win) * np.conj(np.fft.fft2(B * win))).real)
    S = 120; sub = cc[hh//2-S:hh//2+S+1, ww//2-S:ww//2+S+1]; iy, ix = np.unravel_index(np.argmax(sub), sub.shape)
    chk = {"residual_shift_px_25cm": [int(ix - S), int(iy - S)],
           "residual_m_east_north": [(ix - S) * 0.249, -(iy - S) * 0.25],
           "corr_no_extra_shift": float(np.corrcoef(A.ravel(), B.ravel())[0, 1])}
    json.dump(chk, open(os.path.join(DER, "check_shifted_redc_vs_mosaic.json"), "w"), indent=1)
print(json.dumps({"leaflet": bounds, "check": chk}, indent=1, default=str))
