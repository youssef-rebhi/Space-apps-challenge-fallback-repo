# Layer 4: Curiosity rover trajectory (approved, rover data only)

**Product:** `layer4_rover.gpkg`. All layers are in lon/lat, planetocentric, east-positive, on the Mars 2000 sphere. These are the USGS Gale-frame positions.

| Layer | Source | Content |
|---|---|---|
| `position_current` | NASA/JPL MMGIS `MSL_waypoints_current.json` | sol 5073, site 125, drive 2490: the **base** for routes and reach |
| `waypoints_mmgis` | NASA/JPL MMGIS `MSL_waypoints.json` | 1,389 end-of-drive positions with roll, pitch and tilt. 183 are in the box (sols 4384–5073; `in_box` = 1). |
| `traverse_mmgis` | NASA/JPL MMGIS `MSL_traverse.json` | 1,317 drive lines, 38.29 km in total. About 5.26 km is inside the box. |
| `drive_path_places` | NASA PDS MSL PLACES `localized_interp.csv` (ROVER rows only) | 49,194 positions, sols 0–4868, 36.94 km. The 121 SITE rows are left out. |

**Check:** at 2,595 shared site/drive pairs, PLACES and MMGIS differ by a median of 0.00 m (max 2.10 m).

**Folders:**
- `sources/`: the downloaded JSONs and the PLACES csv + label.
- `docs/preview_box.png`: a render of the Layer 4 project.

**Made by:** `../../pipeline/build_history/L4_rover/40_build_rover_layer.py` and `41_qgis_project.py`.

**Used for:**
- **Ground truth:** ±5 m around the driven path counts as proven ground.
- **Certainty.**
- **Calibration:** the slope and roughness limits are checked against the in-box path, and rover tilt against DEM slope.
- The "Curiosity's real path" overlay in 3D.

**Limits:**
- Waypoints are end-of-drive positions only.
- Heights (`elev_geoid`) are the USGS DEM values; see Layer 2's height note.
