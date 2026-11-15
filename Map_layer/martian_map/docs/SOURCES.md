# Sources

Detailed per-layer source lists:
- `docs/history/L2_sources.json` (Layer 2)
- `layers/L5_poi/sources.json` (Layer 5)
- `pipeline/sources_gonogo.json` (GO/NO-GO)
- `pipeline/live_gates_rules.json` (live gates)
- `docs/history/DATA_SOURCES.md` and `docs/history/METADATA.md` (the full record from 13–15 Nov)

## Data used in the maps
| Data | Producer | Used in | Link |
|---|---|---|---|
| MSL Gale Merged Orthophoto Mosaic 25 cm v3 | Calef & Parker 2016, USGS Astrogeology / PDS Annex | L1, 3D photo texture | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif |
| MSL Gale DEM Mosaic 1 m v3 | Parker & Calef, USGS Astrogeology / PDS Annex | L2, 3D heightmap, slope, roughness | https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_DEM_Mosaic_1m_v3.tif |
| MOLA PEDR laser shots | MGS MOLA team, PDS Geosciences Node | L2 absolute-height check | see `docs/history/METADATA.md` |
| HRSC/MOLA blend 200 m, MOLA 463 m | USGS Astrogeology | L2 regional context | see `docs/history/L2_sources.json` |
| MSL traverse, waypoints, current position | NASA/JPL MMGIS | L4, ground truth, calibration | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/ |
| MSL PLACES localized_interp.csv | NASA PDS (MSL Localizations) | L4 (denser path to sol 4868) | https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/data_localizations/ |
| POIs (drill sites, contact, current position) | NASA/JPL news and blogs, MMGIS, IAU gazetteer | L5, routes | `layers/L5_poi/sources.json` |
| EVA stops with terrain fractions | Team AI (AI4Mars-style) on NASA Navcam raw images | L5, ground truth | https://github.com/malek-mejaouel/Depo_nasa/blob/main/Ai_model/results/stops_v2.json |
| Geologic Map of Mars, SIM 3292 | Tanaka et al. 2014, USGS | L3 context | NASA Space Apps resource list |
| Persaud 2021 marker bed / unit traces | Zenodo 5819267 | L3 reference | `layers/L3_geology/reference_persaud2021/` |

## Facts used for the rules
| Fact | Source |
|---|---|
| Curiosity is designed to withstand a 45° tilt; onboard fault protection prevents tilts over 30° | NASA/JPL MSL "Planetary mobility" page, archived 2009: https://webarchive.library.unt.edu/eot2008/20090512223236/http://mars.jpl.nasa.gov/msl/mission/technology/planetarymobility |
| Record tilt of 31° during a 2020 climb | NASA/JPL: https://www.jpl.nasa.gov/news/nasas-curiosity-mars-rover-takes-a-new-selfie-before-record-climb/ |
| Boxwork: ridges with dark central lines; hollows 10–20 m, often sediment-filled | Siebach et al., GSA Connects 2025: https://gsameetings.secure-platform.com/connects25/solicitations/103002/sessiongallery/schedule/items/95386/application/10634 |
| Boxwork campaign, drilling on ridge and in hollow | NASA: https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-mars-rover-starts-unpacking-boxwork-formations/ ; https://science.nasa.gov/blog/curiosity-blog-sols-4709-4715-drilling-high-and-low-in-the-boxwork-unit |
| Hidden Valley sand lesson (sols 709–710) | NASA: https://mars.nasa.gov/resources/6493/curiosity-tracks-in-hidden-valley-on-mars/ |
| Surface radiation: 0.67 mSv/day average GCR dose equivalent (Aug 2012 – Jun 2013) | SwRI on Hassler et al. 2014: https://www.swri.org/press-release/swri-scientists-publish-first-radiation-measurements-surface-mars |
| Absorbed dose 0.210 ± 0.040 mGy/day at Gale | Hassler et al. 2014, Science 343: https://ntrs.nasa.gov/citations/20180007641 |
| Career effective dose limit 600 mSv | NASA OCHMO technical brief (NASA-STD-3001 Vol. 1): https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf |
| Opportunity lost in the 2018 global dust storm | NASA: https://science.nasa.gov/mission/mer-opportunity/ |
| MEDA wind sensor damaged by saltating sand | EPSC-DPS 2025 abstract: https://meetingorganizer.copernicus.org/EPSC-DPS2025/EPSC-DPS2025-1461.html |

## Software
- three.js 0.160.0, loaded from cdn.jsdelivr.net.
- Python packages are pinned in `requirements.lock.txt`: rasterio, geopandas, scikit-image, scipy, pyproj, pillow.
- QGIS 4.2.3.
