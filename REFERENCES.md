# References

Grouped by the part of the project that uses them. Datasets give the URL we downloaded from; papers give the journal reference. Entries marked † were cited from a data label or a secondary source and not yet checked against the publisher's page.

## Challenge

- NASA Space Apps Challenge 2026, "Interplanetary Survival Guide: Martian Map", challenge page and Resources tab. https://www.spaceappschallenge.org/

## Rover data (used by all parts)

- **Curiosity waypoints and traverse**, NASA/JPL MMGIS. https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json (also `MSL_traverse.json`, `MSL_waypoints_current.json`)
- **Curiosity raw Navcam images**, sols 4534–4805, NASA/JPL-Caltech. https://mars.nasa.gov/msl/multimedia/raw-images/
- **Curiosity's proposed path up Mount Sharp**, NASA. https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/
- **Boxwork context**: NASA/JPL-Caltech PIA26306 (boxwork extent); Siebach et al., GSA 2025 abstract† (sulfate to boxwork transition near sol 4534); Seeger et al. 2026, SEPM† (boxwork phyllosilicates and siderite).

## AI terrain reading (`Ai_model/`)

- **AI4Mars dataset**: Swan, R. M., et al. (2021). AI4Mars: A dataset for terrain-aware autonomous driving on Mars. *CVPR Workshops 2021*. Copy used: https://huggingface.co/datasets/hassanjbara/AI4MARS
- **DeepLabV3+**: Chen, L.-C., Zhu, Y., Papandreou, G., Schroff, F., & Adam, H. (2018). Encoder-decoder with atrous separable convolution for semantic image segmentation. *ECCV 2018*.
- **ResNet-50 encoder**: He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image recognition. *CVPR 2016*.
- **segmentation-models-pytorch** (library). https://github.com/qubvel-org/segmentation_models.pytorch
- **THEMIS Night IR 100 m mosaic**, NASA Mars Odyssey / Arizona State University. Used for the orbit vs ground check (`Ai_model/themis_vs_ai.png`).
- **Perseverance raw images**, NASA/JPL-Caltech. https://mars.nasa.gov/mars2020/multimedia/raw-images/ (generalisation test only)

## Elevation and slope (`Map_layer/Layer2_Elevation/`)

Download URLs, byte ranges and MD5 sums are in `Map_layer/Layer2_Elevation/raw/fetch_log.json`.

- **USGS MSL Gale Merged DEM Mosaic 1 m v3**: Parker, T., & Calef, F. J. (2016). USGS Astrogeology, PDS Annex†. https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_DEM_Mosaic_1m_v3.tif
- **USGS MSL Gale Merged Orthophoto Mosaic 25 cm v3**: Calef, F. J., & Parker, T. (2016). USGS Astrogeology, PDS Annex†. https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif
- **Mars MGS MOLA – MEX HRSC Blended DEM Global 200 m v2**: Fergason, R. L., Hare, T. M., & Laura, J. (2018). USGS Astrogeology†. https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif
- **MGS MOLA global DEM 463 m** (USGS mosaic of MOLA MEGDR). https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif
- **MOLA PEDR laser shots**, PDS Geosciences Node, Orbital Data Explorer REST query. https://oderest.rsl.wustl.edu/
- **MOLA and the Mars 2000 areoid**: Smith, D. E., et al. (2001). Mars Orbiter Laser Altimeter: Experiment summary after the first year of global mapping of Mars. *Journal of Geophysical Research*, 106(E10), 23689–23722. https://doi.org/10.1029/2000JE001364
- **HiRISE camera**: McEwen, A. S., et al. (2007). Mars Reconnaissance Orbiter's High Resolution Imaging Science Experiment (HiRISE). *Journal of Geophysical Research*, 112, E05S02. https://doi.org/10.1029/2005JE002605
- **HiRISE DTMs**: Kirk, R. L., et al. (2008). Ultrahigh resolution topographic mapping of Mars with MRO HiRISE stereo images. *Journal of Geophysical Research*, 113, E00A24. https://doi.org/10.1029/2007JE003000
- **HiRISE DTM and orthoimages** DTEEC_019698_1750_019988_1750_U01 and ESP_019698_1750 RED_C, MRO HiRISE (NASA/JPL/University of Arizona). https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_019600_019699/ESP_019698_1750_ESP_019988_1750/
- **Geologic context**: Tanaka, K. L., et al. (2014). Geologic map of Mars. USGS Scientific Investigations Map 3292. https://doi.org/10.3133/sim3292
- **Mars Trek**, NASA. https://trek.nasa.gov/mars/ (viewer, not used as data)

## Application (`Application/`)

- **SuperCam** (idea behind the simulated "zap and listen" scout): Maurice, S., et al. (2021). The SuperCam instrument suite on the Mars 2020 rover. *Space Science Reviews*, 217, 47. https://doi.org/10.1007/s11214-021-00807-w
- **Sound on Mars**: Maurice, S., et al. (2022). In situ recording of Mars soundscape. *Nature*, 605, 653–658. https://doi.org/10.1038/s41586-022-04679-0
- **Surface radiation (simulated helmet sensor range)**: Hassler, D. M., et al. (2014). Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover. *Science*, 343(6169), 1244797. https://doi.org/10.1126/science.1244797
- **Air temperature (simulated helmet sensor range)**: Gómez-Elvira, J., et al. (2012). REMS: The environmental sensor suite for the Mars Science Laboratory rover. *Space Science Reviews*, 170, 583–640. https://doi.org/10.1007/s11214-012-9921-1
- **Suit oxygen and EVA reserve**: NASA ISS Extravehicular Mobility Unit (EMU) planning values† (about 6.5–8 h of oxygen, 30 min reserve).
- **Libraries**: React, Vite, qrcode-generator (MIT licence).

## Scout drone (`Drone/`)

- **Ingenuity flight 72 accident investigation**, JPL news. https://www.jpl.nasa.gov/news/nasa-performs-first-aircraft-accident-investigation-on-another-world/
- **Ingenuity flight 34 software update** (elevation map, hazard-avoiding landing), NASA Science. https://science.nasa.gov/missions/mars-2020-perseverance/ingenuity-helicopter/flight-34-was-short-but-significant/
- **Ingenuity flight 9 scouting the Séítah dunes**, JPL news. https://www.jpl.nasa.gov/news/nasas-mars-helicopter-reveals-intriguing-terrain-for-rover-team/
- **When should Ingenuity fly** (battery, wind, temperature), NASA Science blog. https://science.nasa.gov/blog/when-should-ingenuity-fly/
- **Wind testing**, NASA Science blog "The Right Stuff". https://science.nasa.gov/missions/mars-2020-perseverance/ingenuity-helicopter/the-right-stuff/
- **Ingenuity laser altimeter** (Garmin LIDAR-Lite v3). https://www.garmin.com/en-US/blog/general/garmin-on-mars/
- **Ingenuity navigation and state estimation**: The Robot Report, https://www.therobotreport.com/ingenuity-helicopter-state-estimation-localization/ ; Inside Unmanned Systems, https://insideunmannedsystems.com/jpl-autonomously-alone-on-the-red-planet/
- **Flight durations** (169.5 s record): List of Ingenuity flights, Wikipedia. https://en.wikipedia.org/wiki/List_of_Ingenuity_flights
- **Mars Science Helicopter study**: arXiv:2203.03704. https://arxiv.org/abs/2203.03704
- **RIMFAX ground-penetrating radar**, NASA Science. https://science.nasa.gov/missions/mars-2020-perseverance/searching-for-buried-treasure-on-mars-with-rimfax/
- **Thermal inertia and sand slip**: Cunningham, C., Nesnas, I., & Whittaker, W. (2017). Improving slip prediction on Mars using thermal inertia measurements. *Robotics: Science and Systems XIII*. https://roboticsproceedings.org/rss13/p38.html ; journal version in *Autonomous Robots*. https://doi.org/10.1007/s10514-018-9796-4
- **Terrain**: the drone flies over the USGS MSL Gale 1 m DEM above, read from `Map_layer/Layer2_Elevation/exports/web/elevation_box_1m_lonlat.tif`.
- **Machine learning**: Pedregosa, F., et al. (2011). Scikit-learn: Machine learning in Python. *Journal of Machine Learning Research*, 12, 2825–2830.

## Image credits

Curiosity and Perseverance images: NASA/JPL-Caltech. HiRISE: NASA/JPL/University of Arizona. THEMIS: NASA/JPL/Arizona State University. Elevation mosaics: USGS Astrogeology Science Center.
