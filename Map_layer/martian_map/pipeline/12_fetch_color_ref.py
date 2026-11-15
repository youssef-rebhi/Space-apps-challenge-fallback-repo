"""Step 12: fetch NASA's natural-colour Mastcam panorama PIA26693 (the colour source of the walk view).

PIA26693 "Curiosity Surveys the Boxwork Region", NASA/JPL-Caltech/MSSS, 179 Mastcam images, 26 Sept 2025 (sol 4671).
Page: https://science.nasa.gov/photojournal/curiosity-surveys-the-boxwork-region/
The file is 179 MB, over GitHub's 100 MB limit, so it is not in git. This script fetches it and checks the MD5.
"""
import hashlib, json, os, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import MM

URL = "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia26/pia26693/PIA26693.png"
PAGE = "https://science.nasa.gov/photojournal/curiosity-surveys-the-boxwork-region/"
MD5 = "6a06db7742934e28757e8f87fc8b41d2"
SIZE = 179468813
DST_DIR = os.path.join(MM, "walk", "sources")
DST = os.path.join(DST_DIR, "PIA26693.png")


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(DST_DIR, exist_ok=True)
    if os.path.exists(DST) and md5(DST) == MD5:
        print("already here, MD5 ok:", DST)
        return
    t0 = time.time()
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (research script)"})
    with urllib.request.urlopen(req) as r, open(DST + ".part", "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    got = md5(DST + ".part")
    if got != MD5:
        raise SystemExit(f"MD5 mismatch: {got} (expected {MD5}). NASA may have replaced the file; check {PAGE}")
    os.replace(DST + ".part", DST)
    log = {"file": "PIA26693.png", "url": URL, "page": PAGE, "bytes": os.path.getsize(DST), "md5": MD5,
           "credit": "NASA/JPL-Caltech/MSSS", "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "seconds": round(time.time() - t0, 1)}
    json.dump(log, open(os.path.join(DST_DIR, "fetch_log.json"), "w"), indent=1)
    print("ok", log)


if __name__ == "__main__":
    main()
