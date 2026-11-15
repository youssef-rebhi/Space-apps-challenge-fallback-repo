"""Clip USGS SIM 3292 (Tanaka et al. 2014) shapefiles to a Gale-region context box.
Usage: python-qgis.bat -P sim3292_clip.py <shapefile_dir> <out_gpkg>
Runs in QGIS's Python (GDAL bindings). Reads only; writes one new GeoPackage.
"""
import sys
from pathlib import Path
from osgeo import gdal, ogr

gdal.UseExceptions()
src_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
# Context box: Gale crater (~137.4E, 5.4S, ~154 km across) and its surroundings,
# planetocentric east-positive degrees, same frame as the shapefiles (-180..180).
W, S, E, N = 127.0, -15.0, 148.0, 5.0

if out.exists():
    out.unlink()
jobs = [("SIM3292_Global_Geology.shp", "sim3292_units"),
        ("SIM3292_Global_Contacts.shp", "sim3292_contacts"),
        ("SIM3292_Global_Landing_sites.shp", "sim3292_landing_sites")]
for i, (shp, name) in enumerate(jobs):
    gdal.VectorTranslate(str(out), str(src_dir / shp), format="GPKG", layerName=name,
                         spatFilter=[W, S, E, N], clipSrc=[W, S, E, N],
                         accessMode=None if i == 0 else "update",
                         geometryType="PROMOTE_TO_MULTI" if "Landing" not in shp else None)

ds = ogr.Open(str(out))
for lyr in ds:
    defn = lyr.GetLayerDefn()
    fields = [defn.GetFieldDefn(k).GetName() for k in range(defn.GetFieldCount())]
    print(f"\n{lyr.GetName()}: {lyr.GetFeatureCount()} features, fields={fields}")
lyr = ds.GetLayerByName("sim3292_units")
units = {}
for f in lyr:
    units.setdefault(f.GetField("Unit"), [f.GetField("UnitDesc"), 0])[1] += 1
for u, (d, n) in sorted(units.items()):
    print(f"  {u:8s} x{n:<3d} {d}")
lyr = ds.GetLayerByName("sim3292_landing_sites")
for f in lyr:
    print("  site:", {k: f.GetField(k) for k in range(f.GetFieldCount())}, f.GetGeometryRef().ExportToWkt())
# Which unit sits under our study box centre (137.38E, 4.805S)?
pt = ogr.CreateGeometryFromWkt("POINT (137.38 -4.805)")
lyr = ds.GetLayerByName("sim3292_units")
lyr.SetSpatialFilter(pt)
for f in lyr:
    if f.GetGeometryRef().Contains(pt):
        print("\nUnit under study box centre:", f.GetField("Unit"), "-", f.GetField("UnitDesc"))
