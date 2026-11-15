# Marsouine · Martian Map (team y3m)

NASA Space Apps Challenge 2026, challenge **"Interplanetary Survival Guide: Martian Map"**.

Marsouine is a map for an astronaut walking on Mars. It tells them, stop by stop, whether the ground ahead is firm, sandy or too steep, and how sure we are. The study site is the **boxwork region of Mount Sharp, Gale crater** (box 137.36–137.40°E, 4.78–4.83°S), along the route Curiosity drove between sols 4534 and 4805.

The map combines three readings of the same ground:

| Layer | Question it answers | Folder |
|---|---|---|
| AI terrain reading | What is the ground made of (soil, bedrock, sand, big rock)? From Curiosity's own Navcam photos. | [`Ai_model/`](Ai_model/) |
| Elevation and slope | How steep is it? 1 m elevation model in the rover's own frame. | [`Map_layer/`](Map_layer/) |
| GIS map, GO/NO-GO and 3D | Where can we walk? All five map layers in QGIS, one GO/NO-GO layer per input, a combined GO/NO-GO map with routes, and a 3D viewer with the points of interest as numbered pins. | [`Map_layer/martian_map/`](Map_layer/martian_map/) |
| Scout drone (simulated) | What lies between the stops, where no photo exists? A laser-ranging drone flies ahead. | [`Drone/`](Drone/) |

The [`Application/`](Application/) folder is the tablet and helmet app that puts these together for the astronaut.

## Key results

| Part | Result | Details |
|---|---|---|
| AI terrain reading | sand IoU 0.966, mean IoU 0.821 on the AI4Mars expert test set; 55 boxwork stops read (50 green, 4 orange, 1 red) | [`Ai_model/AI_WRITEUP.md`](Ai_model/AI_WRITEUP.md) |
| Elevation layer | rover heights match the USGS Gale DEM to 0.08 m at 183 waypoints; slope classes GO < 15°, caution 15–25°, NO-GO ≥ 25° | [`Map_layer/Layer2_Elevation/METADATA.md`](Map_layer/Layer2_Elevation/METADATA.md) |
| Scout drone | laser map height error 4.4 cm on the real route, 95 % safe landings (40-seed verification loop) | [`Drone/README.md`](Drone/README.md) |
| GO/NO-GO map | box (crew on foot): 55.7 % GO, 27.3 % caution, 16.6 % NO-GO; Curiosity's own path is only 1.0 % NO-GO on the orbital data, so the limits are not too strict; 98 % of passable ground is connected; 5 routes between the boxwork stops, none crosses NO-GO | [`Map_layer/martian_map/README.md`](Map_layer/martian_map/README.md) |

## Run it

**App (tablet + helmet):** see [`Application/README.md`](Application/README.md). Quick start with the pre-built copy:
```bash
cd Application/marsouine-app-built
python server.py        # then open http://localhost:8000 (or http://<this-PC-IP>:8000 on a phone)
```

**Drone simulator:** open `Drone/Drone_Simulator.html` in a browser. No install needed.

**Elevation layer:** open `Map_layer/Layer2_Elevation/qgis/layer2_elevation_POSSIBLE.qgz` in QGIS, or use the web exports in `Map_layer/Layer2_Elevation/exports/`.

**GIS map and GO/NO-GO:** open `Map_layer/martian_map/qgis/martian_map.qgz` in QGIS. For the 3D viewer, run `python -m http.server 8765 --directory Map_layer/martian_map/web` and open http://localhost:8765/viewer3d/. The 25 cm base map is not in git (113 MB); `Map_layer/martian_map/pipeline/10_fetch_basemap.py` fetches it from USGS.

**AI model:** `Ai_model/nasa_training.ipynb` (Google Colab, GPU).

## Repository layout

```
Ai_model/                    terrain segmentation notebook, metrics, per-stop results
Map_layer/Layer2_Elevation/  elevation, slope, contours, exports for the web map, scripts
Map_layer/martian_map/       all five map layers, GO/NO-GO layers and combined map, routes, 3D viewer, pipeline
Application/
  fg-app/                    React source of the tablet + helmet app
  marsouine-app-built/      built app, ready to serve
  data/                      stops.json + AI overlays (copied into the app)
Drone/                       scout drone simulator, its pipeline and the GeoJSON hazard layer
ASSUMPTIONS.md               every threshold the team chose (not NASA rules)
REFERENCES.md                all data sources and papers
```

## Honest limits

- The thresholds (sand %, slope degrees, oxygen reserve, walking speed) are **team assumptions**, listed in [`ASSUMPTIONS.md`](ASSUMPTIONS.md). They are not NASA safety rules.
- The AI was trained on rover images. Ground that is safe for rover wheels is a guide, not proof, for boots.
- The scout drone, its "laser and microphone" readings, and the helmet walk are **simulations**. On the drone's route the ground shape is real (USGS DEM); the rocks and sand ripples are synthetic.
- Absolute heights carry about ±15 m uncertainty between elevation products; slopes and relative heights are not affected.

## Data and references

All datasets, papers and web sources are listed in [`REFERENCES.md`](REFERENCES.md). Images from Curiosity and Perseverance are credited to NASA/JPL-Caltech. No NASA logos are used.

## Use of AI

- The terrain model is our own (DeepLabV3+), trained by us on AI4Mars.
- Claude (Anthropic) helped with code (Colab notebook, React app, drone simulator), with checking results, and with drafting text. Every number in this repository comes from our own runs.
