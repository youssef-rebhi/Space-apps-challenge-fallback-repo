"""Add the clipped USGS SIM 3292 context layers to the QGIS project, save it, and render a check image.
Usage: python-qgis.bat -P qgz_add_sim3292.py <project.qgz> <context.gpkg> <out_png>
"""
import sys
from qgis.core import (QgsApplication, QgsProject, QgsVectorLayer, QgsCategorizedSymbolRenderer,
                       QgsRendererCategory, QgsFillSymbol, QgsLineSymbol, QgsMarkerSymbol,
                       QgsPalLayerSettings, QgsTextFormat, QgsTextBufferSettings,
                       QgsVectorLayerSimpleLabeling, QgsMapSettings, QgsMapRendererParallelJob,
                       QgsCoordinateTransform, QgsRectangle, QgsLayerMetadata)
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtCore import QSize

proj_path, gpkg, out_png = sys.argv[1], sys.argv[2], sys.argv[3]
app = QgsApplication([], False)
app.initQgis()
p = QgsProject.instance()
assert p.read(proj_path), "project did not load"
root = p.layerTreeRoot()

GROUP = "Context: USGS SIM 3292 Geologic Map of Mars (1:20M)"
if root.findGroup(GROUP):
    raise SystemExit("group already present; nothing changed")

CITE = ("Tanaka, K.L., Skinner, J.A., Jr., Dohm, J.M., Irwin, R.P., III, Kolb, E.J., Fortezzo, C.M., "
        "Platz, T., Michael, G.G., and Hare, T.M., 2014, Geologic Map of Mars, scale 1:20,000,000: "
        "U.S. Geological Survey Scientific Investigations Map 3292, https://doi.org/10.3133/sim3292")
NOTE = ("Official Space Apps 2026 resource (USGS-NASA Planetary Geologic Mapping Program). "
        "Clipped to 127-148 E, 15 S-5 N from the published SIM 3292 shapefiles "
        "(geographic, Mars 2000 sphere). CONTEXT ONLY: at 1:20,000,000, 1 mm on the printed map is "
        "20 km on Mars, so our 2.4 x 3 km study box is about 0.1-0.15 mm. Do not use for site-scale "
        "decisions. Hidden when zoomed in closer than 1:100,000. Fill colours were chosen by the team "
        "(grouped by period); they are not the USGS map palette.")

# Colours: our choice, grouped by period (browns = Noachian, yellows = Hesperian/transition,
# greens/purples = Amazonian-Hesperian and Amazonian, grey = impact unit). Not the USGS palette.
COLOURS = {"eNh": "#8c5a3c", "mNh": "#a8744f", "lNh": "#c99a6b", "HNt": "#d9b77a",
           "eHt": "#bdb36a", "Htu": "#ecd98f", "AHtu": "#9fbf8f", "AHi": "#c9c9c9",
           "AHv": "#c48fb0", "lAv": "#a678b8"}


def meta(lyr, title):
    m = QgsLayerMetadata()
    m.setTitle(title)
    m.setAbstract(NOTE + "\n\nSource: " + CITE)
    m.setRights(["USGS public domain"])
    lyr.setMetadata(m)
    lyr.setAttribution("USGS SIM 3292 (Tanaka et al. 2014)")


def zoomed_out_only(lyr):
    lyr.setScaleBasedVisibility(True)
    lyr.setMaximumScale(100000)   # hidden when zoomed in closer than 1:100,000
    lyr.setMinimumScale(0)        # no limit when zooming out


def label(lyr, expr, size=9):
    s = QgsPalLayerSettings()
    s.fieldName = expr
    s.isExpression = False
    fmt = QgsTextFormat()
    fmt.setSize(size)
    buf = QgsTextBufferSettings()
    buf.setEnabled(True)
    buf.setSize(1.0)
    buf.setColor(QColor("white"))
    fmt.setBuffer(buf)
    s.setFormat(fmt)
    lyr.setLabeling(QgsVectorLayerSimpleLabeling(s))
    lyr.setLabelsEnabled(True)


units = QgsVectorLayer(f"{gpkg}|layername=sim3292_units", "SIM 3292 units (1:20M, context only)", "ogr")
contacts = QgsVectorLayer(f"{gpkg}|layername=sim3292_contacts", "SIM 3292 contacts", "ogr")
site = QgsVectorLayer(f"{gpkg}|layername=sim3292_landing_sites", "MSL landing site (SIM 3292)", "ogr")
for lyr in (units, contacts, site):
    assert lyr.isValid(), lyr.name()
    print(lyr.name(), "| features:", lyr.featureCount(), "| crs:", lyr.crs().description(), lyr.crs().toProj())

# Units: categorized by the 'Unit' field, label = unit code
cats = []
idx = units.fields().indexOf("UnitDesc")
desc = {}
for f in units.getFeatures():
    desc[f["Unit"]] = f["UnitDesc"]
for code in sorted(desc):
    sym = QgsFillSymbol.createSimple({"color": COLOURS.get(code, "#dddddd"), "outline_style": "no"})
    sym.setOpacity(0.8)
    cats.append(QgsRendererCategory(code, sym, f"{code}: {desc[code]}"))
units.setRenderer(QgsCategorizedSymbolRenderer("Unit", cats))
label(units, "Unit")

# Contacts: by ConType as present in the data
contypes = sorted({f["ConType"] for f in contacts.getFeatures()})
print("ConType values:", contypes)
ccats = []
for t in contypes:
    style = "dash" if str(t).lower().startswith("approx") else "solid"
    ccats.append(QgsRendererCategory(t, QgsLineSymbol.createSimple(
        {"line_color": "#3a2a1a", "line_width": "0.35", "line_style": style}), str(t)))
contacts.setRenderer(QgsCategorizedSymbolRenderer("ConType", ccats))

# Landing site point
site.renderer().setSymbol(QgsMarkerSymbol.createSimple(
    {"name": "star", "color": "#ffffff", "outline_color": "#000000", "size": "4"}))
label(site, "NAME", 10)

for lyr, title in ((units, "USGS SIM 3292 geologic units, Gale region"),
                   (contacts, "USGS SIM 3292 geologic contacts, Gale region"),
                   (site, "USGS SIM 3292 landing sites layer, Gale region")):
    meta(lyr, title)
    zoomed_out_only(lyr)
    p.addMapLayer(lyr, False)

grp = root.addGroup(GROUP)          # appended last = drawn underneath the site-scale layers
for lyr in (site, contacts, units):
    grp.addLayer(lyr)

assert p.write(proj_path), "project write failed"
print("saved:", proj_path)

# Check render: Gale region, all visible layers, at regional scale
ms = QgsMapSettings()
ms.setDestinationCrs(p.crs())
ms.setOutputSize(QSize(1100, 1000))
ms.setBackgroundColor(QColor("white"))
ms.setLayers([l for l in root.checkedLayers()])
tr = QgsCoordinateTransform(units.crs(), p.crs(), p)
ms.setExtent(tr.transformBoundingBox(QgsRectangle(133.0, -10.0, 142.0, -0.5)))
job = QgsMapRendererParallelJob(ms)
job.start()
job.waitForFinished()
job.renderedImage().save(out_png)
print("scale of check render ~ 1:", round(ms.scale()), "| png:", out_png)
app.exitQgis()
