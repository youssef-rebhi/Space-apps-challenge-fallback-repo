# Pipeline (run order)

Run everything from `martian_map/`. Two Python environments are used:
- `PY` = `.venv/Scripts/python.exe -I -X utf8`. This is Python 3.12 with the packages pinned in `../requirements.lock.txt`.
- `QPY` = `"C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" -P`, QGIS's own Python.

| Step | Command | Reads | Writes | Time |
|---|---|---|---|---|
| 00 | `PY pipeline/00_assemble_workspace.py [scratch dir]`, run from the project root (original workspace only; a git clone already has its output) | approved originals | `layers/`, `pipeline/build_history/`, `docs/history/`, `docs/FILE_MAP.json` | ~1 min (374 MB copy) |
| 10 | `PY pipeline/10_fetch_basemap.py` (only needed after a git clone; the base map is not in git) | the USGS 25 cm mosaic on S3 | `layers/L1_basemap/usgs_msl_gale_ortho_25cm_box.tif`, `fetch_log_refetch.json` | ~16 min (2.28 GB read) |
| 30 | `PY pipeline/30_terrain_package.py` | L1, L2 | `web/terrain/`, `web/plotly/terrain_300.json` | seconds |
| 40 | `PY pipeline/40_gonogo_layers.py` | L2, L3, L4, L5, `sources_gonogo.json`, `live_gates_rules.json` | `gonogo/conv_*.tif`, `certainty.tif`, `gonogo_rules.json`, `live_gates.json`, `inputs/` | seconds |
| 50 | `PY pipeline/50_combined_routes.py` | `gonogo/` | `combined_*.tif`, `routes.gpkg`, `routes_lonlat.geojson`, `reach_from_base_*.tif`, `calibration/combined_report.json` | seconds |
| 60 | `PY pipeline/60_web_export.py` | everything above | `web/textures/`, `web/layers.json`, `web/overlays.json`, `web/data/`, `web/plotly/gonogo_300.json`, `docs/img/preview_combined_foot.jpg` | seconds |
| 12 | `PY pipeline/12_fetch_color_ref.py` (only needed after a git clone; the file is not in git) | NASA PIA26693 | `walk/sources/PIA26693.png` (179 MB, MD5 checked), `fetch_log.json` | ~1 min |
| 80 | `PY pipeline/80_walk_export.py` (uses `walk_color.py`) | L1, L2, regional DEM, `combined_foot.tif`, `overlays.json`, PIA26693 | `web/walk/`: `walk.json`, `height_1m.u16`, `color_1m.jpg`, `tiles/`, `walk_mask.png`, `sand_2m.png`, `far_400m.f32` | ~10 s |
| 81 | `"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b --factory-startup -noaudio -P pipeline/81_blender_detail.py` | nothing (procedural, seed 4671) | `web/walk/rocks.glb`, `detail_normal.png`, `detail_ao.png`, `detail.json` | ~5 s |
| 70 | `QPY pipeline/70_qgis_master.py` | everything above + the main project (read-only; in a git clone, the saved styles and `qgis/project_crs.wkt`) | `qgis/martian_map.qgz`, `layers/L3_geology/styles/*.qml`, `docs/img/qgis_master_preview.png` | ~1 min |

**Helpers:**
- `paths.py`: every path and CRS.
- `common.py`: the 3 m grid, the rover path, raster writing.
- `qgz_view.py`: the saved view for projects written headless.

**To change a threshold:** edit it in `40_gonogo_layers.py` (or `live_gates_rules.json` for the live gates), then re-run steps 40, 50, 60 and 70. List the change in `docs/ASSUMPTIONS.md`.

**`build_history/`** holds the scripts exactly as they were run to make Layers 1–5 (13–15 Nov). They point at the original folders and are kept for provenance. The products they made are already in `layers/`.
