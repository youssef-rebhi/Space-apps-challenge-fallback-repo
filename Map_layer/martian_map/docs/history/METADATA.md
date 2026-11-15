# METADATA: sources, datasets, decisions (possible_output, 14 Nov 2026)

This file documents every dataset and source used across all sessions so far: the first session, the geology-qgis session, the nasa_data trial, and this one. For each it gives where it came from and how we used it. **Fact** = read from the source or measured here (the file named). **ASSUMPTION** = a team choice, to be confirmed. Citations marked *(verify)* were not checked against the publisher's page in this session.

Machine-readable copy: `sources.json`. Download log with byte counts and MD5: `raw/fetch_log.json`.

---

## A. Datasets downloaded in THIS session (`possible_output/raw/`)

| Local file | Dataset | Source / URL | What was taken | Used for |
|---|---|---|---|---|
| `raw/msl_gale_dem_1m_box.tif` | **USGS MSL Gale Merged DEM Mosaic 1 m v3**, float32 m, `eqc lon_0=0 R=3396190`, planetocentric E-positive (from the PDS3/ISIS labels) | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_DEM_Mosaic_1m_v3.tif (7.58 GB; label `..._pds3.lbl`, revised 2017-05-01 by D. P. Mayer, USGS). Citation: Parker & Calef 2016, USGS Astrogeology PDS Annex *(verify)* | Window 137.3565–137.4035°E, 4.8335–4.7765°S (box + ~200 m), 3,379 rows, 446 MB transferred by HTTP range reads, 197 s | **Primary box elevation** (Layer 2), slope, contours, Plotly/Leaflet exports; frame/datum tests |
| `raw/hrsc_mola_blend_200m_gale.tif` | **Mars MGS MOLA – MEX HRSC Blended DEM Global 200 m v2**, int16 m, `+proj=longlat +R=3396190` | https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif (redirects to asc-pds-services S3; 11.4 GB). Citation: Fergason, Hare & Laura 2018, USGS Astrogeology *(verify)* | 136.2–139.4°E, 7.0–3.8°S (whole Gale crater + rim), 948×948 px, 202 MB, 94 s | **Regional whole-crater elevation**, hillshade, 100 m contours, regional Plotly/Leaflet |
| `raw/mola_463m_gale.tif` | **MGS MOLA global DEM 463 m** (USGS mosaic of MOLA MEGDR), int16 m | https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif (2.13 GB). Citation: Smith et al. 2001, JGR 106(E10) *(verify)* | Same crater window, 38 MB, 20 s | Cross-check of the blend (`derived/regional_hrsc_vs_mola.json`: median +2.1 m, std 67 m) |
| `raw/mola_pedr/MolaPEDR_box_pts_csv.csv` (+ `.lbl`, `.txt`, `query_response.xml`) | **MOLA PEDR individual laser shots**, TOPOGRAPHY = planetary radius − areoid radius (from the `.lbl`) | PDS Geosciences Node GDS REST: `https://oderest.rsl.wustl.edu/livegds/?query=molapedr&results=vsi&minlat=-4.8335&maxlat=-4.7765&westernlon=137.3565&easternlon=137.4035` (53 shots, orbits 2001; output URLs expire 2026-12-14). Citation: Smith et al., MGS MOLA PEDR, PDS *(verify)* | 53 shots in box + margin | **Absolute vertical check** of both 1 m DEMs (`derived/mola_shot_check.json`) |

## B. Datasets from earlier sessions (read-only here)

Full per-file table: `../DATA_SOURCES.md` and `../data/raw/geology/manifest.json` (89 files, 3.5 GB, first session, `pipeline/00_download_geology_kit.py`).

| Dataset | Source | Used in this folder for |
|---|---|---|
| HiRISE DTM `DTEEC_019698_1750_019988_1750_U01.IMG` (1.0117 m; label: "elevations in meters above the martian equipotential surface (Mars 2000 Datum) defined by Smith et al. (2001)"; `eqc lon_0=137.38`) | MRO HiRISE (NASA/JPL/Univ. Arizona) via PDS: hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_019600_019699/ESP_019698_1750_ESP_019988_1750/ | Via its clip `../data/clean/geology/dtm_box.tif` (geology-qgis session): first-version items 1–2, frame test, MOLA test, shifted copy |
| HiRISE orthoimages ESP_019698_1750 RED_C (1 m), RED_A (25 cm), IRB_C/IRB_A | Same PDS folder | RED_C: shifted copy into Gale frame; RED_A: trial alignment |
| Backup HiRISE DTM DTEEC_009149_1750_009294_1750 + RED_C; PSP_001752_1750 RED (PIA26306 context) | HiRISE PDS | Not used here |
| Curiosity waypoints / traverse / current position (GeoJSON, no CRS; fields `easting`, `northing`, `elev_geoid`, `sol`…) | NASA/JPL MMGIS: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json (+ `MSL_traverse.json`, `MSL_waypoints_current.json`) | Datum and frame tests; `exports/rover/waypoints_box.geojson` |
| USGS SIM 3292 Geologic Map of Mars (Tanaka et al. 2014), pamphlet, DMU, database | pubs.usgs.gov/sim/3292, doi:10.3133/sim3292 | Not used here (geology context, Layer 3) |
| Persaud 2021 Sakarya Vallis unit map shapefiles; Persaud 2021 CRISM basemaps | Zenodo 5819267, 5808381 | Not used here (Layer 3, inferred lines) |
| `../data/clean/geology/` dtm_box, hillshade_box, study_box.gpkg, ridges_hollows_DRAFT, tpi_relief_DRAFT | Derived by the geology-qgis session from the HiRISE DTM | study_box (outline), dtm_box (see above) |
| `../qgis/geology_DRAFT.gpkg` | geology-qgis session draft (in HiRISE frame) | Not used, not touched. **Needs the frame shift (section D) if the Gale frame is adopted** |
| USGS MSL Gale Merged Orthophoto Mosaic 25 cm v3 (Calef & Parker 2016) | asc-pds-services S3 `mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif`, via teammate repo github.com/malek-mejaouel/nasa_data (commit 7769d38) | `../trials/nasa_data_trial/output/` windows: frame check (shifted RED_C vs mosaic) and comparison layer |

## C. Literature and web sources used across sessions (from `../SESSION_HANDOFF.md`)
- Official challenge page and Resources tab, NASA Space Apps 2026 "Interplanetary Survival Guide: Martian Map" (spaceappschallenge.org).
- USGS–NASA Planetary Geologic Mapping Program map database (astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars).
- Siebach et al., GSA 2025 abstract (sulfate → boxwork transition, sol 4534; ridge/hollow sizes).
- Seeger et al. 2026, SEPM (boxwork phyllosilicates, siderite; authors.library.caltech.edu/records/6522c-90325).
- NASA PIA26306 (boxwork extent 10–20 km).
- JPL Ingenuity end-of-mission release (scout precedent).
- Martínez et al. 2014 (REMS ground temperature, thermal inertia).
- Milliken et al. 2010 (marker bed), via Persaud 2021.
- Kirk et al. 2008 (HiRISE DTM production), cited in the DTM label.
- Smith et al. 2001 (MOLA, Mars 2000 areoid), cited in the DTM label.
- Mars Trek (trek.nasa.gov): viewer referenced by the nasa_data repo. Not used as data.

## D. Decisions and findings (this session)

### Item 5: reference frame. DECISION: USGS MSL Gale mosaic frame (ortho 25 cm + DEM 1 m v3)
Evidence (`derived/frame_datum_tests.json`, `derived/mola_shot_check.json`, `derived/check_shifted_redc_vs_mosaic.json`):
1. **Rover data is native to it.** At all 183 waypoints in the box, USGS Gale DEM − rover `elev_geoid` = **0.00 m mean, 0.08 m std, 0.38 m max**. The rover elevations are read from this DEM at the published positions. A horizontal error of even a few metres would give metre-scale differences on these slopes, so the positions are in this frame too.
2. **Our HiRISE products are offset** from it by **29.8 m W, 32.0 N = 43.7 m** (DEM-to-DEM correlation of 7 M pixels). The trial's image-to-image measure was 47–50 m. After the shift, the HiRISE RED_C image still differs from the USGS 25 cm image by ~7 m (5.7 m W, 4.3 m N). Treat **±7 m as the imagery alignment uncertainty**.
3. **MOLA cannot decide horizontally.** A grid search of DEM shifts against 47–52 laser shots barely improves the fit for either DEM (std 7.7→7.1 m and 7.5→6.9 m). Both lie within MOLA's own positional tolerance.
4. So we choose for internal consistency with the most important ground truth (rover). **All HiRISE-derived layers must be shifted by (−29.87, +32.05) m in eqc grid metres** to join it. Files here already shifted: `hirise_dtm_box_GALEFRAME.tif`, `hirise_red_c_box_GALEFRAME.tif`. **Not yet shifted:** `../qgis/geology_DRAFT.gpkg`, `../data/clean/geology/*`. Those belong to the other session; apply the same translation there if the team agrees.

### Item 4: the 12–15 m height gap. CONFIRMED cause
- It is **not** a different datum definition: the HiRISE DTM label says "above … Mars 2000 Datum (Smith et al. 2001)", and the rover field is `elev_geoid`, read from the USGS Gale DEM (point 1 above).
- It **is** a near-constant vertical bias between two DEM products. After horizontal alignment, HiRISE DTM − USGS Gale DEM = **+15.2 m mean, 1.6 m std** over 7.0 M pixels. Before alignment it looked like 7.6 ± 6.9 m, which is why the earlier waypoint test (12.2 ± 2.3 m) was mixing the horizontal and vertical offsets.
- **Absolute truth (MOLA laser shots):** MOLA − HiRISE DTM = **+6.8 m median** (std 7.7 m, n = 47). MOLA − USGS Gale DEM = **+14.9 m median** (std 7.5 m, n = 52). Our HiRISE DTM is closer to MOLA by ~8 m, but neither matches. The ~7 m shot-to-shot scatter is expected on steep ground with a ~150 m footprint (*approximation: 150 m box mean*).
- **What this means for the walk:** slopes, contours and relative heights are unaffected. Absolute heights carry a ±15 m uncertainty. We **use USGS Gale DEM heights** so that every height shown agrees exactly with the rover's own numbers, and we state "heights relative to Mars areoid, USGS MSL Gale DEM; MOLA shots suggest true areoid heights ~15 m higher".
- **How to confirm further, if needed:** (a) ask the MSL localization team, or the PDS MSL Localizations archive (PLACES), which DEM and version their `elev_geoid` uses (expected: this mosaic, given the 0.08 m match); (b) compare against more MOLA shots over a larger area (e.g. 10 × 10 km) to beat the per-shot scatter; (c) MOLA PEDR areoid version vs MEGDR areoid: check that both use the same areoid model. *Not done.*

### Item 6: slope GO/NO-GO version. All thresholds are ASSUMPTIONS
- Slope = Horn 3×3 on the USGS DEM block-averaged to **3 m** (ASSUMPTION: a 1 m baseline is noisy; HiRISE-class DTMs resolve a few metres).
- **GO < 15°, caution 15–25°, NO-GO ≥ 25°, unknown = no data.** These are placeholders, NOT sourced limits. Confirm with a mentor and put them in `ASSUMPTIONS.md` (handoff open decision #2). Change `SLOPE_GO_MAX` / `SLOPE_NOGO_MIN` in `scripts/06_galeframe_layers.py` and re-run 06, 08, 09.
- Result in the box: GO 60.2 %, caution 22.8 %, NO-GO 16.6 %, unknown 0.5 % (`derived/slope_classes_stats.json`).

### Other ASSUMPTIONS / approximations
- Regional window 136.2–139.4°E, 7.0–3.8°S taken as "whole crater + rim" (Gale ≈ 154 km diameter; centre ≈ 5.4°S, 137.8°E as used by the nasa_data repo).
- Plotly grids: Gaussian anti-alias then 300 × 300 sampling. Display height ×3 per the team's 3D guide.
- Leaflet bounds are planetocentric degrees on the Mars sphere. The app must not treat them as Earth WGS84 for distances.
- Hillshade 315° azimuth, 30° altitude (same as the geology session).

---

## E. Layer 5: Points of interest (`layer5_poi/`, built 14 Nov 2026)

**Outputs:**
- `layer5_poi/derived/layer5_poi.gpkg`, with three layers:
  - `poi`: 21 points (12 rover events plus 9 IAU names).
  - `eva_stops`: 55 points.
  - `surface_view_sites`: 4 polygons.
- `layer5_poi/exports/`: `poi_gale.geojson` (all), `poi_box.geojson` (box only), `eva_stops.geojson`, and `poi_cards.json` (stop-card text with what / why / evidence / position / source for the app and the assistant's `source()`).
- QGIS: `layer5_poi/qgis/layer5_poi.qgz` (separate project; Layer 2 elevation as backdrop). Styles in `layer5_poi/qgis/styles/`.
- Previews: `layer5_poi/docs/preview_gale.png`, `preview_box.png`.
- Build: `layer5_poi/scripts/10_build_poi.py` (the curated catalogue is in the script, each entry with its URL), `11_qgis_project.py`, `12_render_preview.py`.

**Positions:**
- Rover events use the NASA MMGIS waypoint of the last drive with sol ≤ event sol, i.e. where the rover was parked. They are therefore native to the USGS Gale frame (§D).
- The uncertainty values are ASSUMPTIONS: 5 m for arm targets (drill), 10 m for landing and rover position, 25 m for mast or area targets, 100 m for Hidden Valley.
- IAU names use the gazetteer centre points. Their control is older (MDIM/THEMIS), so they are only good at km scale, for labels.

**Sources added (all reachable on 14 Nov 2026; read through a fetch agent or a search summary as noted):**

| POI | Sol | Source | How verified |
|---|---|---|---|
| Bradbury Landing | 0 | https://www.jpl.nasa.gov/news/nasa-mars-rover-begins-driving-at-bradbury-landing/ | search summary of NASA/JPL pages |
| John Klein, first drill | 182 | https://www.jpl.nasa.gov/news/nasa-curiosity-rover-collects-first-martian-bedrock-sample/ | search summary (NASA/JPL) |
| Hidden Valley (sand) | 709 (to ~719) | https://mars.nasa.gov/resources/6493/curiosity-tracks-in-hidden-valley-on-mars/ ; JPL release 2014-279 | search summary (NASA/JPL) |
| Elemental sulfur discovery | ~4200 **ESTIMATED** (30 May 2024; NASA gives sol 4209 = 8 June) | https://www.jpl.nasa.gov/news/nasas-curiosity-rover-discovers-a-surprise-in-a-martian-rock/ | search summary; rock name not confirmed |
| Sulfate → boxwork contact | 4534 | NASA blog sols 4804–4811 (Phase 1 = sols 4534–4570); Siebach et al. GSA 2025 (**URL not verified**) | page read by fetch agent |
| Altadena drill | 4564 **INFERRED** (blog: drilled on the 2nd sol of the 4563–4565 plan) | https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/ ; https://science.nasa.gov/blog/curiosity-blog-sols-4563-4565-doing-what-we-do-best/ | pages read |
| Monte Grande hollow, Valle de la Luna (44th hole) | ~4689–4694 (hole image sol 4693) | https://science.nasa.gov/blog/curiosity-blog-sols-4689-4694-drill-in-the-boxwork-unit-is-go/ ; https://science.nasa.gov/blog/curiosity-blog-sols-4695-4701-searching-for-answers-at-monte-grande/ | pages read |
| Nevado Sajama | 4718 (stated) | https://science.nasa.gov/blog/curiosity-blog-sols-4716-4722-drilling-success-at-nevado-sajama/ | page read |
| Nevado Sajama 2 | 4803 (MAHLI image) | https://science.nasa.gov/blog/curiosity-blog-sols-4804-4811-kicking-off-the-final-phase-of-boxwork-exploration | page read |
| Nazca (49th hole) | 5050–5055 | https://science.nasa.gov/blog/curiosity-blog-sols-5050-5055-its-nazca-our-49th-drill-hole/ | **title only (sidebar); page NOT read** |
| IAU names: Gale, Aeolis Mons, Aeolis Palus, Peace, Farah, Dulce, Gediz, Sakarya Valles, Yellowknife | n/a | https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip (downloaded to `layer5_poi/raw/iau_gazetteer/`) | file read |
| Surface View sites: Mary Anning & Groken, Kimberley, Pahrump Hills, Dingo Gap | n/a | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_SurfaceSites.json | file read |
| EVA stops (55) | 4534+ | team AI, `Depo_nasa/Ai_model/results/stops_v2.json` (positions = MMGIS waypoints) | file read |

**Decisions taken by default (the user can change them):**
- Only the box plus a few Gale-wide highlights; not every one of the ~49 drill holes.
- NASA informal names are used, flagged `name_status = NASA_informal`.
- The AI stops are kept as their own `eva_stops` layer, not merged into `poi`.
- Image links are left empty; nothing was downloaded from the raw-images API.

**Known gaps:**
- Monte Grande and Valle de la Luna share one rover position.
- The drill sols for Altadena, Valle de la Luna and the sulfur rock are inferred or estimated.
- The Nazca page and the GSA abstract still need reading.
- Other boxwork targets (Volcán Peña Blanca, Tesoro del Pangal, Los Flamencos…) are not added because their sols aren't verified.

## F. Layer 1: Base map (`layer1_basemap/`, built 15 Nov 2026)
- **Source:** USGS MSL Gale Merged Orthophoto Mosaic 25 cm v3 (Calef & Parker 2016).
- **What we took:** the study box plus ~100 m, on the native grid (`eqc lon_0=0`, 0.25 m, the Gale frame), as one tiled GeoTIFF with overviews and one fixed 2–98 % stretch.
- **Replaces:** the 4 nasa_data v2 strips. Those were resampled to lon/lat and stretched one by one, which made visible bands.
- **Details:** `layer1_basemap/README.md`. The fetch log (bytes, MD5, window, stretch) is `layer1_basemap/raw/fetch_log.json`. Scripts are `20_fetch_basemap_25cm.py` and `21_qgis_project.py`. The project is `layer1_basemap/qgis/layer1_basemap.qgz`.

## G. Layer 4: Rover trajectory (`layer4_rover/`, built 15 Nov 2026)
- **Sources:** NASA/JPL MMGIS waypoints, traverse and current position (to sol 5073), plus NASA PDS MSL PLACES `localized_interp.csv` (ROVER rows only, to sol 4868).
- **Output:** one GeoPackage, `layer4_rover/derived/layer4_rover.gpkg`, with no geology layers.
- **Check:** PLACES and MMGIS agree at 2,595 shared site/drive pairs (median 0.00 m, max 2.10 m).
- **Details:** `layer4_rover/README.md`. Scripts are `40_build_rover_layer.py` and `41_qgis_project.py`. The project is `layer4_rover/qgis/layer4_rover.qgz`.
- **Saved views:** projects written by headless PyQGIS lose their saved view, so `scripts/qgz_view.py` adds it back.
