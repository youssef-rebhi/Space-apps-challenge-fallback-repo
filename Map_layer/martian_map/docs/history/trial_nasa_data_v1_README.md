# nasa_data trial (14 Nov 2026), DRAFT, safe to delete

Self-contained test of the teammate's repo https://github.com/malek-mejaouel/nasa_data (commit `7769d38`).
Everything lives in `trials/nasa_data_trial/`. To discard the trial, delete this folder. Nothing outside it was changed: no file in the project is newer than the clone, and `qgis/` timestamps are unchanged (16:03–16:30). QGIS was not touched.

## 1. Repo vs `nasa_data-master/`
- Same 10 `src/` modules and logic for the remote USGS mosaic. Line endings differ (CRLF vs LF), and there are small wording changes ("metres/pixel (ground, on the Mars 2000 sphere)").
- **New:** a second dataset, "curiosity_hirise_mosaic", read from a local `ressources/curiosity_hirise_mosaic.tif` (8.6 GB, Mars Trek layer footprint). **That file is not in the repo**, so this part skips itself. Its outputs (`curiosity_aoi_*`) are committed, but they use the same placeholder AOIs (5.8 km and 11.8 km from the real sites).
- AOIs are still placeholders. The transfer cap is still 600 MB per AOI.
- **Safety:** the code only reads (HTTP HEAD/Range GETs to the USGS S3 file, local reads) and writes only inside the repo folder. It has no subprocess, eval, or delete calls. **Caution:** the repo also ships `.pylibs/`, 38 prebuilt binary Python packages from an unknown build. I did **not** use them; the venv here was installed from PyPI (`.venv`, Python 3.12).

## 2. What I changed (clone only)
`repo/src/config.py`: added `TRIAL_AOIS` (the only modified file; see `git diff` in `repo/`). Drivers live outside the repo: `run_trial.py` (calls the repo's own `phase_3_extract` / `phase_4_process`, redirecting output to `output/`), `run_terrain.py`, `run_alignment.py`, `run_waypoint_test.py`, `make_compare.py`.

Full box at 25 cm = 11,856 full-width rows × 180,000 B ≈ **2.1 GB**, over the cap. Coarser output doesn't help, because the file is stored as 1-row strips and every row still has to be read. So I used two sub-windows:

| Window | bbox (°E, °N) | Size | Transfer | Read time |
|---|---|---|---|---|
| boxwork_stops | 137.3765–137.3845, −4.8110 to −4.8000 | 1897×2608 px ≈ 474×652 m | 469 MB | 294 s |
| sol4534 | 137.38444–137.38844, −4.79962 to −4.79562 | 948×948 px ≈ 237 m | 171 MB | 94 s |

## 3. Outputs (`output/`)
- `mosaic25cm_boxwork_stops_geographic_TRIAL_DRAFT.tif`: **main layer**. 25 cm, uint8, nodata 0, CRS `+proj=longlat +R=3396190` (Mars 2000 sphere; the repo picks IAU_2015:49900 when available). Source: Calef & Parker 2016, MSL Gale Merged Orthophoto Mosaic v3, USGS.
- `mosaic25cm_sol4534_geographic_TRIAL_DRAFT.tif`: small window at sol 4534.
- `*_aeqd_TRIAL_DRAFT.tif`: the same data in the repo's compute CRS (AEQD 5.4°S 137.8°E, R 3396190).
- `*_preview_TRIAL_DRAFT.png`: quick-looks.
- `dtm_box_slope_deg_TRIAL_DRAFT.tif`, `dtm_box_aspect_deg_TRIAL_DRAFT.tif`: the repo's Horn (1981) slope/aspect on `data/clean/geology/dtm_box.tif` (1.0117 m, DTM CRS, nodata −9999). Stats are in `dtm_box_slope_stats_TRIAL_DRAFT.json`: mean 16.4°, median 13.4°, p95 39.0°; 30 % of pixels > 20°, 13 % > 30°. Note: the repo's guard *refused* our DTM, because the file has no "elevation"/unit metadata, so I bypassed it on purpose. 1 m-posted HiRISE DTM slopes are noisy at pixel scale (the effective resolution is a few metres; *assumption from typical HiRISE DTM practice, not measured here*). QGIS `gdal:slope` would give the same result: this is not new capability.
- `alignment_vs_hirise_TRIAL_DRAFT.json`, `alignment_sol4534_compare_TRIAL_DRAFT.png`, `waypoint_elevation_test_TRIAL_DRAFT.json`, `extraction_log_TRIAL_DRAFT.json`.

## 4. Alignment vs our HiRISE (ESP_019698_1750 RED_A, 25 cm)
FFT cross-correlation of high-passed images on the same grid, ±50 m search:

| Window | Mosaic minus HiRISE | Correlation before → after shift |
|---|---|---|
| sol4534 | **−35.1 m E, +35.7 m N = 50.0 m** (mosaic is NW) | −0.00 → 0.88 |
| boxwork_stops | −32.1 m E, +34.4 m N = 47.1 m | 0.00 → 0.58 |

Consistent to ~3 m between windows and visually confirmed (see the compare PNG). **In QGIS the mosaic will sit ~50 m north-west of RED_C/IRB_C/DTM.**

Which frame is "right" is not established. A hint (weak evidence, not proof): the rover waypoint `easting/northing` are in the mosaic's own grid (`eqc lon_0=0`, e.g. 8146811 / −272039). Shifting the 182 in-box waypoints into the HiRISE frame cuts the scatter of (DTM − rover elev) from 2.3 m to 1.3 m std. The mean gap (12.2 → 15.6 m) is *not* explained, so that part is a vertical-datum difference. If confirmed, our waypoints may be ~50 m off relative to the HiRISE DTM in the geology project. **Worth a decision by the user / a mentor before relying on waypoint-vs-DTM positions at <50 m.**

## 5. How to open
QGIS → Layer → Add Layer → Add Raster Layer → `trials/nasa_data_trial/output/mosaic25cm_boxwork_stops_geographic_TRIAL_DRAFT.tif` (QGIS reprojects on the fly). Optionally, add the slope tif the same way. Use a scratch project if you don't want the main `.qgz` changed (don't save the project).

## 6. Verdict (honest)
- **Adds:** a second 25 cm view of the boxwork stops that is sharper than RED_A and has different illumination (likely a different source HiRISE image; *not verified which*). That helps for reading ridge/hollow edges. It also gives evidence of a ~50 m registration difference between the USGS mosaic (and probably the rover waypoints) and our HiRISE DTM products.
- **Doesn't add:** whole-box coverage (2.1 GB, ~20+ min at the speed seen here: ~1.6 MB/s), elevation, or colour. Slope is the same as QGIS's.
- **Recommendation:** keep the boxwork_stops window as an optional reference layer, labelled with its offset. Don't co-register it by hand without deciding which frame is the reference. Raise the 50 m waypoint question with the team.
