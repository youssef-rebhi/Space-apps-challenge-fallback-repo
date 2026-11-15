# Context layer: USGS SIM 3292 (Gale region)

`sim3292_gale_context.gpkg` holds the **official Space Apps resource** for geology: the USGS-NASA Planetary Geologic Mapping Program's global map, clipped to the Gale region.

**Source**

Tanaka, K.L., Skinner, J.A., Jr., Dohm, J.M., Irwin, R.P., III, Kolb, E.J., Fortezzo, C.M., Platz, T., Michael, G.G., and Hare, T.M., 2014, *Geologic Map of Mars*, scale 1:20,000,000. U.S. Geological Survey Scientific Investigations Map 3292. https://doi.org/10.3133/sim3292

**How it was made (15 Nov 2026)**

1. Extracted the published shapefiles from `data/raw/geology/usgs_sim3292/sim3292_database.zip`. The raw file is unchanged. The extracted files are in `data/extracted/sim3292/`: Global_Geology, Global_Contacts, Global_Landing_sites, plus the readme and metadata.
2. Clipped each layer to 127–148°E, 15°S–5°N with GDAL `VectorTranslate`, run in QGIS 4.2.3's Python. The CRS is unchanged: geographic, Mars 2000 sphere, R = 3,396,190 m, east-positive.
3. Added the layers to `qgis/mount_sharp_geology.qgz` in the group "Context: USGS SIM 3292 Geologic Map of Mars (1:20M)". The project before this change is saved as `qgis/mount_sharp_geology.qgz.bak_before_sim3292`.

**Layers**

| Layer | Features | Fields used |
|---|---|---|
| `sim3292_units` | 30 polygons, 10 units | `Unit`, `UnitDesc` |
| `sim3292_contacts` | 54 lines | `ConType`: Approx (dashed), Certain, Internal |
| `sim3292_landing_sites` | 1 point | MSL, 137.44°E, 4.59°S ("prelim" in the source) |

**What it shows at our site** (read from the data):
- The study box centre (137.38°E, 4.805°S) is in **Htu**, "Hesperian transition undivided unit". This polygon covers Mount Sharp.
- The crater around it is **AHi**, "Amazonian and Hesperian impact unit".

**Limits: context only**
- At 1:20,000,000, 1 mm on the printed map is 20 km on Mars, so the 2.4 × 3 km study box is about 0.1–0.15 mm. Use the team's own 1:5,000 geology for anything inside the box.
- In QGIS the layers are hidden when you zoom in closer than 1:100,000.
- The 43.7 m HiRISE-to-Gale frame offset doesn't matter at this scale.
- The fill colours were chosen by the team, grouped by period: browns for Noachian, yellows for Hesperian and transition units, grey for the impact unit. They are **not** the USGS map palette. The official symbols only exist as ArcGIS `.lyr` files, which QGIS can't read.
