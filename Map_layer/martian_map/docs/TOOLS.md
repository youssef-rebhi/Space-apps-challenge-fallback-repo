# Tools

| Tool | Version | Used for |
|---|---|---|
| Python (uv) | 3.12.16, in `.venv` | every analysis step (30, 40, 50, 60) |
| rasterio / GDAL | 1.5.2 | reading and writing rasters, windowed range reads of USGS COG-like files |
| geopandas / pyogrio / shapely / pyproj | 1.2.0 / 0.13.0 / 2.2.0 / 3.8.0 | vectors, Mars-sphere reprojection |
| scipy / scikit-image | 1.18.1 / 0.26.0 | filters, connectivity labels, least-cost paths (`MCP_Geometric`) |
| Pillow | 13.0.0 | textures and previews |
| QGIS | 4.2.3, headless via `python-qgis.bat` | Layer 1–5 projects, master project, renders |
| three.js | 0.160.0 (cdn.jsdelivr.net) | 3D viewer |

The full pin list is in `requirements.lock.txt`. To recreate the environment: `uv venv --python 3.12 .venv`, then `uv pip install -r requirements.lock.txt --python .venv/Scripts/python.exe`.

**Lessons that saved time**
- **Saved view:** a project written by headless QGIS has no saved view. `pipeline/qgz_view.set_saved_view()` adds one; without it the project opens on an empty area.
- **Strip GeoTIFFs:** the USGS 25 cm mosaic is stored as 1-row strips, so a range read always costs the full 180,000-pixel row. Read it in full-width bands.
- **Python `-I` flag:** it drops the script's own folder from `sys.path`, so each pipeline script adds it back before importing `paths` and `common`.
- **Windows console:** use `-X utf8`, or "≈" and "°" crash `print`.
