# Layer 2: Elevation

Elevation layer for the boxwork site, lower Mount Sharp, Gale crater (box 137.36–137.40°E, 4.78–4.83°S, planetocentric, east-positive), plus the whole crater for the regional view. Every dataset, decision and assumption is documented in **[`METADATA.md`](METADATA.md)** (machine-readable copy: `sources.json`; download log with byte counts and MD5: `raw/fetch_log.json`).

## Key facts

- Curiosity's heights equal the **USGS MSL Gale DEM** (0.08 m spread at 183 waypoints), so this layer uses the USGS Gale frame.
- HiRISE products must be shifted by −29.87 m E / +32.05 m N to match it.
- The HiRISE DTM sits 15.2 m higher than the USGS DEM. MOLA laser shots suggest true heights are about 15 m above the USGS DEM. Slopes and relative heights are not affected.
- Slope classes: GO < 15°, caution 15–25°, NO-GO ≥ 25° (team assumption, see [`ASSUMPTIONS.md`](../../ASSUMPTIONS.md)). In the box: GO 60.2 %, caution 22.8 %, NO-GO 16.6 %, unknown 0.5 %.

## Open it

QGIS → Project → Open → `qgis/layer2_elevation_POSSIBLE.qgz` (relative paths, works wherever the folder is copied). Groups:
1. **Layer 2 – Elevation (box, USGS MSL Gale frame)**: waypoints, 5 m contours, slope classes, slope, elevation over hillshade.
2. **Compare**: HiRISE RED_C shifted into the Gale frame and the original-frame RED_C (~44 m off).
3. **Regional – whole Gale crater**: study box, 100 m contours, 200 m elevation and hillshade, MOLA 463 m.

QML styles for reuse are in `qgis/styles/`.

## Files

| Item | File(s) |
|---|---|
| Elevation (primary) | `derived/elevation_box_1m_GALEFRAME.tif` |
| Hillshade, contours | `derived/hillshade_box_1m_GALEFRAME.tif`, `derived/contours_box_5m_GALEFRAME.gpkg` |
| Slope, slope classes | `derived/slope_box_3m_GALEFRAME.tif`, `derived/slope_classes_box_3m_GALEFRAME.tif`, `derived/slope_classes_stats.json` |
| HiRISE image in the Gale frame | `derived/hirise_red_c_box_GALEFRAME.tif`; alignment check `derived/check_shifted_redc_vs_mosaic.json` |
| Frame and height tests | `derived/frame_datum_tests.json`, `derived/mola_shot_check.json` (explained in METADATA.md §D) |
| Whole crater | `derived/regional_gale_elevation_200m.tif`, `regional_gale_hillshade_200m.tif`, `regional_gale_contours_100m.gpkg`, `regional_hrsc_vs_mola.json` |
| App exports | `exports/web/*_lonlat.tif` (`+proj=longlat +R=3396190`), `exports/leaflet/*.png` + `leaflet_bounds.json`, `exports/plotly/*_300x300.json`, `exports/rover/waypoints_box.geojson` |
| Raw inputs (small) | `raw/` (MOLA 463 m and HRSC/MOLA windows, MOLA laser shots) |
| Study box | `context/study_box.gpkg` |

**Not in the repo (size), regenerate with `scripts/`:** the raw USGS Gale DEM window (15 MB, script 01), 1 m contours (~48 MB, script 07), the shifted HiRISE DTM (script 06) and the HiRISE-frame first versions (script 02).

## Re-run (in order)

Python 3.12 with rasterio, pyproj, numpy, scipy and pillow; QGIS Python (`python-qgis.bat` on Windows) for the scripts that need GDAL/OGR.

1. `python -I scripts/01_fetch_windows.py` (about 690 MB of HTTP range reads)
2. QGIS Python `scripts/02_box_elevation_contours.py` (HiRISE-frame first version)
3. QGIS Python `scripts/03_regional_crater.py`
4. `python -I scripts/04_frame_and_datum_tests.py`, then `scripts/05_mola_shot_check.py` (needs `raw/mola_pedr/`; query URL in METADATA.md)
5. `python -I scripts/06_galeframe_layers.py` (slope thresholds are set here)
6. QGIS Python `scripts/07_galeframe_contours_hillshade.py`
7. `python -I scripts/08_exports.py`
8. QGIS Python `scripts/09_qgis_project.py`

Scripts 02, 04 and 05 also read the clipped HiRISE DTM `data/clean/geology/dtm_box.tif` from the team's working folder. It is not in this repo; it is a crop of HiRISE DTM DTEEC_019698_1750_019988_1750_U01 (see METADATA.md §B).
