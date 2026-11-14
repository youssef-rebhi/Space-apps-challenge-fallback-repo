"""Items 1 + 2: box elevation layer (heights, styled) and contours.
Input (read-only): data/clean/geology/dtm_box.tif (HiRISE DTEEC_019698_1750_019988_1750_U01 clip,
1.0117 m, heights in m above the Mars 2000 areoid).
Outputs: derived/elevation_box_hirise_1m.tif, derived/contours_box_{5,1}m.gpkg, docs/*.qml
Run with QGIS python (needs osgeo.gdal/ogr):
  "C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" scripts/02_box_elevation_contours.py
"""
import os
os.environ["GDAL_PAM_ENABLED"] = "NO"
from osgeo import gdal, ogr, osr
gdal.UseExceptions()
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "..", "data", "clean", "geology", "dtm_box.tif")
DER = os.path.join(HERE, "derived"); os.makedirs(DER, exist_ok=True)

# 1. Elevation layer: lossless copy with explicit nodata, unit and description
elev = os.path.join(DER, "elevation_box_hirise_1m.tif")
gdal.Translate(elev, SRC, creationOptions=["COMPRESS=DEFLATE", "PREDICTOR=3", "TILED=YES"],
               noData=-3.4028226550889045e+38)
ds = gdal.Open(elev, gdal.GA_Update); b = ds.GetRasterBand(1)
b.SetUnitType("m"); b.SetDescription("Elevation (m) above Mars 2000 areoid, HiRISE DTEEC_019698_1750_019988_1750_U01")
ds.SetMetadata({"SOURCE": "HiRISE DTM DTEEC_019698_1750_019988_1750_U01 (NASA/JPL/UArizona, PDS)",
                "VERTICAL_DATUM": "Mars 2000 areoid (Smith et al. 2001), per DTM PDS label",
                "UNITS": "metres", "CLIPPED_TO": "137.36-137.40E, 4.78-4.83S"})
b.ComputeStatistics(False); print("elevation stats", b.GetStatistics(0, 1)); ds = None

# 2. Contours: 5 m (index every 25 m) and 1 m
for step in (5, 1):
    out = os.path.join(DER, f"contours_box_{step}m.gpkg")
    if os.path.exists(out): os.remove(out)
    src = gdal.Open(elev); srs = osr.SpatialReference(wkt=src.GetProjection())
    drv = ogr.GetDriverByName("GPKG"); vds = drv.CreateDataSource(out)
    lyr = vds.CreateLayer(f"contours_{step}m", srs, ogr.wkbLineString)
    lyr.CreateField(ogr.FieldDefn("id", ogr.OFTInteger))
    lyr.CreateField(ogr.FieldDefn("elev_m", ogr.OFTReal))
    idx = ogr.FieldDefn("index", ogr.OFTInteger); lyr.CreateField(idx)
    gdal.ContourGenerate(src.GetRasterBand(1), float(step), 0.0, [], 1, -3.4028226550889045e+38, lyr, 0, 1)
    lyr.StartTransaction()
    for f in lyr:
        f.SetField("index", 1 if round(f.GetField("elev_m")) % (25 if step == 5 else 5) == 0 else 0); lyr.SetFeature(f)
    lyr.CommitTransaction()
    print(out, lyr.GetFeatureCount()); vds = None
