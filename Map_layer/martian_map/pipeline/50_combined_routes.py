"""Ultimate GO/NO-GO map (Part 3): combine the conversion layers, check strictness on Curiosity's real path, plan routes.

Combine rule (per 3 m cell)
  1. orbital severity = worst of: slope (profile), roughness, terrain unit (only where mapped)
     order GO < CAUTION < UNKNOWN < NO-GO. Unmapped geology is NEUTRAL (it does not grey the map).
  2. Rover-proven ground: within 5 m of Curiosity's path an orbital NO-GO or UNKNOWN becomes CAUTION (it was driven, so it
     is passable, but the orbital data say take care). Ground truth outranks orbital data (team certainty ladder).
  3. final = worst of (step 2, ground-truth hazard from the EVA stops: orange -> CAUTION, red -> NO-GO within 15 m).
     A red stop is itself ground truth, so the rover rule never lifts it.
Route cost = the team app's "Safest" weights (repo ASSUMPTIONS.md, routes.js PROFILES): GO 1, CAUTION 5, UNKNOWN 8,
NO-GO never crossed, x 0.6 on Curiosity's path (driven corridor).
Routes: least-cost path (8-connected, true ground metres) between the Layer 5 POIs in the order Curiosity visited them.
Strictness check: if Curiosity's own path were mostly red, our limits would be too strict. Target: NO-GO on the path <= 5 %
(before the rover-proven rule is applied).

Run (from martian_map/): .venv/Scripts/python.exe -I -X utf8 pipeline/50_combined_routes.py
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, rasterio, geopandas as gpd
from scipy.ndimage import label
from skimage.graph import MCP_Geometric
from shapely.geometry import LineString, Point
from common import *  # noqa: F403

CLASS = {0: "UNKNOWN", 1: "GO", 2: "CAUTION", 3: "NO-GO"}
COLORS = {0: (158, 158, 158, 255), 1: (26, 152, 80, 255), 2: (244, 196, 48, 255), 3: (215, 48, 39, 255)}
SEV = {1: 1.0, 2: 2.0, 0: 2.5, 3: 3.0}                     # class -> severity
SEV2CLS = {1.0: 1, 2.0: 2, 2.5: 0, 3.0: 3}
COST = {1: 1.0, 2: 5.0, 0: 8.0, 3: -1.0}                   # team "Safest" weights; negative = impassable for MCP
DRIVEN_FACTOR = 0.6                                         # team "Safest": on Curiosity's path 0.6
H, W = GRID_SHAPE
rules = json.load(open(os.path.join(GONOGO, "gonogo_rules.json")))


def read(name):
    with rasterio.open(os.path.join(GONOGO, f"conv_{name}.tif")) as s:
        return s.read(1)


rough, terr, gt = read("roughness"), read("terrain"), read("groundtruth")
driven = np.load(os.path.join(GONOGO, "inputs", "driven_mask.npy"))
lat_c = -4.805
EW = math.cos(math.radians(lat_c))                         # eqc metres -> ground metres east-west
P = rover_path_points()


def to_sev(c):
    out = np.vectorize(SEV.get, otypes=[float])(c)
    return out


GT_SEV = np.where(gt == 3, 3.0, np.where(gt == 2, 2.0, 0.0))             # EVA-stop hazards only (GO / none = neutral)


def combine(slope_cls):
    """Returns (orbital severity before the rover rule, as classes) and the final classes."""
    sev = np.maximum(to_sev(slope_cls), to_sev(rough))
    sev = np.where(terr > 0, np.maximum(sev, to_sev(terr)), sev)          # unmapped geology = neutral
    before = np.vectorize(SEV2CLS.get, otypes=[np.uint8])(sev)
    sev = np.where(driven & (sev > 2.0), 2.0, sev)                         # rover-proven ground (orbital limits only)
    sev = np.maximum(sev, GT_SEV)                                          # EVA-stop hazards (team colours), never lifted
    after = np.vectorize(SEV2CLS.get, otypes=[np.uint8])(sev)
    return before, after


def shares(c, where=None):
    v = c if where is None else c[where]
    return {CLASS[k]: round(float(np.mean(v == k)), 4) for k in CLASS}


def path_shares(c):
    v = sample(c.astype(float), P[:, 0], P[:, 1])
    return {CLASS[k]: round(float(np.mean(v == k)), 4) for k in CLASS}


def cost_grid(cls):
    cost = np.vectorize(COST.get, otypes=[float])(cls)
    cost = np.where((cost > 0) & driven, cost * DRIVEN_FACTOR, cost)
    return cost


def cell_of(x, y):
    r, c = rc(x, y)
    return int(r), int(c)


# ---- POIs in visiting order (duplicates at the same spot merged)
poi = gpd.read_file(POI_BOX).sort_values("sol")
stops, seen = [], set()
for r in poi.itertuples():
    gx, gy = TO_GALE.transform(r.lon, r.lat)
    cell = cell_of(gx, gy)
    key = (round(gx / 5), round(gy / 5))                   # same 5 m spot -> one stop
    names = [r.name]
    if key in seen:
        stops[-1]["names"].append(r.name); continue
    seen.add(key)
    stops.append({"poi_id": r.poi_id, "names": names, "sol": int(r.sol), "x": gx, "y": gy, "cell": cell})

# ---- Curiosity waypoint chain between sols (lower bound of what it drove: straight lines between end-of-drive points)
wp = gpd.read_file(ROVER, layer="waypoints_mmgis")
wp["sol"] = wp.sol.astype(int)
wx, wy = TO_GALE.transform(wp.lon.astype(float).values, wp.lat.astype(float).values)
wp["gx"], wp["gy"] = wx, wy
wp = wp.sort_values(["sol", "site", "drive"], key=lambda s: s.astype(float))


def curiosity_chain(a, b):
    """POI a -> every waypoint with sol_a < sol < sol_b -> POI b (the sol-5073 position is not in the waypoint file)."""
    seg = wp[(wp.sol > a["sol"]) & (wp.sol < b["sol"])]
    xs = np.r_[a["x"], seg.gx.values, b["x"]]; ys = np.r_[a["y"], seg.gy.values, b["y"]]
    return float(np.hypot(np.diff(xs) * EW, np.diff(ys)).sum())


def route_props(path_cells, cls):
    rr, cc = np.array(path_cells).T
    xs, ys = X0 + (cc + 0.5) * CELL, Y0 - (rr + 0.5) * CELL
    length = float(np.hypot(np.diff(xs) * EW, np.diff(ys)).sum())
    on = cls[rr, cc]
    near = np.array([np.min(np.hypot((P[:, 0] - x) * EW, P[:, 1] - y)) for x, y in zip(xs[::3], ys[::3])])
    return xs, ys, length, {CLASS[k]: round(float(np.mean(on == k)), 3) for k in CLASS}, float(np.mean(near <= 10.0)), \
        float(np.nanmax(SLOPE[rr, cc])), float(np.nanmean(SLOPE[rr, cc]))


report = {"cost_model": {"class_cost": {CLASS[k]: v for k, v in COST.items()}, "driven_factor": DRIVEN_FACTOR,
                         "status": "team app 'Safest' weights (repo ASSUMPTIONS.md, routes.js PROFILES); NO-GO never crossed",
                         "neighbourhood": "8-connected, true ground metres"},
          "profiles": {}}
route_feats = []
os.makedirs(os.path.join(WEB, "data"), exist_ok=True)
for pid in ("foot", "rover"):
    with rasterio.open(os.path.join(GONOGO, f"conv_slope_{pid}.tif")) as s:
        slope_cls = s.read(1)
    before, comb = combine(slope_cls)
    write_grid(os.path.join(GONOGO, f"combined_{pid}.tif"), comb, "uint8", colormap={k: COLORS[k] for k in CLASS},
               tags={"layer": f"combined GO/NO-GO, profile {pid}", "classes": CLASS, "rule": __doc__.split("Route cost")[0]})
    cost = cost_grid(comb)
    passable = cost > 0
    lab, n = label(passable, structure=np.ones((3, 3)))
    sizes = np.bincount(lab.ravel())[1:]
    prof = {"box": shares(comb), "box_before_rover_rule": shares(before),
            "curiosity_path_before_rover_rule": path_shares(before), "curiosity_path": path_shares(comb),
            "cells_changed_by_rover_rule": int(np.sum(before != comb)),
            "connectivity": {"passable_share": round(float(passable.mean()), 4), "components": int(n),
                             "largest_component_share_of_passable": round(float(sizes.max() / passable.sum()), 4)}}
    nogo_path = prof["curiosity_path_before_rover_rule"]["NO-GO"]
    prof["strictness_verdict"] = ("OK: Curiosity's real path is {:.1%} NO-GO before the rover rule (target <= 5 %)".format(nogo_path)
                                  if nogo_path <= 0.05 else "TOO STRICT: {:.1%} of Curiosity's path is NO-GO".format(nogo_path))
    # strictness knob: what the box would look like with other NO-GO slope limits (same CAUTION start 15 deg)
    knob = {}
    for t in (20, 25, 30, 35):
        sc = np.where(np.isfinite(SLOPE), np.where(SLOPE >= t, 3, np.where(SLOPE >= 15, 2, 1)), 0).astype("uint8")
        b, a = combine(sc)
        knob[f"NO-GO >= {t} deg"] = {"box": shares(a), "curiosity_path_before_rover_rule": path_shares(b)}
    prof["strictness_table"] = knob

    # reach from the current rover position (sol 5073) = the 'base' for the demo
    base = stops[-1]
    mcp = MCP_Geometric(cost, fully_connected=True, sampling=(CELL, CELL * EW))
    cum, _ = mcp.find_costs([base["cell"]])
    reach = np.where(np.isfinite(cum) & passable, cum, -1).astype("float32")
    write_grid(os.path.join(GONOGO, f"reach_from_base_{pid}.tif"), reach, "float32", nodata=-1,
               tags={"meaning": f"accumulated route cost from {base['names'][0]} (equivalent metres of flat GO ground)"})
    prof["reachable_share_from_base"] = round(float(np.mean(reach >= 0)), 4)

    legs = []
    for a, b in zip(stops[:-1], stops[1:]):
        mcp = MCP_Geometric(cost, fully_connected=True, sampling=(CELL, CELL * EW))
        cum, _ = mcp.find_costs([a["cell"]], [b["cell"]])
        if not np.isfinite(cum[b["cell"]]):
            legs.append({"from": a["names"][0], "to": b["names"][0], "status": "NO ROUTE"}); continue
        cells = mcp.traceback(b["cell"])
        xs, ys, length, on, share_near, smax, smean = route_props(cells, comb)
        straight = float(math.hypot((b["x"] - a["x"]) * EW, b["y"] - a["y"]))
        chain = curiosity_chain(a, b)
        leg = {"from": " / ".join(a["names"]), "to": " / ".join(b["names"]), "sol_from": a["sol"], "sol_to": b["sol"],
               "route_m": round(length), "straight_m": round(straight), "detour_ratio": round(length / straight, 2) if straight else None,
               "curiosity_waypoint_chain_m": round(chain) if chain else None, "route_cost": round(float(cum[b["cell"]])),
               "classes_on_route": on, "share_within_10m_of_curiosity_path": round(share_near, 3),
               "slope_mean_deg": round(smean, 1), "slope_max_deg": round(smax, 1)}
        legs.append(leg)
        lon, lat = TO_LL.transform(xs, ys)
        route_feats.append({"profile": pid, **{k: v for k, v in leg.items() if k != "classes_on_route"},
                            "pct_go": on["GO"], "pct_caution": on["CAUTION"], "pct_unknown": on["UNKNOWN"], "pct_nogo": on["NO-GO"],
                            "geometry_gale": LineString(np.c_[xs, ys]), "geometry_ll": LineString(np.c_[lon, lat])})
    prof["legs"] = legs
    report["profiles"][pid] = prof
    print(pid, json.dumps({k: prof[k] for k in ("box", "curiosity_path_before_rover_rule", "strictness_verdict", "connectivity",
                                                "reachable_share_from_base")}))
    for l in legs:
        print("   ", l.get("sol_from"), "->", l.get("sol_to"), l.get("route_m"), "m vs straight", l.get("straight_m"),
              "| curiosity chain", l.get("curiosity_waypoint_chain_m"), "| on path", l.get("share_within_10m_of_curiosity_path"),
              "|", l.get("classes_on_route"))

props = [{k: v for k, v in f.items() if not k.startswith("geometry")} for f in route_feats]
gpd.GeoDataFrame(props, geometry=[f["geometry_gale"] for f in route_feats], crs=GALE_CRS).to_file(
    os.path.join(GONOGO, "routes.gpkg"), layer="routes", driver="GPKG")
gpd.GeoDataFrame(props, geometry=[f["geometry_ll"] for f in route_feats], crs=LONLAT_CRS).to_file(
    os.path.join(GONOGO, "routes_lonlat.geojson"), driver="GeoJSON")
report["stops"] = [{k: v for k, v in s.items() if k != "cell"} for s in stops]
report["note"] = ("Curiosity waypoint chain = straight lines between end-of-drive waypoints, so it is SHORTER than what the rover "
                  "actually drove. The rover also went to targets we do not route to. Use it as a sanity check, not a race.")
json.dump(report, open(os.path.join(GONOGO, "calibration", "combined_report.json"), "w"), indent=1)
print("stops:", [(s["sol"], s["names"]) for s in stops])
