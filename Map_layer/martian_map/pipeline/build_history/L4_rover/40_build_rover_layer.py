"""Layer 4 (rover trajectory): one GeoPackage with Curiosity's path, rover data only (no geology).

Inputs (read-only):
  ../../data/raw/geology/rover/MSL_traverse.json          NASA/JPL MMGIS, drive lines (whole mission)
  ../../data/raw/geology/rover/MSL_waypoints.json         NASA/JPL MMGIS, end-of-drive positions with sol
  ../../data/raw/geology/rover/MSL_waypoints_current.json NASA/JPL MMGIS, current position
  ../../trials/nasa_data_v2/inputs/localized_interp.csv   NASA PDS MSL PLACES localizations (denser, ends earlier)
Output: derived/layer4_rover.gpkg  (lon/lat, Mars 2000 sphere R = 3396190 m, planetocentric, east-positive)

Run with QGIS's Python (GDAL/OGR):  "C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" -P scripts/40_build_rover_layer.py
"""
import csv, json, math, os, sys
from osgeo import ogr, osr

ogr.UseExceptions()
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(HERE))
ROVER = os.path.join(ROOT, "data", "raw", "geology", "rover")
PLACES = os.path.join(ROOT, "trials", "nasa_data_v2", "inputs", "localized_interp.csv")
OUT = os.path.join(HERE, "derived", "layer4_rover.gpkg")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
BOX = (137.36, -4.83, 137.40, -4.78)  # W, S, E, N
R = 3396190.0
WKT = ('GEOGCS["GCS_Mars_2000_Sphere",DATUM["D_Mars_2000_Sphere",SPHEROID["Mars_2000_Sphere_IAU_IAG",3396190.0,0.0]],'
       'PRIMEM["Reference_Meridian",0.0],UNIT["Degree",0.0174532925199433]]')
srs = osr.SpatialReference(); srs.ImportFromWkt(WKT); srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)


def in_box(lon, lat):
    return BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3]


def gc_len(pts):  # great-circle length on the Mars sphere, metres
    d = 0.0
    for (lo1, la1), (lo2, la2) in zip(pts, pts[1:]):
        p1, p2, dl = math.radians(la1), math.radians(la2), math.radians(lo2 - lo1)
        a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        d += 2 * R * math.asin(min(1.0, math.sqrt(a)))
    return d


if os.path.exists(OUT):
    os.remove(OUT)
ds = ogr.GetDriverByName("GPKG").CreateDataSource(OUT)

# 1. MMGIS traverse lines
tr = json.load(open(os.path.join(ROVER, "MSL_traverse.json"), encoding="utf-8"))
lyr = ds.CreateLayer("traverse_mmgis", srs, ogr.wkbMultiLineString)
lyr.CreateField(ogr.FieldDefn("length_m", ogr.OFTReal)); lyr.CreateField(ogr.FieldDefn("source", ogr.OFTString))
tot_len = 0.0
for f in tr["features"]:
    g = f["geometry"]
    parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
    ml = ogr.Geometry(ogr.wkbMultiLineString)
    for part in parts:
        ls = ogr.Geometry(ogr.wkbLineString)
        for c in part:
            ls.AddPoint_2D(c[0], c[1])
        ml.AddGeometry(ls)
    o = ogr.Feature(lyr.GetLayerDefn()); o.SetGeometry(ml)
    o.SetField("length_m", f["properties"].get("Length")); o.SetField("source", "NASA/JPL MMGIS MSL_traverse.json")
    lyr.CreateFeature(o)
    tot_len += f["properties"].get("Length") or 0.0
print(f"traverse_mmgis: {len(tr['features'])} drive lines, sum of 'Length' = {tot_len/1000:.2f} km")


# 2. MMGIS waypoints and current position
def write_points(name, path):
    js = json.load(open(path, encoding="utf-8"))
    lyr = ds.CreateLayer(name, srs, ogr.wkbPoint)
    keys = ["sol", "site", "drive", "RMC", "elev_geoid", "lon", "lat", "easting", "northing", "roll", "pitch", "yaw", "tilt"]
    types = {"sol": ogr.OFTInteger, "site": ogr.OFTInteger, "drive": ogr.OFTInteger, "RMC": ogr.OFTString}
    for k in keys:
        lyr.CreateField(ogr.FieldDefn(k, types.get(k, ogr.OFTReal)))
    lyr.CreateField(ogr.FieldDefn("in_box", ogr.OFTInteger)); lyr.CreateField(ogr.FieldDefn("source", ogr.OFTString))
    sols_box = []
    for f in js["features"]:
        lon, lat = f["geometry"]["coordinates"][:2]
        o = ogr.Feature(lyr.GetLayerDefn())
        pt = ogr.Geometry(ogr.wkbPoint); pt.AddPoint_2D(lon, lat); o.SetGeometry(pt)
        for k in keys:
            v = f["properties"].get(k)
            if v is not None:
                o.SetField(k, v)
        o.SetField("in_box", int(in_box(lon, lat))); o.SetField("source", "NASA/JPL MMGIS " + os.path.basename(path))
        lyr.CreateFeature(o)
        if in_box(lon, lat):
            sols_box.append(f["properties"].get("sol"))
    print(f"{name}: {len(js['features'])} points, {len(sols_box)} in box, sols in box {min(sols_box) if sols_box else '-'}..{max(sols_box) if sols_box else '-'}")
    return sols_box


sols_box = write_points("waypoints_mmgis", os.path.join(ROVER, "MSL_waypoints.json"))
write_points("position_current", os.path.join(ROVER, "MSL_waypoints_current.json"))

# 3. PDS PLACES drive path: ROVER-frame rows only (SITE rows are site origins, not rover positions)
rows = [r for r in csv.DictReader(open(PLACES, newline="")) if r["frame"] == "ROVER"]
n_site = sum(1 for r in csv.DictReader(open(PLACES, newline="")) if r["frame"] == "SITE")
pts = [(float(r["longitude"]), float(r["planetocentric_latitude"])) for r in rows]
lyr = ds.CreateLayer("drive_path_places", srs, ogr.wkbLineString)
for k, t in (("sol_first", ogr.OFTInteger), ("sol_last", ogr.OFTInteger), ("n_points", ogr.OFTInteger),
             ("length_km", ogr.OFTReal), ("source", ogr.OFTString)):
    lyr.CreateField(ogr.FieldDefn(k, t))
ls = ogr.Geometry(ogr.wkbLineString)
for lon, lat in pts:
    ls.AddPoint_2D(lon, lat)
o = ogr.Feature(lyr.GetLayerDefn()); o.SetGeometry(ls)
sols = [int(r["sol"]) for r in rows]
o.SetField("sol_first", min(sols)); o.SetField("sol_last", max(sols)); o.SetField("n_points", len(pts))
o.SetField("length_km", round(gc_len(pts) / 1000, 3))
o.SetField("source", "NASA PDS MSL PLACES localized_interp.csv (ROVER rows only)")
lyr.CreateFeature(o)
inbox = sum(1 for p in pts if in_box(*p))
print(f"drive_path_places: {len(pts)} ROVER points (skipped {n_site} SITE rows), sols {min(sols)}..{max(sols)}, "
      f"great-circle length {gc_len(pts)/1000:.2f} km, {inbox} points in box")

# 4. Agreement check: PLACES vs MMGIS at the same site/drive (both should be in the USGS Gale frame)
wp = {(f["properties"]["site"], f["properties"]["drive"]): f["geometry"]["coordinates"][:2]
      for f in json.load(open(os.path.join(ROVER, "MSL_waypoints.json"), encoding="utf-8"))["features"]}
d = []
for r in rows:
    k = (int(r["site"]), int(r["drive"]))
    if k in wp:
        lon, lat = wp[k]
        d.append(gc_len([(lon, lat), (float(r["longitude"]), float(r["planetocentric_latitude"]))]))
d.sort()
if d:
    print(f"PLACES vs MMGIS at matching site/drive: n={len(d)}, median {d[len(d)//2]:.2f} m, max {d[-1]:.2f} m")
ds = None
print("written:", OUT)
