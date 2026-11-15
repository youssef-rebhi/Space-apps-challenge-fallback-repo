# Credits

Who made the data, images and software this project is built on. Full references, with download URLs and papers, are in [`REFERENCES.md`](REFERENCES.md). How AI tools were used is in [`AI_USE.md`](AI_USE.md).

## NASA content and branding

- NASA images and data are used for educational and informational purposes, as NASA's media guidelines allow. NASA is credited as the source, and nothing here implies NASA endorsement. (https://www.nasa.gov/nasa-brand-center/images-and-media/)
- **No NASA logos are used:** no NASA Insignia ("meatball"), Logotype ("worm"), seal, flags or mission identifiers appear anywhere in the project.
- **Project names:** "Marsouine" and "team y3m" are the team's own names. This is a NASA Space Apps Challenge 2026 entry, not a NASA product.

## Image and data credit lines

Use these exact lines wherever the pictures appear (app, slides, demo video).

| What | Credit line | Where it is used |
|---|---|---|
| Curiosity Navcam raw images (sols 4534–4805) | NASA/JPL-Caltech | AI terrain reading, app photos, AI overlays |
| Mastcam panorama PIA26693 "Curiosity Surveys the Boxwork Region" | NASA/JPL-Caltech/MSSS | walk-view ground and sky colours |
| Map of Lower Mount Sharp, PIA18781 | NASA/JPL-Caltech/Univ. of Arizona | geology context (`Map_layer/martian_map/docs/research/`) |
| HiRISE images and DTM (ESP_019698_1750, ESP_019988_1750) | NASA/JPL/University of Arizona | 3D terrain, geology layer, checks |
| THEMIS Night IR mosaic | NASA/JPL/Arizona State University | orbit vs ground check (`Ai_model/themis_vs_ai.png`) |
| Perseverance raw images | NASA/JPL-Caltech | AI generalisation test only |
| Curiosity traverse, waypoints, MSL PLACES localisations | NASA/JPL-Caltech (MMGIS, PDS) | rover layer, routes |
| USGS MSL Gale DEM 1 m and orthophoto 25 cm | USGS Astrogeology Science Center (Parker & Calef 2016; Calef & Parker 2016) | elevation, slope, base map, 3D terrain |
| MOLA global DEM, MOLA PEDR | NASA/GSFC MOLA Science Team; USGS Astrogeology (mosaic); PDS Geosciences Node | regional elevation, height checks |
| HRSC + MOLA blended DEM 200 m v2 | USGS Astrogeology (Fergason, Hare & Laura 2018), from ESA Mars Express HRSC and NASA MGS MOLA data | Gale crater view, walk-view horizon |
| Planetary nomenclature | IAU / USGS Gazetteer of Planetary Nomenclature | place names |
| Mars24 sun algorithm | NASA GISS (Allison 1997; Allison & McEwen 2000) | sun position in the walk view |

## Space Agency Partner data

ESA (European Space Agency) is a 2026 Space Apps Space Agency Partner. The HRSC + MOLA blended elevation model the project uses is built partly from **ESA Mars Express HRSC** stereo data. It's used for the regional Gale crater elevation and the far horizon of the walk view. (Fergason, Hare & Laura 2018, USGS Astrogeology; see [`REFERENCES.md`](REFERENCES.md).)

## Datasets and research

- **AI4Mars** terrain dataset: Swan, R. M., et al. (2021), *CVPR Workshops*. It's used to train the team's terrain model.
- **Scientific papers, NASA news and blog posts:** the boxwork science, rover limits, radiation, temperature, Ingenuity and SuperCam facts. All are listed with links in [`REFERENCES.md`](REFERENCES.md).

## Software

Versions and licences were read from the project's own files: `Application/fg-app/node_modules/*/package.json`, `Map_layer/martian_map/web/vendor/three/LICENSE` and `Map_layer/martian_map/requirements.lock.txt`.

| Software | Version | Licence | Used for |
|---|---|---|---|
| React, React DOM | 18.3.1 | MIT | tablet and helmet app |
| Leaflet | 1.9.4 | BSD-2-Clause | 2D maps in the app |
| qrcode-generator | 1.5.2 | MIT | tablet → helmet pairing QR code |
| esbuild | 0.21.5 | MIT | app build (`Application/fg-app/build.js`) |
| Vite, @vitejs/plugin-react | 5.4.21, 4.7.0 | MIT | app development server |
| three.js | r160 (0.160.0) | MIT | 3D viewer, layer animation, walk view, phone portal (copy in `Map_layer/martian_map/web/vendor/three/`) |
| QGIS | 4.2.3 | GPL | GIS project, layer checks |
| Blender | 5.3.0 | GPL | simulated rocks and close-up texture of the walk view (`pipeline/81_blender_detail.py`; the rock shapes are made by that script) |
| Python libraries | pinned in `Map_layer/martian_map/requirements.lock.txt` | each library's own licence | rasterio, geopandas, pyogrio, shapely, pyproj, NumPy, SciPy, scikit-image, Pillow, pandas |
| PyTorch, segmentation-models-pytorch | as in `Ai_model/nasa_training.ipynb` | each library's own licence | terrain model training (Google Colab) |
| scikit-learn | as in `Drone/sim/` | BSD-3-Clause | drone sand detector |
| GDAL | via rasterio / QGIS | MIT | raster reading and reprojection |

## Team

Team y3m, NASA Space Apps Challenge 2026, challenge "Interplanetary Survival Guide: Martian Map".
Team members: *to be completed by the team (full names as on the Space Apps team page).*
