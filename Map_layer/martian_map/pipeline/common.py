"""Shared helpers: the 3 m analysis grid, rover path in grid coordinates, raster writing."""
import os, sys, json
import numpy as np, rasterio, geopandas as gpd
from rasterio.transform import from_origin
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import *  # noqa: F403

CELL = 3.0
with rasterio.open(SLOPE3) as s:
    GRID_T = s.transform; GRID_SHAPE = (s.height, s.width); GRID_CRS = s.crs
    _sl = s.read(1).astype("float32"); _nd = s.nodata
SLOPE = np.where(_sl == _nd, np.nan, _sl) if _nd is not None else _sl
X0, Y0 = GRID_T.c, GRID_T.f
TO_GALE = Transformer.from_crs(LONLAT_CRS, GALE_CRS, always_xy=True)
TO_LL = Transformer.from_crs(GALE_CRS, LONLAT_CRS, always_xy=True)
FROM_PROJECT = Transformer.from_crs(PROJECT_CRS, GALE_CRS, always_xy=True)


def rc(x, y):
    """Gale-frame metres -> (row, col) float on the 3 m grid."""
    return (Y0 - np.asarray(y)) / CELL, (np.asarray(x) - X0) / CELL


def inside(r, c):
    return (r >= 0) & (c >= 0) & (r < GRID_SHAPE[0]) & (c < GRID_SHAPE[1])


def sample(arr, x, y):
    r, c = rc(x, y); ok = inside(r, c)
    out = np.full(len(np.atleast_1d(x)), np.nan, dtype="float64")
    out[ok] = arr[r[ok].astype(int), c[ok].astype(int)]
    return out


def densify_gale(geom_ll, step=1.0):
    """Lon/lat (Mars sphere) line(s) -> list of Nx2 arrays in Gale metres, resampled every `step` m."""
    parts = geom_ll.geoms if isinstance(geom_ll, MultiLineString) else [geom_ll]
    out = []
    for p in parts:
        xy = np.array(p.coords)[:, :2]
        gx, gy = TO_GALE.transform(xy[:, 0], xy[:, 1])
        ln = LineString(np.c_[gx, gy])
        if ln.length == 0:
            continue
        d = np.arange(0, ln.length, step)
        out.append(np.array([ln.interpolate(v).coords[0] for v in d]))
    return out


def rover_path_points(step=1.0):
    """Curiosity's driven path inside the analysis grid: MMGIS traverse (sols up to 5073), resampled every 1 m."""
    tr = gpd.read_file(ROVER, layer="traverse_mmgis")
    pts = []
    for g in tr.geometry:
        for a in densify_gale(g, step):
            r, c = rc(a[:, 0], a[:, 1]); pts.append(a[inside(r, c)])
    return np.vstack([p for p in pts if len(p)])


def write_grid(path, arr, dtype, nodata=None, tags=None, colormap=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    prof = dict(driver="GTiff", width=GRID_SHAPE[1], height=GRID_SHAPE[0], count=1, dtype=dtype, crs=GRID_CRS,
                transform=GRID_T, compress="deflate", nodata=nodata)
    with rasterio.open(path, "w", **prof) as d:
        d.write(arr.astype(dtype), 1)
        if tags:
            d.update_tags(**{k: (json.dumps(v) if not isinstance(v, str) else v) for k, v in tags.items()})
        if colormap:
            d.write_colormap(1, colormap)
