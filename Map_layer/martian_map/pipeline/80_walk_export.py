"""Step 80: data for the astronaut walk view (web/walk/).

Real data:
  - heights: USGS MSL Gale DEM 1 m v3 (Layer 2), the whole box at 1 m
  - pattern: USGS MSL Gale orthophoto 25 cm v3 (Layer 1), cut into 64 m tiles at 25 cm
  - where you may walk: the combined GO/NO-GO map for a crew on foot (Part 3)
  - far horizon: HRSC/MOLA blended DEM 200 m (Fergason, Hare & Laura 2018, USGS), Layer 2 regional
Colours: NASA's natural-colour Mastcam panorama PIA26693 (sol 4671, taken inside this box); see walk_color.py.
Simulated, and labelled so on screen: sand-ripple places (team drone-sim rule, adapted to 2D). Rocks are placed
in the browser with the team's drone-sim rock rule (see walk.json -> simulated).

Outputs in web/walk/: walk.json, height_1m.u16, color_1m.jpg, tiles/c_<i>_<j>.jpg, walk_mask.png, sand_2m.png,
far_400m.f32. Run after steps 30-60. Needs walk/sources/PIA26693.png (step 12).
"""
import hashlib, json, math, os, sys, time

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import *  # noqa: E402,F403
import walk_color as wc  # noqa: E402

OUT = os.path.join(WEB, "walk")
TILES = os.path.join(OUT, "tiles")
PIA = os.path.join(MM, "walk", "sources", "PIA26693.png")
PIA_MD5 = "6a06db7742934e28757e8f87fc8b41d2"
REGIONAL = os.path.join(L2, "regional", "regional_gale_elevation_200m.tif")
COMBINED_FOOT = os.path.join(GONOGO, "combined_foot.tif")

TILE_M = 64                 # near-terrain tile size (m); 256 px at 25 cm
TILE_PX = 256
FAR_HALF_M = 70_000         # far horizon: +-70 km around the box centre (ASSUMPTION A41)
FAR_STEP_M = 400            # far horizon grid step (m)
SAND_MEDIAN_CELLS = 11      # team rule "20 m running median" -> 11 cells of 2 m (22 m) in 2D
SAND_BELOW_M = 0.10         # team rule: >= 10 cm below the running median
SAND_SLOPE_MAX = 8.0        # team rule: slope < 8 deg
JPEG_Q = 85

for p, step in [(BASEMAP, "pipeline/10_fetch_basemap.py"), (PIA, "pipeline/12_fetch_color_ref.py")]:
    if not os.path.exists(p):
        raise SystemExit(f"Missing {p}. Run {step} first.")
os.makedirs(TILES, exist_ok=True)
t0 = time.time()


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


assert md5(PIA) == PIA_MD5, "PIA26693.png differs from the file this step was built on"

# ---------------------------------------------------------------- DEM (1 m) ----
with rasterio.open(DEM) as d:
    z = d.read(1).astype(np.float32)
    dem_b, dem_t = d.bounds, d.transform
    nodata = d.nodata
HM, WM = z.shape                                     # 2964 rows (N-S), 2371 cols (E-W)
bad = (z == nodata) | ~np.isfinite(z)
if bad.any():                                        # fill rare holes with the nearest valid height
    idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
    z = z[tuple(idx)]
ZMIN, ZMAX = float(z.min()), float(z.max())
q = np.round((z - ZMIN) / (ZMAX - ZMIN) * 65535).astype("<u2")
q.tofile(os.path.join(OUT, "height_1m.u16"))
print(f"heights: {WM} x {HM} at 1 m, {int(bad.sum())} holes filled, z {ZMIN:.2f}..{ZMAX:.2f}")

# ---------------------------------------------------------------- colours -------
with rasterio.open(BASEMAP) as o:
    col_off = (dem_b.left - o.bounds.left) / o.res[0]
    row_off = (o.bounds.top - dem_b.top) / o.res[1]
    c0, r0 = int(round(col_off)), int(round(row_off))
    shift_m = [round((c0 - col_off) * o.res[0], 4), round((r0 - row_off) * o.res[1], 4)]
    W25, H25 = WM * 4, HM * 4
    ortho = o.read(1, window=Window(c0, r0, W25, H25))
print(f"orthophoto window col {c0} row {r0} ({W25} x {H25} px), grid shift {shift_m} m")

pano = wc.load(PIA)
lin, sky_m, ground_m = wc.masks(pano)
vals = ortho[ortho > 0]
lut, lut_info = wc.ground_lut(lin, ground_m, vals)
sky = wc.sky_colours(lin, sky_m)
ground_median = wc.ground_median(lin, ground_m)
median_grey = int(np.median(vals))
del pano, lin, sky_m, ground_m, vals
rgb = lut[ortho]                                     # H25 x W25 x 3, sRGB
print("colour table built; sky", sky["horizon_srgb"], sky["top_srgb"], "ground", ground_median)

nx, ny = math.ceil(WM / TILE_M), math.ceil(HM / TILE_M)
for j in range(ny):                                  # j = tile row from the north edge
    for i in range(nx):                              # i = tile column from the west edge
        blk = rgb[j * TILE_PX:(j + 1) * TILE_PX, i * TILE_PX:(i + 1) * TILE_PX]
        if blk.shape[:2] != (TILE_PX, TILE_PX):      # edge tile: repeat the last row/column
            blk = np.pad(blk, ((0, TILE_PX - blk.shape[0]), (0, TILE_PX - blk.shape[1]), (0, 0)), mode="edge")
        Image.fromarray(blk).save(os.path.join(TILES, f"c_{i}_{j}.jpg"), quality=JPEG_Q)
Image.fromarray(rgb).reduce(4).save(os.path.join(OUT, "color_1m.jpg"), quality=JPEG_Q)
print(f"colour tiles: {nx} x {ny} = {nx * ny} of {TILE_M} m ({TILE_PX} px), plus color_1m.jpg")
del rgb, ortho

# ---------------------------------------------------------------- where you may walk ----
with rasterio.open(COMBINED_FOOT) as d:
    cls = d.read(1)
    cell = d.res[0]
ov = json.load(open(os.path.join(WEB, "overlays.json"), encoding="utf-8"))
base = next(s for s in ov["poi_sites"] if s["category"] == "rover_position")
bc, br = int(base["x"] // cell), int((HM - base["y"]) // cell)
ok = (cls == 1) | (cls == 2)                         # GO or CAUTION (ASSUMPTION A39)
lab, _ = ndimage.label(ok, structure=np.ones((3, 3)))
walk = ok & (lab == lab[br, bc])                     # joined to the base without crossing NO-GO or UNKNOWN
assert walk[br, bc], "the base cell is not walkable"
mask = np.zeros(cls.shape + (3,), np.uint8)
mask[..., 0] = cls
mask[..., 1] = np.where(walk, 255, 0)
Image.fromarray(mask).save(os.path.join(OUT, "walk_mask.png"))
n = cls.size
walk_stats = {"box_cells": int(n), "walkable_pct": round(100 * walk.sum() / n, 1),
              "walkable_go_pct": round(100 * (walk & (cls == 1)).sum() / n, 1),
              "walkable_caution_pct": round(100 * (walk & (cls == 2)).sum() / n, 1),
              "go_or_caution_not_joined_pct": round(100 * (ok & ~walk).sum() / n, 1),
              "nogo_pct": round(100 * (cls == 3).sum() / n, 1), "unknown_pct": round(100 * (cls == 0).sum() / n, 1)}
print("walkable:", walk_stats)

# ---------------------------------------------------------------- sand-ripple places (simulated) ----
z2 = z[: HM // 2 * 2, : WM // 2 * 2].reshape(HM // 2, 2, WM // 2, 2).mean(axis=(1, 3))
det = z2 - ndimage.median_filter(z2, size=SAND_MEDIAN_CELLS, mode="nearest")
with rasterio.open(SLOPE3) as d:
    s3 = d.read(1, masked=True).filled(90).astype(np.float32)
ri = np.minimum((np.arange(z2.shape[0]) * 2 + 1) // 3, s3.shape[0] - 1)
ci = np.minimum((np.arange(z2.shape[1]) * 2 + 1) // 3, s3.shape[1] - 1)
s2 = s3[np.ix_(ri, ci)]
sand = (det <= -SAND_BELOW_M) & (s2 < SAND_SLOPE_MAX)
sand = ndimage.binary_opening(sand, structure=np.ones((2, 2)))      # team rule ">= 4 m long" -> at least 2 x 2 cells
Image.fromarray(np.where(sand, 255, 0).astype(np.uint8)).save(os.path.join(OUT, "sand_2m.png"))
sand_pct = round(100 * sand.mean(), 1)
print(f"sand-ripple places (simulated): {sand_pct} % of the box")

# ---------------------------------------------------------------- far horizon (regional 200 m) ----
with rasterio.open(REGIONAL) as d:
    reg = d.read(1).astype(np.float32)
    reg_nod, rt = d.nodata, d.transform
reg[reg == reg_nod] = np.nan
deg = 180.0 / math.pi / R_MARS                        # degrees per eqc metre
lonW, latS = dem_b.left * deg, dem_b.bottom * deg


def regional_at(x, y):                                # local box metres -> regional DEM (bilinear)
    lon, lat = lonW + x * deg, latS + y * deg
    c = (lon - rt.c) / rt.a - 0.5
    r = (lat - rt.f) / rt.e - 0.5
    return ndimage.map_coordinates(reg, [r, c], order=1, mode="nearest")


gx, gy = np.meshgrid(np.arange(20, WM, 40), np.arange(20, HM, 40))   # box check points every 40 m
dem_pts = z[(HM - gy).clip(0, HM - 1), gx]          # local y (north of the south edge) -> row from the north
offset = float(np.nanmedian(dem_pts - regional_at(gx.astype(float), gy.astype(float))))
cx, cy = WM / 2, HM / 2
ax = np.arange(-FAR_HALF_M, FAR_HALF_M + 1, FAR_STEP_M, dtype=np.float64)
FX, FY = np.meshgrid(cx + ax, cy - ax)               # rows north -> south
far = (regional_at(FX, FY) + offset).astype("<f4")
far.tofile(os.path.join(OUT, "far_400m.f32"))
print(f"far horizon: {far.shape[1]} x {far.shape[0]} at {FAR_STEP_M} m, regional->DEM offset {offset:+.1f} m")

# ---------------------------------------------------------------- manifest ----
man = {
    "name": "Mount Sharp boxwork: astronaut walk view data",
    "made_by": "pipeline/80_walk_export.py",
    "frame": "same local frame as web/terrain/terrain.json: x east of the west edge, y north of the south edge, "
             "z elevation (m, Mars areoid as in the USGS DEM). Heights are true (no exaggeration).",
    "size_m": [WM, HM], "z": {"min": ZMIN, "max": ZMAX},
    "lat_center": round((dem_b.bottom + dem_b.top) / 2 * 180 / math.pi / R_MARS, 5),
    "lat_note": "planetocentric (Mars 2000 sphere); the page converts it to planetographic for Mars24",
    "height": {"file": "height_1m.u16", "cols": WM, "rows": HM, "cell_m": 1.0, "dtype": "uint16 little-endian",
               "order": "row-major, first row = north edge", "decode": "z = zmin + v / 65535 * (zmax - zmin)",
               "source": "USGS MSL Gale DEM Mosaic 1 m v3 (Layer 2)"},
    "color": {"tiles": "tiles/c_{i}_{j}.jpg", "i": "tile column from the west edge", "j": "tile row from the north edge",
              "nx": nx, "ny": ny, "tile_m": TILE_M, "tile_px": TILE_PX, "overview": "color_1m.jpg",
              "overview_px": [WM, HM], "ortho_grid_shift_m": shift_m,
              "pattern_source": "Calef, F.J. III, and Parker, T., 2016, MSL Gale Merged Orthophoto Mosaic 25 cm v3, "
                                "USGS Astrogeology / PDS Annex (Layer 1, greyscale)",
              "colour_source": {"id": "PIA26693", "title": "Curiosity Surveys the Boxwork Region",
                                "page": "https://science.nasa.gov/photojournal/curiosity-surveys-the-boxwork-region/",
                                "credit": "NASA/JPL-Caltech/MSSS", "taken": "2025-09-26, sol 4671, 179 Mastcam images",
                                "nasa_colour_note": "This natural color view is approximately how the scene would "
                                                    "appear to an average person if they were on Mars.",
                                "file_md5": PIA_MD5,
                                "where": "Curiosity was inside this box on sol 4671 (Layer 4 waypoint 137.38127 E, "
                                         "4.80827 S)"},
              "method": "each orbital grey value keeps its brightness rank in the box and takes the median colour "
                        "of the panorama's ground pixels with the same rank (ASSUMPTION A37)",
              "lut_info": lut_info, "ground_median_srgb": ground_median, "far_ground_srgb": [int(v) for v in lut[median_grey]]},
    "sky": sky,
    "walk": {"file": "walk_mask.png", "cell_m": float(cell), "cols": int(cls.shape[1]), "rows": int(cls.shape[0]),
             "covers_m": [float(cls.shape[1] * cell), float(cls.shape[0] * cell)],
             "channels": "R = class (0 UNKNOWN, 1 GO, 2 CAUTION, 3 NO-GO); G = 255 where you may walk",
             "rule": "you may walk on GO or CAUTION ground that joins the base without crossing NO-GO or UNKNOWN "
                     "(ASSUMPTION A39)", "source": "gonogo/combined_foot.tif (crew on foot)", "stats": walk_stats},
    "base": {"x": base["x"], "y": base["y"], "z": base["z"], "label": "Base: Curiosity's position, sol 5073"},
    "far": {"file": "far_400m.f32", "cols": int(far.shape[1]), "rows": int(far.shape[0]), "step_m": FAR_STEP_M,
            "x0": float(cx - FAR_HALF_M), "y_top": float(cy + FAR_HALF_M), "order": "row-major, first row = north",
            "dtype": "float32 little-endian", "offset_to_dem_m": round(offset, 2),
            "source": "Mars MGS MOLA - MEX HRSC Blended DEM Global 200 m v2 (Fergason, Hare & Laura 2018, USGS), "
                      "shifted by the median difference to the 1 m DEM inside the box"},
    "simulated": {
        "note": "Detail finer than the real data (1 m shape, 25 cm photo) is made up so the ground looks real "
                "up close. It is not measured.",
        "rocks": {"rule": "team drone-sim rule (Drone/sim/scripts/02_route_flights.py): about 1 rock per 12 m of path, "
                          "height gamma(2.2, 0.14) clipped to 0.15-0.7 m, width 0.5-1.2 m",
                  "per_m2": round(1 / 12 / 0.85, 4),
                  "per_m2_how": "1 per 12 m along a line / 0.85 m mean rock width (line-intercept) (ASSUMPTION A38)"},
        "ripples": {"file": "sand_2m.png", "cell_m": 2.0, "cols": int(sand.shape[1]), "rows": int(sand.shape[0]),
                    "wavelength_m": 2.5, "amplitude_m": 0.06, "box_pct": sand_pct,
                    "rule": "team drone-sim rule: 2.5 m wavelength, 6 cm, in DEM hollows >= 10 cm below a ~20 m running "
                            "median with slope < 8 deg, at least 4 m across (adapted from 1D to 2D, ASSUMPTION A40)"}},
    "sun": {"method": "Mars24 (NASA GISS; Allison & McEwen 2000), see web/walk/mars24.js",
            "default_ltst_h": 9.0, "default_ltst_note": "EVA start 09:00 local Mars time (team, safety.js START_HOUR)"},
    "walker": {"speed_m_s": 0.8, "speed_note": "team walking speed in a suit (safety.js SPEED)",
               "eye_height_m": 1.7, "eye_note": "ASSUMPTION A42 (display only)"},
    "built_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}
json.dump(man, open(os.path.join(OUT, "walk.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"done in {time.time() - t0:.0f} s -> {OUT}")
