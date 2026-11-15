# Team assumptions

Every threshold below is a choice made by our team for a walking astronaut. None of them is a NASA safety rule. Where a number is backed by a source, the source is named (full references in [`REFERENCES.md`](REFERENCES.md)). Change a value in the file named in the last column.

## What is real and what is simulated

| Thing | Type | Note |
|---|---|---|
| Ground at Curiosity stops (sand, rock, soil %) | real | our model on NASA Curiosity Navcam photos |
| AI certainty per stop | real | share of ground pixels where the model's top class is at least 60 % sure (`Ai_model`, certainty cell → `stops.json`) |
| Elevation and slope | real | USGS MSL Gale DEM 1 m (Layer 2) |
| Curiosity's path | real | NASA MMGIS waypoints |
| Astronaut walk | SIM | auto walk, or phone steps (see Helmet) |
| Suit oxygen use, air temperature, radiation in the helmet | SIM | ranges below |
| Drone / scout readings | SIM | terrain real (DEM); rocks and sand where there is no photo are our model |
| Scout "zap" sound | SIM | built from our AI result; idea from Perseverance SuperCam |

## Ground colour at a rover stop (AI terrain reading)

| Assumption | Value | Where |
|---|---|---|
| A pixel counts as sand when the model is at least this sure | 30 % (not 50 %: missing sand is worse than a false alarm) | `Ai_model/nasa_training.ipynb` |
| Image band read as "the ground in front of the rover" | 40 % to 85 % of image height | `Ai_model/nasa_training.ipynb` |
| RED (don't go) | sand > 30 % or big rock > 2 % | `Application/fg-app/src/lib/mission.js` |
| ORANGE (careful) | sand 10–30 % | `mission.js` |
| GREY (no data) | no Curiosity photo for that place | `mission.js`, `src/lib/grey.js` |
| A green stop turns orange when the AI certainty is below | 0.75 | `src/lib/safety.js` (`UNSURE`) |
| Certainty of one photo | share of ground-band pixels whose top class probability is ≥ 0.6; stop = mean of its photos | certainty cell (Colab) |
| Certainty when the model gives none | estimated from the distance to the 10 % / 30 % / 2 % lines | `safety.js` (`certaintyOf`) |
| AI result used for a clicked point only if a photo stop is within | 30 m (Navcam sees roughly 5–30 m ahead) | `src/lib/grey.js` (`NEAR_AI_M`), `src/lib/routes.js` |

## Slope (elevation layer)

| Assumption | Value | Where |
|---|---|---|
| Slope baseline | Horn 3×3 on the DEM averaged to 3 m (1 m is noisy) | `Map_layer/Layer2_Elevation/scripts/06_galeframe_layers.py` |
| GO / caution / NO-GO | < 15° / 15–25° / ≥ 25° | same script (`SLOPE_GO_MAX`, `SLOPE_NOGO_MIN`) |
| Reference frame | USGS MSL Gale DEM frame, because the rover heights match it to 0.08 m | `Map_layer/Layer2_Elevation/METADATA.md` §D |

## GIS GO/NO-GO map (`Map_layer/martian_map/`)

The GIS map uses the team values above as they are: the stop colours (sand > 30 % or big rock > 2 % red; sand 10–30 % or certainty < 0.75 orange), the 30 m AI radius, the 15 m red keep-out, the "Safest" route weights and the 30 min oxygen reserve. The numbers below are the extra choices it makes. The full table is in [`Map_layer/martian_map/docs/ASSUMPTIONS.md`](Map_layer/martian_map/docs/ASSUMPTIONS.md).

| Assumption | Value | Where |
|---|---|---|
| Analysis grid | 3 m (the Layer 2 slope grid) | `pipeline/40_gonogo_layers.py` |
| Slope, rover profile | caution 15°, NO-GO 30° (30° is Curiosity's onboard fault-protection limit, NASA/JPL) | `40_gonogo_layers.py` |
| Roughness (RMS of DEM minus a 5 m smooth, in 9 m) | GO ≤ 0.56 m (95 % of Curiosity's in-box drive); caution to 1.53 m (the roughest it drove); grey above; never red | `40_gonogo_layers.py` |
| Terrain units (Layer 3) | layered sulfate unit and boxwork ridges GO; boxwork hollows (often sediment-filled) and sand caution; unmapped neutral | `40_gonogo_layers.py` |
| Rover-proven ground | within 5 m of Curiosity's path, orbital red or grey becomes caution; a red stop is never lifted | `50_combined_routes.py` |
| Strictness check | Curiosity's own path must be ≤ 5 % red on the orbital data (result: 1.0 % on foot, 0.5 % rover) | `50_combined_routes.py` |
| Live gates for the whole map | radiation caution > 2×, NO-GO > 10× the 0.67 mSv/day baseline; career dose 80 % / 95 % of 600 mSv; dust τ 1 / 2; wind 10 / 20 m/s; O2 after the walk back caution < 60 min, NO-GO < 30 min; reading stale after 6 h | `pipeline/live_gates_rules.json` |
| 3D view height exaggeration | 2× by default (display only) | `web/viewer3d/index.html` |
| Points of interest on the 3D map | POIs closer than 25 m share one numbered pin (display only; four drill-site POIs lie within 6 m) | `pipeline/60_web_export.py` |

## Route planner (A → B options)

| Assumption | Value | Where |
|---|---|---|
| Planner grid | 2×2 slope pixels ≈ 6 m; the worst class of the 4 wins | `src/lib/routes.js` |
| Never crossed | slope ≥ 25°; 15 m around stops with sand > 30 % or big rock > 2 % | `routes.js` |
| Escape near A and B | within 20 m, blocked cells cost 50 instead (to step off) | `routes.js` |
| Curiosity's path counts as proven ground within | 12 m | `routes.js` |
| Cost of a step | distance × mean weight of the two cells | `routes.js` |
| Weights, Shortest | GO 1 · caution 1.6 · no slope data 1.5 · near 10–30 % AI sand 1.5 · on Curiosity's path 1 | `routes.js` (`PROFILES`) |
| Weights, Safest | GO 1 · caution 5 · no slope data 8 · near 10–30 % AI sand 6 · on Curiosity's path 0.6 | `routes.js` (`PROFILES`) |
| Science route | Safest weights, forced through one Curiosity stop (auto: 4 smallest straight-line detours tried) | `routes.js` |
| "Least risk" tag | lowest 3 × caution m + unknown-ground m + 4 × near-sand m | `routes.js` |
| Route sent to the helmet | one point every ~200 m | `routes.js` (`samplePts`) |

## Walk and oxygen (app)

| Assumption | Value | Where |
|---|---|---|
| Walking speed in a suit | 0.8 m/s | `src/lib/safety.js` (`SPEED`) |
| Way back is longer than a straight line by | 20 % | `safety.js` (`RETURN_FACTOR`) |
| Suit oxygen | 8 h (NASA ISS EMU: about 6.5–8 h) | `safety.js` (`O2_H`) |
| Oxygen reserve never planned into | 30 min (NASA ISS EVA planning) | `safety.js` (`RESERVE_MIN`) |
| Time worked at each stop | 15 min (not at path points) | `safety.js` (`STOP_MIN`) |
| EVA limit | 4 h | `src/components/Tablet.jsx` (`EVA_MIN`) |
| EVA start | 09:00 local Mars time | `safety.js` (`START_HOUR`) |
| Simulated air temperature | about −70 °C before dawn to a few °C above 0 in the afternoon (Curiosity REMS range) | `safety.js` (`envAt`) |
| Simulated radiation | about 0.67 mSv/day (Curiosity RAD, Hassler et al. 2014 — verify before quoting) | `safety.js` (`envAt`) |

## Helmet

| Assumption | Value | Where |
|---|---|---|
| Helmet walk simulation speed-up | × 20 | `src/components/Helmet.jsx` |
| Phone walk: one detected step on Mars | 0.7 m × 20 = 14 m (demo scale); time also × 20 | `Helmet.jsx` (`STEP_M`, `SCALE`) |
| Arrival at a point | within 15 m | `Helmet.jsx` (`ARRIVE_M`) |
| Warning before an orange / red point | within 60 m | `Helmet.jsx` (`NEAR_M`) |
| Warning near drone-flagged sand | within 25 m | `Helmet.jsx` |
| Mars–Earth radio delay in the mission-control demo | 20 or 60 s (real: about 3–22 min one way) | `src/components/Control.jsx` |

## Scout drone (simulation)

| Assumption | Value | Where |
|---|---|---|
| Hover height | 5 m above the orbital DEM | `Drone/Drone_Simulator.html` (`H_TARGET`) |
| Laser rangefinder | 50 Hz, noise σ 2 cm | `Drone_Simulator.html` |
| Obstacle | > 30 cm above the ground baseline (median over ±4 m) | `Drone_Simulator.html` (`classify`) |
| Slope classes | same as the elevation layer: 15° and 25° | `Drone_Simulator.html` (`classify`) |
| Safe touch-down | ground slope ≤ 15°, sideways speed ≤ 0.6 m/s | `Drone_Simulator.html` |
| Flights along the route | take-off at rover stops at most 90 m apart, scout up to 100 m and back | `Drone/sim/scripts/02_route_flights.py` |
| Synthetic rocks (the DEM cannot see them) | Poisson, 1 per 12 m; height gamma(2.2, 0.14) clipped to 0.15–0.7 m | `02_route_flights.py` |
| Synthetic sand ripples | 2.5 m wavelength, ±6 cm, placed in DEM hollows (at least 4 m long, at least 10 cm below the 20 m running median, slope < 8°) | `02_route_flights.py` |
| App drone scan (tablet): flies only where the ground is not known | no confident AI photo within 30 m | `src/lib/pathfind.js` |
| App drone scan: sand assumed in a hollow | cell > 1 m below the mean of ~40 m around it (DEM 120×120 grid) | `pathfind.js` (`droneScan`) |
| App drone sand cell weight in the planner | 8 | `pathfind.js` (`DRONE_SAND_W`) |

## Orbit vs ground check

| Assumption | Value | Where |
|---|---|---|
| "Orbit sand" in THEMIS Night IR 100 m | coldest 30 % of pixels around our stops | orbit check cell (Colab) |
