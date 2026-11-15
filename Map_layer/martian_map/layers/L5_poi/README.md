# Layer 5: Points of interest (approved)

**Product:** `layer5_poi.gpkg`, in lon/lat on the Mars 2000 sphere.

| Layer | Count | What |
|---|---|---|
| `poi` | 21 | Gale-wide and in-box points of interest: landing site, drill sites, discoveries, the current position, the Hidden Valley lesson, and more. Each point carries its source, position method and uncertainty. |
| `eva_stops` | 55 | the team's EVA stops, with terrain fractions (soil, bedrock, sand, big rock) from the team AI (AI4Mars-style) run on NASA Navcam images. The AI certainty per stop is in `sources/app_stops_with_certainty.json` (from the team app's `stops.json`). |
| `surface_view_sites` | 4 | NASA Curiosity location map, "Surface View" panoramas |

| Folder / file | What |
|---|---|
| `exports/poi_box.geojson` | the 8 POIs inside the box. These are the route stops: sols 4534, 4564, 4693 (×2), 4718, 4803, 5050, 5073. |
| `exports/poi_gale.geojson`, `exports/poi_cards.json` | Gale-wide POIs; stop cards for the app |
| `exports/eva_stops.geojson` | EVA stops |
| `sources.json`, `sources/` | every source used, with its URL (NASA/JPL, MMGIS, IAU gazetteer, PDS, team AI) |
| `styles/` | `poi.qml`, `eva_stops.qml`, `surface_view_sites.qml` |
| `docs/` | preview renders (box and Gale) |

**Made by:** `../../pipeline/build_history/L5_poi/*.py`. The plan and decisions are in `../../docs/history/L5_PLAN.md` and `../../docs/history/METADATA.md` §E.

**Used for:**
- **Route stops**, in visiting order.
- **Ground truth:** within 30 m of an EVA stop counts as "seen". Each stop gets the team colour (repo `ASSUMPTIONS.md`): 49 green, 5 orange, 1 red (stop 13, sol 4580, big rock 9.1%).
- **Certainty.**
- **3D markers and info cards.**

POIs are destinations, so they are not coloured GO/NO-GO.
