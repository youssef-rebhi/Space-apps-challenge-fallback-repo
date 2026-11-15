"""Layer 1 (base map): fetch the USGS MSL Gale Merged Orthophoto Mosaic 25 cm v3 for the study box
(+ ~100 m margin) on its NATIVE grid (no resampling), as ONE file with internal overviews.

Source: Calef, F.J. III & Parker, T. (2016), MSL Gale Merged Orthophoto Mosaic, v3, USGS Astrogeology / PDS Annex.
The 50.4 GB GeoTIFF on S3 is stored as uncompressed 1-row strips, so every row read costs the full width
(180,000 B). We read full-width row bands by HTTP range requests (GDAL /vsicurl/) and crop locally:
the same technique as ../../scripts/01_fetch_windows.py (Layer 2).

Run: ../.venv/Scripts/python.exe -I scripts/20_fetch_basemap_25cm.py     (from possible_output/layer1_basemap)
Writes: raw/usgs_msl_gale_ortho_25cm_box.tif, raw/fetch_log.json
"""
import os, json, time, hashlib, datetime as dt
import numpy as np, rasterio
from rasterio.env import Env
from rasterio.enums import Resampling
from rasterio.windows import Window, from_bounds
from pyproj import CRS, Transformer

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(HERE, "raw")
os.makedirs(RAW, exist_ok=True)
URL = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif"
# Study box 137.36-137.40 E, 4.83-4.78 S, plus 0.0017 deg (~100 m) margin on each side
BBOX = (137.3583, -4.8317, 137.4017, -4.7783)
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
           GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="3", GDAL_HTTP_MULTIRANGE="YES",
           GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", VSI_CACHE="FALSE")
GEO = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs")
OUT = os.path.join(RAW, "usgs_msl_gale_ortho_25cm_box.tif")
BAND_ROWS = 256


def main():
    t0 = time.time()
    with Env(**ENV), rasterio.open("/vsicurl/" + URL) as ds:
        t = Transformer.from_crs(GEO, ds.crs, always_xy=True)
        xs, ys = t.transform([BBOX[0], BBOX[2], BBOX[0], BBOX[2]], [BBOX[1], BBOX[1], BBOX[3], BBOX[3]])
        w = from_bounds(min(xs), min(ys), max(xs), max(ys), ds.transform).round_offsets().round_lengths()
        w = w.intersection(Window(0, 0, ds.width, ds.height))
        c0, r0, nc, nr = int(w.col_off), int(w.row_off), int(w.width), int(w.height)
        print(f"source {ds.width}x{ds.height} px, {ds.dtypes[0]}, nodata={ds.nodata}, res={ds.res}, crs={ds.crs.to_proj4()}")
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
            print(f"  rows {s + n}/{nr}  {el:.0f}s  ~{(s + n) * ds.width / el / 1e6:.1f} MB/s", flush=True)
        prof = dict(driver="GTiff", width=nc, height=nr, count=1, dtype=ds.dtypes[0], crs=ds.crs,
                    transform=ds.window_transform(Window(c0, r0, nc, nr)), nodata=ds.nodata,
                    tiled=True, blockxsize=512, blockysize=512, compress="DEFLATE", predictor=2, BIGTIFF="IF_SAFER")
        src = dict(width=ds.width, height=ds.height, crs=ds.crs.to_proj4(), res=list(ds.res), nodata=ds.nodata)
    with rasterio.open(OUT, "w", **prof) as dst:
        dst.write(arr, 1)
    with rasterio.open(OUT, "r+") as dst:  # internal overviews so QGIS draws it fast when zoomed out
        dst.build_overviews([2, 4, 8, 16, 32], Resampling.average)
        dst.update_tags(ns="rio_overview", resampling="average")
    valid = arr[arr != (src["nodata"] if src["nodata"] is not None else -1)][::7]
    p2, p98 = (float(v) for v in np.percentile(valid, [2, 98]))
    rec = dict(source_url=URL, source=src, bbox_lonlat_requested=BBOX, pixel_window=[c0, r0, nc, nr],
               transfer_bytes=nr * src["width"], seconds=round(time.time() - t0, 1),
               local_file=os.path.relpath(OUT, HERE).replace("\\", "/"),
               local_md5=hashlib.md5(open(OUT, "rb").read()).hexdigest(),
               valid_fraction=round(float((arr != (src["nodata"] if src["nodata"] is not None else -1)).mean()), 6),
               stretch_p2_p98=[p2, p98],
               citation="Calef, F.J. III, and Parker, T., 2016, MSL Gale Merged Orthophoto Mosaic, v3: USGS Astrogeology Science Center / PDS Annex",
               fetched_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"))
    json.dump(rec, open(os.path.join(RAW, "fetch_log.json"), "w"), indent=2)
    print("done:", json.dumps(rec, indent=1), flush=True)


if __name__ == "__main__":
    main()
