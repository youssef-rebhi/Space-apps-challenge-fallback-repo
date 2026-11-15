# Layer 2: Elevation (approved)

**Source:** the USGS MSL Gale DEM Mosaic 1 m v3 (Parker & Calef, USGS Astrogeology / PDS Annex), cut to the box in the USGS Gale frame.

| File | What |
|---|---|
| `elevation_box_1m_GALEFRAME.tif` | **main product.** 2371 × 2964 px at 1 m, float32, nodata −9999, 100% valid, z from −3990.1 to −3350.6 m (relative to the areoid, the same numbers as the rover's `elev_geoid`) |
| `hillshade_box_1m_GALEFRAME.tif` | hillshade |
| `contours_box_1m_GALEFRAME.gpkg`, `contours_box_5m_GALEFRAME.gpkg` | contours |
| `slope_box_3m_GALEFRAME.tif` | slope in degrees, Horn method on a 3 m block-mean DEM, 790 × 988. **This is the grid every GO/NO-GO layer uses.** |
| `slope_classes_box_3m_GALEFRAME.tif`, `slope_classes_stats.json` | approved slope classes: GO < 15°, caution 15–25°, NO-GO ≥ 25° (ASSUMPTIONS) |
| `regional/` | the whole crater: 200 m elevation and hillshade (HRSC/MOLA blend), 100 m contours |
| `checks/` | frame and datum tests, MOLA laser-shot check, the HiRISE DTM shifted into the Gale frame (for comparison only) |
| `sources/` | raw source windows (USGS 1 m DEM box, MOLA 463 m, HRSC/MOLA 200 m, MOLA PEDR shots) with fetch logs |
| `styles/` | QML styles: elevation, contours, slope, slope classes, regional |
| `exports_v1/` | the first app exports (lon/lat GeoTIFFs, Leaflet PNG + bounds, Plotly 300 × 300). The new web package is in `../../web/`. |

**Height note:** MOLA laser shots read a median **+14.9 m** higher than this DEM (`checks/mola_shot_check.json`). Slopes and relative heights are not affected. We keep the USGS heights so that they match the rover's own numbers.

**Made by:** `../../pipeline/build_history/L2_elevation/01–09_*.py`. The full record is in `../../docs/history/L2_README_original.md` and `../../docs/history/METADATA.md` §A–D.

**Used for:** the 3D terrain shape (heightmaps), hillshade, and the slope and roughness GO/NO-GO layers.
