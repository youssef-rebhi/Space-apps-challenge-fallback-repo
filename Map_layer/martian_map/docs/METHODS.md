# Methods

## Frames
- **Analysis frame:** the USGS MSL Gale mosaic frame, `+proj=eqc +lon_0=0 +R=3396190`. Curiosity's NASA positions are native to it, so the rover data sit on the maps with no shift (`docs/history/METADATA.md` §D).
- **QGIS display frame:** the team project CRS, eqc with lon_0 = 137.38 (the same sphere). On-the-fly reprojection between the two is a pure x-shift.
- **Web local frame:** x = metres east of the box's west edge, y = metres north of its south edge, z = elevation. East-west ground distance = x × cos(lat) = x × 0.9965.

## Layers 1–5 (approved, unchanged)
Each layer's README in `layers/` covers what it is, its source and how it was made. The original build scripts are in `pipeline/build_history/`.

## 3D terrain package (`pipeline/30_terrain_package.py`)
**Heightmaps** come from the 1 m DEM, area-averaged:
- 2 m grid: 1186 × 1482.
- 4 m grid: 593 × 741.
- Format: float32 little-endian, first row = north. The 4 m grid is also a 16-bit PNG with its decode rule.

**Textures:**
- Photo: Layer 1 resampled to 3277 × 4096 px (≈ 0.72 m/px) with the fixed 2–98% stretch (66–194). 4096 px is the safe size for mobile GPUs.
- Hillshade: from Layer 2.

**Metadata:** `terrain.json` holds the extent, the corner lon/lat, the z range and the sources.

**Plotly:** a 300 × 300 sample after a Gaussian anti-alias filter, in the same schema as the earlier exports.

## GO/NO-GO conversion layers (`pipeline/40_gonogo_layers.py`)
All on the 3 m grid of the approved Layer 2 slope (790 × 988). Each layer has its own rule (`docs/GONOGO_RULES.md`).

**Calibration on Curiosity's real path** (MMGIS traverse inside the box, resampled every 1 m, 5,255 samples):

| Slope | ≥ 15° | ≥ 20° | ≥ 25° | ≥ 30° | ≥ 35° |
|---|---|---|---|---|---|
| Curiosity's path | 6.1% | 1.6% | 1.0% | 0.5% | 0.2% |
| Whole box | 39.4% | 25.7% | 16.6% | 9.9% | 5.2% |

The path median is 8.2°. Curiosity chose gentle ground through steep terrain, which is why the box is much redder than the path while routes stay open.

**Does DEM slope measure what the rover felt?** At the 183 in-box waypoints:
- Rover tilt (NASA MMGIS roll/pitch) has a median of 8.6°; the DEM slope at the same points has a median of 9.2°.
- The median difference is −0.5°.
- The correlation is 0.46. Single points differ because of DEM noise, position error and heading.

**Roughness thresholds** come from the same path: p95 0.56 m and max 1.53 m. The box p99 is 1.23 m.

## Combined map, routes, reach (`pipeline/50_combined_routes.py`)
**Combined map:** each cell takes the worst orbital class of the inputs. Ground Curiosity drove is capped at CAUTION. The EVA-stop hazards (team colours) are applied last, so a red stop's 15 m keep-out stays NO-GO.

**Connectivity:** 8-connected labels of passable cells. 98.2% (foot) and 98.9% (rover) of passable ground is one network.

**Routes:** `skimage.graph.MCP_Geometric` on the cost grid, with the team app's "Safest" weights.
- `sampling = (3 m, 3 m × cos lat)`, so costs are in true ground metres.
- Each leg is compared with the straight line and with Curiosity's waypoint chain. The planner mostly finds the corridors Curiosity used: legs 1, 3, 4 and 5 run 65–100% within 10 m of Curiosity's path. Leg 2 (39%) takes a shorter line than Curiosity's 919 m chain.

**Reach:** accumulated cost from the base, Curiosity's sol 5073 position.

## Web export and viewer (`pipeline/60_web_export.py`, `web/viewer3d/index.html`)
**Textures:**
- Class layers are PNGs at grid resolution (1 px = 3 m) with nearest-neighbour filtering, so cells stay crisp.
- The "3D colored map" multiplies the class colour by the photo brightness, which keeps texture detail under the colour.

**Overlays:** routes, Curiosity's path, POIs and EVA stops in the local frame, with z read bilinearly from the DEM.

**Viewer:**
- three.js 0.160.0.
- Controls: a profile switch (crew on foot or rover), a layer menu built from `layers.json`, exaggeration 1–5×, and toggles for routes, path, POIs, EVA stops and 2 m detail.
- Points of interest (Layer 5): the 8 in-box POIs as 5 numbered pins, coloured by category, each with a ring draped on the terrain at the exact spot. POIs closer than 25 m share one pin: Monte Grande, Valle de la Luna, Nevado Sajama and Nevado Sajama 2 are all within 6 m. A list in the left panel flies the camera to a pin. A pin's card shows every POI in it, with its NASA source. Each label moves to the side of its pin that is clear, every frame.
- Hover readout: lon/lat, elevation and class.
- A legend with each layer's parameter, rule, basis, sources and shares (box and Curiosity's path).
- A simulated live-gate panel that tints the map: red for NO-GO, grey for stale data.

## Master QGIS project (`pipeline/70_qgis_master.py`)
- 25 layers in 7 groups, with relative paths and a saved view on the box.
- The geology style was copied from the team's main project, which was opened read-only (MD5 checked before and after).
