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
| A22 | POIs closer than **25 m** share one numbered pin; pin colours by category | 3D display and preview only | 4 POIs lie within 6 m and their labels would overlap; the POI data are unchanged | 60 |
| A23 | Layer animation: gap between sheets **380 m** by default (slider 60–1200 m), measured from the top of the 3D sheet | layer animation, display only | Each sheet stays visible at the default camera; the terrain (639 m of relief at 1×) never cuts through a sheet | web/explode |
| A24 | Upper sheets **85%** solid (slider 40–100%); the bottom 3D sheet is solid | layer animation, display only | The user asked for the sheet below to show through | web/explode |
| A25 | Relief **1×** (true height) in the animation, range 1–5× | layer animation, display only | At the viewer's 2× (A21) the bottom block would be about 1.3 km tall and push the stack off the screen | web/explode |
| A26 | Grey UNKNOWN cells on the terrain-units and ground-truth sheets drawn at **10%** strength (a switch turns this off) | layer animation, display only | The combined map does not use these cells (`50_combined_routes.py`); solid grey (78% and 99% of those sheets) would hide the sheets below. The data are unchanged. | web/explode |
| A27 | Bottom block side walls reach **30 m** below the lowest point; bare-terrain colour light grey-brown; light from the north-west, 45° up (as in the viewer) | layer animation, display only | Makes the 3D map read as a solid piece of ground; the colour is neutral so it is not mistaken for a GO/NO-GO class | web/explode |
| A28 | Each split takes **1.2 s**, the four input sheets leave **0.06 s** apart, with a small overshoot going apart and none going back; a gentle float of ± the smaller of 6% of the gap or 25 m, every 4.5 s | layer animation, display only | About a second per split, readable when presenting; the bounce is the "burger advert" look the user approved | web/explode |
| A29 | Camera: 32° field of view, from the north-east (bearing 35°, 24° above the horizon), zoomed to fit the stack in the free screen area | layer animation, display only | The terrain slopes down to the north, so this side shows its surface best | web/explode |
| A30 | Auto-play holds each stage **2.5 s** (map), **3 s** (two maps), **5 s** (layers); the recorded video holds 2, 3, 5, 2 and 2.5 s | layer animation, display only | Time to read the labels while presenting | web/explode |
| A31 | Map section from a path: **100 m** margin around the path (slider 0–500 m) | map sections, display only | Shows the ground just off the path, for example a whole 30 m EVA-stop zone (A9) with room to spare | web/lib/sections.js |
| A32 | Smallest section side **300 m** (slider 100–1000 m) | map sections, display only | Even the 10 m leg (sol 4693 → 4718) gets enough ground around it to see where it is; the scale bar and pins stay readable | web/lib/sections.js |
| A33 | Map section around one point: **200 m** half side, so 400 × 400 m (slider 50–1000 m) | map sections, display only | Shows a POI with the EVA stops and routes around it | web/lib/sections.js |
| A34 | Sections use the **2 m** heightmap; the section page puts at most **600** cells on the long side (about 5 m per cell for the whole box) | map sections, display only | Finer relief for a small area, while a large section stays light enough for a tablet. The 3D viewer keeps its own 2 m switch. | web/section, web/explode |
| A35 | Section page: side walls **20 m** below the lowest point; camera **40°** above the horizon, from the section's bottom side | map sections, display only | The section reads as a cut block of ground. The bottom side is south when north is up, and behind A when heading up. | web/section |
| A36 | Layer animation on a section: gap = 380 m × (section's long side / 2964 m), at least 60 m | layer animation, display only | Keeps the look of the whole-box stack (A23) at any section size | web/explode |

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
