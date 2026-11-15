"""Step 10: re-fetch the Layer 1 base map (it is not in git: 113 MB is over GitHub's 100 MB file limit).

Source: Calef, F.J. III & Parker, T. (2016), MSL Gale Merged Orthophoto Mosaic 25 cm, v3,
USGS Astrogeology Science Center / PDS Annex, on the USGS public S3 bucket (URL below).

Same method as the approved fetch (pipeline/build_history/L1_basemap/20_fetch_basemap_25cm.py):
- The source GeoTIFF is 180,000 x 280,000 px of uncompressed 1-row strips.
- The script reads full-width row bands by HTTP range requests (GDAL /vsicurl/), then crops locally.
- Same box plus ~100 m margin, native 25 cm grid, no resampling, DEFLATE, internal overviews.
- About 2.28 GB is transferred; the first run took 955 s.

Check: the pixel MD5 must equal EXPECTED_PIXEL_MD5. That checksum covers the image values only,
so it does not depend on the GDAL/zlib version. The file MD5 of the approved copy is recorded too;
it matches only when the same library versions are used (requirements.lock.txt).

Run from martian_map/:  .venv/Scripts/python.exe -I -X utf8 pipeline/10_fetch_basemap.py
Writes: layers/L1_basemap/usgs_msl_gale_ortho_25cm_box.tif, layers/L1_basemap/fetch_log_refetch.json
It never touches fetch_log.json (the record of the approved fetch).
"""
import os, sys, json, time, hashlib, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, rasterio
from rasterio.env import Env
from rasterio.enums import Resampling
from rasterio.windows import Window, from_bounds
from pyproj import CRS, Transformer
from paths import L1, BASEMAP

URL = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif"
BBOX = (137.3583, -4.8317, 137.4017, -4.7783)        # study box + 0.0017 deg (~100 m) margin, as approved
EXPECTED_WINDOW = [62494, 168273, 10290, 12661]       # col, row, width, height (from fetch_log.json)
EXPECTED_PIXEL_MD5 = "7c2da177f95bd2ebcbd1d0bc80672978"
APPROVED_FILE_MD5 = "d04ddd301f6333ef1bc726ee9b3c3582"
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
           GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3", GDAL_HTTP_MULTIRANGE="YES",
           GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", VSI_CACHE="FALSE")
GEO = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")
BAND_ROWS = 256
LOG = os.path.join(L1, "fetch_log_refetch.json")


def md5_file(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pixel_md5(p):
    with rasterio.open(p) as d:
        return hashlib.md5(d.read(1).tobytes()).hexdigest()


def main():
    if os.path.exists(BASEMAP) and pixel_md5(BASEMAP) == EXPECTED_PIXEL_MD5:
        print("base map already present and its pixels match; nothing to do:", BASEMAP)
        return
    t0 = time.time()
    tmp = BASEMAP + ".part"
    with Env(**ENV), rasterio.open("/vsicurl/" + URL) as ds:
        t = Transformer.from_crs(GEO, ds.crs, always_xy=True)
        xs, ys = t.transform([BBOX[0], BBOX[2], BBOX[0], BBOX[2]], [BBOX[1], BBOX[1], BBOX[3], BBOX[3]])
        w = from_bounds(min(xs), min(ys), max(xs), max(ys), ds.transform).round_offsets().round_lengths()
        w = w.intersection(Window(0, 0, ds.width, ds.height))
        c0, r0, nc, nr = int(w.col_off), int(w.row_off), int(w.width), int(w.height)
        if [c0, r0, nc, nr] != EXPECTED_WINDOW:
            raise SystemExit(f"window {[c0, r0, nc, nr]} differs from the approved {EXPECTED_WINDOW}; source changed?")
        print(f"window {nc}x{nr} px at col {c0} row {r0}; transfer ~{nr * ds.width / 1e9:.2f} GB", flush=True)
        arr = np.empty((nr, nc), ds.dtypes[0])
        for s in range(0, nr, BAND_ROWS):
            n = min(BAND_ROWS, nr - s)
            for attempt in range(1, 6):
                try:
                    arr[s:s + n] = ds.read(1, window=Window(0, r0 + s, ds.width, n))[:, c0:c0 + nc]
                    break
                except Exception as e:  # network hiccup: retry this band
                    print(f"  band at row {s} failed (attempt {attempt}): {e}", flush=True)
                    time.sleep(5 * attempt)
            else:
                raise SystemExit(f"giving up at row {s}")
            el = time.time() - t0
            print(f"  rows {s + n}/{nr}  {el:.0f}s", flush=True)
        prof = dict(driver="GTiff", width=nc, height=nr, count=1, dtype=ds.dtypes[0], crs=ds.crs,
                    transform=ds.window_transform(Window(c0, r0, nc, nr)), nodata=ds.nodata,
                    tiled=True, blockxsize=512, blockysize=512, compress="DEFLATE", predictor=2, BIGTIFF="IF_SAFER")
    with rasterio.open(tmp, "w", **prof) as dst:
        dst.write(arr, 1)
    with rasterio.open(tmp, "r+") as dst:
        dst.build_overviews([2, 4, 8, 16, 32], Resampling.average)
        dst.update_tags(ns="rio_overview", resampling="average")
    pmd5 = hashlib.md5(arr.tobytes()).hexdigest()
    os.replace(tmp, BASEMAP)
    fmd5 = md5_file(BASEMAP)
    rec = dict(source_url=URL, pixel_window=[c0, r0, nc, nr], seconds=round(time.time() - t0, 1),
               pixel_md5=pmd5, pixel_md5_matches_approved=(pmd5 == EXPECTED_PIXEL_MD5),
               file_md5=fmd5, file_md5_matches_approved=(fmd5 == APPROVED_FILE_MD5),
               citation="Calef, F.J. III, and Parker, T., 2016, MSL Gale Merged Orthophoto Mosaic, v3: USGS Astrogeology Science Center / PDS Annex",
               fetched_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"))
    json.dump(rec, open(LOG, "w"), indent=2)
    print(json.dumps(rec, indent=1))
    if pmd5 != EXPECTED_PIXEL_MD5:
        raise SystemExit("pixel MD5 differs from the approved base map: check the source before using it")


if __name__ == "__main__":
    main()
