# nasa_data v2 trial: report (14 Nov 2026, 22:30)

Repo https://github.com/malek-mejaouel/nasa_data at `2dea615`, cloned to `repo/`. The analysis was written before anything ran: `ANALYSIS.md`.
Everything lives in `trials/nasa_data_v2/`. To discard the trial, delete that folder. Nothing outside it was changed. I checked the `qgis/geology_DRAFT_GALEFRAME.gpkg*` timestamps (unchanged, 20:14), and I did not use the QGIS MCP.
The only repo change is the config block at the end of `repo/src/config.py` (`git diff` in `repo/`). The drivers live outside the repo: `run_layer1.py`, `run_layers345.py`, `check_quality.py` and `make_qgz.py`. Dependencies are in `.venv` (Python 3.12, PyPI). `.pylibs/` was not used.

## Per layer

| Layer | Result | Files (`output/`) | Quality vs what we have |
|---|---|---|---|
| **1 Base map** | **MADE (whole box, 4 strips)** | `L1_strip{1..4}_geographic_25cm_V2TRIAL.tif` (lon/lat Mars sphere), `*_compute_aeqd_25cm_V2TRIAL.tif`, `*_preview_V2TRIAL.png`, `layer1_extraction_log_V2TRIAL.json` | USGS MSL Gale Orthophoto Mosaic 25 cm v3 (Calef & Parker 2016), 9484 × 2964 px per strip, nodata ≤ 0.004 %. The full box would need ≈2.13 GB at once, over the 600 MB cap, so I read 4 latitude strips of 0.0125° at 534 MB each: **2.13 GB in 17.4 min**. **This is the best Layer 1 we have:** 25 cm across the whole box, natively in the USGS Gale frame that we chose as reference (METADATA §D), so the rover data sits on it with no shift. Our existing candidate is HiRISE RED_C at 1 m, shifted, with a residual of ~7 m. Flaws: (a) there is a **1-pixel (0.25 m) gap row between strips 2 and 3**, caused by floating-point rounding of the −4.805 edge; (b) the files are 4 separate tiles, with no mosaic or VRT, because the pipeline has no merge step; (c) greyscale only. |
| 2 Elevation | DONE elsewhere, not re-run | — | — |
| **3 Geology** | **NOT POSSIBLE (pipeline cannot make geology)** | `geology_V2TRIAL.geojson`, `geology_compute_V2TRIAL.gpkg`, `layer_3_geology_V2TRIAL.json` | The pipeline only reads in polygons a person supplies. With no file it says `unavailable`, which is honest. As an ingest test I fed it a copy of **our own** draft units layer (`qgis/geology_DRAFT_GALEFRAME.gpkg` → `inputs/gale_geology.gpkg`). It passed the 5 units through with their attributes, valid geometry and the same area (1.5717 km² → 1.5663 km², −0.35 %, which is the expected difference between eqc and AEQD). **This file is our draft, not pipeline output.** |
| **4 Rover trajectory** | **MADE** (from a file I downloaded by hand) | `traverse_V2TRIAL.geojson` (49,315 pts, whole mission), `traverse_path_V2TRIAL.geojson` (line), `layer_4_rover_trajectory_V2TRIAL.json` | Source: PDS MSL PLACES `localized_interp.csv` (11 MB). The URL in the pipeline config is a 404. The live bundle is `https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/data_localizations/`, dated 2026-08-01. **5,028 points in the box (sols 4384–4868), compared with 183 MMGIS waypoints**, so it gives a denser drive path. The 138 positions present in both match **exactly** (0.0 m E/N), and elevations agree to 0.01 ± 0.16 m: both are in the USGS Gale frame. **Gap:** PLACES ends at **sol 4868**, while our MMGIS waypoints run to **sol 5073**: 45 of our 183 box waypoints are missing. **Bug:** the line also passes through the 121 `SITE`-frame rows, which adds ~1.07 km (38.06 km vs 36.98 km rover-only). The pipeline has no box clip (the `.qgz` uses a display filter), and it can't read the PDS4 `.csv.xml` label (it expects PDS3 `.lbl`). |
| **5 POI** | **PARTLY: runs, but these aren't POIs** | `poi_V2TRIAL.geojson`, `layer_5_points_of_interest_V2TRIAL.json`, `layer5_runA_with_L3_error_V2TRIAL.txt` | "POIs" = every Layer 4 point (49,315) plus a sampled `elevation_m`. They have **no names, categories, drill sites or targets**, so they are not our Layer 5 (`possible_output/layer5_poi/PLAN.md`). Sampled elevation (our USGS box DEM, 5,280 points) minus the PLACES elevation = **0.03 ± 0.42 m**: consistent. **Crash bug:** with a geology file present, L5 fails (`ValueError: 'right_df' should be GeoDataFrame`), because `pipeline.py` does `gpd.sjoin(gdf, geology_gdf.drop(columns="geometry"), ...)`. Dropping the geometry makes the spatial join impossible; the one-line fix is to pass `geology_gdf`. I did not patch it; the output above comes from run B, with L3 hidden. Its validation check "L4/L5 in L2 extent" FAILS by design here, because I gave it only the box DEM (to avoid re-running L2), so points outside the box have null elevation. |

Assumptions and choices (mine):
- **ASSUMPTION:** stubbing the L2 slot with `possible_output/raw/msl_gale_dem_1m_box.tif` (the same USGS product, read-only) instead of re-running L2.
- The 4-strip split.
- Display filters in the `.qgz`.
- In the `.qgz`, setting the existing `waypoints_box.geojson` to Mars lon/lat (IAU_2015:49900). GeoJSON without a CRS is read as Earth EPSG:4979 by default.

## Side finding for Layer 5 (not pipeline output)
PDS PLACES also has `data_mechanisms/mech_drill.csv` (downloaded to `inputs/`). Its columns are `frame, site, drive, drill, min/max_sclk, chuck, feed, rotate`: drill mechanism states per site/drive. It has **no names and no coordinates**. Joining it to `localized_pos.csv` on site/drive *might* give drill-activity positions; that is **not verified**, and it would not give sample names.

## How to open
A new QGIS window should already be open with `trials/nasa_data_v2/nasa_data_v2_V2TRIAL.qgz` (built headlessly; your other projects are untouched). Groups: Layer 1 strips, L3, L4 (path + box points), L5 (box points, hidden), and Reference (study box, MMGIS waypoints, HiRISE RED_C GALEFRAME, hillshade). To reopen:

`Start-Process "C:\Program Files\QGIS 4.2.3\bin\qgis.bat" '"C:\Users\pc\Desktop\NASA_Space_Apps_Challenge\trials\nasa_data_v2\nasa_data_v2_V2TRIAL.qgz"'`

## Verdict
- **Adopt it for Layer 1.** It gives a 25 cm, whole-box, Gale-frame base map in ~17 min, under the cap. It is worth copying into the project (after merging the 4 strips into a VRT/COG and fixing the 1-px seam) as the main base map.
- **Layer 4: adopt the *source*, not really the pipeline.** PLACES is a valuable, authoritative and denser trajectory, but it ends at sol 4868. Keep MMGIS for sols 4869–5073. The pipeline adds little beyond reading a CSV, and it has the SITE-row path error.
- **Layers 3 and 5: no.** It cannot make geology, and its "POIs" are waypoints. The L3→L5 join crashes as soon as real geology exists. Report the bug to the author.
- The AOIs in the repo are still placeholders. Upstream outputs for "boxwork" and "hidden_valley" (including the new DEM tiles) are not at the real sites. Don't use them.
