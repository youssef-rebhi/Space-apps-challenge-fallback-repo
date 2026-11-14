"""Download windows of large remote USGS rasters (1-row-strip GeoTIFFs on S3)
via HTTP range reads of full-width row bands, crop locally, write native-CRS
GeoTIFFs into possible_output/raw/ and log every fetch to raw/fetch_log.json.
Run: .venv/Scripts/python.exe -I scripts/01_fetch_windows.py
"""
import os, sys, json, time, hashlib, datetime as dt
import numpy as np, rasterio
from rasterio.env import Env
from rasterio.windows import Window, from_bounds
from pyproj import CRS, Transformer

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(HERE, "raw")
S3 = "https://asc-pds-services.s3.us-west-2.amazonaws.com/"
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
           GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3", GDAL_HTTP_MULTIRANGE="YES",
           GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", VSI_CACHE="FALSE")
GEO = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")

JOBS = {
    # USGS MSL Gale Merged DEM 1 m v3 (Parker & Calef / USGS 2016-2017), our box + ~200 m margin
    "msl_gale_dem_1m_box": ("mosaic/MSL_Gale_DEM_Mosaic_1m_v3.tif", (137.3565, -4.8335, 137.4035, -4.7765)),
    # MGS MOLA - MEX HRSC blended DEM 200 m v2 (Fergason et al. 2018), whole Gale crater + rim
    "hrsc_mola_blend_200m_gale": ("mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif", (136.2, -7.0, 139.4, -3.8)),
    # MGS MOLA global 463 m DEM (Smith et al. 2001 / USGS mosaic), whole Gale crater + rim
    "mola_463m_gale": ("mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif", (136.2, -7.0, 139.4, -3.8)),
}

def fetch(name, key, bbox, band_rows=512):
    url = S3 + key
    out = os.path.join(RAW, f"{name}.tif")
    with Env(**ENV), rasterio.open("/vsicurl/" + url) as ds:
        t = Transformer.from_crs(GEO, ds.crs, always_xy=True)
        xs, ys = t.transform([bbox[0], bbox[2], bbox[0], bbox[2]], [bbox[1], bbox[1], bbox[3], bbox[3]])
        w = from_bounds(min(xs), min(ys), max(xs), max(ys), ds.transform).round_offsets().round_lengths()
        w = w.intersection(Window(0, 0, ds.width, ds.height))
        c0, r0, nc, nr = int(w.col_off), int(w.row_off), int(w.width), int(w.height)
        item = np.dtype(ds.dtypes[0]).itemsize
        print(f"[{name}] {nc}x{nr} px, transfer ~{nr*ds.width*item/1e6:.0f} MB", flush=True)
        arr = np.empty((nr, nc), ds.dtypes[0]); t0 = time.time()
        for s in range(0, nr, band_rows):
            n = min(band_rows, nr - s)
            arr[s:s+n] = ds.read(1, window=Window(0, r0 + s, ds.width, n))[:, c0:c0+nc]
            print(f"  rows {s+n}/{nr}  {time.time()-t0:.0f}s", flush=True)
        prof = dict(driver="GTiff", width=nc, height=nr, count=1, dtype=ds.dtypes[0], crs=ds.crs,
                    transform=ds.window_transform(Window(c0, r0, nc, nr)), nodata=ds.nodata,
                    tiled=True, blockxsize=256, blockysize=256, compress="DEFLATE", predictor=2 if item == 2 else 3)
        with rasterio.open(out, "w", **prof) as dst:
            dst.write(arr, 1)
        rec = dict(name=name, source_url=url, source_size_bytes=None, source_width=ds.width, source_height=ds.height,
                   source_crs=ds.crs.to_proj4(), bbox_lonlat_requested=bbox, pixel_window=[c0, r0, nc, nr],
                   transfer_bytes=nr * ds.width * item, seconds=round(time.time() - t0, 1),
                   local_file=os.path.relpath(out, HERE).replace("\\", "/"),
                   local_md5=hashlib.md5(open(out, "rb").read()).hexdigest(),
                   fetched_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"))
    log_p = os.path.join(RAW, "fetch_log.json")
    log = json.load(open(log_p)) if os.path.exists(log_p) else {}
    log[name] = rec; json.dump(log, open(log_p, "w"), indent=2)
    print(f"[{name}] done -> {out}", flush=True)

if __name__ == "__main__":
    for n in (sys.argv[1:] or JOBS):
        fetch(n, *JOBS[n])
