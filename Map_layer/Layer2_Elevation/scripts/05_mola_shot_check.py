"""Absolute check of both 1 m DEMs against MOLA PEDR laser shots (the control
both DEMs were tied to). For each DEM: vertical bias (shot - DEM, footprint mean)
and a grid search for the horizontal shift of the DEM that best fits the shots.
Inputs: raw/mola_pedr/MolaPEDR_box_pts_csv.csv (53 shots, PDS GDS ODE REST),
data/clean/geology/dtm_box.tif, raw/msl_gale_dem_1m_box.tif
Output: derived/mola_shot_check.json
"""
import os, json, csv
import numpy as np, rasterio
from pyproj import CRS, Transformer
from scipy.ndimage import uniform_filter
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ROOT = os.path.dirname(HERE)
GEO = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")
shots = [(float(r["LONG_EAST"]), float(r["LAT_NORTH"]), float(r[" TOPOGRAPHY"]))
         for r in csv.DictReader(open(os.path.join(HERE, "raw", "mola_pedr", "MolaPEDR_box_pts_csv.csv")), skipinitialspace=False)]
FOOT = 75  # MOLA footprint ~150-168 m diameter (Smith et al. 2001) -> 150 m box mean (approximation)
res = {"n_shots_query": len(shots), "footprint_box_m": 2 * FOOT}
for name, path in (("HiRISE_DTM", os.path.join(ROOT, "data", "clean", "geology", "dtm_box.tif")),
                   ("USGS_Gale_DEM", os.path.join(HERE, "raw", "msl_gale_dem_1m_box.tif"))):
    with rasterio.Env(GDAL_PAM_ENABLED="NO"), rasterio.open(path) as d:
        a = d.read(1).astype("float64"); a[(a < -1e30) | (a == d.nodata)] = np.nan; tr = d.transform; crs = d.crs
    v = np.isfinite(a); k = int(2 * FOOT / abs(tr.a)) | 1
    num = uniform_filter(np.where(v, a, 0), k); den = uniform_filter(v.astype(float), k)
    sm = np.where(den > 0.95, num / np.maximum(den, 1e-9), np.nan)
    t = Transformer.from_crs(GEO, crs, always_xy=True)
    xy = np.array([t.transform(lo, la) for lo, la, _ in shots]); z = np.array([s[2] for s in shots])
    def resid(dx, dy):  # DEM shifted by (dx,dy) metres in its grid -> sample at shot - shift
        col, row = ~tr * (xy[:, 0] - dx, xy[:, 1] - dy)
        c, r = np.round(col).astype(int), np.round(row).astype(int)
        ok = (r >= 0) & (r < a.shape[0]) & (c >= 0) & (c < a.shape[1])
        out = np.full(len(z), np.nan); out[ok] = z[ok] - sm[r[ok], c[ok]]; return out
    d0 = resid(0, 0); f = np.isfinite(d0)
    best = None
    for dx in range(-120, 121, 5):
        for dy in range(-120, 121, 5):
            d = resid(dx, dy)[f]
            if np.isnan(d).any(): continue
            s = np.std(d)
            if best is None or s < best[0]: best = (s, dx, dy, float(np.median(d)))
    res[name] = {"n_shots_used": int(f.sum()),
                 "mola_minus_dem_m_as_is": {"median": float(np.median(d0[f])), "mean": float(d0[f].mean()), "std": float(d0[f].std())},
                 "best_fit_shift_of_dem_m_grid": {"dx_east": best[1], "dy_north": best[2], "std_after": best[0], "median_after": best[3]},
                 "note": "dx is in the DEM's eqc grid metres (ground east = dx*cos(4.8 deg) = 0.996*dx)"}
print(json.dumps(res, indent=1))
json.dump(res, open(os.path.join(HERE, "derived", "mola_shot_check.json"), "w"), indent=1)
