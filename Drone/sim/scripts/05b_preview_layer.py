"""Visual check of sim/out/drone_hazards.geojson on the USGS DEM hillshade (zoomed to the route)."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
P = Path(__file__).resolve().parents[2]; D = P / "sim/data"
g = json.load(open(D / "usgs_box.json")); a = np.load(D / "usgs_box.npy"); H, W = a.shape
im = Image.open(D / "usgs_box_hillshade.png").convert("RGB")
px = lambda lon, lat: ((lon - g["west"]) / (g["east"] - g["west"]) * W, (g["north"] - lat) / (g["north"] - g["south"]) * H)
fc = json.load(open(P / "sim/out/drone_hazards.geojson"))
col = {"clear": (62, 207, 142), "sand": (255, 176, 32), "slope_caution": (181, 124, 255), "slope_nogo": (106, 31, 209), "obstacle": (255, 90, 90), "obstacle_point": (255, 40, 40)}
dr = ImageDraw.Draw(im); xs, ys = [], []
for f in fc["features"]:
    c = col[f["properties"]["hazard"]]
    if f["geometry"]["type"] == "LineString":
        pts = [px(*p) for p in f["geometry"]["coordinates"]]; dr.line(pts, fill=c, width=7)
        xs += [p[0] for p in pts]; ys += [p[1] for p in pts]
for f in fc["features"]:
    if f["geometry"]["type"] == "Point":
        x, y = px(*f["geometry"]["coordinates"]); dr.ellipse((x - 6, y - 6, x + 6, y + 6), fill=col["obstacle_point"], outline=(0, 0, 0))
stops = json.load(open(D / "route_waypoints.json"))["waypoints"]
for s in stops:
    x, y = px(s["lon"], s["lat"]); dr.ellipse((x - 4, y - 4, x + 4, y + 4), outline=(0, 230, 255), width=2)
m = 60; box = (int(min(xs)) - m, int(min(ys)) - m, int(max(xs)) + m, int(max(ys)) + m)
crop = im.crop(box); crop = crop.resize((crop.width * 900 // max(crop.size), crop.height * 900 // max(crop.size)))
crop.save(P / "sim/out/drone_hazards_preview.png"); print("preview", crop.size)
