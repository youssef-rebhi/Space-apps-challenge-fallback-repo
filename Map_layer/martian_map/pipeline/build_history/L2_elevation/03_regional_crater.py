"""Item 3: whole-Gale-crater elevation layer.
Input: raw/hrsc_mola_blend_200m_gale.tif (int16 m, +proj=longlat +R=3396190, 136.2-139.4E, 7.0-3.8S)
       raw/mola_463m_gale.tif (cross-check)
Outputs: derived/regional_gale_elevation_200m.tif, regional_gale_hillshade_200m.tif,
         regional_gale_contours_100m.gpkg, derived/regional_hrsc_vs_mola.json
Run with QGIS python.
"""
import os, json
os.environ["GDAL_PAM_ENABLED"] = "NO"
import numpy as np
from osgeo import gdal, ogr, osr
gdal.UseExceptions()
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, DER = os.path.join(HERE, "raw"), os.path.join(HERE, "derived")
src = os.path.join(RAW, "hrsc_mola_blend_200m_gale.tif")
elev = os.path.join(DER, "regional_gale_elevation_200m.tif")
gdal.Translate(elev, src, outputType=gdal.GDT_Float32, noData=-32768,
               creationOptions=["COMPRESS=DEFLATE", "TILED=YES"])
ds = gdal.Open(elev, gdal.GA_Update); b = ds.GetRasterBand(1)
b.SetUnitType("m"); b.SetDescription("Elevation (m), MOLA-HRSC blended DEM 200 m v2")
ds.SetMetadata({"SOURCE": "Mars MGS MOLA - MEX HRSC Blended DEM Global 200m v2 (Fergason, Hare & Laura 2018, USGS)",
                "VERTICAL_DATUM": "Mars areoid (MOLA), per USGS product description"})
print("regional stats", b.ComputeStatistics(False)); ds = None

# Hillshade: scale converts degrees to metres (equatorial 1 deg = 59274.7 m on R=3396190)
gdal.DEMProcessing(os.path.join(DER, "regional_gale_hillshade_200m.tif"), elev, "hillshade",
                   azimuth=315, altitude=30, scale=59274.69752, zFactor=1,
                   creationOptions=["COMPRESS=DEFLATE", "TILED=YES"])

# Contours every 100 m, index every 500 m
out = os.path.join(DER, "regional_gale_contours_100m.gpkg")
if os.path.exists(out): os.remove(out)
sd = gdal.Open(elev); srs = osr.SpatialReference(wkt=sd.GetProjection())
vds = ogr.GetDriverByName("GPKG").CreateDataSource(out)
lyr = vds.CreateLayer("contours_100m", srs, ogr.wkbLineString)
lyr.CreateField(ogr.FieldDefn("id", ogr.OFTInteger)); lyr.CreateField(ogr.FieldDefn("elev_m", ogr.OFTReal))
lyr.CreateField(ogr.FieldDefn("index", ogr.OFTInteger))
gdal.ContourGenerate(sd.GetRasterBand(1), 100.0, 0.0, [], 1, -32768, lyr, 0, 1)
lyr.StartTransaction()
for f in lyr:
    f.SetField("index", 1 if round(f.GetField("elev_m")) % 500 == 0 else 0); lyr.SetFeature(f)
lyr.CommitTransaction(); print("contours", lyr.GetFeatureCount()); vds = None

# Cross-check HRSC/MOLA blend against pure MOLA 463 m (resample MOLA onto the 200 m grid)
mola_on = gdal.Warp("/vsimem/mola.tif", os.path.join(RAW, "mola_463m_gale.tif"), format="GTiff",
                    dstSRS=sd.GetProjection(), width=sd.RasterXSize, height=sd.RasterYSize,
                    resampleAlg="bilinear", srcNodata=-32768, dstNodata=np.nan,
                    outputType=gdal.GDT_Float32,
                    **{"outputBounds": (sd.GetGeoTransform()[0], sd.GetGeoTransform()[3] + sd.RasterYSize * sd.GetGeoTransform()[5],
                                        sd.GetGeoTransform()[0] + sd.RasterXSize * sd.GetGeoTransform()[1], sd.GetGeoTransform()[3])})
a = sd.GetRasterBand(1).ReadAsArray().astype("float64"); a[a == -32768] = np.nan
m = mola_on.GetRasterBand(1).ReadAsArray().astype("float64")
d = (a - m)[np.isfinite(a - m)]
res = {"hrsc_minus_mola_m": {"mean": float(d.mean()), "median": float(np.median(d)), "std": float(d.std()),
                             "p05": float(np.percentile(d, 5)), "p95": float(np.percentile(d, 95))},
       "regional_elev_range_m": [float(np.nanmin(a)), float(np.nanmax(a))]}
json.dump(res, open(os.path.join(DER, "regional_hrsc_vs_mola.json"), "w"), indent=1); print(res)
