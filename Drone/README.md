# Drone: laser scout simulator

Between Curiosity's stops there are no photos, so the AI has nothing to read there. Our idea: a small drone flies ahead of the astronaut (called Amira in the simulator), hovers 5 m above the ground, and measures it with a laser rangefinder. It brings back a hazard map: clear, sand ripples, slope 15–25°, slope ≥ 25°, obstacles > 30 cm.

**Open `Drone_Simulator.html` in a browser.** No install, works on a PC or a phone. Pick a scenario, press Fly, and compare the drone's map with the true ground. `Drone_Simulator.html#auto=real` starts a flight on Curiosity's real route.

## How it works

- **Ranging:** the laser measures the time of flight of a pulse, r = c·t/2. The ground height under the drone is z = H − r·cos θ, using the drone's tilt θ (tilt correction).
- **Flight:** Mars gravity 3.71 m/s², drag, tilt limit 20°, wind with gusts that the drone's motion sensors do not see.
- **Navigation:** motion sensors plus a camera that needs ground texture to work. Over smooth sand the camera fails, which is what crashed Ingenuity on flight 72. Our fixes: lidar shape-matching (the ground profile itself gives the speed), a stop rule, and a landing gate that waits until the drone has stopped drifting.
- **Loop closure:** when the drone flies back over the astronaut, the known take-off point corrects its position and height.
- **Real terrain:** 18 flights along Curiosity's real 1.2 km route (sols 4534–4805), taking off at rover stops, over the USGS MSL Gale 1 m DEM from [`Map_layer/Layer2_Elevation`](../Map_layer/Layer2_Elevation/). The drone holds 5 m above the orbital DEM and picks the flattest spot near home to land (the idea behind Ingenuity's flight 34 update).
- **Sand detector (ML):** obstacles and slopes use fixed rules. Sand vs clear is decided by a gradient-boosting model (scikit-learn, 300 trees) trained on 16 features of the measured height profile. It is split by route segment so that test segments are never seen in training, and its trees are exported to JSON and run in the web page.

## Results (verification loop, 40 seeds, all checks pass)

| Claim | Result |
|---|---|
| Laser map height error | 4.9 cm (synthetic ground), 4.4 cm (real route) |
| Safe landings on the real route | 223 / 234 (95 %) |
| Hazard IoU on the real route | obstacle 0.71, slope 15–25° 0.81, slope ≥ 25° 0.64 |
| Tilt correction | map error 23 cm without it, 5 cm with it |
| Flight 72 replay vs our fixes | crashes 45 % → 7.5 %; position error 6.07 m → 0.51 m |
| ML sand detector vs hand rule | false sand alarms 1,368 → 337 bins (−75 %) on unseen segments; sand IoU 0.24 → 0.52 (cross-validation), 0.08 → 0.29 (held-out segments) |

Full table of the last run: [`sim/results/verify_latest.md`](sim/results/verify_latest.md). ML comparison (logistic regression, random forest, gradient boosting): [`sim/results/ml_results.json`](sim/results/ml_results.json).

## Hazard layer for the map

`sim/out/drone_hazards.geojson` is the drone's map along the whole route as GeoJSON (lon/lat, same frame as the MMGIS waypoints): 286 features, one line per stretch of the same hazard class plus a point per obstacle. `sim/out/layer_entry.json` is the matching entry for the web map's `layers.json` (id, url, bounds, colours, legend). `sim/out/drone_hazards_preview.png` shows it on the DEM hillshade with Curiosity's stops.

## Honest limits

- **Simulation.** No drone flew. On the real route the ground shape is real (USGS DEM); rocks and sand ripples are **synthetic**, because a 1 m DEM cannot see them. The sand detector learned our ripple model on real ground: it shows the method, not a measurement of Martian sand.
- Sand IoU on rough real ground stays modest (0.3 to 0.5). Three of the five held-out segments have no sand at all, so any alarm there lowers the test IoU. The held-out segments were fixed before training and not changed afterwards.
- The 11 crashes on the real route are touch-downs on 16–22° ground (limit 15°).
- All thresholds are team assumptions: see [`ASSUMPTIONS.md`](../ASSUMPTIONS.md).

## Rebuild (in order)

Python 3 with numpy, scipy, pillow, pandas, scikit-learn; Node.js.

```bash
python -I sim/scripts/01c_load_usgs.py       # DEM of the box from Map_layer/Layer2_Elevation
python -I sim/scripts/02_route_flights.py    # 18 route flights + augmented variants (synthetic rocks and sand)
node      sim/scripts/export_bins.js         # ML training rows (one per 20 cm map bin)
python -I sim/scripts/03_ml_hazard.py        # train and test, write sim/data/sand_model.json
python -I sim/scripts/04_embed.py            # put route + model into Drone_Simulator.html
node      sim/scripts/05_hazard_layer.js     # GeoJSON hazard layer
python -I sim/scripts/05b_preview_layer.py   # preview PNG
node      sim/scripts/verify.js --seeds 40   # must end with every check PASS (exit code 0)
```

`verify.js` loads the simulation core straight out of `Drone_Simulator.html`, so it tests exactly what the page runs. Re-run it after any change before quoting a number.

| Folder | Contents |
|---|---|
| `sim/scripts/` | the pipeline above |
| `sim/data/` | `route_waypoints.json` (65 Curiosity stops in the box, from MMGIS), `route_flights.json`, `sand_model.json`, `usgs_box.json` (grid georeference) |
| `sim/out/` | hazard layer, `layers.json` entry, preview |
| `sim/results/` | last verification run, ML comparison |

Sources (Ingenuity flights 9, 34 and 72, the laser altimeter, the USGS DEM, scikit-learn): [`REFERENCES.md`](../REFERENCES.md#scout-drone-drone).
