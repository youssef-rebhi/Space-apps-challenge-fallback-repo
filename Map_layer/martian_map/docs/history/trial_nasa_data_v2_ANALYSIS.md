# nasa_data v2: analysis BEFORE running (14 Nov 2026)

Repo: https://github.com/malek-mejaouel/nasa_data, cloned to `repo/` at commit **`2dea615` ("third", 14 Nov 2026 21:43 +01:00)**. Earlier trial used `7769d38` ("second"). Clone size 536 MB (incl. `.pylibs/`).
Nothing was run before this file was written. Everything below was read from the source files or from the HTTP listings named.

## 1. What changed since 7769d38

`git diff 7769d38 2dea615 --stat -- src/*.py`: 7 source files, +1,918 / −7 lines. The other 7 modules (`aoi_analyzer`, `raster_reader`, `crs_manager`, `url_inspector`, `terrain_analyzer`, `json_exporter`, `manifest_manager`) are **unchanged**, so the Layer-1 imagery logic, the AOI placeholders and the 600 MB cap are the same as in the earlier trial (`../nasa_data_trial/README_TRIAL.md`).

| File | Change |
|---|---|
| `src/layer_registry.py` (new, 179) | Declares the 5-layer stack as data: 1 Imagery (raster, "done"), 2 Elevation (raster), 3 Geology (vector, categorical, status `unavailable`), 4 Rover trajectory (vector, trajectory), 5 POI (vector, derived from L4). Enforces resampling rules (continuous→bilinear, categorical→nearest). |
| `src/config.py` (+169) | L2 source: USGS MSL Gale DEM 1 m v3 at `https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` (config says 3,868,256,546 B, LZW, 1-row strips; *we fetched the same product from the asc-pds-services S3 URL in `possible_output/`, listed as 7.58 GB there; different file sizes, not reconciled here*). L3: looks only for `ressources/gale_geology.{geojson,gpkg,shp}`. L4: looks only for `ressources/localized_interp.csv` (PDS MSL PLACES) or `ressources/traverse.{geojson,csv}`. Local PLACES base DEM `ressources/msl_orbital_dem.img` for sampling. L5 = derived from L4. |
| `src/dem_analyzer.py` (new, 231) | L2 adapter: injects the vertical unit "metre" from the publisher record so the old elevation guard passes; Horn slope/aspect; NoData-aware bilinear reprojection to AEQD and lon/lat. |
| `src/vector_reader.py` (new, 365) | GeoPandas reader: CSV of points (auto-detects lon/lat, assigns Mars lon/lat CRS), metadata, reprojection, validity checks, metric length/area, ordering by `sclk`, cumulative distance, raster sampling at points, GeoJSON/GPKG writers, a PDS3 label reader. |
| `src/layer_exporter.py` (new, 142) | One JSON per layer in `metadata/`, `metadata/layer_stack.json`, `layer_stack` array in `manifest.json`. |
| `src/pipeline.py` (+752) | `run_layer_stack()` (L2..L5), L4 processing (sort by sclk, path line, cumulative distance, DEM-sampled elevation profile every ≥50 m, max 1000 samples), L5 derivation, extra validation checks, README Part C. |
| `src/readme_generator.py` (+87) | README Part C (layer stack). |

Committed data added in `2dea615`: `data/vector/traverse.geojson` + `traverse_path.geojson` (49,315 PLACES points, sols −1..4868, 38.06 km), `data/vector/poi.geojson` (the same 49,315 points + `elevation_m`), DEM tiles for the two placeholder AOIs, `metadata/layer_*.json`, `src/__pycache__/*.cpython-313.pyc`, and a **2.57 MB README.md** (Part C embeds per-waypoint arrays).

## 2. What it reads and writes

| Layer | Reads | From | Size / cap | Writes |
|---|---|---|---|---|
| 1 Imagery | USGS MSL Gale Orthophoto Mosaic 25 cm v3 (Calef & Parker 2016) | `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif`, HTTP HEAD + `Range: bytes=0-1023` (requests) then GDAL `/vsicurl/` range reads | ~50.4 GB file; 1-row strips, uncompressed → each row costs the full width: 180,000 B. **Cap 600 MB per AOI** (`MAX_TRANSFER_BYTES`). Optional local `ressources/curiosity_hirise_mosaic.tif` (not in repo) | `data/processed/*_25cm.tif` (AEQD + lon/lat), `outputs/*_preview.png` |
| 2 Elevation | USGS MSL Gale DEM 1 m v3 | planetarymaps.usgs.gov `/vsicurl/` | 32,980 px × 4 B = 131,920 B per row; same 600 MB cap | `data/processed/dem_*` |
| 3 Geology | **only a local file the user supplies** (`ressources/gale_geology.*`) | none remote; two web pages are only *listed* | — | `data/vector/geology.geojson` + `_compute.gpkg` |
| 4 Rover | **only a local file** `ressources/localized_interp.csv` (PDS MSL PLACES), or `traverse.geojson/csv` | the code does NOT download; the URL it lists, `https://planetarydata.jpl.nasa.gov/img/data/msl/MSLPLC_1XXX/`, **returns 404** (checked 14 Nov). The live PLACES bundle is at `https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/` (PDS4; `data_localizations/localized_interp.csv` 11 MB, `localized_pos.csv` 341 KB, `data_maps/msl_orbital_dem.img` 369 MB, `msl_orbital_map.img` 1.4 GB; directory dates 2026-08-01) | — | `data/vector/traverse.geojson`, `traverse_path.geojson` |
| 5 POI | L4 output | — | — | `data/vector/poi.geojson` |

Every run also rewrites `README.md`, `manifest.json`, `metadata/*.json`, `data/vector/aoi_*.geojson` inside the repo.

## 3. Safety review
- **Network:** `requests.head/get` to the S3 mosaic URL (phase 2); GDAL `/vsicurl/` reads of the mosaic and DEM. No uploads, no other hosts. No vector download at all.
- **No** `subprocess`, `os.system`, `eval`, `exec`, `remove/unlink/rmtree` in `src/` (grep, 14 Nov).
- **Writes** only under the repo root (paths from `config.PROJECT_ROOT`). Driver scripts here redirect them to `../output/`.
- **Binaries:** `.pylibs/` still ships 170 `.pyd/.dll` files from an unknown build (unchanged in this commit). **Not used.** The commit also tracks `src/__pycache__/*.cpython-313.pyc` (compiled bytecode). Python 3.12 ignores 3.13 `.pyc`, and I run with `-B` / `PYTHONDONTWRITEBYTECODE`; source `.py` is what executes.
- Committed metadata leaks the author's local path (`C:\Users\user\Documents\trae_projects\nasa_data\...`) — harmless, cosmetic.

## 4. Are the AOIs still placeholders?
**Yes.** `aoi_analyzer._SUBWINDOWS` is unchanged: `aoi_boxwork` = centre fraction (0.46, 0.31) of the mosaic footprint, 1024 px (256 m) → 137.444°E, 4.883°S, ~5.8 km from the real boxwork stops; `aoi_hidden_valley` (0.12, 0.47) ~11.8 km off (earlier trial). The new committed L2 DEM tiles use the same two placeholders. Our box is never mentioned in the code.

## 5. Which of our layers it could plausibly produce (prediction, to be tested)

| Our layer | Prediction | Why |
|---|---|---|
| 1 Base map | **Yes, in 4 sub-windows.** Full box 4.78–4.83°S = 0.05° ≈ 11,855 rows × 180,000 B ≈ **2.13 GB** > 600 MB cap. 4 latitude strips of 0.0125° (≈2,964 rows, ≈534 MB each) fit. ~5–6 min each at the ~1.6 MB/s seen earlier (*estimate*). Output frame = USGS Gale mosaic frame = our chosen reference frame (METADATA §D). | logic unchanged and already worked in trial 1 |
| 2 Elevation | DONE elsewhere, not re-run. | task rule |
| 3 Geology | **Cannot make it.** It only *ingests* polygons someone else drew; with no file it reports `unavailable` (honest). Test: feed a copy of our own draft `qgis/geology_DRAFT_GALEFRAME.gpkg` (5 units) to see if ingest + L5 unit sampling work. That would be the pipeline passing through **our** data, not producing geology. | `config.GEOLOGY_LOCAL_CANDIDATES` |
| 4 Rover trajectory | **Likely yes**, if `localized_interp.csv` is fetched from PDS by hand (11 MB). No AOI clip for vectors: it outputs the whole mission. The current label is PDS4 `.csv.xml`; the code reads only PDS3 `.lbl`, so label provenance will be missing. | `vector_reader._read_csv_points` |
| 5 POI | **Technically yes, scientifically no.** "POIs" = every L4 waypoint (49k points) + sampled elevation (+ geology unit). No names, no drill sites, no targets: not what our Layer 5 plan means by POI (`possible_output/layer5_poi/PLAN.md`). | `_derive_points_of_interest` |

Side finding (not pipeline): the PLACES bundle contains `data_mechanisms/mech_drill.csv` (187 KB). Its name suggests per-sol drill mechanism records; if it carries positions/sols it may close the Layer-5 "no machine-readable drill-site list" gap. *Not verified yet.*

## 6. Plan for step 2
1. venv `trials/nasa_data_v2/.venv` (uv, Python 3.12, PyPI wheels; never `.pylibs`).
2. Config only in the clone: add `BOX_V2TRIAL` + the 4 strips to `repo/src/config.py`; point `GEOLOGY/TRAVERSE` candidates and `DEM_LOCAL_PATH` to `trials/nasa_data_v2/inputs/`.
3. Inputs (downloaded/copied into `trials/nasa_data_v2/inputs/`, own folder): `localized_interp.csv` + `.csv.xml` (PDS); copy of the geology GALEFRAME draft.
4. DEM sampling for L4/L5 uses our existing local box DEM `possible_output/raw/msl_gale_dem_1m_box.tif` (same USGS product as the pipeline's L2, read-only) as the "remote" L2 source, so L2 is not re-run. Points outside the box get null.
5. Drivers outside the repo redirect all outputs to `trials/nasa_data_v2/output/`, names `*_V2TRIAL.*`.
