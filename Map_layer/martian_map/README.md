# Martian Map: Mount Sharp boxwork (clean workspace)

**NASA Space Apps 2026: Interplanetary Survival Guide, Martian Map.**
- **Site:** Mount Sharp boxwork, Gale crater.
- **Box:** 137.36–137.40°E, 4.83–4.78°S (planetocentric, east-positive, Mars 2000 sphere).
- **Built:** 15 Nov 2026, from the five team-approved layers.

Every number in this workspace either comes from a NASA, USGS or published source, or is labelled **ASSUMPTION** ([docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)).

## Open it
| What | How |
|---|---|
| **QGIS: everything** | Open [qgis/martian_map.qgz](qgis/martian_map.qgz). It opens on the box and uses relative paths, so the folder can be moved. |
| **3D web viewer** | From this folder run `.venv/Scripts/python.exe -m http.server 8765 --directory web`, then open http://localhost:8765/viewer3d/ |
| **Quick look** | [docs/img/preview_combined_foot.jpg](docs/img/preview_combined_foot.jpg), [docs/img/qgis_master_preview.png](docs/img/qgis_master_preview.png) |

## The four parts of the brief
| Part | Result | Files |
|---|---|---|
| 1. Clean workspace | All five approved layers, with their source data, styles, build scripts and history. Every copy is logged with size and MD5. | `layers/`, `pipeline/`, `docs/FILE_MAP.json` |
| 2a. 3D map | Heightmaps (2 m and 4 m) plus photo and hillshade textures, for three.js and Plotly | `web/terrain/`, `web/plotly/terrain_300.json` |
| 2b. GO/NO-GO conversion layers | One 4-colour layer per input (slope, roughness, terrain units, ground truth) plus certainty. Each is labelled with its parameter. Radiation and weather are **live-sensor gates**, not maps. | `gonogo/conv_*.tif`, `gonogo/live_gates.json` |
| 3. Combined GO/NO-GO map | Worst-of rule, calibrated on Curiosity's real path, plus least-cost routes between the POIs and a reach map from the base | `gonogo/combined_*.tif`, `gonogo/routes.gpkg`, `gonogo/calibration/combined_report.json` |
| 4. 3D colored map | The combined map draped on the 3D terrain (switchable in the viewer) | `web/textures/combined_over_photo_*.jpg`, `web/viewer3d/index.html` |

## Which layer feeds what
| Layer | 3D | GO/NO-GO | Why |
|---|---|---|---|
| L1 Base map (USGS 25 cm orthophoto) | texture | no | A photo has no hazard value of its own. |
| L2 Elevation (USGS 1 m DEM) | shape + hillshade | slope, roughness | Shape is the main hazard. |
| L3 Geology (approved units) | (draped as a layer) | terrain units | Sand and hollow fill are soft ground. |
| L4 Rover trajectory (NASA MMGIS) | line | ground truth + certainty | Where Curiosity drove is proven ground. |
| L5 POIs + EVA stops | markers | ground truth (EVA stops, in the team AI's colours) | POIs are destinations, not hazards. |
| Radiation, weather | (none) | live gate for the whole map | Both change by the hour and are uniform across a 2.4 × 3 km box. |

Colours: **green GO**, **yellow CAUTION** (passable with precautions), **red NO-GO** (hard limit), **grey UNKNOWN** (no data; send the scout). Full rules: [docs/GONOGO_RULES.md](docs/GONOGO_RULES.md).

## Results (crew on foot; rover profile in brackets)
- **Box:** 55.7% GO, 27.3% CAUTION, 16.6% NO-GO (9.9%), 0.5% UNKNOWN.
- **Strictness check:** on the orbital data alone, Curiosity's own path in the box is **1.0% NO-GO** (0.5%). The target was ≤ 5%, so the slope and roughness limits are not too strict.
- **On the final map,** 0.7% of the path is NO-GO. All of it is the 15 m keep-out around the one red EVA stop: stop 13, sol 4580, big rock 9.1%. The team rule says that zone is never crossed.
- **EVA stops (team colours):** 49 green, 5 orange, 1 red. The terrain fractions alone give 50/4/1. The team's certainty rule (< 0.75) turns one more stop orange: stop 29, sol 4625, certainty 0.734.
- **Connectivity:** 98% of passable ground is one connected network. 82% (89%) of the box is reachable from the base, which is Curiosity's position on sol 5073.
- **Routes**, following the POIs in the order Curiosity visited them and using the app's "Safest" weights:

| Leg | Route | Straight line | Curiosity's waypoint chain | GO share | Within 10 m of Curiosity's path |
|---|---|---|---|---|---|
| sol 4534 → 4564 | 271 m | 216 m | 237 m | 98.7% | 65% |
| sol 4564 → 4693 | 564 m | 496 m | 919 m | 90.5% | 39% |
| sol 4693 → 4718 | 10 m | 10 m | 12 m | 0% (all CAUTION, in an orange stop zone) | 100% |
| sol 4718 → 5050 | 1195 m | 1062 m | 1817 m | 98.2% | 80% |
| sol 5050 → 5073 | 149 m | 110 m | 139 m | 100% | 100% |

No leg crosses NO-GO. Details: [gonogo/calibration/combined_report.json](gonogo/calibration/combined_report.json).

## Agreement with the team repo
The EVA-stop colours, the 30 m AI radius, the 15 m red keep-out, the route weights and the 30 min O2 reserve are the values in the repo's `ASSUMPTIONS.md`. The slope limits of 15° and 25° are the same as Layer 2. Where this map uses its own number, [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) says so and explains why.

## Not in git
The **Layer 1 base map** (`layers/L1_basemap/usgs_msl_gale_ortho_25cm_box.tif`, 113 MB) is over GitHub's 100 MB file limit.
- **Get it:** run `.venv/Scripts/python.exe -I -X utf8 pipeline/10_fetch_basemap.py`. It takes about 16 minutes and reads 2.28 GB by HTTP range requests from the USGS file.
- **Check it:** the script checks the pixel MD5 `7c2da177f95bd2ebcbd1d0bc80672978` (image values only). The approved file's MD5 is `d04ddd301f6333ef1bc726ee9b3c3582`; it matches only with the same library versions.
- **Meanwhile:** the QGIS project opens without it; only that one layer shows as missing. The 3D viewer does not need it, because its photo texture is already in `web/terrain/`.

## From a git clone
1. **Python:** run `uv venv --python 3.12 .venv`, then `uv pip install -r requirements.lock.txt --python .venv/Scripts/python.exe`. See [docs/TOOLS.md](docs/TOOLS.md).
2. **Base map:** run `.venv/Scripts/python.exe -I -X utf8 pipeline/10_fetch_basemap.py`.
3. **Open or rebuild:** open the QGIS project, or re-run steps 30 to 70 ([pipeline/README.md](pipeline/README.md)).

Step 70 normally copies the geology style and CRS from the team's main QGIS project, which is not in this repo. In a clone it uses the saved copies instead: `layers/L3_geology/styles/*.qml` and `qgis/project_crs.wkt`. Steps 40–60 were re-run from a clean copy and gave byte-identical outputs.

## Folder map
```
martian_map/
  README.md            this file
  qgis/martian_map.qgz master QGIS project (L1-L5 + GO/NO-GO + routes); project_crs.wkt = saved project CRS
  layers/L1..L5/       approved layers, each with README.md, sources/, styles/
  gonogo/              conversion layers, combined maps, routes, reach, certainty, rules, calibration
  web/                 terrain package, textures, overlays, layers.json manifest, viewer3d/, plotly/
  pipeline/            numbered scripts (run order in pipeline/README.md) + build_history/ (scripts as originally run)
  docs/                METHODS, SOURCES, ASSUMPTIONS, GONOGO_RULES, TOOLS, FILE_MAP.json, history/, research/, img/
  .venv/               Python 3.12 (uv), pinned in requirements.lock.txt
```

## Rules this workspace follows
- No invented facts. Each source is listed in [docs/SOURCES.md](docs/SOURCES.md) and inside the files themselves (GeoTIFF tags, `gonogo_rules.json`, `layers.json`).
- Originals were **copied**, never moved. In the original workspace, the team's main project (`../qgis/mount_sharp_geology.qgz`, not in git) was only read: the master script checks its MD5 before and after.
- `docs/FILE_MAP.json` and some logs keep the original local paths as a record of where each file came from.
