# Firm Ground · Assumptions

Every number below is a **team choice**, not a NASA rule, unless a source is named.
"SIM" = simulated in the demo, not measured.

## 1. What is real, what is simulated
| Thing | Type | Note |
|---|---|---|
| Ground at Curiosity stops (sand, rock, soil %) | real | our model on NASA Curiosity Navcam photos |
| AI certainty per stop | real | share of ground pixels where the model's top class is ≥ 60% sure |
| Elevation, slope | real | USGS MSL Gale DEM 1 m (team Layer 2) |
| Curiosity's path | real | NASA MMGIS waypoints |
| Astronaut walk | SIM | auto walk, or phone steps (see §6) |
| Suit oxygen use, temperature, radiation | SIM | ranges from Curiosity REMS / RAD (§5) |
| Drone / scout readings | SIM | terrain real (DEM), sand and rocks in unknown areas are our model |
| Scout "zap" sound | SIM | built from our AI result, idea from Perseverance SuperCam |

## 2. Ground colours (AI)
- Orange (careful): sand ≥ 10 % of the ground in front of the rover
- Red (don't go): sand > 30 % **or** big rock > 2 %
- Sand pixel: model probability for sand ≥ 0.3 (not 0.5): we prefer a false alarm to missing sand
- Ground band read: rows 40 % to 85 % of the photo height (near ground, no sky, no rover)
- "AI sure": certainty ≥ 75 %; under that a green stop is shown orange and the app asks for the scout
- AI result used for a point only if a Curiosity photo stop is within **30 m** (Navcam sees roughly 5 to 30 m ahead)

## 3. Slope (from Youssef & Malek, METADATA.md item 6)
- Slope on the DEM block-averaged to 3 m (Horn 3×3)
- GO < 15°, caution 15–25°, NO-GO ≥ 25°

## 4. Route planner
- Grid: 2×2 slope pixels ≈ 6 m, the worst class of the 4 wins
- Never crossed: slope ≥ 25°; 15 m around stops with sand > 30 % or big rock > 2 %
- Exception: within 20 m of A or B those cells cost 50 instead of blocked (to step off)
- Curiosity's path = proven ground within 12 m
- Weights (cost = distance × weight):

| Cell | Shortest | Safest |
|---|---|---|
| GO | 1 | 1 |
| Caution 15–25° | 1.6 | 5 |
| No slope data | 1.5 | 8 |
| Within 15 m of a stop with 10–30 % sand | 1.5 | 6 |
| On Curiosity's path | 1 | 0.6 |

- Science route: Safest weights, forced through one Curiosity stop (auto = smallest straight-line detour, 4 candidates tried)
- "Least risk" tag = lowest 3 × caution m + unknown-ground m + 4 × near-sand m
- Route sent to the helmet: one point every ~200 m

## 5. Walk, suit and mission
- Walking speed 0.8 m/s; way back +20 %
- 15 min of work at each real stop (not at path points)
- EVA limit 4 h
- Oxygen 8 h; 30 min reserve never planned (ISS EMU class suits: about 6.5–8 h + 30 min reserve)
- Simulated air temperature: about −70 °C at night to a few °C above 0 in the afternoon (range measured by Curiosity REMS)
- Simulated radiation: about 0.67 mSv/day (Curiosity RAD; Hassler et al. 2014 — verify before quoting)
- EVA starts 09:00 local Mars time

## 6. Helmet
- Phone walk: one detected step = 0.7 m × 20 = 14 m on Mars (demo scale); time also ×20
- Arrival at a point: within 15 m
- Warnings: within 60 m of an orange/red point; drone sand within 25 m
- Mars–Earth radio delay in mission control demo: 20 or 60 s (real: about 3 to 22 minutes one way)

## 7. Drone (simulated)
- Flies only over route parts where the ground is not known (§2, 30 m rule)
- Sand assumed in hollows: cell more than 1 m below the mean of ~40 m around it (DEM 120×120 grid)
- Drone sand cell weight in the planner: 8

## 8. Orbit check
- THEMIS Night IR 100 m: "orbit sand" = the coldest 30 % of pixels around our stops
