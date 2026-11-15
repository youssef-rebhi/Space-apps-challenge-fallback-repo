# Layer 5: Points of interest (plan; now BUILT, see ../METADATA.md §E)

Status 14 Nov 2026 (evening): **BUILT** — see ../METADATA.md §E. (Original plan kept below.) Team GIS structure: "Layer 5 – Points of interest: landing site, scientific targets and discoveries" (vector).

## 1. Goal
A point layer (with a few polygons) that answers "what is here and why does it matter?" at two scales. Every point names its source and how sure we are. It feeds the tablet stop cards and the assistant's `source()` / `cell_info` answers.

## 2. Two scales
| Scale | Extent | Typical POIs |
|---|---|---|
| **Gale-wide** (regional view, Layer 2 regional extent) | 136.2–139.4°E, 7.0–3.8°S | Bradbury landing site (sol 0); Gale crater and Aeolis Mons (IAU names); Hidden Valley (sols 702–711, ~137.383°E 4.660°S, the sand lesson); major drill sites along the traverse; Mary Anning & Groken drill sites, Dingo Gap (NASA "Surface View" layer) |
| **EVA box** | 137.36–137.40°E, 4.78–4.83°S | Sol 4534 sulfate → boxwork contact (137.38644°E, 4.79762°S); boxwork campaign stops, sols ~4575–4752 (137.379–137.382°E, 4.802–4.809°S); drill site near sol 4709 (name and sol to verify); Curiosity on sol 5073; science stops from the team's AI model (`Depo_nasa/Ai_model/results/stops_v2.json`, 55 boxwork stops) |

## 3. Categories (`category` field)
`landing_site` · `drill_site` · `science_target` (contact/proximity science, APXS/ChemCam targets) · `discovery` (published finding at a place, e.g. the sulfate→boxwork contact) · `named_feature` (IAU or NASA-informal names) · `panorama` (NASA Surface View) · `eva_stop` (our planned Marswalk stops, from the AI stops + route) · `hazard_lesson` (e.g. Hidden Valley sand).

## 4. Attribute schema (GeoPackage `poi`, plus GeoJSON export)
| Field | Type | Notes |
|---|---|---|
| `poi_id` | text | stable id, e.g. `L5-0001` |
| `name` | text | official or NASA-informal name. Mark informal names `name_status = informal` |
| `name_status` | text | `IAU` / `NASA_informal` / `team` |
| `category` | text | section 3 |
| `scale` | text | `gale` / `box` / `both` |
| `sol` | int | sol of the event (null if not tied to a sol) |
| `sol_end` | int | for campaigns (e.g. 4752) |
| `lon`, `lat` | real | planetocentric, east-positive, Mars sphere R = 3396190 |
| `position_method` | text | `published_coord` / `rover_waypoint_on_sol` (position = rover's waypoint that sol; target is near but not exactly there) / `digitised_from_map` / `team_estimate` |
| `position_uncertainty_m` | real | e.g. ≤10 m waypoint, ~50 m map-digitised. ASSUMPTION per method |
| `evidence` | text | `observed` (rover at the place) / `inferred` (orbital or interpreted) |
| `source_name` | text | e.g. "NASA MMGIS MSL waypoints" |
| `source_url` | text | link the assistant can cite |
| `source_class` | text | `official_NASA_list` / `NASA` / `USGS` / `PDS` / `peer_reviewed` / `third_party` |
| `description` | text | ≤ 300 characters, plain language, sourced |
| `science_value` | text | short "why it matters" for the stop card |
| `image_url` | text | optional NASA raw image or photojournal link |
| `retrieved` | date | when the data was pulled |

## 5. CRS and frame
- Store in `+proj=longlat +R=3396190` (planetocentric, east-positive), the same as the Layer 2 exports.
- **Frame = USGS MSL Gale mosaic frame**, chosen in `../METADATA.md` §D. NASA MMGIS waypoints are native to it, so positions taken from waypoints need no shift.
- Positions digitised over our HiRISE RED_C/IRB_C images in the original HiRISE frame must be shifted by −29.87 m E / +32.05 m N (eqc grid metres), or digitised on `../derived/hirise_red_c_box_GALEFRAME.tif` instead.
- IAU gazetteer coordinates are referenced to an older MDIM/THEMIS control. They are fine for Gale-wide labels (km-scale features), but are NOT to be used for metre-scale box POIs.

## 6. Build method (later)
1. Load MMGIS waypoints → table `sol → lon, lat, elev`.
2. Collect named events with sols from the sources (section 8). Join each to the waypoint of that sol → `position_method = rover_waypoint_on_sol`.
3. Add IAU names (Gale, Aeolis Mons…) from the gazetteer for the regional scale.
4. Add the team AI stops (`stops_v2.json`) as `eva_stop`, after checking their CRS/frame.
5. Validate: every row has `source_url` and `evidence`; points fall inside the right scale extent; no duplicate names; a spot-check of 5 points on the Gale-frame imagery.
6. Export: `exports/poi_gale.geojson`, `exports/poi_box.geojson`, `exports/poi_cards.json` (stop-card text + source for the app and assistant), QML style.

## 7. Styling and icons
- One icon per category, consistent with the app's four colours. POIs are informational, so use neutral marker colours and keep green/orange/red/grey for safety status only.
- Shapes: landing ★, drill ⊙ (drill bit), science target ◆, discovery ✦, named feature (text label only), panorama 📷, EVA stop numbered circle, hazard lesson ⚠ (grey-orange).
- Label scale-dependently: Gale-wide shows landing and named features; the box shows all.
- `evidence = inferred` → hollow marker; `observed` → filled.

## 8. Candidate sources (reachability checked 14 Nov 2026; nothing bulk-downloaded)
| Source | Class | Status | Gives |
|---|---|---|---|
| NASA MMGIS MSL waypoints `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` | official NASA list | 200, already in `../../data/raw/geology/rover/`. Fields: RMC, site, drive, sol, easting, northing, elev_geoid, lon, lat, roll, pitch, yaw, tilt, dist… **no target names, no drill flag** | positions per sol |
| NASA Curiosity location map config `https://mars.nasa.gov/maps/location/api/configure/get?mission=Curiosity` | NASA | 200, saved `raw/nasa_location_map_config.json` (5 KB). Layers: Current Position, Waypoints, Surface View, Rover Path, Labels (raster tiles), basemaps | list of NASA layers |
| NASA "Surface View" `.../MSL/Layers/json/MSL_SurfaceSites.json` | NASA | 200, saved `raw/probe_MSL_SurfaceSites.json` (1.3 KB, 4 polygons, e.g. "Mary Anning & Groken Drill Sites" site 82, "Dingo Gap" site 26) | a few named panorama sites |
| NASA map "Labels" `.../MSL_WebGIS_PlaceText/{z}/{x}/{y}.png` | NASA | raster tiles only. Names can't be extracted as data | visual check only |
| USGS/IAU Gazetteer, Mars centre points `https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip` (+ `.kmz`), listed on https://planetarynames.wr.usgs.gov/GIS_Downloads | USGS (IAU) | 200, 5.4 MB zip (not saved) | IAU names: Gale, Aeolis Mons… *Assumption:* no IAU names inside our 2.4 km box (to verify) |
| NASA "Curiosity's Proposed Path up Mount Sharp" (PIA23179, 2019) https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp | official NASA (challenge resource) | 200 (JPL copy https://www.jpl.nasa.gov/images/pia23179-… returns 403 to scripts, likely bot-blocking) | annotated regions, image only. The plan changed in 2025 per third-party reporting, so use it as historical context |
| NASA PIA26306 (boxwork) https://photojournal.jpl.nasa.gov/catalog/PIA26306 | NASA | 200 | boxwork discovery description, image |
| JPL PIA26017 "A map of Curiosity's difficult climb" https://www.jpl.nasa.gov/images/pia26017-a-map-of-curiositys-difficult-climb/ | NASA | 403 to scripts. **Not verified** | route context |
| NASA raw images API `https://mars.nasa.gov/api/v1/raw_image_items/?…` and https://mars.nasa.gov/msl/multimedia/raw-images/ | NASA | 200 (JSON) | `image_url` per sol for stop cards |
| PDS Analyst's Notebook https://an.rsl.wustl.edu/msl/ (`/mslbrowser/`) | PDS (NASA) | 200 (web app). Export format **not verified** | target names by sol (best candidate for science targets) |
| PDS Geosciences MSL: CheMin https://pds-geosciences.wustl.edu/missions/msl/chemin.htm, SAM, APXS supplement bundles e.g. https://pds-geosciences.wustl.edu/msl/urn-nasa-pds-msl_apxs_supplement_sols_3054_3712/ | PDS (NASA) | 200 | drilled sample names (CheMin/SAM), APXS target names + sols. The APXS supplement found so far stops at sol 3712, before our box |
| NASA SVS "Curiosity's first 14 rock or soil sampling sites" https://svs.gsfc.nasa.gov/30810 | NASA | 200 | early drill sites (outside box) |
| Vasavada 2022 / "A look back: drilling on Curiosity, part II" (Icarus 2020) PDF https://www-robotics.jpl.nasa.gov/media/documents/1-s2.0-S0019103520302657-main_look_back_drilling_on_curiosity_part_ii.pdf | peer-reviewed (JPL-hosted) | 200 | drill history to ~2019 |
| Planetary Society drill-hole image pages, e.g. https://www.planetary.org/space-images/sixteen-curiosity-drill-holes | third-party | 200 | drill names + sols (cross-check only) |
| PDS MSL localizations (PLACES) | PDS | **not found**: guessed URLs gave 404 | would document waypoint method |
| Science sources already in METADATA: Siebach et al. GSA 2025, Seeger et al. 2026, NASA PIA26306 | peer-reviewed / NASA | in `../METADATA.md` §C | sol 4534 contact, boxwork facts |

**Gap:** no official machine-readable list of drill sites and target names with coordinates was found yet. The plan is to get names+sols from PDS (Analyst's Notebook / CheMin / SAM labels / mission blog) and positions from the waypoints.

## 9. Environment (installed)
`possible_output/.venv` (Python 3.12): geopandas 1.2.0, shapely 2.2.0, pyogrio 0.13.0, requests 2.34.2, plus the existing rasterio, pyproj, numpy, scipy, pillow. QGIS 4.2.3 python is available for styling and project building. Folders: `raw/`, `derived/`, `scripts/`, `exports/`, `docs/`. Stub: `sources.json`.

## 10. Open questions for the user
1. Which POIs matter most for the demo: all drill sites along the whole traverse (~40+ by 2024), or only the box plus a handful of Gale-wide highlights?
2. Use NASA informal names (e.g. "Mary Anning", "Gediz Vallis") in the app? They're widely used, but they're not IAU names.
3. Should the team AI's 55 boxwork stops become `eva_stop` POIs, or stay a separate route layer?
4. May we pull per-POI images from the NASA raw-images API for the stop cards (small JPGs, a few MB)?
5. Who checks the sol-4709 drill site name and position (the Analyst's Notebook needs manual browsing)?
