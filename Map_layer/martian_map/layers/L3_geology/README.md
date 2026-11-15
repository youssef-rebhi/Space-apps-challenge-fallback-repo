# Layer 3: Geology (approved 15 Nov 2026)

**Product:** `geology_GALEFRAME.gpkg`.
- **Layers:** `units` (5 polygons) and `contacts` (4 lines).
- **CRS:** the team project CRS (eqc lon_0 = 137.38, Mars sphere), drawn in the Gale frame.
- **Status field:** "approved by the team 15 Nov 2026 (drawn by Claude 14 Nov, reviewed by the team)".
- **Copied from:** `../../qgis/geology_DRAFT_GALEFRAME.gpkg`. Geometry and attributes are unchanged apart from the status field.

| Unit | Name | Confidence | Hazard note (ASSUMPTION) | Share of box |
|---|---|---|---|---|
| LSu | Layered Sulfate unit (observed + inferred) | observed / inferred | firm layered bedrock | 18.6% |
| BXr | Boxwork ridges (Altadena member, Mirador fm.) | inferred | firm bedrock ridge tops; ridges up to ~5 m across (GSA 2025) | 0.6% |
| BXh | Boxwork hollows | inferred | hollows often sediment-filled (GSA 2025): treat as caution | 0.9% |
| Aeo | Sand / ripples | observed | soft or loose ground, sinkage risk (Hidden Valley, sols 709–710) | 2.2% |
| (none) | not mapped | | neutral in the combined GO/NO-GO map | 77.6% |

| Folder | What |
|---|---|
| `styles/` | `units.qml` and `contacts.qml`, copied from the team's main project (`../../qgis/mount_sharp_geology.qgz`, read-only) |
| `terrain/` | drafting aids, all in the Gale frame: DTM, hillshade, TPI relief, ridges/hollows draft, shifted HiRISE RED_C |
| `context_sim3292/` | USGS SIM 3292 Geologic Map of Mars (Tanaka et al. 2014, 1:20M) clipped to Gale. This is on the NASA Space Apps resource list. |
| `reference_persaud2021/` | Persaud 2021 marker-bed and unit traces (Zenodo 5819267) |
| `study_box.gpkg` | the study box polygon |

**Science sources:**
- Siebach et al., GSA Connects 2025 (boxwork ridges and hollows).
- Seeger et al. 2026 (siderite in hollows).
- NASA Curiosity blogs for sols 4534 to 4811.

These are listed in `../../docs/SOURCES.md` and `../../docs/history/METADATA.md`.

**Used for:** the terrain-units GO/NO-GO layer (LSu, BXr = GO; BXh, Aeo = CAUTION).
