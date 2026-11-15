# Simulator verification: PASS

Run: 2026-11-15T00:39:51.967Z · 40 seeds per set · core loaded from Drone_Simulator.html

## Checks
- PASS · normal: lands every time: 40/40
- PASS · normal: map error < 10 cm: 4.9 cm
- PASS · normal: finds ≥ 85% of obstacles: 1.00
- PASS · normal: finds ≥ 90% of sand: 0.99
- PASS · normal: false sand ≤ 15%: 0.06
- PASS · gusty: lands ≥ 90%: 40/40
- PASS · gusty: map error < 10 cm: 5.2 cm
- PASS · tilt correction matters (error ×2 without it): 23.3 vs 5.2 cm
- PASS · flight 72 replay crashes ≥ 30%: 0.45
- PASS · flight 72 + fixes crashes ≤ 15%: 0.07
- PASS · fixes at least halve the crash rate: 0.07 vs 0.45
- PASS · fixes beat stop rule alone: 0.93 vs 0.57
- PASS · fixes keep the position error small (< 1 m median): 0.51 m vs replay 6.07 m
- PASS · deterministic for a given seed: x 0.3596 / 0.3596
- PASS · real route: lands ≥ 90%: 223/234
- PASS · real route: map error < 15 cm: 4.4 cm
- PASS · real route: obstacle IoU ≥ 0.4: 0.71
- PASS · real route: slope 15–25° IoU ≥ 0.5: 0.81
- PASS · real route: slope ≥ 25° IoU ≥ 0.5: 0.64
- PASS · real route (hand rule): sand IoU recorded: 0.14 (known weak; the ML checks below)
- PASS · ML at least doubles sand IoU vs the rule on unseen segments: 0.26 vs 0.08, segments F02 F05 F08 F11 F14
- PASS · ML cuts false sand alarms by ≥ 50% on unseen segments: 337 vs 1368 bins
- PASS · ML keeps obstacle and slope IoU (rule-based) unchanged: 0.88/0.92
- PASS · ML does not break the invented world (sand IoU within 0.1 of rule): 0.97 vs 0.77

## Medians per set
| set | landed | map error cm | obstacles found | sand found | false sand | IoU obstacle (pooled) | IoU slope 15–25° (pooled) | IoU slope ≥ 25° (pooled) | IoU sand (pooled) | touchdown m/s | max pos err m | ms/flight |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| normal | 40/40 | 4.9 | 1.00 | 0.99 | 0.06 | 0.97 | – | – | 0.77 | 0.03 | 0.06 | 10 |
| gusty | 40/40 | 5.2 | 1.00 | 0.99 | 0.04 | 0.94 | – | – | 0.78 | 0.12 | 0.15 | 10 |
| gustyNoTilt | 40/40 | 23.3 | 0.71 | 0.82 | 0.18 | 0.38 | – | – | 0.47 | 0.12 | 0.15 | 10 |
| gustyNoLoop | 40/40 | 8.4 | 1.00 | 0.99 | 0.06 | 0.93 | – | – | 0.75 | 0.12 | 0.15 | 10 |
| f72 | 22/40 | 6.6 | 1.00 | 0.95 | 0.04 | 0.94 | – | – | 0.63 | 0.43 | 6.07 | 5 |
| f72fix | 37/40 | 5.6 | 1.00 | 0.95 | 0.04 | 0.94 | – | – | 0.67 | 0.13 | 0.51 | 8 |
| f72stopOnly | 23/40 | 5.1 | 1.00 | 0.38 | 0.04 | 0.94 | – | – | 0.14 | 0.53 | 1.58 | 4 |
| real_route | 223/234 | 4.4 | 1.00 | 0.52 | 0.13 | 0.71 | 0.81 | 0.64 | 0.14 | 0.08 | 0.10 | 9 |
| heldout_rule | 15/15 | 3.9 | 1.00 | 0.53 | 0.18 | 0.88 | 0.92 | 0.93 | 0.08 | 0.04 | 0.08 | 10 |
| heldout_ml | 15/15 | 3.9 | 1.00 | 0.53 | 0.18 | 0.88 | 0.92 | 0.93 | 0.26 | 0.04 | 0.08 | 15 |
| normal_ml | 40/40 | 4.9 | 1.00 | 0.99 | 0.06 | 0.97 | – | – | 0.97 | 0.03 | 0.06 | 14 |
