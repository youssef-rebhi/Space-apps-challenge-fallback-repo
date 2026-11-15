"""Helpers for QGIS projects written by headless PyQGIS (python-qgis.bat).

A headless QgsProject.write() has no map canvas, so the saved view (<mapcanvas>) is missing and QGIS opens the
project on an empty area. set_saved_view() adds that block, reusing the project's own CRS definition.
"""
import re
import zipfile
from pathlib import Path

# The team's main project sits next to martian_map/ in the original workspace, not in a git clone.
MAIN_CRS_WKT_SOURCE = Path(__file__).resolve().parents[2] / "qgis" / "mount_sharp_geology.qgz"
# Saved copy of that project's CRS, so the pipeline also runs from a git clone.
SAVED_CRS_WKT = Path(__file__).resolve().parents[1] / "qgis" / "project_crs.wkt"


def main_project_crs_wkt():
    """WKT of the team's project CRS (eqc lon_0=137.38, Mars sphere).
    Read from qgis/mount_sharp_geology.qgz when it is there, else from the saved copy qgis/project_crs.wkt."""
    if not MAIN_CRS_WKT_SOURCE.exists():
        return SAVED_CRS_WKT.read_text(encoding="utf-8")
    z = zipfile.ZipFile(MAIN_CRS_WKT_SOURCE)
    x = z.read([n for n in z.namelist() if n.endswith(".qgs")][0]).decode("utf-8")
    return re.search(r"<projectCrs>.*?<wkt>(.*?)</wkt>", x, re.S).group(1)


def set_saved_view(qgz, xmin, ymin, xmax, ymax):
    qgz = Path(qgz)
    z = zipfile.ZipFile(qgz)
    members = {n: z.read(n) for n in z.namelist()}
    z.close()
    name = [n for n in members if n.endswith(".qgs")][0]
    x = members[name]
    if b"<mapcanvas" in x:
        x = re.sub(rb"[ \t]*<mapcanvas\b.*?</mapcanvas>[ \t]*\r?\n?", b"", x, flags=re.S)
    srs = re.search(rb"<projectCrs>\s*(<spatialrefsys\b.*?</spatialrefsys>)\s*</projectCrs>", x, re.S).group(1)
    block = (b'  <mapcanvas annotationsVisible="1" name="theMapCanvas">\n    <units>meters</units>\n    <extent>\n'
             + f"      <xmin>{xmin:.6f}</xmin>\n      <ymin>{ymin:.6f}</ymin>\n      <xmax>{xmax:.6f}</xmax>\n      <ymax>{ymax:.6f}</ymax>\n".encode()
             + b"    </extent>\n    <rotation>0</rotation>\n    <destinationsrs>\n      " + srs
             + b"\n    </destinationsrs>\n    <rendermaptile>0</rendermaptile>\n    <expressionContextScope/>\n  </mapcanvas>\n")
    m = re.search(rb"(<polymorphicRelations\b[^>]*/>|</polymorphicRelations>)[ \t]*\r?\n", x)
    pos = m.end() if m else x.find(b"  <projectlayers")
    x = x[:pos] + block + x[pos:]
    tmp = qgz.with_suffix(".qgz.tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
        for n, d in members.items():
            out.writestr(n, x if n == name else d)
    tmp.replace(qgz)
