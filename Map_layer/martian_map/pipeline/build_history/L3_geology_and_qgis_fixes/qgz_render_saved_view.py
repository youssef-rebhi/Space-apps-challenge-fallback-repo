"""READ-ONLY: print the layer tree and render the ticked layers at the project's saved view. Never writes the project.
Usage: python-qgis.bat -P qgz_render_saved_view.py <project.qgz> <out_png>
"""
import re, sys, zipfile
from qgis.core import (QgsApplication, QgsProject, QgsLayerTreeGroup, QgsLayerTreeLayer, QgsMapSettings,
                       QgsMapRendererParallelJob, QgsRectangle)
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtCore import QSize

proj, out_png = sys.argv[1], sys.argv[2]
xml = zipfile.ZipFile(proj).read([n for n in zipfile.ZipFile(proj).namelist() if n.endswith(".qgs")][0])
ext = re.search(rb"<mapcanvas.*?<xmin>([-\d.e]+)</xmin>\s*<ymin>([-\d.e]+)</ymin>\s*<xmax>([-\d.e]+)</xmax>\s*<ymax>([-\d.e]+)</ymax>", xml, re.S)
xmin, ymin, xmax, ymax = (float(v) for v in ext.groups())

app = QgsApplication([], False)
app.initQgis()
p = QgsProject.instance()
assert p.read(proj)


def walk(node, d=0):
    for c in node.children():
        mark = "[x]" if c.itemVisibilityChecked() else "[ ]"
        if isinstance(c, QgsLayerTreeGroup):
            print("  " * d + f"{mark} GROUP {c.name()}")
            walk(c, d + 1)
        else:
            print("  " * d + f"{mark} {c.name()}" + ("" if c.layer() and c.layer().isValid() else "  <-- INVALID"))


walk(p.layerTreeRoot())
drawn = p.layerTreeRoot().checkedLayers()
print("\nDrawn at saved view:", [l.name() for l in drawn])
ms = QgsMapSettings()
ms.setDestinationCrs(p.crs())
ms.setOutputSize(QSize(1000, 1000))
ms.setBackgroundColor(QColor("white"))
ms.setLayers(drawn)
ms.setExtent(QgsRectangle(xmin, ymin, xmax, ymax))
job = QgsMapRendererParallelJob(ms)
job.start()
job.waitForFinished()
job.renderedImage().save(out_png)
print("rendered at ~1:", round(ms.scale()))
app.exitQgis()
