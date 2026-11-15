"""Step 90: copy the data the 30 s demo film needs into web/film/assets/, with where each piece came from.

The film page (web/film/) can only read files under web/. A few of its pieces live elsewhere in the team repo:
  - the crater heights (Layer 2 regional grid, MOLA-HRSC 200 m DEM)   -> crater.f32 + crater.json
  - one AI-read Navcam photo and its stop (Application/data)            -> ai_stop.jpg  + facts.json "ai"
  - the AI test scores (Ai_model/results/metrics.json)                  -> facts.json "ai"
  - the simulated drone hazard lines (Drone/sim/out)                    -> drone.json
  - the drone check numbers (Drone/sim/results/verify_latest.md)       -> facts.json "drone"
Nothing is changed, only copied and moved into the map's local frame (x east of the west edge, y north of the
south edge, eqc metres on the Mars 2000 sphere). Run:  python -I -X utf8 pipeline/90_film_assets.py
"""
import json, math, os, re, shutil, sys
from array import array
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)                                    # -I drops the script's folder from sys.path
from paths import MM, WEB, R_MARS                            # noqa: E402

REPO = os.path.dirname(os.path.dirname(MM))                  # .../Depo_nasa (Map_layer/martian_map -> repo root)
OUT = os.path.join(WEB, "film", "assets")
SRC = {
    "crater": os.path.join(REPO, "Map_layer", "Layer2_Elevation", "exports", "plotly", "regional_gale_300x300.json"),
    "stops": os.path.join(REPO, "Application", "data", "stops.json"),
    "ai_metrics": os.path.join(REPO, "Ai_model", "results", "metrics.json"),
    "ai_writeup": os.path.join(REPO, "Ai_model", "AI_WRITEUP.md"),
    "drone_lines": os.path.join(REPO, "Drone", "sim", "out", "drone_hazards.geojson"),
    "drone_verify": os.path.join(REPO, "Drone", "sim", "results", "verify_latest.md"),
}
AI_SOL = 4582          # the stop shown in the film: the most sand of the 55 stops (29 %), and one big rock

rel = lambda p: os.path.relpath(p, REPO).replace("\\", "/")


def main():
    for k, p in SRC.items():
        if not os.path.exists(p):
            sys.exit(f"missing {k}: {p}")
    os.makedirs(OUT, exist_ok=True)
    terrain = json.load(open(os.path.join(WEB, "terrain", "terrain.json"), encoding="utf-8"))
    walk = json.load(open(os.path.join(WEB, "walk", "walk.json"), encoding="utf-8"))
    lonW, latS = terrain["lonlat_bounds"][0], terrain["lonlat_bounds"][1]
    k = R_MARS * math.pi / 180                                # eqc metres per degree (lat_ts = 0)
    to_xy = lambda lon, lat: (round((lon - lonW) * k, 2), round((lat - latS) * k, 2))
    WM, HM = terrain["size_m"]

    # ---- crater: 300 x 300 heights, first row north
    reg = json.load(open(SRC["crater"], encoding="utf-8"))
    lon, lat, z = reg["lon"], reg["lat"], reg["z"]
    assert len(z) == len(lat) and len(z[0]) == len(lon) and lat[0] > lat[-1], "unexpected crater grid layout"
    off = walk["far"]["offset_to_dem_m"]                      # same shift as the walk view's far hills (A41)
    flat = array("f", [v + off for row in z for v in row])
    with open(os.path.join(OUT, "crater.f32"), "wb") as f:
        flat.tofile(f)
    crater = {
        "file": "crater.f32", "cols": len(lon), "rows": len(lat), "dtype": "float32 little-endian", "order": "row-major, first row = north",
        "x_m": [to_xy(v, latS)[0] for v in lon], "y_m": [to_xy(lonW, v)[1] for v in lat],
        "z_min": round(min(flat), 1), "z_max": round(max(flat), 1),
        "offset_to_dem_m": off, "offset_note": "added to every height so the regional grid meets the 1 m DEM (walk.json far.offset_to_dem_m, ASSUMPTION A41)",
        "source": f"{reg['source']} ({reg['note']}), via {rel(SRC['crater'])}",
    }
    json.dump(crater, open(os.path.join(OUT, "crater.json"), "w", encoding="utf-8"), indent=1)

    # ---- the AI stop
    stops = json.load(open(SRC["stops"], encoding="utf-8"))
    st = next(s for s in stops if s["sol"] == AI_SOL)
    img_src = os.path.join(os.path.dirname(SRC["stops"]), st["image"])
    shutil.copyfile(img_src, os.path.join(OUT, "ai_stop.jpg"))
    m = json.load(open(SRC["ai_metrics"], encoding="utf-8"))["test_min3"]
    hdr = next(l for l in open(SRC["ai_writeup"], encoding="utf-8") if l.startswith("| | soil"))
    classes = [c.strip() for c in hdr.strip().strip("|").split("|")][1:5]     # soil, bedrock, sand, big rock
    assert classes == ["soil", "bedrock", "sand", "big rock"], classes
    x, y = to_xy(st["lon"], st["lat"])
    ai = {
        "stop": {"sol": st["sol"], "x": x, "y": y, "sand": st["sand_pct"], "bedrock": st["bedrock_pct"], "soil": st["soil_pct"],
                 "bigrock": st["bigrock_pct"], "certainty": st["certainty"], "note": st.get("note", ""), "photo": "ai_stop.jpg",
                 "photo_id": os.path.basename(st["image"]).rsplit(".", 1)[0], "photo_credit": "NASA/JPL-Caltech (Curiosity Navcam); colours = team AI"},
        "overlay_colours": {"soil": [150, 110, 60], "bedrock": [90, 90, 90], "sand": [240, 200, 60], "big rock": [200, 40, 40]},
        "overlay_zone": "the AI reads rows 40-85 % of the photo (the near ground)",
        "iou": dict(zip(classes, m["iou"])), "mean_iou": m["miou"],
        "test_set": "AI4Mars expert test set (labels agreed by 3 experts)",
        "source": f"{rel(SRC['ai_metrics'])} (test_min3); {rel(SRC['stops'])} (sol {AI_SOL}); colours from Ai_model/nasa_training.ipynb (COL)",
    }

    # ---- drone hazard lines (simulated)
    g = json.load(open(SRC["drone_lines"], encoding="utf-8"))
    lines = []
    for ft in g["features"]:
        geo = ft["geometry"]
        parts = [geo["coordinates"]] if geo["type"] == "LineString" else geo["coordinates"] if geo["type"] == "MultiLineString" else [[geo["coordinates"]]]
        for part in parts:
            pts = [to_xy(*c[:2]) for c in part]
            if any(0 <= px <= WM and 0 <= py <= HM for px, py in pts):
                lines.append({"h": ft["properties"]["hazard"], "f": ft["properties"].get("flight", ""), "p": pts})
    drone_lines = {"note": g.get("properties", {}).get("note", ""), "source": rel(SRC["drone_lines"]), "lines": lines}
    json.dump(drone_lines, open(os.path.join(OUT, "drone.json"), "w", encoding="utf-8"), separators=(",", ":"))

    # ---- drone check numbers (the real-route row of the verification table)
    md = open(SRC["drone_verify"], encoding="utf-8").read()
    row = re.search(r"^\| real_route \| (\d+)/(\d+) \| ([\d.]+) \|", md, re.M)
    run = re.search(r"^Run: (\S+)", md, re.M)
    drone = {"landed": int(row.group(1)), "flights": int(row.group(2)), "map_error_cm": float(row.group(3)),
             "run": run.group(1) if run else "", "what": "simulated scout drone flying Curiosity's real route (40-seed check)",
             "source": rel(SRC["drone_verify"]) + " (Medians per set, real_route)"}

    facts = {"made_by": "pipeline/90_film_assets.py", "built_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "ai": ai, "drone": drone,
             "note": "Box shares, Curiosity's path share and connectivity are read by the film from web/data/combined_report.json; the route from web/overlays.json."}
    json.dump(facts, open(os.path.join(OUT, "facts.json"), "w", encoding="utf-8"), indent=1)
    print(f"crater {crater['cols']}x{crater['rows']} z {crater['z_min']}..{crater['z_max']} m; x {crater['x_m'][0]:.0f}..{crater['x_m'][-1]:.0f}, "
          f"y {crater['y_m'][-1]:.0f}..{crater['y_m'][0]:.0f} m")
    print(f"AI stop sol {AI_SOL} at ({x}, {y}) m, sand {st['sand_pct']}; sand IoU {ai['iou']['sand']}, mean IoU {ai['mean_iou']}")
    print(f"drone lines in the box: {len(lines)}; real route {drone['landed']}/{drone['flights']} landed, {drone['map_error_cm']} cm")


if __name__ == "__main__":
    main()
