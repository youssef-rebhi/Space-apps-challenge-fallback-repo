"""Separate QGIS project for Layer 5 (+ Layer 2 backdrop). Saves QML styles to qgis/styles/.
Run: "C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" scripts/11_qgis_project.py   (from layer5_poi/)
"""
import os
os.environ["GDAL_PAM_ENABLED"] = "NO"
from qgis.core import (QgsApplication, QgsProject, QgsRasterLayer, QgsVectorLayer, QgsCoordinateReferenceSystem,
                       QgsRuleBasedRenderer, QgsMarkerSymbol, QgsFillSymbol, QgsSingleSymbolRenderer, QgsPalLayerSettings,
                       QgsVectorLayerSimpleLabeling, QgsTextFormat, QgsTextBufferSettings, QgsRectangle,
                       QgsCoordinateTransform, QgsReferencedRectangle, QgsSingleBandPseudoColorRenderer,
                       QgsColorRampShader, QgsRasterShader)
from qgis.PyQt.QtGui import QColor, QFont, QPainter
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PO = os.path.dirname(HERE)  # possible_output
GPKG = os.path.join(HERE, "derived", "layer5_poi.gpkg")
STY = os.path.join(HERE, "qgis", "styles"); os.makedirs(STY, exist_ok=True)
app = QgsApplication([], False); app.initQgis()
proj = QgsProject(); root = proj.layerTreeRoot()
MARS_GEO = QgsCoordinateReferenceSystem.fromProj("+proj=longlat +R=3396190 +no_defs")
LOCAL = QgsCoordinateReferenceSystem.fromProj("+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs")

def add(l, g, vis=True, style=None):
    if not l.isValid(): print("skip", l.name()); return l
    proj.addMapLayer(l, False); g.addLayer(l).setItemVisibilityChecked(vis)
    if style: l.saveNamedStyle(os.path.join(STY, style + ".qml"))
    return l

def labels(l, expr, size=9, maxscale=None):
    pl = QgsPalLayerSettings(); pl.fieldName = expr; pl.isExpression = True
    tf = QgsTextFormat(); tf.setFont(QFont("Arial")); tf.setSize(size)
    b = QgsTextBufferSettings(); b.setEnabled(True); b.setSize(1); b.setColor(QColor("white")); tf.setBuffer(b)
    pl.setFormat(tf)
    if maxscale: pl.scaleVisibility = True; pl.minimumScale = maxscale; pl.maximumScale = 0
    l.setLabeling(QgsVectorLayerSimpleLabeling(pl)); l.setLabelsEnabled(True)

# Category symbology (neutral colours: green/orange/red/grey are reserved for safety status)
CAT = {
 "landing_site":   ("star",     "#1f3a93", 5.0, "Landing site"),
 "drill_site":     ("circle",   "#6a1b9a", 3.6, "Drill site"),
 "discovery":      ("star",     "#00838f", 4.4, "Discovery"),
 "science_target": ("diamond",  "#0277bd", 3.6, "Science target"),
 "hazard_lesson":  ("triangle", "#795548", 4.2, "Hazard lesson"),
 "rover_position": ("square",   "#000000", 3.2, "Rover position (data end)"),
 "named_feature":  ("circle",   "#555555", 1.6, "IAU named feature (label)"),
}
poi = QgsVectorLayer(GPKG + "|layername=poi", "POIs (Layer 5)", "ogr")
rr = QgsRuleBasedRenderer(QgsMarkerSymbol.createSimple({})); r0 = rr.rootRule(); r0.removeChildAt(0)
for cat, (shape, col, size, lab) in CAT.items():
    filled = cat != "named_feature"  # IAU names: evidence 'inferred' -> hollow
    sym = QgsMarkerSymbol.createSimple({"name": shape, "color": col if filled else "0,0,0,0", "outline_color": "white" if filled else col,
                                        "outline_width": "0.4", "size": str(size)})
    r0.appendChild(QgsRuleBasedRenderer.Rule(sym, filterExp=f"\"category\" = '{cat}'", label=lab))
poi.setRenderer(rr)
labels(poi, "CASE WHEN \"category\"='named_feature' THEN \"name\" ELSE \"name\" || CASE WHEN \"sol\" IS NOT NULL THEN ' (sol ' || to_int(\"sol\") || ')' ELSE '' END END", 8)

eva = QgsVectorLayer(GPKG + "|layername=eva_stops", "EVA stops, team AI (55)", "ogr")
eva.setRenderer(QgsSingleSymbolRenderer(QgsMarkerSymbol.createSimple({"name": "circle", "color": "#ffffff", "outline_color": "#333333", "size": "2.2"})))
labels(eva, "to_string(\"stop_no\")", 6, maxscale=8000)

sv = QgsVectorLayer(GPKG + "|layername=surface_view_sites", "NASA Surface View sites", "ogr")
sv.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"color": "0,0,0,0", "outline_color": "#1f3a93", "outline_width": "0.5", "outline_style": "dash"})))
labels(sv, "\"name\"", 8)

g5 = root.addGroup("Layer 5 - Points of interest (draft)")
add(poi, g5, True, "poi"); add(eva, g5, True, "eva_stops"); add(sv, g5, True, "surface_view_sites")

# Backdrop from Layer 2 (possible_output/derived)
g2 = root.addGroup("Backdrop: Layer 2 elevation")
box = QgsVectorLayer(os.path.join(PO, "..", "data", "clean", "geology", "study_box.gpkg") + "|layername=study_box", "Study box (EVA)", "ogr")
box.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"color": "0,0,0,0", "outline_color": "magenta", "outline_width": "0.7"})))
add(box, g2)
for f, name, lo, hi in (("elevation_box_1m_GALEFRAME.tif", "Elevation box 1 m", -3940, -3370),
                        ("regional_gale_elevation_200m.tif", "Elevation Gale 200 m", -4480, 590)):
    l = QgsRasterLayer(os.path.join(PO, "derived", f), name)
    if l.isValid():
        sh = QgsColorRampShader(lo, hi); sh.setColorRampType(QgsColorRampShader.Interpolated)
        sh.setColorRampItemList([QgsColorRampShader.ColorRampItem(lo, QColor("#2b83ba")), QgsColorRampShader.ColorRampItem((lo+hi)/2, QColor("#ffffbf")),
                                 QgsColorRampShader.ColorRampItem(hi, QColor("#ffffff"))])
        rs = QgsRasterShader(); rs.setRasterShaderFunction(sh)
        l.setRenderer(QgsSingleBandPseudoColorRenderer(l.dataProvider(), 1, rs)); l.setOpacity(0.5)
        l.setBlendMode(QPainter.CompositionMode.CompositionMode_Multiply)
    add(l, g2)
for f, name in (("hillshade_box_1m_GALEFRAME.tif", "Hillshade box"), ("regional_gale_hillshade_200m.tif", "Hillshade Gale")):
    add(QgsRasterLayer(os.path.join(PO, "derived", f), name), g2)

proj.setCrs(LOCAL); proj.setEllipsoid("NONE")
tr = QgsCoordinateTransform(MARS_GEO, LOCAL, proj)
proj.viewSettings().setDefaultViewExtent(QgsReferencedRectangle(tr.transformBoundingBox(QgsRectangle(137.30, -4.86, 137.47, -4.56)), LOCAL))
proj.setTitle("Layer 5 points of interest - draft")
os.makedirs(os.path.join(HERE, "qgis"), exist_ok=True)
dst = os.path.join(HERE, "qgis", "layer5_poi.qgz")
print("written" if proj.write(dst) else "FAILED", dst); app.exitQgis()
