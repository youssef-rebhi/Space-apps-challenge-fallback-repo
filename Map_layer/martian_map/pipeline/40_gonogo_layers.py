"""GO / NO-GO conversion layers (Part 2). One 4-colour layer per hazard input, each labelled with the parameter it uses.

Which layer feeds what (decided 15 Nov 2026):
  3D shape/look ........ L2 elevation (heightmap), L1 photo, L2 hillshade                (30_terrain_package.py)
  GO/NO-GO inputs ...... L2 slope, L2 roughness (from the 1 m DEM), L3 terrain units,
                         L4 rover path + L5 EVA stops (ground truth)                      (this script)
  not coloured ......... L1 photo (no hazard information), L5 POIs (they are destinations, not hazards)
  live gates ........... radiation, weather -> live sensors, a global GO/CAUTION/NO-GO for the whole map (gates.json)

Class codes on every conversion layer: 0 UNKNOWN (grey), 1 GO (green), 2 CAUTION (yellow), 3 NO-GO (red).
Grid: 3 m cells (walking scale; = the approved Layer 2 slope grid), USGS Gale frame, 790 x 988 cells.
Every threshold is either NASA-sourced or an ASSUMPTION; both are written into gonogo/gonogo_rules.json and the GeoTIFF tags.

Run (from martian_map/): .venv/Scripts/python.exe -I -X utf8 pipeline/40_gonogo_layers.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -I drops the script folder from sys.path
import numpy as np, rasterio, geopandas as gpd
from rasterio.features import rasterize
from scipy.ndimage import gaussian_filter, uniform_filter
from shapely.geometry import LineString
from common import *  # noqa: F403  (paths, grid, rover path, write_grid)

CLASS = {0: "UNKNOWN", 1: "GO", 2: "CAUTION", 3: "NO-GO"}
COLORS = {0: (158, 158, 158, 255), 1: (26, 152, 80, 255), 2: (244, 196, 48, 255), 3: (215, 48, 39, 255)}
SRC = json.load(open(os.path.join(MM, "pipeline", "sources_gonogo.json")))
os.makedirs(os.path.join(GONOGO, "calibration"), exist_ok=True)

with rasterio.open(DEM) as d:
    dem = d.read(1).astype("float64")
    assert abs(d.transform.c - X0) < 1e-6 and abs(d.transform.f - Y0) < 1e-6, "3 m grid must share the DEM origin"
H, W = GRID_SHAPE
P = rover_path_points()                       # Curiosity's path in the grid, every 1 m (MMGIS traverse)
valid = np.isfinite(SLOPE)


def path_stats(arr):
    v = sample(arr, P[:, 0], P[:, 1]); v = v[np.isfinite(v)]
    return v


def class_share(cls, where=None):
    m = np.ones_like(cls, bool) if where is None else where
    return {CLASS[k]: round(float(np.mean(cls[m] == k)), 4) for k in CLASS}


def path_share(cls):
    v = sample(cls.astype(float), P[:, 0], P[:, 1])
    return {CLASS[k]: round(float(np.mean(v == k)), 4) for k in CLASS}


rules, layers_out = {"class_codes": CLASS, "colors_rgba": COLORS, "grid": {"cell_m": CELL, "rows": H, "cols": W,
         "crs": GALE_CRS, "origin_xy": [X0, Y0]}, "layers": {}}, {}

# ---------------------------------------------------------------- 1. SLOPE (Layer 2), two profiles
PROFILES = {
    "foot": {"label": "Crew on foot", "caution_deg": 15.0, "nogo_deg": 25.0,
             "basis": "Team-approved thresholds (Layer 2, 14 Nov 2026). ASSUMPTION: no NASA EVA slope limit found; "
                      "calibrated: Curiosity's real path is 1.0 % >= 25 deg on this grid."},
    "rover": {"label": "Rover (Curiosity limits)", "caution_deg": 15.0, "nogo_deg": 30.0,
              "basis": "NO-GO 30 deg = Curiosity's default onboard fault-protection tilt limit (NASA/JPL; design tilt 45 deg, record "
                       "31 deg in 2020). CAUTION 15 deg = team ASSUMPTION."},
}
for pid, p in PROFILES.items():
    c = np.zeros((H, W), "uint8")
    c[valid & (SLOPE < p["caution_deg"])] = 1
    c[valid & (SLOPE >= p["caution_deg"]) & (SLOPE < p["nogo_deg"])] = 2
    c[valid & (SLOPE >= p["nogo_deg"])] = 3
    layers_out[f"slope_{pid}"] = c
    rules["layers"][f"slope_{pid}"] = {
        "title": f"Slope - {p['label']}", "input": "Layer 2: slope_box_3m_GALEFRAME.tif (Horn, 3 m baseline = rover length scale)",
        "parameter": "slope in degrees",
        "rule": {"GO": f"< {p['caution_deg']:g} deg", "CAUTION": f"{p['caution_deg']:g}-{p['nogo_deg']:g} deg",
                 "NO-GO": f">= {p['nogo_deg']:g} deg", "UNKNOWN": "no DEM value (0.5 % of cells)"},
        "basis": p["basis"], "sources": SRC["slope"]}

# ---------------------------------------------------------------- 2. ROUGHNESS (Layer 2 DEM, 1 m)
# metre-scale relief: RMS of the DEM after removing everything smoother than a 5 m Gaussian, in a 9 m window
hp = dem - gaussian_filter(dem, 5.0)
rms1 = np.sqrt(uniform_filter(hp ** 2, 9))
rough = rms1[1:3 * H:3, 1:3 * W:3][:H, :W].astype("float32")      # value at each 3 m cell centre
rp = path_stats(rough)
r_caution, r_unknown = float(np.percentile(rp, 95)), float(rp.max())
c = np.ones((H, W), "uint8")
c[rough > r_caution] = 2
c[rough > r_unknown] = 0
layers_out["roughness"] = c
write_grid(os.path.join(GONOGO, "inputs", "roughness_m.tif"), rough, "float32",
           tags={"parameter": "RMS of DEM high-pass (DEM - Gaussian sigma 5 m) in a 9 m window, m"})
rules["layers"]["roughness"] = {
    "title": "Roughness (metre-scale relief)", "input": "Layer 2: elevation_box_1m_GALEFRAME.tif",
    "parameter": "RMS relief in m (DEM minus 5 m Gaussian, 9 m window)",
    "rule": {"GO": f"<= {r_caution:.2f} m (smoother than 95 % of Curiosity's drive here)",
             "CAUTION": f"{r_caution:.2f}-{r_unknown:.2f} m (within the range Curiosity drove over)",
             "UNKNOWN": f"> {r_unknown:.2f} m (rougher than anything Curiosity crossed in the box: scout first)",
             "NO-GO": "never from roughness alone (no NASA hard limit at this scale; the 1 m DEM cannot resolve single rocks)"},
    "basis": "ASSUMPTION calibrated on Curiosity's in-box path (MMGIS traverse, 1 m samples). Curiosity's wheels are 50 cm; "
             "single rocks are below this DEM's resolution, so this is a terrain-texture signal, not a rock count.",
    "calibration": {"path_samples": int(len(rp)), "path_p50": float(np.median(rp)), "path_p95": r_caution, "path_max": r_unknown},
    "sources": SRC["roughness"]}

# ---------------------------------------------------------------- 3. TERRAIN UNITS (Layer 3)
UNIT_RULE = {"LSu": (1, "firm layered bedrock"), "BXr": (1, "firm bedrock ridge tops (Curiosity drove along them)"),
             "BXh": (2, "hollows, often sediment-filled: possible loose fill"), "Aeo": (2, "sand/ripples: sinkage risk (Hidden Valley, sols 709-710)")}
units = gpd.read_file(GEOLOGY, layer="units").to_crs(GALE_CRS)
order = sorted(units.itertuples(), key=lambda r: UNIT_RULE[r.unit_code][0])   # CAUTION units drawn last (win overlaps)
c = rasterize([(r.geometry, UNIT_RULE[r.unit_code][0]) for r in order], out_shape=(H, W), transform=GRID_T, fill=0, dtype="uint8")
unit_code = rasterize([(r.geometry, i + 1) for i, r in enumerate(order)], out_shape=(H, W), transform=GRID_T, fill=0, dtype="uint8")
layers_out["terrain"] = c
rules["layers"]["terrain"] = {
    "title": "Terrain units (geology)", "input": "Layer 3: geology_GALEFRAME.gpkg / units (approved 15 Nov 2026)",
    "parameter": "mapped unit -> trafficability",
    "rule": {u: f"{CLASS[v[0]]}: {v[1]}" for u, v in UNIT_RULE.items()} | {
        "UNKNOWN": "not mapped (78 % of the box). In the combined map an unmapped cell is NEUTRAL: slope and roughness decide."},
    "basis": "ASSUMPTION per unit, from each unit's hazard note (Layer 3) and the NASA boxwork blogs (ridges firm, hollows sediment-filled).",
    "sources": SRC["terrain"]}

# ---------------------------------------------------------------- 4. GROUND TRUTH (Layer 4 rover path + Layer 5 EVA stops)
# Stop colours follow the team's ASSUMPTIONS.md (repo malek-mejaouel/Depo_nasa, Application/fg-app/src/lib/mission.js, safety.js,
# grey.js, routes.js), so the map and the app agree:
#   RED    sand > 30 % or big rock > 2 %          ORANGE sand 10-30 %, or a green stop with AI certainty < 0.75
#   AI result counts within 30 m of a stop (grey.js NEAR_AI_M); red stops are never crossed within 15 m (routes.js)
CORRIDOR_M, SEEN_M, RED_KEEPOUT_M = 5.0, 30.0, 15.0
SAND_RED, BIGROCK_RED, SAND_ORANGE, CERT_MIN = 0.30, 0.02, 0.10, 0.75
tr = gpd.read_file(ROVER, layer="traverse_mmgis")
lines = []
for g in tr.geometry:
    for a in densify_gale(g, 1.0):
        if len(a) > 1:
            lines.append(LineString(a))
driven = rasterize([(ln.buffer(CORRIDOR_M), 1) for ln in lines], out_shape=(H, W), transform=GRID_T, fill=0, dtype="uint8").astype(bool)
eva = gpd.read_file(EVA_STOPS)
ex, ey = TO_GALE.transform(eva.geometry.x.values, eva.geometry.y.values)
eva["gx"], eva["gy"] = ex, ey
# AI certainty per stop: from the team app's stops.json (copied into Layer 5 sources; same 55 stops, matched by sol + position)
cert_src = os.path.join(L5, "sources", "app_stops_with_certainty.json")
certs = {(int(s["sol"]), round(float(s["lon"]), 6), round(float(s["lat"]), 6)): s.get("certainty")
         for s in json.load(open(cert_src, encoding="utf-8"))}
eva["certainty"] = [certs.get((int(r.sol), round(r.geometry.x, 6), round(r.geometry.y, 6))) for r in eva.itertuples()]
assert eva.certainty.notna().all(), "every EVA stop must find its certainty in the app's stops.json"


def team_class(r):
    if r.sand_pct > SAND_RED or r.bigrock_pct > BIGROCK_RED:
        return "red"
    if r.sand_pct >= SAND_ORANGE or r.certainty < CERT_MIN:
        return "orange"
    return "green"


eva["team_class"] = [team_class(r) for r in eva.itertuples()]
from shapely.geometry import Point  # noqa: E402


def disc(cls, radius):
    shapes = [(Point(x, y).buffer(radius), 1) for x, y, k in zip(ex, ey, eva.team_class) if k == cls]
    return rasterize(shapes or [(Point(0, 0), 0)], out_shape=(H, W), transform=GRID_T, fill=0, dtype="uint8").astype(bool)


seen_green, seen_orange, seen_red, red_core = disc("green", SEEN_M), disc("orange", SEEN_M), disc("red", SEEN_M), disc("red", RED_KEEPOUT_M)
seen_any = seen_green | seen_orange | seen_red
c = np.zeros((H, W), "uint8")
c[seen_green | driven] = 1
c[seen_orange | seen_red] = 2          # stop observations are more specific than "Curiosity drove near here"
c[red_core] = 3
layers_out["groundtruth"] = c
eva[["stop_no", "sol", "sand_pct", "bigrock_pct", "certainty", "team_class"]].to_json(
    os.path.join(GONOGO, "inputs", "eva_stop_classes.json"), orient="records", indent=1)
counts = eva.team_class.value_counts().to_dict()
rules["layers"]["groundtruth"] = {
    "title": "Ground truth (rover path + EVA stops)", "input": "Layer 4: traverse_mmgis; Layer 5: eva_stops (team AI on NASA Navcam) + AI certainty",
    "parameter": f"driven within {CORRIDOR_M:g} m of Curiosity's path; team AI stop colour within {SEEN_M:g} m of each EVA stop",
    "rule": {"GO": f"Curiosity drove here (+/-{CORRIDOR_M:g} m), or a GREEN stop within {SEEN_M:g} m",
             "CAUTION": f"ORANGE stop within {SEEN_M:g} m (sand {SAND_ORANGE:.0%}-{SAND_RED:.0%}, or AI certainty < {CERT_MIN}); "
                        f"RED stop {RED_KEEPOUT_M:g}-{SEEN_M:g} m away",
             "NO-GO": f"within {RED_KEEPOUT_M:g} m of a RED stop (sand > {SAND_RED:.0%} or big rock > {BIGROCK_RED:.0%})",
             "UNKNOWN": "no ground truth (most of the box): send the scout"},
    "basis": f"Stop colours, the {SEEN_M:g} m AI radius and the {RED_KEEPOUT_M:g} m red keep-out are the team's values (repo ASSUMPTIONS.md: "
             f"mission.js, safety.js UNSURE, grey.js NEAR_AI_M, routes.js). Corridor {CORRIDOR_M:g} m = ASSUMPTION (rover ~3 m wide; "
             "MMGIS/PLACES agree to <= 2.1 m).",
    "result": {"eva_stops": int(len(eva)), "green": counts.get("green", 0), "orange": counts.get("orange", 0), "red": counts.get("red", 0),
               "red_stops": eva[eva.team_class == "red"][["stop_no", "sol", "sand_pct", "bigrock_pct"]].to_dict("records"),
               "orange_stops": eva[eva.team_class == "orange"][["stop_no", "sol", "sand_pct", "certainty"]].to_dict("records")},
    "sources": SRC["groundtruth"]}

# ---------------------------------------------------------------- 5. CERTAINTY (how sure the colour is)
cert = np.ones((H, W), "uint8")
cert[~valid] = 0
cert[seen_any] = 2
cert[driven] = 3
rules["certainty"] = {"codes": {0: "none (no DEM)", 1: "orbital only (DEM + geology)", 2: f"seen from the ground (EVA stop <= {SEEN_M:g} m)",
                                3: f"driven by Curiosity (<= {CORRIDOR_M:g} m)", 4: "live sensor (runtime only, not in the file)"},
                      "ladder": "live > rover ground truth > orbital > none (team rule)"}

# ---------------------------------------------------------------- write rasters + stats
cmap = {k: COLORS[k] for k in CLASS}
stats = {}
for name, arr in layers_out.items():
    write_grid(os.path.join(GONOGO, f"conv_{name}.tif"), arr, "uint8", tags={"layer": name, "classes": CLASS,
               "rule": rules["layers"][name]["rule"], "parameter": rules["layers"][name]["parameter"]}, colormap=cmap)
    stats[name] = {"box": class_share(arr), "curiosity_path": path_share(arr)}
write_grid(os.path.join(GONOGO, "certainty.tif"), cert, "uint8", tags={"codes": rules["certainty"]["codes"]},
           colormap={0: (158, 158, 158, 255), 1: (198, 219, 239, 255), 2: (107, 174, 214, 255), 3: (8, 81, 156, 255)})
write_grid(os.path.join(GONOGO, "inputs", "geology_unit_index.tif"), unit_code, "uint8",
           tags={"index": {i + 1: r.unit_code for i, r in enumerate(order)}})
np.save(os.path.join(GONOGO, "inputs", "driven_mask.npy"), driven)
stats["certainty"] = {rules["certainty"]["codes"][k]: round(float(np.mean(cert == k)), 4) for k in range(4)}
rules["stats"] = stats

# rover tilt vs DEM slope (does the slope layer measure what the rover felt?)
w = gpd.read_file(ROVER, layer="waypoints_mmgis"); w = w[w.in_box.astype(int) == 1]
gx, gy = TO_GALE.transform(w.lon.astype(float).values, w.lat.astype(float).values)
ws = sample(SLOPE, gx, gy); tilt = w.tilt.astype(float).values; ok = np.isfinite(ws)
rules["calibration_slope_vs_rover_tilt"] = {
    "waypoints_in_box": int(len(w)), "rover_tilt_median_deg": float(np.median(tilt)), "rover_tilt_max_deg": float(tilt.max()),
    "dem_slope_at_waypoints_median_deg": float(np.median(ws[ok])), "median_difference_deg": float(np.median(ws[ok] - tilt[ok])),
    "correlation": float(np.corrcoef(tilt[ok], ws[ok])[0, 1]),
    "note": "Rover tilt (MMGIS waypoints, sols 4384-5073) is the vehicle attitude over its 3 m wheelbase; DEM slope is the 3 m Horn slope. "
            "Medians agree within 0.5 deg; single points differ (DEM noise, position error)."}
sp = path_stats(SLOPE)
rules["calibration_slope_on_path"] = {"path_samples_1m": int(len(sp)),
    "percentiles_deg": {q: round(float(np.percentile(sp, q)), 1) for q in (50, 75, 90, 95, 99, 99.5, 100)},
    "share_ge": {t: round(float(np.mean(sp >= t)), 4) for t in (15, 20, 25, 30, 35)},
    "box_share_ge": {t: round(float(np.nanmean(SLOPE >= t)), 4) for t in (15, 20, 25, 30, 35)}}

# ---------------------------------------------------------------- live-sensor gates (radiation, weather): no map, a global gate
gates = json.load(open(os.path.join(MM, "pipeline", "live_gates_rules.json")))
json.dump(gates, open(os.path.join(GONOGO, "live_gates.json"), "w"), indent=1)
rules["live_gates"] = "live_gates.json (radiation + weather: a time gate over the whole map, from live sensors)"
json.dump(rules, open(os.path.join(GONOGO, "gonogo_rules.json"), "w"), indent=1, default=str)
print(json.dumps(stats, indent=1))
print(json.dumps({k: rules[k] for k in ("calibration_slope_vs_rover_tilt", "calibration_slope_on_path")}, indent=1))
print("roughness thresholds:", r_caution, r_unknown, "| EVA stop colours:", counts)
