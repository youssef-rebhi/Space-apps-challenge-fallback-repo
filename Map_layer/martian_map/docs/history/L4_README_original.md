# Layer 4: Curiosity rover trajectory (rover data only)

**Open:** `qgis/layer4_rover.qgz`. It opens on the study box. It holds no geology layers: just the rover path, the study box outline and the Layer 1 base map underneath.

## Sources (all NASA)
| Layer in `derived/layer4_rover.gpkg` | Source | Content |
|---|---|---|
| `position_current` | NASA/JPL MMGIS `MSL_waypoints_current.json` (https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/), downloaded 14 Nov 2026 to `../../data/raw/geology/rover/` | Last reported position: sol 5073, site 125, drive 2490 |
| `waypoints_mmgis` | NASA/JPL MMGIS `MSL_waypoints.json` | 1,389 end-of-drive positions for the whole mission (sol, site, drive, `elev_geoid`, roll/pitch/yaw). 183 are in the box, sols 4384–5073. `in_box` = 1/0 |
| `traverse_mmgis` | NASA/JPL MMGIS `MSL_traverse.json` | 1,317 drive lines, whole mission. Their `Length` field sums to 38.29 km |
| `drive_path_places` | NASA PDS MSL PLACES `localized_interp.csv` (https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/data_localizations/, bundle dated 2026-08-01), copied in `../../trials/nasa_data_v2/inputs/` | One line through all 49,194 **ROVER-frame** positions, sols 0–4868. Great-circle length 36.94 km; 5,018 of the points are in the box. The 121 `SITE` rows are site origins, not rover positions, so they are left out. The nasa_data pipeline included them, which added about 1 km of false path |

CRS for every layer: lon/lat, planetocentric, east-positive, Mars 2000 sphere (R = 3,396,190 m). These are the USGS Gale-frame positions; METADATA.md §D explains the frame decision.

## Checks (from `scripts/40_build_rover_layer.py`)
- At the 2,595 site/drive pairs found in both sources, PLACES and MMGIS positions differ by a median of **0.00 m** (max 2.10 m), so the two sources agree.
- PLACES **ends at sol 4868**, while MMGIS runs to **sol 5073**. Use MMGIS as the main path, and PLACES only when the denser drive shape matters. In the project PLACES is drawn as a dashed orange line, unticked by default.

## Styling in the project
- **Waypoints:** coloured by sol in 100-sol bins over the time spent in the box (4384–5073). Earlier sols are grey. Sol labels appear only when zoomed in past 1:2,500.
- **Traverse:** yellow line.
- **Current position:** yellow star.
- **No geology markers.** The sol 4534 contact and the boxwork campaign highlights stay in the Layer 3 project.

## Re-run (from this folder)
1. `"C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" -P scripts/40_build_rover_layer.py`
2. `"C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" -P scripts/41_qgis_project.py`. This needs Layer 1 (`../layer1_basemap/raw/…`) and writes `qgis/layer4_rover.qgz` and `docs/preview_box.png`.

The saved view is added by `../scripts/qgz_view.py`, because projects written by headless PyQGIS have none.

## Limits
- MMGIS waypoints are end-of-drive positions, not every point driven.
- Elevations (`elev_geoid`) come from the USGS Gale DEM. MOLA laser shots suggest true areoid heights are about 15 m higher (METADATA.md §D).
