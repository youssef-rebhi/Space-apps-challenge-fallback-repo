"""Web export (Parts 2-4): every map as a texture for the 3D terrain, overlays in local metres, Plotly colour grids.

Writes into web/:
  layers.json ............ manifest: every texture, its legend, its parameters and sources (the viewer builds its menu from it)
  textures/*.png|jpg ..... conv_* (one per conversion layer), combined_{foot,rover}, combined_over_photo_{foot,rover} (Part 4:
                           the 3D coloured map), certainty, reach_from_base_{profile}
  overlays.json .......... routes, Curiosity's path, POIs, EVA stops (x = m east of west edge, y = m north of south edge, z = m)
  data/live_gates.json ... live-sensor gate rules (radiation, weather, O2)
  plotly/gonogo_300.json . class grids on the 300 x 300 terrain sample (surfacecolor) + discrete colourscale
  docs/preview_*.png ..... quick-look images (combined map + routes) for slides and review
Run (from martian_map/): .venv/Scripts/python.exe -I -X utf8 pipeline/60_web_export.py
"""
import json, math, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, rasterio, geopandas as gpd
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import map_coordinates
from common import *  # noqa: F403

Image.MAX_IMAGE_PIXELS = None
TX = os.path.join(WEB, "textures"); os.makedirs(TX, exist_ok=True)
os.makedirs(os.path.join(WEB, "data"), exist_ok=True); os.makedirs(os.path.join(MM, "docs", "img"), exist_ok=True)
meta = json.load(open(os.path.join(WEB, "terrain", "terrain.json")))
rules = json.load(open(os.path.join(GONOGO, "gonogo_rules.json")))
rep = json.load(open(os.path.join(GONOGO, "calibration", "combined_report.json")))
L, B, R, T = meta["extent_eqc_m"]; WM, HM = meta["size_m"]
H, W = GRID_SHAPE
COVER = [W * CELL, H * CELL]                                          # 3 m grid covers 2370 x 2964 m of the 2371 x 2964 m mesh
CLASS_RGBA = {0: (158, 158, 158), 1: (26, 152, 80), 2: (244, 196, 48), 3: (215, 48, 39)}
LEGEND4 = [{"code": 1, "label": "GO", "color": "#1a9850"}, {"code": 2, "label": "CAUTION", "color": "#f4c430"},
           {"code": 3, "label": "NO-GO", "color": "#d73027"}, {"code": 0, "label": "UNKNOWN - send the scout", "color": "#9e9e9e"}]


def read(path):
    with rasterio.open(path) as s:
        return s.read(1)


def class_png(cls, name, alpha=255, unknown_alpha=None):
    rgba = np.zeros((H, W, 4), "uint8")
    for k, c in CLASS_RGBA.items():
        m = cls == k
        rgba[m, :3] = c; rgba[m, 3] = alpha if (k != 0 or unknown_alpha is None) else unknown_alpha
    Image.fromarray(rgba, "RGBA").save(os.path.join(TX, name), optimize=True)
    return name


# ---------- photo at texture resolution, class grid -> texture pixels (nearest)
photo = np.asarray(Image.open(os.path.join(WEB, "terrain", "texture_photo.jpg")).convert("L"), dtype="float32")
th, tw = photo.shape
ci = np.clip(((np.arange(tw) + 0.5) * WM / tw / CELL).astype(int), 0, W - 1)
ri = np.clip(((np.arange(th) + 0.5) * HM / th / CELL).astype(int), 0, H - 1)
lum = 0.30 + 0.70 * (photo / 255.0)                                   # keep the photo's detail under the colour

layers = []
add = lambda **k: layers.append(k)  # noqa: E731
add(id="photo", group="Base", title="Photo (Layer 1)", file="terrain/texture_photo.jpg", covers_m=[WM, HM],
    legend=None, parameter="USGS 25 cm orthomosaic, fixed 2-98 % stretch", sources=[meta["textures"][0]["source"]])
add(id="hillshade", group="Base", title="Shaded relief (Layer 2)", file="terrain/texture_hillshade.jpg", covers_m=[WM, HM],
    legend=None, parameter="Hillshade of the USGS 1 m DEM", sources=[meta["textures"][1]["source"]])

for pid in ("foot", "rover"):
    comb = read(os.path.join(GONOGO, f"combined_{pid}.tif"))
    add(id=f"combined_{pid}", group="GO / NO-GO", profile=pid, title=f"Combined GO/NO-GO ({'crew on foot' if pid == 'foot' else 'rover'})",
        file="textures/" + class_png(comb, f"combined_{pid}.png"), covers_m=COVER, legend=LEGEND4, nearest=True,
        parameter="worst of slope, roughness, terrain unit, ground-truth hazard; rover-driven ground capped at CAUTION",
        stats=rep["profiles"][pid]["box"], sources=["gonogo/gonogo_rules.json", "gonogo/calibration/combined_report.json"])
    big = comb[np.ix_(ri, ci)]
    rgb = np.zeros((th, tw, 3), "float32")
    for k, c in CLASS_RGBA.items():
        rgb[big == k] = c
    rgb *= lum[..., None]
    Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"), "RGB").save(os.path.join(TX, f"combined_over_photo_{pid}.jpg"), quality=85, optimize=True)
    add(id=f"combined_over_photo_{pid}", group="GO / NO-GO", profile=pid, title=f"3D colored map: GO/NO-GO over photo ({pid})",
        file=f"textures/combined_over_photo_{pid}.jpg", covers_m=[WM, HM], legend=LEGEND4,
        parameter="combined classes tinted onto the Layer 1 photo (brightness from the photo)", stats=rep["profiles"][pid]["box"],
        sources=["gonogo/combined_" + pid + ".tif", meta["textures"][0]["source"]])
    reach = read(os.path.join(GONOGO, f"reach_from_base_{pid}.tif")).astype("float32")
    ok = reach >= 0
    v = np.clip(reach / 2500.0, 0, 1)                                  # 0-2500 equivalent metres
    band = (np.floor(reach / 250.0) % 2 == 0)
    rgba = np.zeros((H, W, 4), "uint8")
    col = np.stack([255 * (1 - v) * 0.1 + 30, 120 + 110 * (1 - v), 180 + 60 * v], -1)
    col[band & ok] *= 0.85
    rgba[..., :3] = np.clip(col, 0, 255); rgba[..., 3] = np.where(ok, 230, 0)
    Image.fromarray(rgba, "RGBA").save(os.path.join(TX, f"reach_{pid}.png"), optimize=True)
    add(id=f"reach_{pid}", group="Planning", profile=pid, title=f"Reach from base, sol 5073 position ({pid})",
        file=f"textures/reach_{pid}.png", covers_m=COVER, nearest=True, overlay_on_photo=True,
        legend=[{"label": "near (0 m)", "color": "#3ce6b4"}, {"label": "2500+ equiv. m", "color": "#1e78f0"},
                {"label": "bands = 250 m steps", "color": "#888888"}, {"label": "unreachable / NO-GO", "color": "transparent"}],
        parameter="accumulated route cost from the base (equivalent metres of flat GO ground)",
        stats={"reachable_share": rep["profiles"][pid]["reachable_share_from_base"]}, sources=["gonogo/reach_from_base_" + pid + ".tif"])

GREY_MEANS = {"slope_foot": "UNKNOWN - no DEM value", "slope_rover": "UNKNOWN - no DEM value",
              "roughness": "UNKNOWN - rougher than anything Curiosity crossed: scout first",
              "terrain": "UNKNOWN - not mapped (neutral in the combined map)",
              "groundtruth": "UNKNOWN - no ground truth yet: send the scout"}
for name in ("slope_foot", "slope_rover", "roughness", "terrain", "groundtruth"):
    cls = read(os.path.join(GONOGO, f"conv_{name}.tif"))
    r = rules["layers"][name]
    leg = [dict(s, label=GREY_MEANS[name]) if s["code"] == 0 else s for s in LEGEND4]
    add(id=f"conv_{name}", group="Conversion layers", title=r["title"], file="textures/" + class_png(cls, f"conv_{name}.png"),
        covers_m=COVER, legend=leg, nearest=True, parameter=r["parameter"], rule=r["rule"], basis=r["basis"],
        stats=rules["stats"][name], sources=[s["url"] for s in r["sources"]])
cert = read(os.path.join(GONOGO, "certainty.tif"))
cc = {0: (158, 158, 158), 1: (198, 219, 239), 2: (107, 174, 214), 3: (8, 81, 156)}
rgba = np.zeros((H, W, 4), "uint8")
for k, c in cc.items():
    rgba[cert == k, :3] = c
rgba[..., 3] = 255
Image.fromarray(rgba, "RGBA").save(os.path.join(TX, "certainty.png"), optimize=True)
add(id="certainty", group="Conversion layers", title="Certainty (how sure the colour is)", file="textures/certainty.png", covers_m=COVER,
    nearest=True, legend=[{"label": v, "color": "#%02x%02x%02x" % cc[int(k)]} for k, v in rules["certainty"]["codes"].items() if int(k) < 4],
    parameter=rules["certainty"]["ladder"], stats=rules["stats"]["certainty"], sources=["Layer 4 traverse", "Layer 5 EVA stops"])

# ---------- overlays in local metres
with rasterio.open(DEM) as d:
    dem = d.read(1).astype("float32")


def z_at(x, y):                                                       # bilinear DEM sample, Gale metres in
    col = (np.asarray(x) - L) - 0.5; row = (T - np.asarray(y)) - 0.5
    return map_coordinates(dem, [row, col], order=1, mode="nearest")


def local(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    return np.round(x - L, 2), np.round(y - B, 2), np.round(z_at(x, y), 2)


routes = gpd.read_file(os.path.join(GONOGO, "routes.gpkg"), layer="routes")
ov = {"frame": meta["local_frame"], "routes": [], "curiosity_path": [], "pois": [], "eva_stops": []}
for _, r in routes.iterrows():
    xy = np.array(r.geometry.coords)
    lx, ly, lz = local(xy[:, 0], xy[:, 1])
    props = {k: (v.item() if hasattr(v, "item") else v) for k, v in r.items() if k != "geometry"}
    ov["routes"].append({"profile": r["profile"], "leg": f"{r['sol_from']}->{r['sol_to']}", "props": props,
                         "xyz": np.c_[lx, ly, lz].tolist()})
P = rover_path_points(3.0)
lx, ly, lz = local(P[:, 0], P[:, 1])
gaps = np.r_[0, np.where(np.hypot(np.diff(lx), np.diff(ly)) > 10)[0] + 1, len(lx)]
ov["curiosity_path"] = [np.c_[lx[a:b], ly[a:b], lz[a:b]].tolist() for a, b in zip(gaps[:-1], gaps[1:]) if b - a > 1]
poi = gpd.read_file(POI_BOX)
cards = {}
cp = os.path.join(L5, "exports", "poi_cards.json")
if os.path.exists(cp):
    try:
        cards = {c.get("poi_id"): c for c in json.load(open(cp, encoding="utf-8")) if isinstance(c, dict)}
    except Exception:
        cards = {}
for r in poi.itertuples():
    gx, gy = TO_GALE.transform(r.lon, r.lat)
    x, y, z = local([gx], [gy])
    ov["pois"].append({"poi_id": r.poi_id, "name": r.name, "sol": int(r.sol), "category": r.category, "x": float(x[0]), "y": float(y[0]),
                       "z": float(z[0]), "description": r.description, "science_value": r.science_value, "source_url": r.source_url,
                       "evidence": r.evidence})
eva = gpd.read_file(EVA_STOPS)
gx, gy = TO_GALE.transform(eva.geometry.x.values, eva.geometry.y.values)
x, y, z = local(gx, gy)
klass = {int(k["stop_no"]): k for k in json.load(open(os.path.join(GONOGO, "inputs", "eva_stop_classes.json")))}
for i, r in enumerate(eva.itertuples()):
    k = klass[int(r.stop_no)]
    ov["eva_stops"].append({"stop": int(r.stop_no), "sol": int(r.sol), "x": float(x[i]), "y": float(y[i]), "z": float(z[i]),
                            "sand": r.sand_pct, "bigrock": r.bigrock_pct, "soil": r.soil_pct, "bedrock": r.bedrock_pct,
                            "certainty": k["certainty"], "team_class": k["team_class"]})
ov["base"] = next(p for p in ov["pois"] if p["sol"] == 5073)

# ---------- POI layer for the 3D map: POIs closer than SITE_M share one numbered pin (display choice, not data)
SITE_M = 25.0
ov["poi_categories"] = {
    "rover_position": {"label": "Base: Curiosity's latest position", "color": "#ff9e3d"},
    "drill_site": {"label": "Drill site", "color": "#ff5fd2"},
    "science_target": {"label": "Science target", "color": "#b388ff"},
    "discovery": {"label": "Geologic contact / discovery", "color": "#4da3ff"},
}
sites = []
for p in sorted(ov["pois"], key=lambda q: (q["sol"], q["poi_id"])):
    s = next((s for s in sites if math.hypot(s["_x0"] - p["x"], s["_y0"] - p["y"]) <= SITE_M), None)
    if s is None:
        s = {"_x0": p["x"], "_y0": p["y"], "members": []}; sites.append(s)
    s["members"].append(p)
ov["poi_sites"] = []
for i, s in enumerate(sites, 1):
    m = s["members"]; cats = [q["category"] for q in m]
    cat = "rover_position" if "rover_position" in cats else max(dict.fromkeys(cats), key=cats.count)
    x, y = float(np.mean([q["x"] for q in m])), float(np.mean([q["y"] for q in m]))
    sols = sorted({q["sol"] for q in m})
    ov["poi_sites"].append({
        "site": i, "category": cat, "x": round(x, 2), "y": round(y, 2), "z": float(local([x + L], [y + B])[2][0]),
        "spread_m": round(max(math.hypot(q["x"] - x, q["y"] - y) for q in m), 1),
        "names": [re.sub(r",? sol \d+$", "", q["name"].split(" (")[0]) for q in m], "poi_ids": [q["poi_id"] for q in m],
        "sol_label": f"sol {sols[0]}" if len(sols) == 1 else f"sols {sols[0]}–{sols[-1]}"})
json.dump(ov, open(os.path.join(WEB, "overlays.json"), "w"), separators=(",", ":"))

json.dump({"terrain": "terrain/terrain.json", "overlays": "overlays.json", "gates": "data/live_gates.json",
           "rules": "data/gonogo_rules.json", "report": "data/combined_report.json", "class_codes": rules["class_codes"],
           "layers": layers}, open(os.path.join(WEB, "layers.json"), "w"), indent=1, default=str)
shutil.copy(os.path.join(GONOGO, "live_gates.json"), os.path.join(WEB, "data", "live_gates.json"))
shutil.copy(os.path.join(GONOGO, "gonogo_rules.json"), os.path.join(WEB, "data", "gonogo_rules.json"))
shutil.copy(os.path.join(GONOGO, "calibration", "combined_report.json"), os.path.join(WEB, "data", "combined_report.json"))
shutil.copy(os.path.join(GONOGO, "routes_lonlat.geojson"), os.path.join(WEB, "data", "routes_lonlat.geojson"))

# ---------- Plotly class grids (same 300 x 300 sample as plotly/terrain_300.json)
pt = json.load(open(os.path.join(WEB, "plotly", "terrain_300.json")))
cols = np.clip((np.array(pt["x_m"]) / CELL).astype(int), 0, W - 1)
rows = np.clip(((HM - np.array(pt["y_m"])) / CELL).astype(int), 0, H - 1)
out = {"note": "surfacecolor grids for plotly/terrain_300.json (row 0 = north). Values: 0 UNKNOWN, 1 GO, 2 CAUTION, 3 NO-GO.",
       "colorscale": [[0, "#9e9e9e"], [0.25, "#9e9e9e"], [0.25, "#1a9850"], [0.5, "#1a9850"], [0.5, "#f4c430"], [0.75, "#f4c430"],
                      [0.75, "#d73027"], [1, "#d73027"]], "cmin": -0.5, "cmax": 3.5}
for pid in ("foot", "rover"):
    out[f"combined_{pid}"] = read(os.path.join(GONOGO, f"combined_{pid}.tif"))[np.ix_(rows, cols)].tolist()
for name in ("slope_foot", "roughness", "terrain", "groundtruth"):
    out[f"conv_{name}"] = read(os.path.join(GONOGO, f"conv_{name}.tif"))[np.ix_(rows, cols)].tolist()
out["poi_sites"] = [{"site": s["site"], "x_m": s["x"], "y_m": s["y"], "z": s["z"], "category": s["category"],
                     "color": ov["poi_categories"][s["category"]]["color"], "names": s["names"], "sol_label": s["sol_label"]}
                    for s in ov["poi_sites"]]
json.dump(out, open(os.path.join(WEB, "plotly", "gonogo_300.json"), "w"), separators=(",", ":"))

# ---------- quick-look previews (combined over photo + routes + Curiosity path + POIs)
for pid in ("foot",):
    im = Image.open(os.path.join(TX, f"combined_over_photo_{pid}.jpg")).convert("RGB")
    s = 1400 / im.height; im = im.resize((int(im.width * s), 1400), Image.LANCZOS)
    dr = ImageDraw.Draw(im); k = im.width / WM
    to_px = lambda x, y: (x * k, (HM - y) * k)  # noqa: E731
    for seg in ov["curiosity_path"]:
        dr.line([to_px(p[0], p[1]) for p in seg], fill=(255, 255, 255), width=2)
    for r in ov["routes"]:
        if r["profile"] == pid:
            dr.line([to_px(p[0], p[1]) for p in r["xyz"]], fill=(0, 220, 255), width=4)
    try:
        font = ImageFont.truetype("arialbd.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    for s in ov["poi_sites"]:
        cx, cy = to_px(s["x"], s["y"]); col = ov["poi_categories"][s["category"]]["color"]
        dr.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], outline=(0, 0, 0), fill=col, width=2)
        dr.text((cx, cy), str(s["site"]), fill=(0, 0, 0), font=font, anchor="mm")
        lines = (["BASE: " + s["names"][0]] if s["category"] == "rover_position" else list(s["names"])) + [s["sol_label"]]
        crowded = any(o is not s and o["x"] > s["x"] and math.hypot(o["x"] - s["x"], o["y"] - s["y"]) < 150 for o in ov["poi_sites"])
        w = max(dr.textlength(t, font=font) for t in lines); right = cx + 15 + w < im.width - 6 and not crowded
        for j, t in enumerate(lines):
            dr.text((cx + 15 if right else cx - 15, cy + (j - (len(lines) - 1) / 2) * 18), t, font=font, anchor="lm" if right else "rm",
                    fill=(255, 255, 255) if j < len(lines) - 1 else (215, 215, 215), stroke_width=3, stroke_fill=(0, 0, 0))
    dr.rectangle([0, 0, im.width, 34], fill=(0, 0, 0))
    dr.text((8, 9), f"Combined GO/NO-GO ({pid}) | cyan = planned routes | white = Curiosity's path | numbered pins = Layer 5 POIs",
            fill=(255, 255, 255))
    im.save(os.path.join(MM, "docs", "img", f"preview_combined_{pid}.jpg"), quality=88)
print(len(layers), "layers;", {l["id"]: l["file"] for l in layers})
print("overlays:", len(ov["routes"]), "routes,", len(ov["curiosity_path"]), "path pieces,", len(ov["pois"]), "POIs,", len(ov["eva_stops"]), "EVA stops")
print("POI sites:", [(s["site"], s["category"], s["names"], s["sol_label"], s["spread_m"]) for s in ov["poi_sites"]])
