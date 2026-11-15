# Team assumptions

Every threshold below is a choice made by our team for a walking astronaut. None of them is a NASA safety rule. Where a number is backed by a source, the source is named (full references in [`REFERENCES.md`](REFERENCES.md)). Change a value in the file named in the last column.

## Ground colour at a rover stop (AI terrain reading)

| Assumption | Value | Where |
|---|---|---|
| A pixel counts as sand when the model is at least this sure | 30 % (not 50 %: missing sand is worse than a false alarm) | `Ai_model/nasa_training.ipynb` |
| Image band read as "the ground in front of the rover" | 40 % to 85 % of image height | `Ai_model/nasa_training.ipynb` |
| RED (don't go) | sand > 30 % or big rock > 2 % | `Application/fg-app/src/lib/mission.js` |
| ORANGE (careful) | sand 10–30 % | `mission.js` |
| GREY (no data) | no Curiosity photo for that place | `mission.js`, `src/lib/grey.js` |
| A green stop turns orange when the AI certainty is below | 0.75 | `src/lib/safety.js` (`UNSURE`) |
| Certainty when the model gives none | estimated from the distance to the 10 % / 30 % / 2 % lines | `safety.js` (`certaintyOf`) |

## Slope (elevation layer)

| Assumption | Value | Where |
|---|---|---|
| Slope baseline | Horn 3×3 on the DEM averaged to 3 m (1 m is noisy) | `Map_layer/Layer2_Elevation/scripts/06_galeframe_layers.py` |
| GO / caution / NO-GO | < 15° / 15–25° / ≥ 25° | same script (`SLOPE_GO_MAX`, `SLOPE_NOGO_MIN`) |
| Reference frame | USGS MSL Gale DEM frame, because the rover heights match it to 0.08 m | `Map_layer/Layer2_Elevation/METADATA.md` §D |

## Walk and oxygen (app)

| Assumption | Value | Where |
|---|---|---|
| Walking speed in a suit | 0.8 m/s | `src/lib/safety.js` (`SPEED`) |
| Way back is longer than a straight line by | 20 % | `safety.js` (`RETURN_FACTOR`) |
| Suit oxygen | 8 h (NASA ISS EMU: about 6.5–8 h) | `safety.js` (`O2_H`) |
| Oxygen reserve never planned into | 30 min (NASA ISS EVA planning) | `safety.js` (`RESERVE_MIN`) |
| Time worked at each stop | 15 min | `safety.js` (`STOP_MIN`) |
| EVA start | 09:00 local Mars time | `safety.js` (`START_HOUR`) |
| Helmet walk simulation speed-up | × 20 | `src/components/Helmet.jsx` |

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
