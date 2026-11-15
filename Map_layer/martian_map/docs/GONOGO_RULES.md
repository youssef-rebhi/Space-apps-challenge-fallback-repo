# GO / NO-GO rules

The machine-readable copy is `gonogo/gonogo_rules.json`, written by `pipeline/40_gonogo_layers.py`. The same text is in each GeoTIFF's tags and in `web/layers.json`.

- **Grid:** 3 m cells in the USGS Gale frame, 790 × 988 cells. 3 m is about Curiosity's length and a few walking steps.
- **Class codes:** `0 UNKNOWN` grey · `1 GO` green · `2 CAUTION` yellow · `3 NO-GO` red.
- **What red means:** a hard limit, either sourced or a labelled ASSUMPTION. "Hard", "rough" or "unproven" ground is never red. It is yellow (costly but passable) or grey (scout first).

## Conversion layers (one per input)
| Layer | Parameter | GO | CAUTION | NO-GO | UNKNOWN | Basis |
|---|---|---|---|---|---|---|
| Slope, crew on foot | slope °, 3 m Horn (Layer 2) | < 15° | 15–25° | ≥ 25° | no DEM | Team-approved ASSUMPTION; calibrated on Curiosity's path |
| Slope, rover | same | < 15° | 15–30° | ≥ 30° | no DEM | 30° = Curiosity's onboard fault-protection tilt limit (NASA/JPL); 15° = team |
| Roughness | RMS relief, m: DEM minus 5 m Gaussian, 9 m window | ≤ 0.56 m | 0.56–1.53 m | never | > 1.53 m | Calibrated: GO is smoother than 95% of Curiosity's in-box drive; 1.53 m is the roughest ground it drove |
| Terrain units | Layer 3 unit | LSu, BXr | BXh (sediment-filled hollows), Aeo (sand) | none | not mapped (78%), neutral in the combined map | Unit hazard notes; NASA boxwork blogs; Hidden Valley |
| Ground truth | Curiosity's path ± 5 m; team AI stop colour within 30 m of each EVA stop | driven, or a GREEN stop | an ORANGE stop (sand 10–30%, or AI certainty < 0.75); a RED stop 15–30 m away | within 15 m of a RED stop (sand > 30% or big rock > 2%) | no ground truth | Team values (repo `ASSUMPTIONS.md`); the 5 m corridor is our ASSUMPTION. Today: 49 green, 5 orange, 1 red (stop 13, sol 4580). |
| Certainty | how the colour is known | 3 driven · 2 seen · 1 orbital · 0 none | | | | Team ladder: live > rover ground truth > orbital > none |

## Combined map
1. **Orbital class:** each cell takes the **worst** class of slope (by profile), roughness and terrain unit (where mapped). The order is GO < CAUTION < UNKNOWN < NO-GO.
2. **Rover-proven ground:** within 5 m of Curiosity's path, an orbital NO-GO or UNKNOWN becomes CAUTION. It was driven, so it is passable, but the orbital data say take care.
3. **EVA-stop hazards:** orange stops make their 30 m zone CAUTION, and red stops make their 15 m zone NO-GO. A red stop is ground truth itself, so step 2 never lifts it.
4. **Strictness check:** if Curiosity's own path were more than 5% NO-GO on the orbital class (step 1), the limits would be too strict and must be relaxed. Result: 1.0% (foot) and 0.5% (rover), so the limits pass. On the final map the path is 0.7% NO-GO, which is exactly the red stop's keep-out.

The strictness knob below shows how the box changes with the NO-GO slope limit (crew on foot, CAUTION from 15°). It is in `combined_report.json` → `strictness_table`.

| NO-GO at | Box GO | Box CAUTION | Box NO-GO | Curiosity path NO-GO |
|---|---|---|---|---|
| ≥ 20° | 55.7% | 18.1% | 25.7% | 1.6% |
| ≥ 25° (crew on foot, used) | 55.7% | 27.3% | 16.6% | 1.0% |
| ≥ 30° (rover, used) | 55.7% | 33.9% | 9.9% | 0.5% |
| ≥ 35° | 55.7% | 38.6% | 5.2% | 0.2% |

The green share stays at 55.7% because GO is fixed by the 15° CAUTION start and by roughness. The knob only moves ground between yellow and red. Path shares are on the orbital class.

## Routes
- **Method:** least-cost path, 8-connected, in true ground metres, using `skimage.graph.MCP_Geometric`.
- **Cost:** the team app's **"Safest"** weights (repo `ASSUMPTIONS.md`, `routes.js` PROFILES): GO 1, CAUTION 5, UNKNOWN 8, NO-GO never crossed, × 0.6 on Curiosity's path.
- **Stops:** Layer 5 POIs in visiting order. POIs at the same spot are merged: Monte Grande with Valle de la Luna, and Nevado Sajama with Nevado Sajama 2.
- **Reach map:** accumulated cost from the base (Curiosity's sol 5073 position), in equivalent metres of flat GO ground.

## Live-sensor gates (radiation, weather, O2)
These are in `gonogo/live_gates.json`.
- Each feed gives one GO / CAUTION / NO-GO for the **whole map**, and the worst gate wins.
- **NO-GO:** the whole map is NO-GO; go to the shelter.
- **CAUTION:** the map stays as it is, with a banner.
- **Stale reading** (older than 6 h, ASSUMPTION): the map turns grey.

| Gate | Unit | GO | CAUTION | NO-GO | Measured or official anchor |
|---|---|---|---|---|---|
| Radiation dose rate | mSv/day | ≤ 1.34 | 1.34–6.7 | > 6.7 or SPE alert | Baseline 0.67 mSv/day measured by Curiosity's RAD (SwRI / Hassler et al. 2014) |
| Career dose budget | % of 600 mSv | < 80 | 80–95 | ≥ 95 | 600 mSv = NASA-STD-3001 career limit |
| Dust opacity τ | none | < 1.0 | 1.0–2.0 | ≥ 2.0 or storm alert | (thresholds are ASSUMPTIONS) |
| Wind | m/s | < 10 | 10–20 | ≥ 20 | (ASSUMPTIONS) |
| Suit O2 left after the walk back | min | ≥ 60 | 30–60 | < 30 | 30 min = the team's reserve that is never planned into (repo `ASSUMPTIONS.md`, NASA ISS EVA planning); 60 = ASSUMPTION |

The viewer moves these values with sliders and labels them **simulated**. The real app reads them from live feeds.
