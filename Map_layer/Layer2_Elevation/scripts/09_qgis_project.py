"""Build possible_output/qgis/layer2_elevation_POSSIBLE.qgz (separate project) and save
QML styles to qgis/styles/. Does not touch qgis/ in the main project folder.
Run: "C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" scripts/09_qgis_project.py
"""
import os, sys
os.environ["GDAL_PAM_ENABLED"] = "NO"
# Optional arg: package root (e.g. the repo's Map_layer/Layer2_Elevation). Layers whose files are
# missing there are skipped; context files are looked up in <package>/context/ first.
PKG = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else None
from qgis.core import (QgsApplication, QgsProject, QgsRasterLayer, QgsVectorLayer, QgsCoordinateReferenceSystem,
                       QgsSingleBandPseudoColorRenderer, QgsColorRampShader, QgsRasterShader, QgsPalettedRasterRenderer,
                       QgsMarkerSymbol, QgsLineSymbol, QgsFillSymbol, QgsRuleBasedRenderer, QgsPalLayerSettings,
                       QgsVectorLayerSimpleLabeling, QgsRectangle, QgsCoordinateTransform, QgsReferencedRectangle,
                       QgsSingleSymbolRenderer, QgsFeature, QgsGeometry, QgsPointXY, QgsField, QgsVectorFileWriter,
                       QgsCoordinateTransformContext)
from qgis.PyQt.QtGui import QColor, QPainter
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); ROOT = os.path.dirname(HERE)
if PKG:
    HERE = PKG
    _ctx = os.path.join(PKG, "context")
    _orig_join = os.path.join
    def _remap(*a):  # redirect ROOT/data/... study_box to package context copy
        p = _orig_join(*a)
        if p.endswith("study_box.gpkg"): return _orig_join(_ctx, "study_box.gpkg")
        return p
    os.path.join = _remap
DER, EX = os.path.join(HERE, "derived"), os.path.join(HERE, "exports")
STY = os.path.join(HERE, "qgis", "styles"); os.makedirs(STY, exist_ok=True)
app = QgsApplication([], False); app.initQgis()
proj = QgsProject(); root = proj.layerTreeRoot()
MARS_GEO = QgsCoordinateReferenceSystem.fromProj("+proj=longlat +R=3396190 +no_defs")
LOCAL = QgsCoordinateReferenceSystem.fromProj("+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs")

def add(lyr, group, visible=True, style=None):
    if not lyr.isValid():
        if PKG: print("skipped (not in package):", lyr.name()); return lyr
        raise AssertionError(lyr.source())
    proj.addMapLayer(lyr, False); group.addLayer(lyr).setItemVisibilityChecked(visible)
    if style: lyr.saveNamedStyle(os.path.join(STY, style + ".qml"))
    return lyr

def pseudo(lyr, items, opacity=1.0):
    if not lyr.isValid(): return
    sh = QgsColorRampShader(items[0][0], items[-1][0]); sh.setColorRampType(QgsColorRampShader.Interpolated)
    sh.setColorRampItemList([QgsColorRampShader.ColorRampItem(v, QColor(c), l) for v, c, l in items])
    rs = QgsRasterShader(); rs.setRasterShaderFunction(sh)
    lyr.setRenderer(QgsSingleBandPseudoColorRenderer(lyr.dataProvider(), 1, rs)); lyr.setOpacity(opacity)

def contours(path, name, label_every, color):
    l = QgsVectorLayer(path, name, "ogr")
    rr = QgsRuleBasedRenderer(QgsLineSymbol.createSimple({"color": color, "width": "0.15"}))
    r0 = rr.rootRule(); r0.children()[0].setFilterExpression('"index" = 0')
    idx = QgsRuleBasedRenderer.Rule(QgsLineSymbol.createSimple({"color": color, "width": "0.45"}), filterExp='"index" = 1', label="index")
    r0.appendChild(idx); l.setRenderer(rr)
    pl = QgsPalLayerSettings(); pl.fieldName = f'CASE WHEN "index" = 1 THEN to_string(round("elev_m")) END'; pl.isExpression = True
    pl.placement = QgsPalLayerSettings.Line
    l.setLabeling(QgsVectorLayerSimpleLabeling(pl)); l.setLabelsEnabled(True); return l

ELEV_BOX = [(-3940, "#2b83ba", "-3940 m"), (-3800, "#abdda4", ""), (-3650, "#ffffbf", "-3650 m"), (-3500, "#d7783c", ""), (-3370, "#ffffff", "-3370 m")]
ELEV_REG = [(-4480, "#2b83ba", "-4480 m"), (-3200, "#abdda4", ""), (-1900, "#ffffbf", ""), (-600, "#d7783c", ""), (590, "#ffffff", "+590 m")]

# ---------- Group: Layer 2 Elevation, box, chosen frame
g2 = root.addGroup("Layer 2 - Elevation (box, USGS MSL Gale frame) POSSIBLE")
wp = QgsVectorLayer(os.path.join(EX, "rover", "waypoints_box.geojson"), "Curiosity waypoints (native Gale frame)", "ogr"); wp.setCrs(MARS_GEO)
wp.setRenderer(QgsSingleSymbolRenderer(QgsMarkerSymbol.createSimple({"name": "circle", "color": "white", "outline_color": "black", "size": "1.8"})))
pl = QgsPalLayerSettings(); pl.fieldName = "CASE WHEN \"sol\" IN (4534,4575,4709,4752,5073) THEN 'sol ' || \"sol\" END"; pl.isExpression = True
wp.setLabeling(QgsVectorLayerSimpleLabeling(pl)); wp.setLabelsEnabled(True); add(wp, g2)
add(contours(os.path.join(DER, "contours_box_5m_GALEFRAME.gpkg"), "Contours 5 m (index 25 m)", 25, "#5a3d1e"), g2, True, "contours_5m")
add(contours(os.path.join(DER, "contours_box_1m_GALEFRAME.gpkg"), "Contours 1 m (index 5 m)", 5, "#5a3d1e"), g2, False)
sc = QgsRasterLayer(os.path.join(DER, "slope_classes_box_3m_GALEFRAME.tif"), "Slope classes GO/caution/NO-GO (ASSUMED 15/25 deg)")
sc.setRenderer(QgsPalettedRasterRenderer(sc.dataProvider(), 1, [
    QgsPalettedRasterRenderer.Class(0, QColor(128, 128, 128), "? unknown (no data)"),
    QgsPalettedRasterRenderer.Class(1, QColor(26, 150, 65), "GO  < 15 deg (assumption)"),
    QgsPalettedRasterRenderer.Class(2, QColor(253, 174, 97), "! caution 15-25 deg (assumption)"),
    QgsPalettedRasterRenderer.Class(3, QColor(215, 25, 28), "NO-GO >= 25 deg (assumption)")])); sc.setOpacity(0.6)
add(sc, g2, False, "slope_classes")
sl = QgsRasterLayer(os.path.join(DER, "slope_box_3m_GALEFRAME.tif"), "Slope deg (3 m baseline)")
pseudo(sl, [(0, "#1a9641", "0"), (15, "#ffffbf", "15"), (30, "#fdae61", "30"), (45, "#d7191c", "45+")], 0.6); add(sl, g2, False, "slope_deg")
el = QgsRasterLayer(os.path.join(DER, "elevation_box_1m_GALEFRAME.tif"), "Elevation 1 m (USGS MSL Gale DEM v3) m")
pseudo(el, ELEV_BOX, 0.55); el.setBlendMode(QPainter.CompositionMode.CompositionMode_Multiply); add(el, g2, True, "elevation_box")
add(QgsRasterLayer(os.path.join(DER, "hillshade_box_1m_GALEFRAME.tif"), "Hillshade 1 m (315/30)"), g2, True)

# ---------- Group: comparison / base imagery
gc = root.addGroup("Compare: HiRISE in Gale frame vs original")
add(QgsRasterLayer(os.path.join(DER, "hirise_red_c_box_GALEFRAME.tif"), "HiRISE RED_C 1 m (shifted into Gale frame)"), gc, False)
hd = QgsRasterLayer(os.path.join(DER, "hirise_dtm_box_GALEFRAME.tif"), "HiRISE DTM (shifted; heights +15 m vs USGS DEM)"); pseudo(hd, ELEV_BOX, 1); add(hd, gc, False)
add(QgsRasterLayer(os.path.join(ROOT, "data", "raw", "geology", "hirise", "ESP_019698_1750_RED_C_01_ORTHO.JP2"), "HiRISE RED_C ORIGINAL frame (~44 m SE of Gale frame)"), gc, False)
mos = os.path.join(ROOT, "trials", "nasa_data_trial", "output", "mosaic25cm_boxwork_stops_geographic_TRIAL_DRAFT.tif")
if os.path.exists(mos): add(QgsRasterLayer(mos, "USGS 25 cm mosaic, boxwork stops (from trial)"), gc, False)

# ---------- Group: regional whole crater
gr = root.addGroup("Regional - whole Gale crater (MOLA-HRSC 200 m)")
box = QgsVectorLayer(os.path.join(ROOT, "data", "clean", "geology", "study_box.gpkg") + "|layername=study_box", "Study box", "ogr")
box.setRenderer(QgsSingleSymbolRenderer(QgsFillSymbol.createSimple({"color": "0,0,0,0", "outline_color": "magenta", "outline_width": "0.8"}))); add(box, gr)
add(contours(os.path.join(DER, "regional_gale_contours_100m.gpkg"), "Contours 100 m (index 500 m)", 500, "#3b2a14"), gr, False, "contours_regional")
re_ = QgsRasterLayer(os.path.join(DER, "regional_gale_elevation_200m.tif"), "Elevation 200 m (MOLA-HRSC blend) m")
pseudo(re_, ELEV_REG, 0.6); re_.setBlendMode(QPainter.CompositionMode.CompositionMode_Multiply); add(re_, gr, True, "elevation_regional")
add(QgsRasterLayer(os.path.join(DER, "regional_gale_hillshade_200m.tif"), "Hillshade 200 m"), gr, True)
add(QgsRasterLayer(os.path.join(HERE, "raw", "mola_463m_gale.tif"), "MOLA 463 m (cross-check)"), gr, False)

proj.setCrs(LOCAL); proj.setEllipsoid("NONE")
tr = QgsCoordinateTransform(MARS_GEO, LOCAL, proj)
proj.viewSettings().setDefaultViewExtent(QgsReferencedRectangle(tr.transformBoundingBox(QgsRectangle(137.36, -4.83, 137.40, -4.78)), LOCAL))
proj.setTitle("Layer 2 elevation - POSSIBLE OUTPUT (draft)")
dst = os.path.join(HERE, "qgis", "layer2_elevation_POSSIBLE.qgz")
print("written" if proj.write(dst) else "FAILED", dst); app.exitQgis()
