"""Layer 4 (rover trajectory): QGIS project with rover data only (no geology), on the Layer 1 base map.
Run with QGIS's Python:  "C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" -P scripts/41_qgis_project.py   (from possible_output/layer4_rover)
Writes: qgis/layer4_rover.qgz, docs/preview_box.png
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "possible_output", "scripts"))
sys.path.insert(0, os.path.join(ROOT, "possible_output", "layer1_basemap", "scripts"))
from qgz_view import main_project_crs_wkt, set_saved_view  # noqa: E402
import importlib.util  # noqa: E402
from qgis.core import (QgsApplication, QgsProject, QgsVectorLayer, QgsCoordinateReferenceSystem, QgsFillSymbol,  # noqa: E402
                       QgsLineSymbol, QgsMarkerSymbol, QgsGraduatedSymbolRenderer, QgsRendererRange,
                       QgsPalLayerSettings, QgsTextFormat, QgsTextBufferSettings, QgsVectorLayerSimpleLabeling,
                       QgsMapSettings, QgsMapRendererParallelJob, QgsRectangle, QgsLayerMetadata)
from qgis.PyQt.QtGui import QColor  # noqa: E402
from qgis.PyQt.QtCore import QSize  # noqa: E402

GPKG = os.path.join(HERE, "derived", "layer4_rover.gpkg")
L1 = os.path.join(ROOT, "possible_output", "layer1_basemap")
OUT = os.path.join(HERE, "qgis", "layer4_rover.qgz")
os.makedirs(os.path.dirname(OUT), exist_ok=True); os.makedirs(os.path.join(HERE, "docs"), exist_ok=True)
K = math.pi / 180 * 3396190.0
VIEW = ((137.36 - 137.38) * K - 120, -4.83 * K - 120, (137.40 - 137.38) * K + 120, -4.78 * K + 120)
# Waypoint colour by sol: 100-sol bins over the sols spent in the box (4384-5073); earlier sols grey
BINS = [(-1, 4383.5, "#bdbdbd", "before sol 4384 (outside the box)"), (4383.5, 4499.5, "#fde725", "sols 4384–4499"),
        (4499.5, 4599.5, "#a0da39", "sols 4500–4599"), (4599.5, 4699.5, "#4ac16d", "sols 4600–4699"),
        (4699.5, 4799.5, "#1fa187", "sols 4700–4799"), (4799.5, 4899.5, "#277f8e", "sols 4800–4899"),
        (4899.5, 4999.5, "#365c8d", "sols 4900–4999"), (4999.5, 5073.5, "#46327e", "sols 5000–5073")]


def vlayer(name, title):
    lyr = QgsVectorLayer(f"{GPKG}|layername={name}", title, "ogr")
    assert lyr.isValid(), name
    return lyr


def label(lyr, expr, size=8, max_denominator=None):
    s = QgsPalLayerSettings(); s.fieldName = expr; s.isExpression = True
    fmt = QgsTextFormat(); fmt.setSize(size); fmt.setColor(QColor("white"))
    buf = QgsTextBufferSettings(); buf.setEnabled(True); buf.setSize(0.8); buf.setColor(QColor("black")); fmt.setBuffer(buf)
    s.setFormat(fmt)
    if max_denominator:
        s.scaleVisibility = True; s.minimumScale = max_denominator; s.maximumScale = 1
    lyr.setLabeling(QgsVectorLayerSimpleLabeling(s)); lyr.setLabelsEnabled(True)


def meta(lyr, text):
    m = QgsLayerMetadata(); m.setTitle(lyr.name()); m.setAbstract(text); lyr.setMetadata(m)


if __name__ == "__main__":
    app = QgsApplication([], False); app.initQgis()
    p = QgsProject.instance(); p.clear()
    p.setCrs(QgsCoordinateReferenceSystem.fromWkt(main_project_crs_wkt()))
    p.setTitle("Layer 4 - Curiosity rover trajectory")

    cur = vlayer("position_current", "Curiosity now, sol 5073 (NASA MMGIS)")
    cur.renderer().setSymbol(QgsMarkerSymbol.createSimple({"name": "star", "color": "#ffd400", "outline_color": "black", "size": "6"}))
    label(cur, "'sol ' || \"sol\" || ' (current)'", 9)
    meta(cur, "NASA/JPL MMGIS MSL_waypoints_current.json: last reported position.")

    wp = vlayer("waypoints_mmgis", "Waypoints by sol (NASA MMGIS)")
    ranges = []
    for lo, hi, col, lab in BINS:
        sym = QgsMarkerSymbol.createSimple({"name": "circle", "color": col, "outline_color": "black", "outline_width": "0.2", "size": "2.2"})
        ranges.append(QgsRendererRange(lo, hi, sym, lab))
    wp.setRenderer(QgsGraduatedSymbolRenderer("sol", ranges))
    label(wp, "'sol ' || \"sol\"", 7, max_denominator=2500)  # sol labels only when zoomed in past 1:2,500
    meta(wp, "NASA/JPL MMGIS MSL_waypoints.json: end-of-drive positions (sol, site, drive, elev_geoid). USGS Gale frame.")

    tr = vlayer("traverse_mmgis", "Traverse to sol 5073 (NASA MMGIS)")
    tr.renderer().setSymbol(QgsLineSymbol.createSimple({"line_color": "#ffd400", "line_width": "0.6"}))
    meta(tr, "NASA/JPL MMGIS MSL_traverse.json: drive lines, whole mission (38.29 km by its Length field).")

    pl = vlayer("drive_path_places", "Drive path to sol 4868 (NASA PDS PLACES, denser)")
    pl.renderer().setSymbol(QgsLineSymbol.createSimple({"line_color": "#ff7f00", "line_width": "0.35", "line_style": "dash"}))
    meta(pl, "NASA PDS MSL PLACES localized_interp.csv, ROVER rows only (49,194 positions, sols 0-4868). "
             "Matches MMGIS at shared site/drive to median 0.00 m, max 2.1 m. Ends at sol 4868.")

    box = QgsVectorLayer(os.path.join(ROOT, "data", "clean", "geology", "study_box.gpkg") + "|layername=study_box",
                         "Study box 137.36–137.40°E, 4.78–4.83°S", "ogr")
    box.renderer().setSymbol(QgsFillSymbol.createSimple({"style": "no", "outline_color": "white", "outline_style": "dash", "outline_width": "0.8"}))

    spec = importlib.util.spec_from_file_location("l1", os.path.join(L1, "scripts", "21_qgis_project.py"))
    l1 = importlib.util.module_from_spec(spec); spec.loader.exec_module(l1)
    base = l1.base_layer(l1.BASE, "Base map 25 cm (Layer 1)", l1.LOG["stretch_p2_p98"])

    root = p.layerTreeRoot()
    for lyr in (cur, wp, tr, pl, box, base):
        p.addMapLayer(lyr, False)
    g4 = root.addGroup("Layer 4 - Curiosity rover trajectory (NASA)")
    for lyr in (cur, wp, tr, pl):
        g4.addLayer(lyr)
    g4.findLayer(pl.id()).setItemVisibilityChecked(False)  # optional denser path, off by default
    gr = root.addGroup("Reference"); gr.addLayer(box)
    gb = root.addGroup("Base map (Layer 1)"); gb.addLayer(base)
    assert p.write(OUT)

    ms = QgsMapSettings(); ms.setDestinationCrs(p.crs()); ms.setOutputSize(QSize(1000, 1200)); ms.setBackgroundColor(QColor("magenta"))
    ms.setLayers([cur, wp, tr, box, base]); ms.setExtent(QgsRectangle(*VIEW))
    j = QgsMapRendererParallelJob(ms); j.start(); j.waitForFinished(); j.renderedImage().save(os.path.join(HERE, "docs", "preview_box.png"))
    app.exitQgis()
    set_saved_view(OUT, *VIEW)
    print("written:", OUT)
