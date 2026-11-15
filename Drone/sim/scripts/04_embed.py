"""Embed the real-route flights and the ML sand model into Drone_Simulator.html (idempotent).

Re-run after 02_route_flights.py or 03_ml_hazard.py so the web page uses the latest data.
The blocks are <script type="application/json" id="route-data"> and id="sand-model"; old copies are replaced.
"""
import json, re
from pathlib import Path

P = Path(__file__).resolve().parents[2]
page = P / "Drone_Simulator.html"
s = page.read_text(encoding="utf-8")

route = json.load(open(P / "sim/data/route_flights.json"))
slim = {"source": route["source"], "route_length_m": route["route_length_m"],
        "flights": [{k: f[k] for k in ("id", "route_m", "scout", "near_sol", "relief_m", "max_slope_deg", "terrain")} for f in route["flights"]]}
model = json.load(open(P / "sim/data/sand_model.json"))

def block(id_, obj):
    txt = json.dumps(obj, separators=(",", ":")).replace("</", "<\\/")
    return f'<script type="application/json" id="{id_}">{txt}</script>'

for id_, obj in (("route-data", slim), ("sand-model", model)):
    pat = re.compile(r'<script type="application/json" id="%s">.*?</script>' % id_, re.S)
    new = block(id_, obj)
    if pat.search(s):
        s = pat.sub(lambda m: new, s)
    else:
        s = s.replace('<script id="sim-core">', new + "\n" + '<script id="sim-core">', 1)
page.write_text(s, encoding="utf-8")
print(f"embedded {len(slim['flights'])} flights and {len(model['trees'])} trees; page now {page.stat().st_size / 1024:.0f} kB")
