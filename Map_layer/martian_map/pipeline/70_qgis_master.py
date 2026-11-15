"""Master QGIS project for the clean workspace: Layers 1-5 + GO/NO-GO conversion layers + combined map + routes.

Run with QGIS's Python (from martian_map/):
  "C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" -P pipeline/70_qgis_master.py
Writes qgis/martian_map.qgz (relative paths, opens on the study box) and docs/img/qgis_master_preview.png.
The geology style is COPIED from the team's main project qgis/mount_sharp_geology.qgz, which is opened read-only (never saved).
"""
import hashlib, json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from paths import *  # noqa: F403,E402
from qgz_view import main_project_crs_wkt, set_saved_view, MAIN_CRS_WKT_SOURCE, SAVED_CRS_WKT  # noqa: E402
from qgis.core import (QgsApplication, QgsProject, QgsVectorLayer, QgsRasterLayer, QgsCoordinateReferenceSystem,  # noqa: E402
                       QgsLineSymbol, QgsMarkerSymbol, QgsFillSymbol, QgsSingleBandGrayRenderer, QgsContrastEnhancement,
                       QgsPalettedRasterRenderer, QgsMapSettings, QgsMapRendererParallelJob, QgsRectangle, QgsLayerMetadata,
                       QgsPalLayerSettings, QgsTextFormat, QgsTextBufferSettings, QgsVectorLayerSimpleLabeling,
                       QgsRuleBasedRenderer, QgsReadWriteContext, QgsCategorizedSymbolRenderer, QgsRendererCategory)
from qgis.PyQt.QtGui import QColor  # noqa: E402
from qgis.PyQt.QtCore import QSize  # noqa: E402
from qgis.PyQt.QtXml import QDomDocument  # noqa: E402

OUT = os.path.join(QGIS_DIR, "martian_map.qgz"); os.makedirs(QGIS_DIR, exist_ok=True)
K = math.pi / 180 * R_MARS
VIEW = ((137.36 - 137.38) * K - 120, -4.83 * K - 120, (137.40 - 137.38) * K + 120, -4.78 * K + 120)
CLS = [(1, "#1a9850", "GO"), (2, "#f4c430", "CAUTION"), (3, "#d73027", "NO-GO"), (0, "#9e9e9e", "UNKNOWN")]
rules = json.load(open(os.path.join(GONOGO, "gonogo_rules.json")))
md5 = lambda p: hashlib.md5(open(p, "rb").read()).hexdigest()  # noqa: E731
HAVE_MAIN = MAIN_CRS_WKT_SOURCE.exists()   # False in a git clone: then the saved styles and CRS are used
main_before = md5(MAIN_CRS_WKT_SOURCE) if HAVE_MAIN else None
if not os.path.exists(BASEMAP):
    raise SystemExit("Layer 1 base map missing (it is not in git): run pipeline/10_fetch_basemap.py first.")


def meta(lyr, text):
    m = QgsLayerMetadata(); m.setTitle(lyr.name()); m.setAbstract(text); lyr.setMetadata(m); return lyr


def vec(path, layer, title, text):
    lyr = QgsVectorLayer(f"{path}|layername={layer}" if layer else path, title, "ogr")
    assert lyr.isValid(), (path, layer)
    return meta(lyr, text)


def ras(path, title, text):
    lyr = QgsRasterLayer(path, title)
    assert lyr.isValid(), path
    return meta(lyr, text)


def style(lyr, qml):
    if os.path.exists(qml):
        msg, ok = lyr.loadNamedStyle(qml)
        assert ok, (qml, msg)
    return lyr


def classes(lyr, grey_label="UNKNOWN", opacity=1.0):
    cl = [QgsPalettedRasterRenderer.Class(v, QColor(c), grey_label if v == 0 else lab) for v, c, lab in CLS]
    r = QgsPalettedRasterRenderer(lyr.dataProvider(), 1, cl); r.setOpacity(opacity); lyr.setRenderer(r); return lyr


def label(lyr, expr, size=8):
    s = QgsPalLayerSettings(); s.fieldName = expr; s.isExpression = True
    f = QgsTextFormat(); f.setSize(size); f.setColor(QColor("white"))
    b = QgsTextBufferSettings(); b.setEnabled(True); b.setSize(0.8); b.setColor(QColor("black")); f.setBuffer(b)
    s.setFormat(f); lyr.setLabeling(QgsVectorLayerSimpleLabeling(s)); lyr.setLabelsEnabled(True)


app = QgsApplication([], False); app.initQgis()

# ---- copy the approved geology style from the team's main project (read-only)
geo_qml = {}
if HAVE_MAIN:
    src = QgsProject(); src.read(str(MAIN_CRS_WKT_SOURCE))
    for lyr in src.mapLayers().values():
        s = lyr.source().replace("\\", "/")
        if "geology_DRAFT_GALEFRAME.gpkg" in s and not lyr.name().startswith("OLD FRAME"):
            key = "units" if "layername=units" in s else "contacts" if "layername=contacts" in s else None
            if key and key not in geo_qml:
                doc = QDomDocument(); lyr.exportNamedStyle(doc)
                qml = os.path.join(L3, "styles", f"{key}.qml"); os.makedirs(os.path.dirname(qml), exist_ok=True)
                open(qml, "w", encoding="utf-8").write(doc.toString()); geo_qml[key] = qml
    del src
    SAVED_CRS_WKT.write_text(main_project_crs_wkt(), encoding="utf-8")
    print("geology styles copied:", geo_qml)
else:
    for key in ("units", "contacts"):
        qml = os.path.join(L3, "styles", f"{key}.qml")
        if os.path.exists(qml):
            geo_qml[key] = qml
    print("team main project not found (git clone): using the saved styles", geo_qml, "and", SAVED_CRS_WKT)

p = QgsProject.instance(); p.clear()
p.setCrs(QgsCoordinateReferenceSystem.fromWkt(main_project_crs_wkt()))
p.setTitle("Martian Map - Mount Sharp boxwork (clean workspace, 15 Nov 2026)")
p.writeEntryBool("Paths", "/Absolute", False)

# ---- Plan: routes + POIs
routes = []
for pid, col, dash in (("foot", "#00dcff", "solid"), ("rover", "#c77dff", "dash")):
    r = vec(os.path.join(GONOGO, "routes.gpkg"), "routes", f"Planned routes - {'crew on foot' if pid == 'foot' else 'rover'}",
            "Least-cost paths on the combined GO/NO-GO map between the Layer 5 POIs in visiting order (50_combined_routes.py).")
    r.setSubsetString(f"\"profile\" = '{pid}'")
    r.renderer().setSymbol(QgsLineSymbol.createSimple({"line_color": col, "line_width": "1.0", "line_style": dash}))
    routes.append(r)
poi = style(vec(POI, "poi", "Points of interest (Layer 5)", "Approved Layer 5 POIs."), os.path.join(L5, "styles", "poi.qml"))
eva = style(vec(POI, "eva_stops", "EVA stops with AI terrain (Layer 5)",
                "Team AI on NASA Navcam. Team colours (repo ASSUMPTIONS.md): red if sand > 30% or big rock > 2%; "
                "orange if sand 10-30% or AI certainty < 0.75; else green."),
            os.path.join(L5, "styles", "eva_stops.qml"))
# ---- Layer 4
cur = vec(ROVER, "position_current", "Curiosity now, sol 5073 (base)", "NASA/JPL MMGIS current position.")
cur.renderer().setSymbol(QgsMarkerSymbol.createSimple({"name": "star", "color": "#ff9e3d", "outline_color": "black", "size": "6"}))
label(cur, "'BASE: sol ' || \"sol\"", 9)
tr = vec(ROVER, "traverse_mmgis", "Curiosity traverse (NASA MMGIS)", "Approved Layer 4.")
tr.renderer().setSymbol(QgsLineSymbol.createSimple({"line_color": "#ffffff", "line_width": "0.5"}))
wp = vec(ROVER, "waypoints_mmgis", "Waypoints (NASA MMGIS)", "End-of-drive positions with roll/pitch/tilt.")
wp.renderer().setSymbol(QgsMarkerSymbol.createSimple({"name": "circle", "color": "#ffd400", "outline_color": "black", "size": "1.6"}))
# ---- GO/NO-GO combined (Part 3)
comb = [classes(ras(os.path.join(GONOGO, f"combined_{pid}.tif"), f"COMBINED GO/NO-GO - {pid}",
                    "Worst of slope, roughness, terrain unit; rover-driven ground capped at CAUTION; then EVA-stop hazards "
                    "(a red stop's 15 m keep-out stays NO-GO). "
                    "See gonogo/gonogo_rules.json and gonogo/calibration/combined_report.json."), opacity=0.7) for pid in ("foot", "rover")]
reach = ras(os.path.join(GONOGO, "reach_from_base_foot.tif"), "Reach from base (equivalent m) - foot",
            "Accumulated route cost from the sol 5073 position.")
cert = ras(os.path.join(GONOGO, "certainty.tif"), "Certainty (0 none, 1 orbital, 2 seen, 3 driven)", json.dumps(rules["certainty"]["codes"]))
cert.setRenderer(QgsPalettedRasterRenderer(cert.dataProvider(), 1, [QgsPalettedRasterRenderer.Class(k, QColor(c), lab) for k, c, lab in (
    (0, "#9e9e9e", "none (no DEM)"), (1, "#c6dbef", "orbital only"), (2, "#6baed6", "seen from the ground (EVA stop)"), (3, "#08519c", "driven by Curiosity"))]))
# ---- conversion layers (Part 2)
GREY = {"slope_foot": "no DEM value", "slope_rover": "no DEM value", "roughness": "rougher than anything Curiosity crossed",
        "terrain": "not mapped (neutral)", "groundtruth": "no ground truth yet"}
conv = []
for name in ("slope_foot", "slope_rover", "roughness", "terrain", "groundtruth"):
    r = rules["layers"][name]
    rl = ras(os.path.join(GONOGO, f"conv_{name}.tif"), f"{r['title']}  [{r['parameter']}]",
             f"Rule: {json.dumps(r['rule'])}\nBasis: {r['basis']}")
    conv.append(classes(rl, f"UNKNOWN - {GREY[name]}", 0.8))
# ---- Layer 3
units = vec(GEOLOGY, "units", "Geology units (Layer 3, approved)", "Approved 15 Nov 2026.")
contacts = vec(GEOLOGY, "contacts", "Geology contacts (Layer 3)", "Approved 15 Nov 2026.")
if "units" in geo_qml:
    style(units, geo_qml["units"])
else:
    cats = [QgsRendererCategory(c, QgsFillSymbol.createSimple({"color": col, "outline_color": "black"}), c) for c, col in
            (("LSu", "#d9b38c80"), ("BXr", "#8c510a80"), ("BXh", "#bf812d80"), ("Aeo", "#f6e8c380"))]
    units.setRenderer(QgsCategorizedSymbolRenderer("unit_code", cats))
if "contacts" in geo_qml:
    style(contacts, geo_qml["contacts"])
sim = vec(os.path.join(L3, "context_sim3292", "sim3292_gale_context.gpkg"), None, "Context: USGS SIM 3292 (1:20M)",
          "Tanaka et al. 2014 global geologic map, clipped to Gale.")
# ---- Layer 2
hill = ras(HILLSHADE, "Hillshade 1 m (Layer 2)", "USGS MSL Gale DEM 1 m v3.")
elev = style(ras(DEM, "Elevation 1 m (Layer 2)", "USGS MSL Gale DEM 1 m v3, m (areoid)."), os.path.join(L2, "styles", "elevation_box.qml"))
slc = style(ras(os.path.join(L2, "slope_classes_box_3m_GALEFRAME.tif"), "Slope classes 3 m (Layer 2)", "15/25 deg."),
            os.path.join(L2, "styles", "slope_classes.qml"))
cont = style(vec(os.path.join(L2, "contours_box_5m_GALEFRAME.gpkg"), None, "Contours 5 m (Layer 2)", ""),
             os.path.join(L2, "styles", "contours_5m.qml"))
# ---- Layer 1
log = json.load(open(BASEMAP_LOG))
base = ras(BASEMAP, "Base map 25 cm (Layer 1, USGS orthomosaic)", log["citation"])
ce = QgsContrastEnhancement(base.dataProvider().dataType(1))
ce.setContrastEnhancementAlgorithm(QgsContrastEnhancement.StretchToMinimumMaximum)
ce.setMinimumValue(log["stretch_p2_p98"][0]); ce.setMaximumValue(log["stretch_p2_p98"][1])
gr = QgsSingleBandGrayRenderer(base.dataProvider(), 1); gr.setContrastEnhancement(ce); base.setRenderer(gr)
box = vec(STUDY_BOX, "study_box", "Study box", "137.36-137.40E, 4.83-4.78S")
box.renderer().setSymbol(QgsFillSymbol.createSimple({"style": "no", "outline_color": "white", "outline_style": "dash", "outline_width": "0.8"}))

root = p.layerTreeRoot()
GROUPS = [
    ("Plan: routes, POIs, base", [routes[0], routes[1], cur, poi, eva], {routes[1], eva}),
    ("Layer 4 - Curiosity rover trajectory", [tr, wp], {wp}),
    ("GO/NO-GO combined map (Part 3)", [comb[0], comb[1], reach, cert], {comb[1], reach, cert}),
    ("GO/NO-GO conversion layers (Part 2) - one per input", conv, set(conv)),
    ("Layer 3 - Geology", [contacts, units, sim], {sim}),
    ("Layer 2 - Elevation", [cont, slc, elev, hill], {cont, slc, elev, hill}),
    ("Layer 1 - Base map", [box, base], set()),
]
for gname, lyrs, off in GROUPS:
    g = root.addGroup(gname)
    for l in lyrs:
        p.addMapLayer(l, False); n = g.addLayer(l); n.setItemVisibilityChecked(l not in off)
    if gname.startswith("GO/NO-GO conversion"):
        g.setExpanded(False)
root.findGroup("Layer 3 - Geology").setItemVisibilityChecked(False)
assert p.write(OUT), "write failed"

ms = QgsMapSettings(); ms.setDestinationCrs(p.crs()); ms.setOutputSize(QSize(1000, 1240)); ms.setBackgroundColor(QColor("black"))
ms.setLayers([routes[0], cur, poi, tr, comb[0], box, base]); ms.setExtent(QgsRectangle(*VIEW))
j = QgsMapRendererParallelJob(ms); j.start(); j.waitForFinished()
os.makedirs(os.path.join(MM, "docs", "img"), exist_ok=True)
j.renderedImage().save(os.path.join(MM, "docs", "img", "qgis_master_preview.png"))
app.exitQgis()
set_saved_view(OUT, *VIEW)
if HAVE_MAIN:
    assert md5(MAIN_CRS_WKT_SOURCE) == main_before, "main project changed!"
print("written:", OUT, "| main project untouched" if HAVE_MAIN else "| built from the saved styles and CRS")
