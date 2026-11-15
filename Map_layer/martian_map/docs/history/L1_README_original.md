# Layer 1: Base map (USGS 25 cm orthomosaic, Gale frame)

**Open:** `qgis/layer1_basemap.qgz`. It opens on the study box.

## What it is
`raw/usgs_msl_gale_ortho_25cm_box.tif` is the **USGS MSL Gale Merged Orthophoto Mosaic, 25 cm, v3**: Calef, F.J. III, and Parker, T., 2016, USGS Astrogeology Science Center / PDS Annex. Source file: https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif (50.4 GB, 180,000 × 280,000 px, uint8, nodata 0).

The file is cut to the study box (137.36–137.40°E, 4.83–4.78°S) plus about 100 m on each side.
- **Native grid**, so no resampling: `eqc lon_0=0`, Mars 2000 sphere, 0.25 m pixels. The NASA rover positions are in this grid, so Layer 4 sits on it with no shift (METADATA.md §D).
- **One file**, tiled and DEFLATE-compressed, with internal overviews (2–32×) so QGIS draws it quickly at any zoom.
- **One fixed contrast stretch** for the whole box: the 2nd–98th percentile, saved in `raw/fetch_log.json`.

Byte counts, timing, the MD5 checksum, the pixel window and the stretch are in `raw/fetch_log.json`.

## Why it replaces the earlier Layer 1
The earlier version is in `../../trials/nasa_data_v2/output/L1_strip*`, from the teammate's nasa_data pipeline. It had these problems:
- It was 4 separate strips, each auto-stretched on its own, so brightness bands showed at the joins. Strip means were 115–128.
- It was resampled from the native grid into lon/lat.
- It had no single file or overviews.
- Its project had no saved view.

The same USGS source is now taken once, on its own grid.

HiRISE RED_C (`../../data/raw/geology/hirise/`) is not used as the base map. It is 1 m rather than 25 cm, and it needs a 43.7 m shift to reach the Gale frame, after which about 7 m of residual remains (METADATA.md §D).

## Re-run (from this folder)
1. `../.venv/Scripts/python.exe -I scripts/20_fetch_basemap_25cm.py`. This reads 2.28 GB as full-width row bands by HTTP range requests: 955 s, ~2.4 MB/s, on 15 Nov 2026. The source is stored as 1-row strips, so every row read costs the full 180,000 B width.
2. `"C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" -P scripts/21_qgis_project.py`. This writes `qgis/layer1_basemap.qgz` and `docs/preview_box.png`.

## Limits
- Greyscale only.
- Like every orthoimage, it shows the surface at the time of imaging. The rover tracks and sand may have changed since.
