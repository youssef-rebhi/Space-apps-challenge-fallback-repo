"""Download the geology kit for the Mount Sharp boxwork box.

Box: 137.36-137.40 E, 4.78-4.83 S (planetocentric latitude, east-positive longitude).

Run from anywhere (paths are relative to the project folder):

    python pipeline/00_download_geology_kit.py --check              list files and sizes, download nothing
    python pipeline/00_download_geology_kit.py                      core tier
    python pipeline/00_download_geology_kit.py --tier detail        + 25 cm images, backup DTM, USGS GIS database
    python pipeline/00_download_geology_kit.py --tier all           + NASA's boxwork image just west of the box

Tiers
    core    what you need to start tracing units in QGIS
    detail  full-resolution images and the USGS global geologic map database
    all     NASA's PIA26306 boxwork image (PSP_001752_1750); it covers 137.24-137.36 E,
            so it stops about 200 m west of the box. Context only.

Files go to data/raw/geology/<group>/. Interrupted downloads resume; files already on disk
with the right size are skipped. DATA_SOURCES.md in the project folder gets a generated
section listing every downloaded file, for the project page's References field.
data/raw/geology/manifest.json records the same thing for scripts.

Keep data/raw/ out of git (add it to .gitignore): these files are large.
Standard library only. Python 3.9+.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "geology"
SOURCES_MD = ROOT / "DATA_SOURCES.md"
HEADERS = {"User-Agent": "geology-kit-downloader/1.0"}
TIER_RANK = {"core": 0, "detail": 1, "all": 2}
CHUNK = 1 << 20
MAX_STALLS = 5   # give up on a file after this many retries in a row that add no data

HIRISE_A = ("https://hirise-pds.lpl.arizona.edu/PDS/DTM/ESP/ORB_019600_019699/"
            "ESP_019698_1750_ESP_019988_1750/")
HIRISE_B = ("https://hirise-pds.lpl.arizona.edu/PDS/DTM/PSP/ORB_009100_009199/"
            "PSP_009149_1750_PSP_009294_1750/")
HIRISE_BOXWORK = ("https://hirise-pds.lpl.arizona.edu/PDS/RDR/PSP/ORB_001700_001799/"
                  "PSP_001752_1750/")
ROVER = "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/"
SIM = "https://pubs.usgs.gov/sim/3292/"

SRC_HIRISE = "MRO HiRISE (NASA/JPL/University of Arizona), via NASA PDS"
SRC_ROVER = "MSL Curiosity waypoints, NASA/JPL MMGIS"
SRC_SIM = "Tanaka et al. 2014, USGS SIM 3292, Geologic Map of Mars, https://doi.org/10.3133/sim3292"

# (tier, group, file name, base URL, what it is, source)
FILES = [
    ("core", "hirise", "DTEEC_019698_1750_019988_1750_U01.IMG", HIRISE_A,
     "HiRISE DTM, 1 m/px elevation, PDS3 (covers the whole box)", SRC_HIRISE),
    ("core", "hirise", "ESP_019698_1750_RED_C_01_ORTHO.JP2", HIRISE_A,
     "HiRISE greyscale orthoimage, 1 m/px, aligned to the DTM", SRC_HIRISE),
    ("core", "hirise", "ESP_019698_1750_IRB_C_01_ORTHO.JP2", HIRISE_A,
     "HiRISE false-colour (IRB) orthoimage, 1 m/px, aligned to the DTM", SRC_HIRISE),
    ("core", "rover", "MSL_waypoints.json", ROVER,
     "Curiosity waypoints, whole mission (GeoJSON)", SRC_ROVER),
    ("core", "rover", "MSL_traverse.json", ROVER,
     "Curiosity drive traverse, whole mission (GeoJSON)", SRC_ROVER),
    ("core", "rover", "MSL_waypoints_current.json", ROVER,
     "Curiosity current position (GeoJSON)", SRC_ROVER),
    ("core", "usgs_sim3292", "sim3292_readme.txt", SIM + "downloads/",
     "SIM 3292 readme", SRC_SIM),
    ("core", "usgs_sim3292", "sim3292_metadata.xml", SIM + "downloads/",
     "SIM 3292 metadata", SRC_SIM),
    ("core", "usgs_sim3292", "sim3292_pamphlet.pdf", SIM + "pdf/",
     "SIM 3292 pamphlet (unit descriptions)", SRC_SIM),
    ("core", "usgs_sim3292", "sim3292_dmu_with_locality_images.pdf", SIM + "pdf/",
     "SIM 3292 description of map units with example images", SRC_SIM),
    ("core", "usgs_sim3292", "sim3292_map.pdf", SIM + "pdf/",
     "SIM 3292 map sheet", SRC_SIM),
    ("detail", "hirise", "ESP_019698_1750_RED_A_01_ORTHO.JP2", HIRISE_A,
     "HiRISE greyscale orthoimage, 25 cm/px", SRC_HIRISE),
    ("detail", "hirise", "ESP_019698_1750_IRB_A_01_ORTHO.JP2", HIRISE_A,
     "HiRISE false-colour (IRB) orthoimage, 25 cm/px", SRC_HIRISE),
    ("detail", "hirise_backup", "DTEEC_009149_1750_009294_1750_U01.IMG", HIRISE_B,
     "Backup HiRISE DTM, 1 m/px (east half of the box)", SRC_HIRISE),
    ("detail", "hirise_backup", "PSP_009149_1750_RED_C_01_ORTHO.JP2", HIRISE_B,
     "Backup HiRISE greyscale orthoimage, 1 m/px", SRC_HIRISE),
    ("detail", "usgs_sim3292", "sim3292_database.zip", SIM + "downloads/",
     "SIM 3292 GIS database (geodatabase and shapefiles)", SRC_SIM),
    ("all", "hirise_boxwork_context", "PSP_001752_1750_RED.JP2", HIRISE_BOXWORK,
     "NASA PIA26306 boxwork image, 25 cm/px, just west of the box", SRC_HIRISE),
    ("all", "hirise_boxwork_context", "PSP_001752_1750_RED.LBL", HIRISE_BOXWORK,
     "Label for PSP_001752_1750_RED.JP2", SRC_HIRISE),
]

# (tier, Zenodo record id, local group, keep files whose name matches this regex, source)
ZENODO = [
    ("core", 5819267, "references/zenodo_5819267_sakarya_unit_map", r".*",
     "Persaud 2021, Unit map and dips/strikes of Sakarya Vallis, Gale crater, Zenodo"),
    ("core", 5808381, "references/zenodo_5808381_persaud_crism", r"(CRISM|README)",
     "Persaud 2021, Multi-resolution basemap of NW Aeolis Mons (CRISM maps only), Zenodo"),
]


def safe_name(name):
    """File names from the Zenodo API are outside data: keep only a plain file name."""
    clean = Path(name).name
    if not clean or clean in (".", "..") or clean != name.replace("\\", "/").split("/")[-1]:
        raise ValueError(f"refusing unexpected file name: {name!r}")
    return clean


def head_size(url):
    req = urllib.request.Request(url, method="HEAD", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        n = r.headers.get("Content-Length")
        return int(n) if n else None


def build_items(tier, check_sizes):
    """Every file for the chosen tier, with its expected size in bytes (None if unknown)."""
    rank = TIER_RANK[tier]
    items = []
    for t, group, name, base, what, source in FILES:
        if TIER_RANK[t] > rank:
            continue
        url = base + name
        size = None
        if check_sizes:
            try:
                size = head_size(url)
            except (urllib.error.URLError, OSError) as e:
                print(f"  ! could not reach {url}: {e}")
        items.append(dict(tier=t, group=group, name=name, url=url, size=size,
                          what=what, source=source))
    for t, record, group, pattern, source in ZENODO:
        if TIER_RANK[t] > rank:
            continue
        api = f"https://zenodo.org/api/records/{record}"
        try:
            req = urllib.request.Request(api, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                meta = json.load(r)
        except (urllib.error.URLError, OSError, ValueError) as e:
            print(f"  ! could not read Zenodo record {record}: {e}")
            continue
        for f in meta.get("files", []):
            if not re.search(pattern, f["key"]):
                continue
            items.append(dict(tier=t, group=group, name=safe_name(f["key"]),
                              url=f["links"]["self"], size=f.get("size"),
                              what=f"Zenodo record {record}",
                              source=f"{source}, https://zenodo.org/records/{record}"))
    return items


def mb(n):
    return "?" if n is None else f"{n / 1e6:,.1f} MB"


def download(item):
    dest = OUT / item["group"] / item["name"]
    expected = item["size"]
    if dest.exists() and (expected is None or dest.stat().st_size == expected):
        return "skipped (already on disk)"
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    stalls = 0                                    # failed attempts in a row that added no bytes
    while stalls < MAX_STALLS:
        have = part.stat().st_size if part.exists() else 0
        headers = dict(HEADERS)
        if have:
            headers["Range"] = f"bytes={have}-"
        try:
            req = urllib.request.Request(item["url"], headers=headers)
            with urllib.request.urlopen(req, timeout=120) as r:
                if have and r.status != 206:      # server ignored the range: start over
                    have = 0
                done, last = have, time.time()
                with open(part, "ab" if have else "wb") as f:
                    while True:
                        chunk = r.read(CHUNK)
                        if not chunk:
                            break
                        f.write(chunk)
                        done += len(chunk)
                        if time.time() - last > 5:
                            print(f"    {mb(done)} of {mb(expected)}", flush=True)
                            last = time.time()
            got = part.stat().st_size
            if expected is not None and got != expected:
                if got > expected:
                    part.unlink()
                raise OSError(f"got {got} bytes, expected {expected}")
            part.replace(dest)
            return "downloaded"
        except urllib.error.HTTPError as e:
            if e.code == 416 and expected is not None and have == expected:
                part.replace(dest)                # the .part file was already complete
                return "downloaded"
            if e.code == 416:
                part.unlink(missing_ok=True)
            reason = f"HTTP {e.code}"
        except (urllib.error.URLError, OSError) as e:
            reason = str(e)
        now = part.stat().st_size if part.exists() else 0
        stalls = 0 if now > have else stalls + 1  # keep going while each try adds data
        print(f"    interrupted at {mb(now)} ({reason}); retrying", flush=True)
        time.sleep(5 * max(1, stalls))
    return "FAILED"


def write_records(items):
    """Rewrite the generated section of DATA_SOURCES.md and the manifest from what is on disk."""
    on_disk = [i for i in items if (OUT / i["group"] / i["name"]).exists()]
    today = date.today().isoformat()
    manifest = [dict(path=str((OUT / i["group"] / i["name"]).relative_to(ROOT)).replace("\\", "/"),
                     url=i["url"], bytes=(OUT / i["group"] / i["name"]).stat().st_size,
                     tier=i["tier"], what=i["what"], source=i["source"]) for i in on_disk]
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    rows = [f"| `{m['path']}` | {m['what']} | {m['source']} | {m['url']} | {mb(m['bytes'])} |"
            for m in manifest]
    block = "\n".join([
        "<!-- geology-kit:start -->",
        f"## Geology kit (generated by pipeline/00_download_geology_kit.py, {today})",
        "",
        "| Local file | What | Source | URL | Size |",
        "|---|---|---|---|---|",
        *rows,
        "<!-- geology-kit:end -->",
    ])
    if SOURCES_MD.exists():
        text = SOURCES_MD.read_text(encoding="utf-8")
        pattern = re.compile(r"<!-- geology-kit:start -->.*?<!-- geology-kit:end -->", re.S)
        text = pattern.sub(lambda _: block, text) if pattern.search(text) else text.rstrip() + "\n\n" + block + "\n"
    else:
        text = ("# Data sources\n\nEvery external dataset, image and tool we use. "
                "Copy this into the References field of the project page.\n\n" + block + "\n")
    SOURCES_MD.write_text(text, encoding="utf-8")


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tier", choices=list(TIER_RANK), default="core")
    ap.add_argument("--check", action="store_true", help="list files and sizes, download nothing")
    args = ap.parse_args()

    print(f"Geology kit, tier '{args.tier}' -> {OUT}")
    items = build_items(args.tier, check_sizes=True)
    total = sum(i["size"] or 0 for i in items)
    for i in items:
        here = (OUT / i["group"] / i["name"]).exists()
        print(f"  [{i['tier']:<6}] {i['group'] + '/' + i['name']:<70} {mb(i['size']):>12}"
              f"{'  (on disk)' if here else ''}")
    print(f"  {len(items)} files, {mb(total)} in total")
    if args.check:
        return

    results = {}
    for n, i in enumerate(items, 1):
        print(f"[{n}/{len(items)}] {i['group']}/{i['name']} ({mb(i['size'])})", flush=True)
        results[i["name"]] = download(i)
        print(f"    {results[i['name']]}")
    write_records(items)
    failed = [k for k, v in results.items() if v == "FAILED"]
    print(f"\nDone. DATA_SOURCES.md updated. {len(failed)} failed" + (f": {', '.join(failed)}" if failed else "."))
    if failed:
        print("Run the same command again to resume the failed files.")
        sys.exit(1)


if __name__ == "__main__":
    main()
