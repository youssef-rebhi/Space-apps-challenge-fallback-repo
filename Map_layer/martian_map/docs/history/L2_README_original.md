# possible_output: Layer 2 (Elevation), draft, self-contained

Everything for this work is in this folder. Nothing outside it was changed. Delete the folder to discard it. Sources, decisions and assumptions are in **METADATA.md** (machine-readable copy: `sources.json`).

## Open it
QGIS → Project → Open → `qgis/layer2_elevation_POSSIBLE.qgz`, or double-click it. It is a separate project, so your `mount_sharp_geology.qgz` is untouched. Groups:
1. **Layer 2 – Elevation (box, USGS MSL Gale frame)**: waypoints, 5 m contours (1 m off), slope classes GO/caution/NO-GO (off), slope (off), elevation (colour over hillshade).
2. **Compare**: HiRISE RED_C and DTM shifted into the Gale frame, the original-frame RED_C (~44 m off), and the USGS 25 cm mosaic window from the trial.
3. **Regional – whole Gale crater**: study box, 100 m contours, 200 m elevation and hillshade, MOLA 463 m.

QML styles for reuse are in `qgis/styles/`.

## Files
| Item | File(s) |
|---|---|
| 1 Elevation layer | `derived/elevation_box_1m_GALEFRAME.tif` (primary). Also, in the HiRISE frame: `derived/elevation_box_hirise_1m.tif` |
| 2 Contours (+ hillshade) | `derived/contours_box_5m_GALEFRAME.gpkg`, `contours_box_1m_GALEFRAME.gpkg`, `hillshade_box_1m_GALEFRAME.tif`. HiRISE frame: `contours_box_5m.gpkg`, `contours_box_1m.gpkg` |
| 3 Whole crater | `derived/regional_gale_elevation_200m.tif`, `regional_gale_hillshade_200m.tif`, `regional_gale_contours_100m.gpkg` |
| 4 Height gap | `derived/frame_datum_tests.json`, `derived/mola_shot_check.json` (explained in METADATA.md §D) |
| 5 Frame | Decision in METADATA.md §D. Shifted HiRISE: `derived/hirise_dtm_box_GALEFRAME.tif`, `hirise_red_c_box_GALEFRAME.tif`. Check: `derived/check_shifted_redc_vs_mosaic.json` |
| 6 Slope GO/NO-GO version | `derived/slope_box_3m_GALEFRAME.tif`, `slope_classes_box_3m_GALEFRAME.tif`, `slope_classes_stats.json` (thresholds are ASSUMPTIONS) |
| 7 App exports | `exports/web/*_lonlat.tif` (`+proj=longlat +R=3396190`), `exports/leaflet/*.png` + `leaflet_bounds.json`, `exports/plotly/*_300x300.json`, `exports/rover/waypoints_box.geojson` |

## Re-run (in order)
`.venv` = Python 3.12 (rasterio, pyproj, numpy, scipy, pillow), installed in this folder. QGIS python = `"C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat"`.
1. `.venv/Scripts/python.exe -I scripts/01_fetch_windows.py` (≈ 690 MB of range reads)
2. QGIS python `scripts/02_box_elevation_contours.py` (HiRISE-frame items 1–2)
3. QGIS python `scripts/03_regional_crater.py`
4. `.venv … scripts/04_frame_and_datum_tests.py`, then `05_mola_shot_check.py` (needs `raw/mola_pedr/`, see METADATA.md for the query URL)
5. `.venv … scripts/06_galeframe_layers.py` (change the slope thresholds here)
6. QGIS python `scripts/07_galeframe_contours_hillshade.py`
7. `.venv … scripts/08_exports.py`
8. QGIS python `scripts/09_qgis_project.py`
