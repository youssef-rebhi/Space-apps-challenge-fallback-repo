"""Real terrain for the drone simulator.

Cuts Curiosity's route through our box (65 MMGIS waypoints, sols 4534-4805) into scouting flights.
Each flight takes off at a rover stop on the route (where the astronaut stands), scouts up to 100 m ahead along the
route and comes back. The ground height under the drone comes from the USGS MSL Gale 1 m DEM in the
rover's frame (sim/data/usgs_box.*, made by 01c_load_usgs.py from Layer 2).

The DEM cannot see things smaller than ~1-3 m, so two SYNTHETIC layers are added on top and are
labelled as such in the output (team assumptions, listed in ASSUMPTIONS.md):
  - rocks: random, about 1 per 12 m of route, 0.15 to 0.7 m high
  - sand ripples (2.5 m wavelength, 6 cm amplitude) in the real DEM hollows: stretches >= 4 m long that sit
    >= 10 cm below the 20 m running median and slope < 8 deg (sand collects in lows)

Output: sim/data/route_flights.json
"""
import json, math
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates, median_filter

P = Path(__file__).resolve().parents[2]
D = P / "sim" / "data"
g = json.load(open(D / "usgs_box.json"))
dtm = np.load(D / "usgs_box.npy")
H, W = dtm.shape
PIX = g["pixel_m"]
SCOUT, STEP, DX = 100.0, 90.0, 0.1

stops = sorted(json.load(open(D / "route_waypoints.json"))["waypoints"], key=lambda s: s["sol"])
def to_px(lon, lat):
    return ((lon - g["west"]) / (g["east"] - g["west"]) * W - 0.5, (g["north"] - lat) / (g["north"] - g["south"]) * H - 0.5)
def to_lonlat(c, r):
    return (g["west"] + (c + 0.5) / W * (g["east"] - g["west"]), g["north"] - (r + 0.5) / H * (g["north"] - g["south"]))

pts = [to_px(s["lon"], s["lat"]) for s in stops]
sols = [s["sol"] for s in stops]
keep = [0] + [i for i in range(1, len(pts)) if math.dist(pts[i], pts[keep[-1] if False else i - 1]) > 0.5]
pts = np.array([pts[i] for i in keep]); sols = [sols[i] for i in keep]
seg = np.hypot(*np.diff(pts, axis=0).T) * PIX
S = np.concatenate([[0], np.cumsum(seg)])           # metres along the route at each waypoint
L = S[-1]

def along(s):
    """pixel (col,row) at route distance s; beyond the ends, continue straight along the end segment"""
    s = np.asarray(s, float)
    i = np.clip(np.searchsorted(S, s) - 1, 0, len(S) - 2)
    t = (s - S[i]) / np.maximum(S[i + 1] - S[i], 1e-9)
    return pts[i] + (pts[i + 1] - pts[i]) * t[:, None]

def sample(s):
    c = along(s)
    return map_coordinates(dtm, [c[:, 1], c[:, 0]], order=1, mode="nearest"), c

# Flights take off at real rover stops (where Curiosity parked and the astronaut would stand), about every STEP m.
# (Version 1 started every 80 m wherever that fell; on the rover-frame DEM some of those points are 15-21 deg slopes.)
STARTS = [0.0]                                   # greedy: next take-off = farthest stop within STEP m of the last one
while L - STARTS[-1] > SCOUT:
    nxt = S[(S > STARTS[-1] + 1) & (S <= STARTS[-1] + STEP)]
    STARTS.append(float(nxt.max()) if len(nxt) else float(S[S > STARTS[-1] + 1].min()))
STARTS = [float(v) for v in STARTS]
gaps = np.diff(STARTS + [L])
assert gaps.max() <= SCOUT, f"gap between take-off stops {gaps.max():.0f} m > scout {SCOUT} m"

def build_flights(rng, amp=0.06, lam=2.5, thr=0.10, tag=""):
    flights = []
    for k, s0 in enumerate(STARTS):
        scout = float(min(SCOUT, L - s0 - 5))
        x = np.arange(-10, scout + 15 + 1e-9, DX)
        z, c = sample(s0 + x)
        if np.isnan(z).any():
            print("skip flight", k, "no-data on path"); continue
        z = z - z[np.argmin(np.abs(x))]                    # take-off point = 0
        # sand in real hollows
        win = int(20 / DX) | 1
        det = z - median_filter(z, size=win, mode="nearest")
        slope = np.degrees(np.arctan(np.abs(np.gradient(z, DX))))
        low = (det < -thr) & (slope < 8)
        sand, i = [], 0
        while i < len(x):
            if low[i]:
                j = i
                while j < len(x) and low[j]: j += 1
                if x[j - 1] - x[i] >= 4 and x[i] > 2: sand.append([round(float(x[i]), 2), round(float(x[j - 1]), 2)])
                i = j
            else: i += 1
        # rocks (synthetic, Poisson)
        nr = rng.poisson((scout + 10) / 12)
        rocks = [{"x": round(float(rx), 2), "h": round(float(h), 2), "w": round(float(w), 2)}
                 for rx, h, w in zip(rng.uniform(3, scout + 5, nr), np.clip(rng.gamma(2.2, 0.14, nr), 0.15, 0.7), rng.uniform(0.5, 1.2, nr))
                 if not any(a - 1 < rx < b + 1 for a, b in sand)]
        xs_geo = np.arange(0, scout + 1e-9, 1.0)
        cg = along(s0 + xs_geo)
        lonlat = [[round(lo, 7), round(la, 7)] for lo, la in (to_lonlat(cc, rr) for cc, rr in cg)]
        near = int(np.argmin(np.abs(S - s0)))
        flights.append({
            "id": f"F{k:02d}{tag}", "group": f"F{k:02d}", "route_m": round(float(s0), 1), "scout": round(scout, 1), "near_sol": sols[near],
            "relief_m": round(float(z.max() - z.min()), 2), "max_slope_deg": round(float(slope.max()), 1),
            "terrain": {"x0": -10.0, "dx": DX, "z": [round(float(v), 3) for v in z], "sand": sand, "rocks": rocks,
                        "rippleAmp": round(amp, 3), "rippleLambda": round(lam, 2),
                        "synthetic": "rocks and ripples are synthetic; base height is the USGS MSL Gale 1 m DEM (rover frame)"},
            "geo": {"x0": 0, "dx": 1.0, "lonlat": lonlat},
        })
    return flights

flights = build_flights(np.random.default_rng(2026))

# augmented variants for machine learning: same real ground, different small-scale detail
aug, arng = [], np.random.default_rng(7)
for v in range(4):
    aug += build_flights(np.random.default_rng(100 + v), amp=float(arng.uniform(0.04, 0.10)), lam=float(arng.uniform(2.0, 3.5)),
                         thr=float(arng.uniform(0.06, 0.14)), tag=f"v{v}")
for f in aug: f.pop("geo")
json.dump({"source": g["source"], "flights": aug}, open(D / "route_flights_aug.json", "w"), separators=(",", ":"))
print("augmented variants:", len(aug), "flights")

out = {"source": g["source"], "route_length_m": round(float(L), 1), "flight_spacing_m": STEP, "flights": flights}
json.dump(out, open(D / "route_flights.json", "w"), separators=(",", ":"))
print(f"route {L:.0f} m -> {len(flights)} flights")
for f in flights:
    print(f"  {f['id']} at {f['route_m']:6.1f} m (sol {f['near_sol']}): scout {f['scout']:5.1f} m, relief {f['relief_m']:5.2f} m, "
          f"max slope {f['max_slope_deg']:4.1f} deg, sand {len(f['terrain']['sand'])} patches "
          f"({sum(b - a for a, b in f['terrain']['sand']):.0f} m), rocks {len(f['terrain']['rocks'])}")
print("file size kB", round((D / "route_flights.json").stat().st_size / 1024))
