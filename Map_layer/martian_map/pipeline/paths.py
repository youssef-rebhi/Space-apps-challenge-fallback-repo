"""Central paths and grid definitions for the martian_map pipeline. Every script imports this."""
import os

MM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # .../martian_map
LAY = os.path.join(MM, "layers")
L1 = os.path.join(LAY, "L1_basemap")
L2 = os.path.join(LAY, "L2_elevation")
L3 = os.path.join(LAY, "L3_geology")
L4 = os.path.join(LAY, "L4_rover")
L5 = os.path.join(LAY, "L5_poi")
GONOGO = os.path.join(MM, "gonogo")
WEB = os.path.join(MM, "web")
QGIS_DIR = os.path.join(MM, "qgis")

BASEMAP = os.path.join(L1, "usgs_msl_gale_ortho_25cm_box.tif")
BASEMAP_LOG = os.path.join(L1, "fetch_log.json")
DEM = os.path.join(L2, "elevation_box_1m_GALEFRAME.tif")          # USGS MSL Gale DEM 1 m v3, box window
HILLSHADE = os.path.join(L2, "hillshade_box_1m_GALEFRAME.tif")
SLOPE3 = os.path.join(L2, "slope_box_3m_GALEFRAME.tif")             # approved Layer 2 slope, 3 m baseline
GEOLOGY = os.path.join(L3, "geology_GALEFRAME.gpkg")               # approved Layer 3 (units, contacts)
STUDY_BOX = os.path.join(L3, "study_box.gpkg")
ROVER = os.path.join(L4, "layer4_rover.gpkg")                      # approved Layer 4
POI = os.path.join(L5, "layer5_poi.gpkg")                          # approved Layer 5
POI_BOX = os.path.join(L5, "exports", "poi_box.geojson")
EVA_STOPS = os.path.join(L5, "exports", "eva_stops.geojson")

# Frames
GALE_CRS = "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"   # USGS Gale frame
LONLAT_CRS = "+proj=longlat +R=3396190 +no_defs"                                               # Mars 2000 sphere
PROJECT_CRS = "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs"  # QGIS display
BOX_LONLAT = (137.36, -4.83, 137.40, -4.78)   # W, S, E, N
R_MARS = 3396190.0
