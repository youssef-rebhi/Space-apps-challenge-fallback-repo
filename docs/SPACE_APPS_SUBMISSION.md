# Space Apps 2026 project page: text for each field

Draft text for the fields of the Space Apps project page, in the order of the 2026 Project Submission Guide (https://www.spaceappschallenge.org/resources/project-submission-guide/). Every number below comes from this repository; follow the links to check it. The team should review every field before pasting.

**Before submitting, check these:**
- [ ] **Links are public.** The repository link and the demo link must open **without a login**. Right now, both GitHub repositories return "not found" to visitors who are not signed in, so they are private.
- [ ] **Demo length.** The demo is a video of **30 seconds or less**, or a deck of **7 slides or fewer**. It must be in English, or have English subtitles.
- [ ] **No minors.** No images, video or audio of anyone under 18.
- [ ] **AI-made media.** Any SI-generated image or video in the demo carries a visible watermark ([`AI_USE.md`](../AI_USE.md)).
- [ ] **No NASA logos** in the demo or on the project page ([`CREDITS.md`](../CREDITS.md)).
- [ ] **Submit for Judging** is pressed before Sunday 15 November 2026, 11:59 p.m., local time of the Local Event.

---

## Project Name

Marsouine: a GO/NO-GO walking map for astronauts on Mars

## High-Level Project Summary

Marsouine is a map for an astronaut walking on Mars. Stop by stop, it tells them whether the ground ahead is firm, sandy or too steep, and how sure we are. We built it for the boxwork region of Mount Sharp in Gale crater, along the route NASA's Curiosity rover drove between sols 4534 and 4805.

The map combines three readings of the same ground:
- our own AI, reading Curiosity's Navcam photos;
- a 1 m elevation and slope model from USGS;
- a simulated scout drone for the ground between photos.

From these it builds a GO / CAUTION / NO-GO map in 2D and 3D. A tablet plans the walk from A to B, and the astronaut's phone becomes a portal into the 3D terrain: walking in the room moves them on Mars, along a green route guide drawn on the ground. It matters because the first crews on Mars will walk where no rover has driven, and they need to know before each step whether the ground will hold.

## Link to Project Demo

*(public link to the 30-second video or 7-slide deck)*

## Link to Final Project

*(public link to the repository)*

## Detailed Project Description

**What it does**
- **AI terrain reading** ([`Ai_model/`](../Ai_model/)): a DeepLabV3+ model we trained on the AI4Mars dataset reads Curiosity's Navcam photos at 55 boxwork stops. It finds sand, soil, bedrock and big rocks.
  - Sand IoU 0.966 and mean IoU 0.821 on the AI4Mars expert test set.
  - 50 stops green, 4 orange, 1 red.
- **Elevation and slope** ([`Map_layer/Layer2_Elevation/`](../Map_layer/Layer2_Elevation/)): the USGS MSL Gale 1 m DEM, in the rover's own frame.
  - Rover heights match it to 0.08 m at 183 waypoints.
  - Slope classes: GO under 15°, caution 15–25°, NO-GO 25° or more (team assumptions).
- **GIS map and GO/NO-GO** ([`Map_layer/martian_map/`](../Map_layer/martian_map/)): five map layers, one GO/NO-GO layer per input, and a combined map.
  - The box, for a crew on foot: 55.7 % GO, 27.3 % caution, 16.6 % NO-GO.
  - Curiosity's own path is only 1.0 % NO-GO, so the limits are not too strict.
  - 5 routes between the stops, none crossing NO-GO.
  - A 3D viewer, a layer-by-layer animation, and an astronaut's-eye walk view in NASA's own Mastcam colours.
- **Scout drone, simulated** ([`Drone/`](../Drone/)): a laser-ranging drone flies ahead over the real terrain.
  - Height error 4.4 cm on the real route.
  - 95 % safe landings over 40 seeds.
- **Tablet + helmet app and phone portal** ([`Application/`](../Application/)):
  - The tablet plans A → B routes on the 2D or 3D map and pairs the helmet phone with a QR code.
  - The phone shows the helmet view, then opens a portal into the 3D terrain, with WebXR AR or compass + step counting. The astronaut starts at A, green chevrons on the ground lead to B, and the tablet follows the astronaut live.

**How it works:** NASA, USGS and ESA data go through Python and QGIS pipelines into GeoTIFF layers and web textures. The app is React; the 3D views use three.js; a small Python server links the tablet and the phone. Every threshold the team chose is listed in [`ASSUMPTIONS.md`](../ASSUMPTIONS.md).

**Benefits:**
- Each GO/NO-GO decision can be traced to its source layer.
- It says how sure it is, and marks what is real and what is simulated.
- It runs on one laptop and a phone, with no internet.

**What we hope to achieve:** a planning and walking aid that crews and mission planners could use with the orbital and rover data that already exist.

**Tools:**
- Python (rasterio, geopandas, SciPy, scikit-image, scikit-learn), QGIS, Blender.
- PyTorch with segmentation-models-pytorch (Google Colab).
- React, Leaflet, three.js, esbuild, WebXR.
- Full list with licences in [`CREDITS.md`](../CREDITS.md).

**Honest limits:**
- The thresholds are team assumptions, not NASA rules.
- The AI was trained on rover images.
- The drone and the helmet sensors are simulations.
- Absolute heights carry about ±15 m between products.

## Use of Super Intelligence (SI)

Yes.
- **Our own models:** the terrain model (DeepLabV3+) and the drone's sand detector (scikit-learn) are machine learning that we built and trained ourselves.
- **Claude (Anthropic):** a coding and writing assistant. It helped write code (map pipeline, 3D viewers, walk view, phone portal, app integration), check results and draft documentation.
- **The idea:** the idea, the choice of site and data, and all decisions were the team's.
- **Media:** no image, video or audio was made by a generation model.

Where and how, part by part: [`AI_USE.md`](../AI_USE.md) and [`ai_use.json`](../ai_use.json).

## NASA Data

- **Curiosity Navcam raw images**, sols 4534–4805 (NASA/JPL-Caltech): read by our AI at 55 stops.
- **Curiosity traverse, waypoints and current position** (NASA/JPL MMGIS) and **MSL PLACES localisations** (NASA PDS): rover layer, routes, stop positions.
- **Mastcam panorama PIA26693** (NASA/JPL-Caltech/MSSS): the true colours of the ground and sky in the walk view.
- **HiRISE images and DTM** (NASA/JPL/University of Arizona, MRO): 3D terrain, geology layer, checks.
- **MOLA** global DEM and laser shots (NASA MGS, PDS Geosciences Node): regional elevation and height checks.
- **THEMIS Night IR** (NASA Mars Odyssey/ASU): orbit vs ground check of the AI.
- **Map of Lower Mount Sharp, PIA18781**: geology context.
- **Mars24 sun algorithm** (NASA GISS): sun position in the walk view.
- **NASA facts behind the rules:** rover tilt limits, surface radiation, the Hidden Valley sand lesson, the boxwork campaign, and Ingenuity's flights for the drone.

## Space Agency Partner Data and Other References

- **ESA Mars Express HRSC**, in the USGS HRSC + MOLA blended DEM 200 m v2 (Fergason, Hare & Laura 2018): Gale crater elevation and the walk-view horizon.
- **USGS Astrogeology:** MSL Gale DEM 1 m and orthophoto 25 cm; the IAU planetary nomenclature.
- **AI4Mars** dataset (Swan et al. 2021).
- **Papers:** DeepLabV3+, ResNet, HiRISE, MOLA, REMS, RAD, SuperCam and others.
- **Software:** React, Leaflet, three.js, qrcode-generator, esbuild, Vite, QGIS, Blender, and the Python libraries. Licences are in [`CREDITS.md`](../CREDITS.md).
- **Complete list with URLs:** [`REFERENCES.md`](../REFERENCES.md).
