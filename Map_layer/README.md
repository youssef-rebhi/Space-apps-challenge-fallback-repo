# Map_layer

Orbital map layers of the study box (137.36–137.40°E, 4.78–4.83°S, lower Mount Sharp, Gale crater).

| Layer | Folder | What |
|---|---|---|
| Layer 2: Elevation | [`Layer2_Elevation/`](Layer2_Elevation/) | 1 m elevation, hillshade, 5 m contours, slope and slope classes (GO / caution / NO-GO), whole-crater 200 m elevation, exports for Leaflet and Plotly |
| Martian Map (all layers + GO/NO-GO + 3D) | [`martian_map/`](martian_map/) | The five approved layers (base map, elevation, geology, rover path, points of interest) in one QGIS project. Adds a GO/NO-GO conversion layer for each input, a combined GO/NO-GO map (crew on foot and rover), least-cost routes between the stops, a 3D web viewer and live-sensor gates for radiation, weather and oxygen. Start with [`martian_map/README.md`](martian_map/README.md). |

All layers use the **USGS MSL Gale DEM frame**, the frame Curiosity's own positions and heights are in (planetocentric, east-positive longitudes, Mars sphere R = 3396.19 km). Distances must be computed on the Mars sphere, not as Earth WGS84.

## Source imagery

The 1 m elevation comes from the USGS MSL Gale Merged DEM Mosaic, built from stereo pairs taken by the HiRISE camera on NASA's Mars Reconnaissance Orbiter (0.5 m telescope, about 0.3 m/pixel from 300 km; McEwen et al. 2007). Full list in [`REFERENCES.md`](../REFERENCES.md).
