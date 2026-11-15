# Use of Super Intelligence (SI) / AI tools

The 2026 NASA Space Apps Project Submission Guide asks every team to "clearly indicate where and how SI tools were utilized" in the project. For code and data, it asks teams to acknowledge SI use "in descriptive text and metadata". For images and videos, it asks for a visible watermark. Generated content must not use NASA branding.
(Source: https://www.spaceappschallenge.org/resources/project-submission-guide/, "Use of Super Intelligence (SI)", read 15 Nov 2026.)

This file is that statement for the whole repository. The machine-readable version is [`ai_use.json`](ai_use.json).

## 1. The idea came from the team

The team chose the challenge, the site (the Mount Sharp boxwork in Gale crater), and the idea: a GO/NO-GO walking map for an astronaut, combining the AI ground reading, elevation and slope, and a scout drone. The tablet + helmet app, the phone portal and the route guide were also team requests. SI tools were used to build and check these ideas, not to come up with them.

## 2. Machine learning that is part of the product

| What | Where | How |
|---|---|---|
| Terrain segmentation model (DeepLabV3+ with ResNet-50 encoder) | [`Ai_model/`](Ai_model/) | Trained by the team on the AI4Mars dataset, then run on NASA Curiosity Navcam images of the boxwork stops. Metrics and per-stop results are the team's own runs: [`Ai_model/AI_WRITEUP.md`](Ai_model/AI_WRITEUP.md). |
| Drone sand detector (gradient boosting, scikit-learn) | [`Drone/`](Drone/) | Part of the simulated scout drone; decides sand vs clear ground. Trained and compared by the team (logistic regression, random forest, gradient boosting). See [`Drone/README.md`](Drone/README.md). |

These are tools the team built and trained. They are not generative AI.

## 3. Generative AI (large language model) assistance

**Tool:** Claude (Anthropic), used as a coding and writing assistant (Claude Code).

| Part of the repository | How SI was used | People checked it by |
|---|---|---|
| `Map_layer/martian_map/`: the pipeline scripts, QGIS project, GO/NO-GO layers, 3D viewer (`web/viewer3d`), layer animation (`web/explode`), sections, astronaut walk view (`web/walk`), phone portal (`web/walk/portal.js`), route guide | Code written with SI assistance, following the team's instructions and data | Running every script on the real data; checks against NASA and USGS values (for example, rover heights against the USGS DEM to 0.08 m); in-browser tests |
| `Application/`: integration of the 3D map, the phone portal, the HTTPS server, the A/B route labels | Code written with SI assistance | Tests on a laptop and on an Android phone (Chrome, WebXR) |
| `Ai_model/nasa_training.ipynb`, `Drone/` simulator, React app | SI helped with code (as stated in the main README) | The team's own training runs and simulations |
| Documentation (`README.md` files, `REFERENCES.md`, `ASSUMPTIONS.md`, `DEVELOPMENT_LOG_2026-11-15.md`, this file, `CREDITS.md`, `docs/`) | Drafted with SI assistance from the team's work and sources | Every number traced to a NASA, USGS, ESA or published source, or labelled as a team ASSUMPTION |

Every number in this repository comes from the team's own runs or from a cited source. Numbers the team chose, rather than measured, are labelled ASSUMPTION ([`ASSUMPTIONS.md`](ASSUMPTIONS.md)).

## 4. Images, video and audio

- **No image, video or audio in this repository was made by an image, video or voice generation model.**
- **Real data:** pictures of Mars are NASA, USGS and ESA data, or renders of that data by the team's code. Examples are the 3D map, the hillshade and the walk view. Credits are in [`CREDITS.md`](CREDITS.md).
- **Simulated detail:** the walk view adds rocks, pebbles and sand ripples that are not in the data. They come from the team's simulation rules, and the page labels them on screen as "Simulated".
- **No NASA branding:** no NASA logos, insignia, flags or mission identifiers are used or modified.
- **Demo video:** if it uses any SI-generated image, video or voice, those parts need a visible "SI-generated" watermark, or a text and metadata note for audio, as the Space Apps guide asks.

## 5. NASA data in SI work

Following NASA's guidelines for SI applications (https://www.nasa.gov/nasa-brand-center/images-and-media/):
- NASA is credited as the source of its data, but not as the source of anything an SI tool wrote.
- No NASA review or endorsement is implied.
- The in-app assistant (the helmet's 🤖 Ask button) is rule-based, not a language model. It answers only from the mission data on screen (`Application/fg-app/src/lib/assistant.js`), and its answers are the product's, not NASA's.
