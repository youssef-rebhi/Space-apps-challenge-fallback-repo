# Assumptions (every chosen number)

Anything not measured or published is listed here. Change a value in the script named, then re-run the pipeline from that step.

| # | Value | Used for | Why this value | Script |
|---|---|---|---|---|
| A1 | Slope CAUTION from **15°** | slope layers (both profiles) | Team-approved (Layer 2, 14 Nov). 95% of Curiosity's in-box path is below 15.7°. | 40 |
| A2 | Slope NO-GO at **25°**, crew on foot | slope_foot, combined_foot | Team-approved. No NASA EVA slope limit was found. Calibrated: Curiosity's path is 1.0% ≥ 25°. | 40 |
| A3 | Slope NO-GO at **30°**, rover | slope_rover, combined_rover | Sourced, not assumed: Curiosity's onboard fault-protection tilt limit (NASA/JPL). Listed so all thresholds sit in one place. | 40 |
| A4 | Slope baseline **3 m** (Horn on a 3 m block-mean DEM) | slope | About rover length; approved Layer 2 product | Layer 2 |
| A5 | Roughness = RMS of (DEM − Gaussian σ 5 m) in a **9 m** window | roughness | Picks up relief 2–10 m across, such as boxwork ridges (up to ~5 m wide, GSA 2025), without DEM-scale noise. | 40 |
| A6 | Roughness CAUTION above Curiosity's in-box **p95 (0.56 m)**; UNKNOWN above its **max (1.53 m)**; never NO-GO | roughness | No NASA limit at this scale, and the 1 m DEM cannot see single rocks | 40 |
| A7 | Terrain: LSu, BXr = GO; BXh, Aeo = CAUTION; unmapped = neutral | terrain | Layer 3 hazard notes; NASA boxwork blogs (Curiosity drove along ridges, hollows are sediment-filled); Hidden Valley sand lesson | 40 |
| A8 | Driven corridor **± 5 m** around Curiosity's path | ground truth, certainty, rover-proven rule | Rover about 3 m wide; MMGIS vs PLACES agree to ≤ 2.1 m | 40 |
| A9 | EVA-stop "seen" radius **30 m**; red keep-out **15 m** | ground truth, certainty | Team values (repo `ASSUMPTIONS.md`: AI radius 30 m, red-cell keep-out 15 m) | 40 |
| A10 | Stop colour: RED if sand **> 30%** or big rock **> 2%**; ORANGE if sand **10–30%** or AI certainty **< 0.75**; else GREEN | ground truth | Team values (repo `ASSUMPTIONS.md`), used as is. Today: 49 green, 5 orange, 1 red. | 40 |
| A11 | RED stop → NO-GO within 15 m and CAUTION from 15 to 30 m; ORANGE stop → CAUTION within 30 m; GREEN stop → GO within 30 m | ground truth | Mapping of the team colours onto the 4-colour grid (our choice) | 40 |
| A12 | Rover-proven rule: driven orbital NO-GO/UNKNOWN → CAUTION; a RED stop is never lifted | combined | Ground truth outranks orbital data (team certainty ladder) | 50 |
| A13 | Strictness target: Curiosity path NO-GO **≤ 5%** on the orbital class | calibration | Most of Curiosity's real path must not be red (user requirement) | 50 |
| A14 | Route cost GO **1**, CAUTION **5**, UNKNOWN **8**, NO-GO never crossed; × **0.6** on Curiosity's path | routes, reach | Team app "Safest" profile (repo `ASSUMPTIONS.md`, `routes.js` PROFILES) | 50 |
| A15 | Radiation gate: CAUTION > **2×** and NO-GO > **10×** the RAD baseline 0.67 mSv/day | live gates | The baseline is measured; the multipliers are team choices | live_gates_rules.json |
| A16 | Career budget gate: CAUTION **80%**, NO-GO **95%** of 600 mSv | live gates | The 600 mSv limit is NASA-STD-3001; the percentages are team choices | live_gates_rules.json |
| A17 | Dust τ CAUTION **1.0**, NO-GO **2.0** | live gates | Team choice; agree with a mentor | live_gates_rules.json |
| A18 | Wind CAUTION **10 m/s**, NO-GO **20 m/s** | live gates | Team choice; agree with a mentor | live_gates_rules.json |
| A19 | Suit O2 left after the walk back: NO-GO < **30 min**, CAUTION < **60 min** | live gates | 30 min = the team's reserve that is never planned into (repo `ASSUMPTIONS.md`, after NASA ISS EVA planning); 60 min = our ASSUMPTION | live_gates_rules.json |
| A20 | Live reading stale after **6 h** → grey | live gates | Team choice (Team Plan "live-data expiry") | live_gates_rules.json |
| A21 | Vertical exaggeration **2×** by default (range 1–5×) | 3D display only | Readability; all analysis uses true heights | 30 |

## Consistency with the team repo `ASSUMPTIONS.md`
| Item | Team repo | This map | Why |
|---|---|---|---|
| Stop colours (sand, big rock, certainty) | red > 30% / > 2%; orange 10–30% or < 0.75 | same | used as is |
| AI radius / red keep-out | 30 m / 15 m | same | used as is |
| Route weights ("Safest") | GO 1, CAUTION 5, UNKNOWN 8, NO-GO impassable, proven × 0.6 | same | used as is |
| O2 reserve | 30 min never planned into | NO-GO gate below 30 min | used as is |
| Proven-ground band | 12 m around the traverse (route weighting) | 5 m for the rover-proven cap (A8); × 0.6 applied on the same 5 m band | The cap lifts orbital red to yellow, so it is kept to the rover's own width plus position error. |
| Planner grid | 6 m (app) | 3 m (Layer 2 slope grid) | The approved slope product is 3 m. |

## Known limits
- **Absolute heights:** these are the USGS Gale DEM values, the same as the rover's `elev_geoid`. MOLA laser shots read a median **+14.9 m** higher (Layer 2 check, `layers/L2_elevation/checks/mola_shot_check.json`). Slopes and relative heights are not affected.
- **Ground distances:** the eqc grid metres are stretched east-west by 1/cos(4.8°). Routes and reach are computed in true ground metres (× 0.9965 east-west).
- **Time of imaging:** the orthophoto and DEM are from orbital passes before the boxwork campaign. Sand can move.
- **Waypoint chain:** Curiosity's chain is straight lines between end-of-drive points, so it is shorter than what the rover really drove.
