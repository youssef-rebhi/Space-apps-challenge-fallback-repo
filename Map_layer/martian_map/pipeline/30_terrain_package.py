"""3D terrain package for the web app: heightmaps (Layer 2) + photo/hillshade textures (Layers 1, 2), one metadata file.

The 3D surface uses only the layers that describe SHAPE and LOOK:
  shape = Layer 2 elevation (USGS MSL Gale DEM 1 m v3), look = Layer 1 base map (USGS 25 cm orthomosaic), hillshade.
Everything is on one footprint: the DEM box in the USGS Gale frame (eqc lon_0=0), so every texture lines up with the
heightmap pixel for pixel and every later GO/NO-GO texture can be dropped on the same mesh.

Writes web/terrain/: height_2m.bin, height_4m.bin (float32, row-major, first row = north), height_4m.png (16-bit),
texture_photo.jpg, texture_hillshade.jpg, terrain.json; and web/plotly/terrain_300.json.
Run: .venv/Scripts/python.exe -I pipeline/30_terrain_package.py   (from martian_map/)
"""
import json, math, os, sys
import numpy as np, rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from PIL import Image
from pyproj import Transformer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import *  # noqa: E402,F403
if not os.path.exists(BASEMAP):  # noqa: F405
    raise SystemExit("Layer 1 base map missing (it is not in git): run pipeline/10_fetch_basemap.py first.")

OUT = os.path.join(WEB, "terrain"); os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(WEB, "plotly"), exist_ok=True)
Image.MAX_IMAGE_PIXELS = None

with rasterio.open(DEM) as d:
    dem = d.read(1).astype("float64"); nd = d.nodata; B = d.bounds; tr = d.transform
    W, H = d.width, d.height
dem[dem == nd] = np.nan
assert np.isfinite(dem).all(), "DEM has gaps; fill before meshing"
zmin, zmax = float(np.nanmin(dem)), float(np.nanmax(dem))


def resample(path, shape, resampling=Resampling.average, band=1):
    with rasterio.open(path) as s:
        win = from_bounds(B.left, B.bottom, B.right, B.top, s.transform)
        return s.read(band, window=win, out_shape=shape, resampling=resampling, boundless=False)


heightmaps = []
for cell in (2, 4):
    rows, cols = int(round(H / cell)), int(round(W / cell))
    z = resample(DEM, (rows, cols)).astype("float32")
    z.astype("<f4").tofile(os.path.join(OUT, f"height_{cell}m.bin"))
    heightmaps.append({"file": f"height_{cell}m.bin", "cols": cols, "rows": rows, "cell_m": [W / cols, H / rows],
                       "dtype": "float32 little-endian", "order": "row-major, first row = north edge, first column = west edge",
                       "units": "m (absolute elevation, same as terrain.z)"})
    if cell == 4:  # 16-bit PNG version (for engines that want an image heightmap): value = (z - zmin) / (zmax - zmin) * 65535
        q = np.round((z - zmin) / (zmax - zmin) * 65535).astype("uint16")
        Image.fromarray(q).save(os.path.join(OUT, "height_4m.png"))
        heightmaps[-1]["png16"] = {"file": "height_4m.png", "decode": "z = zmin + v / 65535 * (zmax - zmin)"}

# Textures: photo (Layer 1, fixed 2-98 % stretch), hillshade (Layer 2). Max 4096 px (mobile GPU limit).
TEX_H = 4096; TEX_W = int(round(TEX_H * W / H))
log = json.load(open(BASEMAP_LOG))
lo, hi = log["stretch_p2_p98"]
ph = resample(BASEMAP, (TEX_H, TEX_W)).astype("float32")
ph = np.clip((ph - lo) / (hi - lo), 0, 1) * 255
Image.fromarray(ph.astype("uint8"), "L").save(os.path.join(OUT, "texture_photo.jpg"), quality=88, optimize=True)
hs = resample(HILLSHADE, (TEX_H // 2, TEX_W // 2))
Image.fromarray(hs.astype("uint8"), "L").save(os.path.join(OUT, "texture_hillshade.jpg"), quality=88, optimize=True)

# Georeferencing for the web app
to_ll = Transformer.from_crs(GALE_CRS, LONLAT_CRS, always_xy=True)
corners = {k: [round(v, 7) for v in to_ll.transform(x, y)] for k, (x, y) in
           {"NW": (B.left, B.top), "NE": (B.right, B.top), "SW": (B.left, B.bottom), "SE": (B.right, B.bottom)}.items()}
lat_c = (corners["NW"][1] + corners["SW"][1]) / 2
meta = {
    "name": "Mount Sharp boxwork, Gale crater: 3D terrain package",
    "frame": "USGS MSL Gale mosaic frame (eqc lon_0=0, Mars 2000 sphere R=3396190 m). NASA rover positions are native to it.",
    "crs_proj4": GALE_CRS,
    "extent_eqc_m": [B.left, B.bottom, B.right, B.top],
    "size_m": [W, H],
    "corners_lonlat": corners,
    "lonlat_bounds": [corners["SW"][0], corners["SW"][1], corners["NE"][0], corners["NE"][1]],
    "local_frame": "x = metres east of the west edge, y = metres north of the south edge (eqc grid metres), z = elevation in m. "
                   f"True east-west ground distance = eqc distance x cos(lat) = x {math.cos(math.radians(lat_c)):.4f} (0.35 % shorter); north-south is exact.",
    "z": {"min": zmin, "max": zmax, "units": "m relative to the Mars areoid, from the USGS MSL Gale DEM (same numbers as the rover's elev_geoid). "
          "MOLA laser shots suggest true areoid heights ~15 m higher (docs/METHODS.md, Layer 2)."},
    "vertical_exaggeration": {"default": 2.0, "range": [1, 5], "note": "display only; slopes and GO/NO-GO use true heights"},
    "heightmaps": heightmaps,
    "textures": [
        {"id": "photo", "file": "texture_photo.jpg", "px": [TEX_W, TEX_H], "label": "Photo (USGS 25 cm orthomosaic)",
         "source": log["citation"]},
        {"id": "hillshade", "file": "texture_hillshade.jpg", "px": [TEX_W // 2, TEX_H // 2], "label": "Shaded relief (USGS DEM)",
         "source": "Derived from the USGS MSL Gale DEM 1 m v3 (Layer 2)"},
    ],
    "overlays": "overlays.json",
    "sources": ["USGS MSL Gale DEM Mosaic 1 m v3 (Parker & Calef / USGS Astrogeology)", log["citation"]],
}
json.dump(meta, open(os.path.join(OUT, "terrain.json"), "w"), indent=1)

# Plotly: 300 x 300 grid (compatible with the earlier exports_v1 schema) + local metres
ri = np.linspace(0, H - 1, 300).round().astype(int); ci = np.linspace(0, W - 1, 300).round().astype(int)
from scipy.ndimage import gaussian_filter  # noqa: E402
zs = gaussian_filter(dem, sigma=(H / 300) / 2)[np.ix_(ri, ci)]
x_m = (ci + 0.5) * tr.a; y_m = H - (ri + 0.5)  # metres from west / south edge
lon, lat = to_ll.transform(B.left + x_m, np.full_like(x_m, B.top))[0], to_ll.transform(np.full_like(y_m, B.left), B.top - (ri + 0.5))[1]
json.dump({"name": "terrain_box", "source": "USGS MSL Gale DEM Mosaic 1m v3", "frame": meta["frame"], "units": "m above Mars areoid",
           "note": "Gaussian anti-alias then 300x300 sample (~7.9 m E-W x 9.9 m N-S). Row 0 = north. Colour grids for GO/NO-GO are added by 60_web_exports.py",
           "x_m": [round(v, 2) for v in x_m.tolist()], "y_m": [round(v, 2) for v in y_m.tolist()],
           "lon": [round(v, 7) for v in lon.tolist()], "lat": [round(v, 7) for v in lat.tolist()],
           "z": np.round(zs, 2).tolist()}, open(os.path.join(WEB, "plotly", "terrain_300.json"), "w"))
print(json.dumps({k: meta[k] for k in ("size_m", "z", "lonlat_bounds")}, indent=1))
print("heightmaps:", [(h["file"], h["cols"], h["rows"]) for h in heightmaps], "texture:", TEX_W, "x", TEX_H)
