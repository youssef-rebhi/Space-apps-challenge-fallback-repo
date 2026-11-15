"""Report the footprint of shapefiles, GeoTIFFs and a PDS3 DTM label, and whether they overlap the box.
Standard library only. Usage: python -I check_coverage.py <folder-or-file> ...
"""
import math, re, struct, sys
from pathlib import Path

BOX = (137.36, -4.83, 137.40, -4.78)  # W, S, E, N
R = 3396190.0


def overlap(b):
    w, s, e, n = b
    return not (e < BOX[0] or w > BOX[2] or n < BOX[1] or s > BOX[3])


def eqc_to_deg(x, y, lon0, lat_ts, radius=R):
    lon = lon0 + math.degrees(x / (radius * math.cos(math.radians(lat_ts))))
    lat = math.degrees(y / radius)
    return lon, lat


def prj_params(text):
    def num(name):
        m = re.search(r'PARAMETER\["%s",\s*([-\d.eE+]+)' % name, text, re.I)
        return float(m.group(1)) if m else 0.0
    projected = text.strip().upper().startswith("PROJCS")
    lon0 = num("central_meridian")
    lat_ts = num("standard_parallel_1") or num("latitude_of_origin")
    m = re.search(r'SPHEROID\["[^"]*",\s*([\d.]+)', text)
    radius = float(m.group(1)) if m else R
    return projected, lon0, lat_ts, radius


def shp(path):
    with open(path, "rb") as f:
        head = f.read(100)
    xmin, ymin, xmax, ymax = struct.unpack("<4d", head[36:68])
    prj = path.with_suffix(".prj")
    text = prj.read_text(errors="replace") if prj.exists() else ""
    projected, lon0, lat_ts, radius = prj_params(text)
    if projected:
        (w, s), (e, n) = eqc_to_deg(xmin, ymin, lon0, lat_ts, radius), eqc_to_deg(xmax, ymax, lon0, lat_ts, radius)
    else:
        w, s, e, n = xmin, ymin, xmax, ymax
    if w > 180:
        w, e = w - 360, e - 360
    return (w, s, e, n), ("projected" if projected else "geographic") + f" lon0={lon0} lat_ts={lat_ts}"


def tiff(path):
    data = open(path, "rb").read()
    bo = "<" if data[:2] == b"II" else ">"
    if struct.unpack(bo + "H", data[2:4])[0] != 42:
        return None, "not a classic TIFF"
    off = struct.unpack(bo + "I", data[4:8])[0]
    n = struct.unpack(bo + "H", data[off:off + 2])[0]
    sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8}
    fmt = {1: "B", 2: "c", 3: "H", 4: "I", 5: "II", 11: "f", 12: "d", 16: "Q"}
    tags = {}
    for i in range(n):
        e = off + 2 + i * 12
        tag, typ, cnt = struct.unpack(bo + "HHI", data[e:e + 8])
        nbytes = sizes.get(typ, 1) * cnt
        voff = e + 8 if nbytes <= 4 else struct.unpack(bo + "I", data[e + 8:e + 12])[0]
        raw = data[voff:voff + nbytes]
        if typ == 2:
            tags[tag] = raw.decode("latin-1").rstrip("\x00")
        elif typ in fmt:
            tags[tag] = struct.unpack(bo + fmt[typ] * cnt if typ != 5 else bo + "II" * cnt, raw)
    width, height = tags[256][0], tags[257][0]
    sx, sy = tags[33550][:2]
    _, _, _, tx, ty, _ = tags[33922][:6]
    keys = {}
    gk = tags.get(34735, ())
    doubles = tags.get(34736, ())
    for k in range(4, len(gk), 4):
        key, loc, cnt, val = gk[k:k + 4]
        keys[key] = doubles[val] if loc == 34736 else (val if loc == 0 else None)
    ascii_ = tags.get(34737, "")
    model = keys.get(1024)  # 1 projected, 2 geographic
    x0, y0, x1, y1 = tx, ty - sy * height, tx + sx * width, ty
    if model == 2:
        w, s, e, n = x0, y0, x1, y1
    else:
        lon0 = keys.get(3088) or keys.get(3080) or 0.0
        lat_ts = keys.get(3078) or 0.0
        radius = keys.get(2057) or R
        (w, s), (e, n) = eqc_to_deg(x0, y0, lon0, lat_ts, radius), eqc_to_deg(x1, y1, lon0, lat_ts, radius)
    if w > 180:
        w, e = w - 360, e - 360
    return (w, s, e, n), f"model={model} size={width}x{height} px={sx:g} ascii={ascii_[:60]!r}"


def pds_label(path):
    head = open(path, "rb").read(60000).decode("latin-1")
    head = head.split("\nEND\r")[0].split("\nEND\n")[0]
    want = ["MAP_PROJECTION_TYPE", "CENTER_LATITUDE", "CENTER_LONGITUDE", "MAP_SCALE", "MISSING_CONSTANT",
            "VALID_MINIMUM", "VALID_MAXIMUM", "LINES", "LINE_SAMPLES", "SAMPLE_TYPE", "SAMPLE_BITS",
            "MINIMUM_LATITUDE", "MAXIMUM_LATITUDE", "EASTERNMOST_LONGITUDE", "WESTERNMOST_LONGITUDE", "A_AXIS_RADIUS"]
    out = []
    for line in head.splitlines():
        k = line.split("=")[0].strip()
        if k in want:
            out.append(line.strip())
    return out


def main():
    sys.stdout.reconfigure(errors="replace")
    for arg in sys.argv[1:]:
        p = Path(arg)
        files = sorted(p.rglob("*")) if p.is_dir() else [p]
        for f in files:
            try:
                if f.suffix.lower() == ".shp":
                    b, info = shp(f)
                elif f.suffix.lower() in (".tif", ".tiff"):
                    b, info = tiff(f)
                elif f.suffix.lower() == ".img":
                    print(f"{f.name}:")
                    for line in pds_label(f):
                        print("   ", line)
                    continue
                else:
                    continue
            except Exception as e:  # report and keep going
                print(f"{f.name}: could not read ({e})")
                continue
            if b is None:
                print(f"{f.name}: {info}")
                continue
            w, s, e, n = b
            print(f"{f.name}: lon {w:.4f}..{e:.4f}  lat {s:.4f}..{n:.4f}  overlaps box: {overlap(b)}  [{info}]")


if __name__ == "__main__":
    main()
