# Session handoff: Martian Map, Mount Sharp boxwork

Written 14 Nov 2026 at the end of the first Claude Code session. Read this first in any new session. Everything below was checked against the source named; anything marked *assumption* is the team's choice, not a fact.

## 1. The project

- **Event:** NASA Space Apps Challenge 2026 (14–15 Nov), challenge "Interplanetary Survival Guide: Martian Map". Team of 5. Demo is a ≤30 s video or ≤7 slides; every external resource goes in References.
- **Official brief (read 14 Nov):** a layered, integrated view of one location or route, from multiple NASA missions, to help an astronaut plan and carry out a Marswalk with science along the way. Considerations: ≥3 data types; astronaut safety and radiation/space weather; suit mobility; a route avoiding large rock formations; formats (habitat display, tablet, helmet HUD); time frame; point-of-view images from surface missions; robots or rovers to help, astronauts in pairs. It says Mars Trek and the USGS maps are built for regional views, not single spacewalks.
- **Official Resources tab (unchanged on 14 Nov):** Mars Trek, USGS-NASA Planetary Geologic Mapping Program, Curiosity route animation, NASA Worldview, Perseverance raw images.
- **User rule:** do not hallucinate. Every fact on screen names a NASA or published source; every chosen number is labelled an assumption (keep them in `ASSUMPTIONS.md`).

## 2. Decisions already made

- **Site:** boxwork region, lower Mount Sharp, Gale crater. **Box: 137.36–137.40°E, 4.78–4.83°S** (planetocentric, east-positive; 2.36 × 2.96 km; elevation −3,735 to −3,472 m from rover data).
- **Tablet:** 3D by default (Plotly surface), one tap to 2D (Leaflet). Route editing in 2D. Same data in both.
- **Helmet:** 2D. Heading-up mini-map of the next ~200 m, turn-back countdown, oxygen margin, hazard ahead, assistant subtitles. Demo as a simulated visor web page over a real Curiosity image.
- **Four colours, everywhere (with icons):** green ✓ GO (high certainty), orange ! caution (moderate hazard or orbital/old evidence), red ✕ NO-GO (any hard limit broken), grey ? unknown (no data → send the scout). Certainty ladder: live sensor > rover ground truth (AI on Curiosity photos) > orbital > none. Newest, closest, most direct reading wins. Rules are plain code; the assistant only explains them.
- **Robotic scout:** drone (images) + small ground robot (contact: wheel slip = soft vs firm). In the demo, Curiosity's real data plays the scout, labelled "replayed"; one scripted live event turns a cell red and reroutes. Precedent: Ingenuity flew 72 flights, "an aerial scout for Perseverance scientists and rover drivers" (JPL); ended 25 Jan 2024 after Flight 72 over sand ripples its navigation struggled to track.
- **Oxygen** is part of GO/NO-GO: o2 minutes ≥ return time + reserve (values = assumptions, ask a mentor).
- **Assistant (LLM), screen + voice:** never decides; answers only from app data through tools (`where_am_i`, `cell_info`, `route_summary`, `sensor_readings`, `assumptions`, `source`); names source and data age; says "I don't know" when no data; warnings fire from rules, not the model. Test with 25 questions (5 unanswerable) before the freeze. Runs onboard on Mars (4–22 min delay); in the demo via a server function so the API key stays out of the browser. If Claude: `claude-opus-5-5` with tool use. LLM provider not yet confirmed (open decision).
- **AI4Mars sand/rock model stays the core** (edge over rival team ARES//NAV on the same site, per the team's Field Manual).
- **3D:** Plotly. three.js only if 2D, planner and Plotly all work by H24 (it would add a first-person walk with the HiRISE photo draped; label it "rendered").

## 3. Geology layer (current focus)

- **Why our own map:** the USGS-NASA map database (queried for 137.38°E, 4.80°S) lists only SIM 3292 (1:20M, 2014), I-1111 Aeolis quadrangle (1:5M, 1978), I-2397 (1:5M), I-1802B (1:15M), I-1083 (1:25M), I-2461 (1:30M). A 1:60K "Aeolis Mons" map by B. Thomson is **In Progress** (not released). At 1:20M the whole box is ~0.1 mm. Plan: draw our own ~1:5,000 map, anchored to sources; USGS SIM 3292 as zoomed-out context.
- **Legend (sources in brackets; hazard column = assumption):**
  - `LSu` Layered Sulfate unit: Curiosity left it on sol 4534 (Siebach et al., GSA 2025); in the north-east of the box.
  - `BXr` boxwork ridges, Altadena member of the Mirador formation: ridges up to ~5 m across with dark central lines (GSA 2025); phyllosilicate-rich (Seeger et al. 2026); boxwork extends 10–20 km (NASA PIA26306).
  - `BXh` boxwork hollows: 10–20 m, often sediment-filled (GSA 2025); contain siderite; orbital interpretation is weaker rock eroded by wind (Seeger et al. 2026).
  - `Aeo` sand/ripples (Hidden Valley lesson, sols 709–710); `Flt` boulder field (AI4Mars big rock = >30 cm tall, ≥50 cm wide).
  - **Removed claim:** "hollows 1–2 m deep" had no source; do not reuse it.
- **Ground-truth points (NASA MMGIS waypoints):** sol 4534 at 137.38644°E, 4.79762°S, −3,658 m (sulfate → boxwork contact); boxwork campaign sols ~4575–4752 around 137.379–137.382°E, 4.802–4.809°S (drilling near sol 4709); Curiosity on sol 5073 at 137.38889°E, 4.82602°S. 183 waypoints in the box, sols 4384–5073. Real Hidden Valley is around 137.383°E, 4.660°S (sols 702–711).
- **Reference lines inside the box:** from Persaud 2021 (Zenodo 5819267), `marker-bed_trace.shp` (marker bed, Milliken et al. 2010) and `p3.shp` (Package 3) reach ~0.9–1.05 km into the box's north-west corner. The readme says they were extrapolated from Sakarya Vallis: mark them *inferred*. CRS of those files: `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +R=3396190`.
- **Not covering the box:** the 4 Persaud CRISM GeoTIFFs (137.13–137.33°E, 5.00–5.18°S); NASA's boxwork image PSP_001752_1750 (137.24–137.36°E, stops ~200 m west).
- **Ridge layer idea:** topographic position index on the 1 m DTM (`relief = z − gaussian(z, σ≈12 px)`; threshold ±0.4 m is a starting guess, tune by eye).
- **Interpretation (drawing boundaries) is the user's job.** Claude may suggest and check screenshots.

## 4. Data on disk

`pipeline/00_download_geology_kit.py` (stdlib only; `--check`, `--tier core|detail|all`; resumes; retries while progress is made) downloaded **all 89 files, 3.5 GB** into `data/raw/geology/`, sizes verified. `DATA_SOURCES.md` and `data/raw/geology/manifest.json` list every file with source and URL.

- `hirise/`: DTM `DTEEC_019698_1750_019988_1750_U01.IMG` (1.0117 m/px, EQUIRECTANGULAR, centre lon 137.38, centre lat 0, R 3396.19 km, MISSING_CONSTANT 16#FF7FFFFB# ≈ −3.4028e38, valid −4,324.9 to −2,080.4 m; footprint covers the whole box); greyscale RED_C (1 m) and RED_A (25 cm); colour IRB_C (1 m) and IRB_A (25 cm), covering the box.
- `hirise_backup/`: DTM `DTEEC_009149_1750_009294_1750_U01.IMG` (east half of box) + RED_C.
- `hirise_boxwork_context/`: PSP_001752_1750 RED JP2 + LBL (outside the box).
- `rover/`: `MSL_waypoints.json`, `MSL_traverse.json`, `MSL_waypoints_current.json` (whole mission).
- `usgs_sim3292/`: readme, metadata, pamphlet, DMU with images, map PDF, `sim3292_database.zip`. On 15 Nov its shapefiles were extracted to `data/extracted/sim3292/` and clipped to `data/clean/context/sim3292_gale_context.gpkg` (see the README there). It is now in `qgis/mount_sharp_geology.qgz` as a zoomed-out context group: the study box sits in unit Htu, and Gale's floor is AHi. Also on 15 Nov, the HiRISE-frame groups (DRAFT geology v1, Terrain, raw HiRISE) were moved, unticked, into the group "SUPERSEDED – HiRISE frame, 44 m off the Gale frame". With both frames ticked, the draft appeared twice. The project's saved view now opens on the study box. Backups: `qgis/*.bak_before_sim3292` and `*.bak_before_superseded`.
- **Layer status (15 Nov, user decisions):** Layer 2 (`possible_output/qgis/layer2_elevation_POSSIBLE.qgz`), Layer 3 (`qgis/mount_sharp_geology.qgz`) and Layer 5 (`possible_output/layer5_poi/qgis/layer5_poi.qgz`) are APPROVED.
  - Layer 1 was rebuilt as `possible_output/layer1_basemap/`: the USGS 25 cm mosaic on its native grid, one file, replacing the nasa_data v2 strips.
  - Layer 4 was rebuilt as `possible_output/layer4_rover/`: rover data only (MMGIS plus PDS PLACES), no geology.
  - See `possible_output/METADATA.md` §F–G.
- `references/`: Sakarya Vallis shapefiles (Zenodo 5819267), Persaud CRISM GeoTIFFs + readme (Zenodo 5808381).
- **Not downloaded:** Fraeman et al. 2016 paper (site blocks automation; user saves PDF), Stack et al. traverse map (ResearchGate login), Thomson 1:60K (unreleased), Mars Trek MOLA/CTX (stream as WMTS), AI4Mars (load in Colab), Navcam photos for sols 4384–5073, REMS/RAD (check which sols exist in PDS), THEMIS.
- **Keep `data/raw/` and `nasa_data-master/.pylibs/` out of git.** No git repo exists in this folder yet.

## 5. The `nasa_data-master/` folder (added by the user, analysed 14 Nov)

A teammate's Python pipeline that reads the USGS **MSL Gale Merged Orthophoto Mosaic 25 cm v3** (Calef & Parker 2016; 50.4 GB uncompressed GeoTIFF on AWS S3; stripped, no overviews) over HTTP range requests, and extracts small windows. Contents: `src/` (10 modules, ~1,900 lines: URL inspection, Mars CRS checks, AOI intersection, windowed reads, reprojection, README/manifest generation, a Horn-slope module that refuses to run on non-elevation data), `data/processed/` (4 small 25 cm GeoTIFFs), `outputs/` (2 previews), `metadata/`, `manifest.json`, and `.pylibs/` (338 MB of bundled Windows Python packages: rasterio, pyproj, geopandas, shapely, numpy…).

**Verdict:**
- **Its "boxwork" and "hidden_valley" areas are placeholders, not the real places.** Its own files say so ("NOT an authoritative outline"). `aoi_boxwork` is a 256 m square centred at 137.444°E, 4.883°S, **5.8 km** from the real boxwork stops; `aoi_hidden_valley` is at 137.186°E, 4.695°S, **11.8 km** from the real Hidden Valley. Its extracted rasters and previews show neither feature: do not use them in the map, the pitch or the video.
- **Image data:** for our box it adds little. We already have HiRISE 25 cm and 1 m images aligned to our DTM. The mosaic's value is wide seamless coverage of all of Gale (137.09–137.85°E, 4.07–5.25°S) for a regional view, but each read is slow (full-width row bands, ~184 MB per 1,024 rows; our full box at 25 cm would be roughly 2 GB of transfer).
- **Useful parts:** the CRS handling (Mars 2000 sphere, IAU 49900; refuses Earth CRSs), the manifest/README pattern, the honest-limits style, and `.pylibs/` as a ready local install of rasterio/geopandas for our own pipeline scripts (set `PYTHONPATH` to it), instead of installing them again.
- **To make it truly useful:** change its AOI config to our real box (or the real Hidden Valley) and re-run, or simply skip it for the geology map. Its compute CRS (AEQD centred 5.4°S, 137.8°E) differs from our plan (DTM's own equirectangular grid for analysis, `+proj=longlat +R=3396190` for web); pick one per output and document it.

## 6. Tools and setup on this PC

- **QGIS** installed, with the **QGIS MCP** plugin (nkarasiak/qgis-mcp, community, GPL-2.0, QGIS 3.28–4.x). The QGIS server listens on 127.0.0.1:9876 (no auth by default; any local process can drive QGIS including `execute_code`: stop the server when not in use).
- **uv 0.13.8** installed via winget. The MCP server needs **Python ≥ 3.12** (`--python 3.12` in the registration); the user re-registered it and reports it working. Register command (PowerShell needs the quoted `'--'`):
  `claude mcp add -s user qgis '--' uvx --python 3.12 --from https://github.com/nkarasiak/qgis-mcp/archive/refs/heads/main.zip qgis-mcp-server`
- Python 3.14 is the default `python`; Git Bash and PowerShell both available. Claude Code's auto-mode classifier blocked edits to Claude's own MCP config: the user runs those commands.

## 7. Files and links

- Team plan (shareable artifact, private until shared): https://claude.ai/artifact/S1gGg9o1W4WErZWXMZQBtT ; local copy `research/Mount Sharp Team Plan.html` (sections A–O: brief mapping, 14 workstreams ≈ 117–149 person-hours for 5 people, workflow, roles P1–P5, geology, 3D/2D, four colours, displays, scout, assistant, data, cleaning, Claude vs you, decisions).
- Team research: `research/Martian Map Field Manual.html`, `research/Martian Map Mission Journal.html`, `research/Mission Journal_ Filled Example.html`, `research/Martian_Map_3D_Guide.pdf` (Plotly 3D recipe; same 4 colours; 300 × 300 grid; height ×3).
- Key sources: official challenge page and Resources tab (spaceappschallenge.org); USGS-NASA Mars map database (astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars); SIM 3292 (pubs.usgs.gov/publication/sim3292); Siebach et al. GSA 2025; Seeger et al. 2026 SEPM (authors.library.caltech.edu/records/6522c-90325); NASA PIA26306; JPL Ingenuity end-of-mission release; Martínez et al. 2014 (REMS ground temperature, thermal inertia); HiRISE PDS DTM index; NASA MMGIS waypoints.

## 8. Open decisions

1. Roles P1–P5 (suggested: user = P1 geo-data & geology; Malak = P2 ML lead, per the Journal).
2. Safety numbers for the four-colour rule: slope limits (foot/rover), oxygen reserve, live-data expiry, dose limit, 30 m ground-truth radius (ask a mentor → `ASSUMPTIONS.md`).
3. LLM provider and where it runs (recommended: Claude API via one Vercel/Netlify function).
4. Scout concept: drone, ground robot or both (recommended: both; Curiosity replays it in the demo).
5. Local event deadline, pitch length, video vs slides (ask the Local Lead).
6. AI-assistance disclosure rule in the participant terms.

## 9. Next steps

1. In QGIS (via the qgis MCP tools): create `qgis/mount_sharp_geology.qgz`; load DTM, RED_C, IRB_C, waypoints, traverse, `marker-bed_trace.shp`, `p3.shp` (inferred); project CRS = DTM CRS; add the box; clip DTM to `data/clean/geology/dtm_box.tif`; hillshade (315°, 30°) to `data/clean/geology/hillshade_box.tif`; highlight sol 4534 and sols 4575–4752; create `qgis/geology.gpkg` with empty `units` (unit_code, unit_name, source, hazard, science, confidence) and `contacts` (type, source) layers, snapping and avoid-overlap on, value map LSu/BXr/BXh/Aeo/Flt. **Do not draw boundaries.**
2. Ridge/hollow layer from the DTM (TPI).
3. User reads the sources and traces the `LSu`/`BX` contact first, through sol 4534; then the other units; sends screenshots for checking.
4. Add `.gitignore` (`data/raw/`, `nasa_data-master/.pylibs/`) when the GitHub repo is created.
5. Teammates: AI4Mars (Colab), Navcam for sols 4384–5073, REMS/RAD availability check; share the team plan artifact.
