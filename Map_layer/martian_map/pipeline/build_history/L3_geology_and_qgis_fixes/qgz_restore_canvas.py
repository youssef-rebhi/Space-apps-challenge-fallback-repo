"""Copy the GUI-only blocks (mapcanvas, projectModels, mapViewDocks) from a backup .qgz into the current .qgz.
Byte-level splice, so nothing else in the project changes.
Usage: python -I qgz_restore_canvas.py <backup.qgz> <current.qgz> <expected_saveDateTime>
"""
import re, shutil, sys, zipfile
from pathlib import Path

old_p, cur_p, expect = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3].encode()


def read(p):
    z = zipfile.ZipFile(p)
    members = {n: z.read(n) for n in z.namelist()}
    qgs = [n for n in members if n.endswith(".qgs")][0]
    return members, qgs


old, old_qgs = read(old_p)
cur, cur_qgs = read(cur_p)
xml_old, xml_cur = old[old_qgs], cur[cur_qgs]

# Refuse if the file was saved again since our headless save (e.g. by QGIS itself).
m = re.search(rb'saveDateTime="([^"]+)"', xml_cur)
if not m or m.group(1) != expect:
    raise SystemExit(f"current project saveDateTime is {m.group(1) if m else None}, expected {expect}; not touching it")

blocks = []
for tag in (b"mapcanvas", b"projectModels", b"mapViewDocks"):
    if re.search(rb"<" + tag + rb"[\s>/]", xml_cur):
        raise SystemExit(f"{tag} already present in current project; not touching it")
    mm = re.search(rb"[ \t]*<" + tag + rb"\b[^>]*/>\s*\n|[ \t]*<" + tag + rb"\b[^>]*>.*?</" + tag + rb">\s*\n", xml_old, re.S)
    if not mm:
        raise SystemExit(f"{tag} not found in backup")
    blocks.append(mm.group(0))
    print(f"copied <{tag.decode()}>: {len(mm.group(0))} bytes")

anchor = re.search(rb"(<polymorphicRelations\b[^>]*/>|</polymorphicRelations>)[ \t]*\r?\n", xml_cur)
if not anchor:
    raise SystemExit("anchor <polymorphicRelations> not found")
new_xml = xml_cur[:anchor.end()] + b"".join(blocks) + xml_cur[anchor.end():]

tmp = cur_p.with_suffix(".qgz.tmp")
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in cur.items():
        z.writestr(name, new_xml if name == cur_qgs else data)
shutil.copy2(cur_p, Path(sys.argv[4]) if len(sys.argv) > 4 else cur_p.with_suffix(".qgz.headless_save"))
tmp.replace(cur_p)
print("written:", cur_p, len(new_xml), "bytes of XML")
