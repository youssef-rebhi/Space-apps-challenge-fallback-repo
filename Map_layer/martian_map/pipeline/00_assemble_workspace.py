"""Assemble the clean martian_map workspace from the approved layer files (15 Nov 2026).

COPIES (never moves) every approved product, its source data, styles, build scripts and documentation into
martian_map/, and records origin -> destination, size and MD5 for every file in docs/FILE_MAP.json.
The approved geology (Layer 3) is written with an extra `status` field; nothing else is altered.

Run from the project root:  martian_map/.venv/Scripts/python.exe -I martian_map/pipeline/00_assemble_workspace.py
"""
import glob, hashlib, json, os, shutil, sys, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # project root
MM = os.path.join(ROOT, "martian_map")
SCRATCH = sys.argv[1] if len(sys.argv) > 1 else None  # optional: folder holding helper scripts used on 15 Nov
PO, DR, DC = "possible_output", "data/raw/geology", "data/clean"
L = "layers"

COPIES = [  # (source glob relative to ROOT, destination folder relative to martian_map)
    # ---- Layer 1 base map
    (f"{PO}/layer1_basemap/raw/usgs_msl_gale_ortho_25cm_box.tif", f"{L}/L1_basemap"),
    (f"{PO}/layer1_basemap/raw/fetch_log.json", f"{L}/L1_basemap"),
    (f"{PO}/layer1_basemap/raw/fetch_console.log", f"{L}/L1_basemap"),
    (f"{PO}/layer1_basemap/docs/preview_box.png", f"{L}/L1_basemap/docs"),
    # ---- Layer 2 elevation (Gale frame products, regional context, checks, source windows, styles, old exports)
    *[(f"{PO}/derived/{n}", f"{L}/L2_elevation") for n in (
        "elevation_box_1m_GALEFRAME.tif", "hillshade_box_1m_GALEFRAME.tif", "contours_box_1m_GALEFRAME.gpkg",
        "contours_box_5m_GALEFRAME.gpkg", "slope_box_3m_GALEFRAME.tif", "slope_classes_box_3m_GALEFRAME.tif",
        "slope_classes_stats.json")],
    *[(f"{PO}/derived/{n}", f"{L}/L2_elevation/regional") for n in (
        "regional_gale_elevation_200m.tif", "regional_gale_hillshade_200m.tif", "regional_gale_contours_100m.gpkg")],
    *[(f"{PO}/derived/{n}", f"{L}/L2_elevation/checks") for n in (
        "frame_datum_tests.json", "mola_shot_check.json", "regional_hrsc_vs_mola.json", "check_shifted_redc_vs_mosaic.json",
        "hirise_dtm_box_GALEFRAME.tif")],
    (f"{PO}/raw/*.tif", f"{L}/L2_elevation/sources"), (f"{PO}/raw/*.json", f"{L}/L2_elevation/sources"),
    (f"{PO}/raw/*.log", f"{L}/L2_elevation/sources"), (f"{PO}/raw/mola_pedr/*", f"{L}/L2_elevation/sources/mola_pedr"),
    (f"{PO}/qgis/styles/*.qml", f"{L}/L2_elevation/styles"),
    (f"{PO}/exports/web/*", f"{L}/L2_elevation/exports_v1/web"), (f"{PO}/exports/leaflet/*", f"{L}/L2_elevation/exports_v1/leaflet"),
    (f"{PO}/exports/plotly/*", f"{L}/L2_elevation/exports_v1/plotly"), (f"{PO}/docs/preview_layers.png", f"{L}/L2_elevation/docs"),
    # ---- Layer 3 geology (approved draft, terrain helpers, context, inferred reference lines)
    (f"{DC}/geology/ridges_hollows_DRAFT_GALEFRAME.tif", f"{L}/L3_geology/terrain"),
    (f"{DC}/geology/tpi_relief_DRAFT_GALEFRAME.tif", f"{L}/L3_geology/terrain"),
    (f"{DC}/geology/dtm_box_GALEFRAME.tif", f"{L}/L3_geology/terrain"),
    (f"{DC}/geology/hillshade_box_GALEFRAME.tif", f"{L}/L3_geology/terrain"),
    (f"{PO}/derived/hirise_red_c_box_GALEFRAME.tif", f"{L}/L3_geology/terrain"),
    (f"{DC}/geology/study_box.gpkg", f"{L}/L3_geology"),
    (f"{DC}/context/*", f"{L}/L3_geology/context_sim3292"),
    (f"{DR}/references/zenodo_5819267_sakarya_unit_map/marker-bed_trace.*", f"{L}/L3_geology/reference_persaud2021"),
    (f"{DR}/references/zenodo_5819267_sakarya_unit_map/p3.*", f"{L}/L3_geology/reference_persaud2021"),
    (f"{DR}/references/zenodo_5819267_sakarya_unit_map/Persaud_2021_Shapefiles-README.txt", f"{L}/L3_geology/reference_persaud2021"),
    # ---- Layer 4 rover trajectory
    (f"{PO}/layer4_rover/derived/layer4_rover.gpkg", f"{L}/L4_rover"),
    (f"{PO}/layer4_rover/docs/preview_box.png", f"{L}/L4_rover/docs"),
    (f"{DR}/rover/*.json", f"{L}/L4_rover/sources"),
    ("trials/nasa_data_v2/inputs/localized_interp.csv*", f"{L}/L4_rover/sources"),
    # ---- Layer 5 points of interest
    (f"{PO}/layer5_poi/derived/layer5_poi.gpkg", f"{L}/L5_poi"),
    (f"{PO}/layer5_poi/exports/*", f"{L}/L5_poi/exports"),
    (f"{PO}/layer5_poi/sources.json", f"{L}/L5_poi"),
    (f"{PO}/layer5_poi/qgis/styles/*", f"{L}/L5_poi/styles"),
    (f"{PO}/layer5_poi/docs/*", f"{L}/L5_poi/docs"),
    (f"{PO}/layer5_poi/raw/*.json", f"{L}/L5_poi/sources"),
    (f"{PO}/layer5_poi/raw/iau_gazetteer/*", f"{L}/L5_poi/sources/iau_gazetteer"),
    # ---- Build scripts exactly as they were run (provenance)
    ("pipeline/00_download_geology_kit.py", "pipeline/build_history/downloads"),
    (f"{PO}/scripts/0*.py", "pipeline/build_history/L2_elevation"),
    (f"{PO}/layer1_basemap/scripts/*.py", "pipeline/build_history/L1_basemap"),
    (f"{PO}/layer4_rover/scripts/*.py", "pipeline/build_history/L4_rover"),
    (f"{PO}/layer5_poi/scripts/*.py", "pipeline/build_history/L5_poi"),
    (f"{PO}/scripts/qgz_view.py", "pipeline"),
    # ---- Documentation history
    ("SESSION_HANDOFF.md", "docs/history"), ("DATA_SOURCES.md", "docs/history"),
    (f"{DR}/manifest.json", "docs/history"),
    (f"{PO}/METADATA.md", "docs/history"), (f"{PO}/README.md", "docs/history/L2_README_original.md"),
    (f"{PO}/sources.json", "docs/history/L2_sources.json"),
    (f"{PO}/layer1_basemap/README.md", "docs/history/L1_README_original.md"),
    (f"{PO}/layer4_rover/README.md", "docs/history/L4_README_original.md"),
    (f"{PO}/layer5_poi/PLAN.md", "docs/history/L5_PLAN.md"),
    ("trials/nasa_data_trial/README_TRIAL.md", "docs/history/trial_nasa_data_v1_README.md"),
    ("trials/nasa_data_v2/REPORT_V2TRIAL.md", "docs/history/trial_nasa_data_v2_REPORT.md"),
    ("trials/nasa_data_v2/ANALYSIS.md", "docs/history/trial_nasa_data_v2_ANALYSIS.md"),
    ("research/*", "docs/research"),
]
if SCRATCH:  # helper scripts used on 15 Nov for SIM 3292 and the geology project fixes (were in a temp folder)
    for n in ("sim3292_clip.py", "qgz_add_sim3292.py", "qgz_restore_canvas.py", "qgz_supersede.py", "check_coverage.py",
              "qgz_inspect.py", "qgz_render_saved_view.py"):
        COPIES.append((os.path.join(SCRATCH, n), "pipeline/build_history/L3_geology_and_qgis_fixes"))


def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


file_map = []
for src_glob, dest in COPIES:
    pattern = src_glob if os.path.isabs(src_glob) else os.path.join(ROOT, src_glob)
    hits = [h for h in glob.glob(pattern) if os.path.isfile(h)]
    if not hits:
        print("MISSING:", src_glob); continue
    for h in hits:
        if dest.endswith((".md", ".json")) and len(hits) == 1:   # explicit rename
            out = os.path.join(MM, dest)
        else:
            out = os.path.join(MM, dest, os.path.basename(h))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        shutil.copy2(h, out)
        file_map.append({"from": os.path.relpath(h, ROOT).replace("\\", "/") if not os.path.isabs(src_glob) else h.replace("\\", "/"),
                         "to": os.path.relpath(out, MM).replace("\\", "/"), "bytes": os.path.getsize(out), "md5": md5(out)})

# Layer 3: approved geology = the Gale-frame draft, plus a status field (geometry and attributes otherwise unchanged)
import geopandas as gpd  # noqa: E402
src = os.path.join(ROOT, "qgis", "geology_DRAFT_GALEFRAME.gpkg")
out = os.path.join(MM, L, "L3_geology", "geology_GALEFRAME.gpkg")
if os.path.exists(out):
    os.remove(out)
for lyr in ("units", "contacts"):
    g = gpd.read_file(src, layer=lyr)
    g["status"] = "approved by the team 15 Nov 2026 (drawn by Claude 14 Nov, reviewed by the team)"
    g.to_file(out, layer=lyr, driver="GPKG")
file_map.append({"from": "qgis/geology_DRAFT_GALEFRAME.gpkg (layers units, contacts; + status field)",
                 "to": os.path.relpath(out, MM).replace("\\", "/"), "bytes": os.path.getsize(out), "md5": md5(out)})

os.makedirs(os.path.join(MM, "docs"), exist_ok=True)
json.dump({"assembled_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
           "note": "Every file below was COPIED from the original project folders; originals are untouched.",
           "files": file_map}, open(os.path.join(MM, "docs", "FILE_MAP.json"), "w"), indent=1)
print(f"copied {len(file_map)} files, {sum(f['bytes'] for f in file_map)/1e6:.0f} MB")
