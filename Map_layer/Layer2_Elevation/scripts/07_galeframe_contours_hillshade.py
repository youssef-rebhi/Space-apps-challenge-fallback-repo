"""Item 2 in the chosen frame: hillshade + contours of derived/elevation_box_1m_GALEFRAME.tif.
Run with QGIS python: python-qgis scripts/07_galeframe_contours_hillshade.py
"""
import os, math
os.environ["GDAL_PAM_ENABLED"] = "NO"
from osgeo import gdal, ogr, osr
gdal.UseExceptions()
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); DER = os.path.join(HERE, "derived")
elev = os.path.join(DER, "elevation_box_1m_GALEFRAME.tif")
# eqc x metres are equatorial; ground x = x*cos(lat). scale ~1, error <0.4 % at 4.8 S (accepted)
gdal.DEMProcessing(os.path.join(DER, "hillshade_box_1m_GALEFRAME.tif"), elev, "hillshade", azimuth=315, altitude=30,
                   creationOptions=["COMPRESS=DEFLATE", "TILED=YES"])
for step, index_every in ((5, 25), (1, 5)):
    out = os.path.join(DER, f"contours_box_{step}m_GALEFRAME.gpkg")
    if os.path.exists(out): os.remove(out)
    sd = gdal.Open(elev); srs = osr.SpatialReference(wkt=sd.GetProjection())
    vds = ogr.GetDriverByName("GPKG").CreateDataSource(out)
    lyr = vds.CreateLayer(f"contours_{step}m", srs, ogr.wkbLineString)
    for n, t in (("id", ogr.OFTInteger), ("elev_m", ogr.OFTReal), ("index", ogr.OFTInteger)):
        lyr.CreateField(ogr.FieldDefn(n, t))
    gdal.ContourGenerate(sd.GetRasterBand(1), float(step), 0.0, [], 1, -9999, lyr, 0, 1)
    lyr.StartTransaction()
    for f in lyr:
        f.SetField("index", 1 if round(f.GetField("elev_m")) % index_every == 0 else 0); lyr.SetFeature(f)
    lyr.CommitTransaction(); print(out, lyr.GetFeatureCount()); vds = None
