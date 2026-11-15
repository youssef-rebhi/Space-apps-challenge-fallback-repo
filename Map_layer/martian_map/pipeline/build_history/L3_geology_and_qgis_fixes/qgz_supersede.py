"""Move the HiRISE-frame groups into one unticked 'SUPERSEDED' group at the bottom of the layer tree.
Byte-level edit of the .qgs inside the .qgz; nothing else changes.
Usage: python -I qgz_supersede.py <project.qgz> <expected_saveDateTime> <backup_path>
"""
import re, shutil, sys, zipfile
from pathlib import Path

proj, expect, backup = Path(sys.argv[1]), sys.argv[2].encode(), Path(sys.argv[3])
z = zipfile.ZipFile(proj)
members = {n: z.read(n) for n in z.namelist()}
z.close()
qgs = [n for n in members if n.endswith(".qgs")][0]
x = members[qgs]

m = re.search(rb'saveDateTime="([^"]+)"', x)
if m.group(1) != expect:
    raise SystemExit(f"project was saved since ({m.group(1)}); not touching it")

PARENT = "SUPERSEDED – HiRISE frame, 44 m off the Gale frame (do not use with rover data)"
OLD = {  # current group name (as in XML) -> new name
    b"DRAFT geology (for review)": "OLD FRAME – DRAFT geology v1 (replaced by Gale frame revised)",
    b"Terrain (data/clean/geology)": "OLD FRAME – Terrain: DTM + hillshade (data/clean/geology)",
    b"HiRISE images &amp; source DTM (data/raw, read-only)": "OLD FRAME – HiRISE images &amp; source DTM (data/raw, read-only)",
}
if PARENT.encode() in x:
    raise SystemExit("already done")

moved = []
for old_name, new_name in OLD.items():
    pat = re.compile(rb'[ \t]*<layer-tree-group[^>]*name="' + re.escape(old_name) + rb'"[^>]*>.*?</layer-tree-group>[ \t]*\r?\n', re.S)
    hits = pat.findall(x)
    if len(hits) != 1:
        raise SystemExit(f"{old_name!r}: found {len(hits)} matches, expected 1")
    block = hits[0]
    if block.count(b"<layer-tree-group") != 1:
        raise SystemExit(f"{old_name!r} has nested groups; not handled")
    x = x.replace(block, b"", 1)
    block = block.replace(b'name="' + old_name + b'"', b'name="' + new_name.encode() + b'"', 1)
    block = re.sub(rb'^([ \t]*<layer-tree-group )checked="Qt::Checked"', rb'\1checked="Qt::Unchecked"', block, count=1)
    block = re.sub(rb'^([ \t]*<layer-tree-group [^>]*?)expanded="1"', rb'\1expanded="0"', block, count=1)
    # indent one level deeper (2 spaces), line by line
    block = b"".join(b"  " + ln if ln.strip() else ln for ln in block.splitlines(keepends=True))
    moved.append(block)
    print("moved:", old_name.decode(), "->", new_name)

parent = (b'    <layer-tree-group checked="Qt::Unchecked" expanded="1" groupLayer="" name="' + PARENT.encode()
          + b'" wms-group-request-mode="Normal">\n      <customproperties>\n        <Option/>\n      </customproperties>\n'
          + b"".join(moved) + b"    </layer-tree-group>\n")
i = x.find(b"    <custom-order")
if i < 0:
    raise SystemExit("custom-order anchor not found")
x = x[:i] + parent + x[i:]

shutil.copy2(proj, backup)
tmp = proj.with_suffix(".qgz.tmp")
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
    for n, data in members.items():
        out.writestr(n, x if n == qgs else data)
tmp.replace(proj)
print("written; backup at", backup)
