"""Load the USGS MSL Gale 1 m DEM for the study box from Layer 2
(Map_layer/Layer2_Elevation/exports/web/elevation_box_1m_lonlat.tif, +proj=longlat R=3396190).
This DEM is in the rover's frame: rover elev_geoid matches it to 0.08 m (Layer 2 METADATA.md), so the
MMGIS waypoints sit on the right ground. A HiRISE DTM tried first was ~72 m off the waypoints.
Output: sim/data/usgs_box.npy, usgs_box.json, usgs_box_hillshade.png."""
import json, math
from pathlib import Path
import numpy as np
from PIL import Image

P = Path(__file__).resolve().parents[2]; D = P / "sim/data"
src = P.parent / "Map_layer/Layer2_Elevation/exports/web/elevation_box_1m_lonlat.tif"
im = Image.open(src)
a = np.array(im, dtype=np.float32); a[a <= -9990] = np.nan
sx, sy = im.tag_v2[33550][:2]; tp = im.tag_v2[33922]
H, W = a.shape
M_PER_DEG = 3396190 * math.pi / 180
geo = dict(file="usgs_box.npy", shape=a.shape, pixel_m=sx * M_PER_DEG, west=tp[3], north=tp[4], east=tp[3] + W * sx, south=tp[4] - H * sy,
           note="row 0 = north edge; planetocentric lon/lat, east-positive, Mars sphere R=3396190",
           source="USGS MSL Gale Merged DEM Mosaic 1 m v3 (Parker & Calef 2016) via Map_layer/Layer2_Elevation (rover frame)")
np.save(D / "usgs_box.npy", a); json.dump(geo, open(D / "usgs_box.json", "w"), indent=1)
z = np.nan_to_num(a, nan=float(np.nanmedian(a)))
gy, gx = np.gradient(z, geo["pixel_m"])
slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
hs = np.sin(math.radians(35)) * np.cos(slope) + np.cos(math.radians(35)) * np.sin(slope) * np.cos(math.radians(315) - aspect)
Image.fromarray((np.clip(hs, 0, 1) * 255).astype(np.uint8)).save(D / "usgs_box_hillshade.png")
v = a[np.isfinite(a)]
print("shape", a.shape, "pixel m", round(geo["pixel_m"], 3), "nodata %", round(100 * np.isnan(a).mean(), 2), "elev", v.min().round(1), v.max().round(1))
