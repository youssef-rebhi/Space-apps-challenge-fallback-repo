"""Print a QGIS project's CRS and layer tree (read-only). Usage: python-qgis.bat -P qgz_inspect.py <project.qgz>"""
import sys
from qgis.core import QgsApplication, QgsProject, QgsLayerTreeGroup, QgsLayerTreeLayer

app = QgsApplication([], False)
app.initQgis()
p = QgsProject.instance()
print("read ok:", p.read(sys.argv[1]))
print("CRS:", p.crs().authid(), "|", p.crs().description(), "|", p.crs().toProj())


def walk(node, d=0):
    for c in node.children():
        if isinstance(c, QgsLayerTreeGroup):
            print("  " * d + f"[group] {c.name()}  visible={c.isVisible()}")
            walk(c, d + 1)
        elif isinstance(c, QgsLayerTreeLayer):
            lyr = c.layer()
            src = lyr.source() if lyr else "MISSING"
            ok = lyr.isValid() if lyr else False
            print("  " * d + f"- {c.name()}  valid={ok}  crs={lyr.crs().authid() if lyr else ''}  src={src}")


walk(p.layerTreeRoot())
app.exitQgis()
