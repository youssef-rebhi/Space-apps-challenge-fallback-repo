"""Render docs/preview_gale.png and docs/preview_box.png from qgis/layer5_poi.qgz (headless check)."""
import os
os.environ["GDAL_PAM_ENABLED"] = "NO"
from qgis.core import (QgsApplication, QgsProject, QgsMapSettings, QgsMapRendererParallelJob, QgsRectangle,
                       QgsCoordinateTransform, QgsCoordinateReferenceSystem)
from qgis.PyQt.QtCore import QSize
from qgis.PyQt.QtGui import QColor
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = QgsApplication([], False); app.initQgis()
p = QgsProject(); p.read(os.path.join(HERE, "qgis", "layer5_poi.qgz"))
geo = QgsCoordinateReferenceSystem.fromProj("+proj=longlat +R=3396190 +no_defs")
tr = QgsCoordinateTransform(geo, p.crs(), p)
order = [n.layer() for n in p.layerTreeRoot().findLayers() if n.isVisible()]
for name, bb, px in (("gale", (137.30, -4.87, 137.48, -4.56), (900, 1500)), ("box", (137.36, -4.83, 137.40, -4.78), (800, 1000))):
    ms = QgsMapSettings(); ms.setLayers(order); ms.setDestinationCrs(p.crs()); ms.setBackgroundColor(QColor("white"))
    ms.setExtent(tr.transformBoundingBox(QgsRectangle(*bb))); ms.setOutputSize(QSize(*px))
    j = QgsMapRendererParallelJob(ms); j.start(); j.waitForFinished()
    j.renderedImage().save(os.path.join(HERE, "docs", f"preview_{name}.png")); print("saved", name)
app.exitQgis()
