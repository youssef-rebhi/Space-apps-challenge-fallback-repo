"""Layer 1 (base map): QGIS project with the 25 cm USGS mosaic for the box, one fixed contrast stretch, saved view on the box.
Run with QGIS's Python:  "C:/Program Files/QGIS 4.2.3/bin/python-qgis.bat" -P scripts/21_qgis_project.py   (from possible_output/layer1_basemap)
Writes: qgis/layer1_basemap.qgz, docs/preview_box.png
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "possible_output", "scripts"))
from qgz_view import main_project_crs_wkt, set_saved_view  # noqa: E402
from qgis.core import (QgsApplication, QgsProject, QgsRasterLayer, QgsVectorLayer, QgsCoordinateReferenceSystem,
                       QgsSingleBandGrayRenderer, QgsContrastEnhancement, QgsFillSymbol, QgsMapSettings,
                       QgsMapRendererParallelJob, QgsRectangle, QgsLayerMetadata)
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtCore import QSize

BASE = os.path.join(HERE, "raw", "usgs_msl_gale_ortho_25cm_box.tif")
LOG = json.load(open(os.path.join(HERE, "raw", "fetch_log.json")))
OUT = os.path.join(HERE, "qgis", "layer1_basemap.qgz")
os.makedirs(os.path.dirname(OUT), exist_ok=True); os.makedirs(os.path.join(HERE, "docs"), exist_ok=True)
K = math.pi / 180 * 3396190.0
VIEW = ((137.36 - 137.38) * K - 120, -4.83 * K - 120, (137.40 - 137.38) * K + 120, -4.78 * K + 120)  # box + 120 m


def base_layer(path, name, stretch):
    lyr = QgsRasterLayer(path, name)
    assert lyr.isValid(), path
    ce = QgsContrastEnhancement(lyr.dataProvider().dataType(1))
    ce.setContrastEnhancementAlgorithm(QgsContrastEnhancement.StretchToMinimumMaximum)
    ce.setMinimumValue(stretch[0]); ce.setMaximumValue(stretch[1])
    r = QgsSingleBandGrayRenderer(lyr.dataProvider(), 1); r.setContrastEnhancement(ce)
    lyr.setRenderer(r)
    m = QgsLayerMetadata(); m.setTitle("USGS MSL Gale Merged Orthophoto Mosaic 25 cm v3, study box")
    m.setAbstract("Layer 1 base map. " + LOG["citation"] + ". Source " + LOG["source_url"]
                  + ". Native grid (eqc lon_0=0, Mars 2000 sphere, 0.25 m), no resampling; this grid is the frame the "
                  "NASA rover positions are in (team decision, possible_output/METADATA.md section D). Fixed contrast "
                  f"stretch {stretch[0]:.0f}-{stretch[1]:.0f} = 2nd-98th percentile of the whole box.")
    lyr.setMetadata(m)
    return lyr


if __name__ == "__main__":
    app = QgsApplication([], False); app.initQgis()
    p = QgsProject.instance(); p.clear()
    p.setCrs(QgsCoordinateReferenceSystem.fromWkt(main_project_crs_wkt()))
    p.setTitle("Layer 1 - Base map (USGS 25 cm, Gale frame)")
    base = base_layer(BASE, "Base map 25 cm (USGS MSL Gale orthomosaic v3)", LOG["stretch_p2_p98"])
    box = QgsVectorLayer(os.path.join(ROOT, "data", "clean", "geology", "study_box.gpkg") + "|layername=study_box",
                         "Study box 137.36–137.40°E, 4.78–4.83°S", "ogr")
    box.renderer().setSymbol(QgsFillSymbol.createSimple({"style": "no", "outline_color": "white", "outline_style": "dash", "outline_width": "0.8"}))
    root = p.layerTreeRoot()
    for lyr in (box, base):
        p.addMapLayer(lyr, False)
    g = root.addGroup("Layer 1 - Base map")
    g.addLayer(box); g.addLayer(base)
    assert p.write(OUT)
    ms = QgsMapSettings(); ms.setDestinationCrs(p.crs()); ms.setOutputSize(QSize(1000, 1200)); ms.setBackgroundColor(QColor("magenta"))
    ms.setLayers([box, base]); ms.setExtent(QgsRectangle(*VIEW))
    j = QgsMapRendererParallelJob(ms); j.start(); j.waitForFinished(); j.renderedImage().save(os.path.join(HERE, "docs", "preview_box.png"))
    app.exitQgis()
    set_saved_view(OUT, *VIEW)
    print("written:", OUT)
