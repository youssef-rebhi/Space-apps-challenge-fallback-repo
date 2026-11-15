"""Mars colours for the walk view, sampled from NASA's natural-colour Mastcam panorama PIA26693.

PIA26693 "Curiosity Surveys the Boxwork Region": 179 Mastcam images taken on 26 Sept 2025 (sol 4671).
NASA: "This natural color view is approximately how the scene would appear to an average person if they
were on Mars." Credit NASA/JPL-Caltech/MSSS. On sol 4671 Curiosity was inside our box (Layer 4 waypoints).

How the colours are used (ASSUMPTION A37 in docs/ASSUMPTIONS.md):
  - ground: our orbital photo is greyscale only. Each grey value keeps its brightness rank in the box and
    takes the median colour of the panorama's ground pixels with the same brightness rank.
  - sky: median colour of the panorama's sky pixels just above the horizon and at the top of the sky.
"""
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = 120_000_000          # the panorama is 16221 x 6189 = 100.4 MP

REDUCE = 4                  # colour statistics only; 4x4 averaging keeps 4055 x 1547 px
GROUND_FROM = 0.40          # ground pixels only below 40 % of the image height: near and middle ground, little haze
SKY_TO = 0.35               # sky pixels only in the top 35 % of the image height
DARK = 10 / 255             # black border = no data
SKY_LUMA = 0.30             # sky pixels are brighter than this (0-1); dark rocks are not
SKY_EDGE_PX = 12            # rows taken at the bottom (horizon) and top of each column's sky, at REDUCE scale


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def load(path):
    im = Image.open(path).convert("RGB").reduce(REDUCE)
    a = np.asarray(im).astype(np.float32) / 255.0
    return a


def masks(a):
    h = a.shape[0]
    rows = np.arange(h)[:, None] / h
    valid = a.max(axis=2) > DARK
    lin = srgb_to_linear(a)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    luma = a @ np.array([0.299, 0.587, 0.114], np.float32)
    # the natural-colour sky is bright bluish-grey, the ground red-brown. Sky = the unbroken run of such
    # pixels from the top edge of the picture down, so dark bluish rocks on the hills are not counted.
    sky_like = valid & (b > r) & (luma > SKY_LUMA) & (rows < SKY_TO)
    run = np.cumprod(sky_like | ~valid | (luma < 0.12), axis=0).astype(bool)   # dim seam at the mosaic's top edge
    sky = run & sky_like
    ground = valid & (r > 1.15 * b) & (rows >= GROUND_FROM)
    return lin, sky, ground


def ground_lut(lin, ground, ortho_values):
    """256-entry table: orbital grey value -> sRGB colour, by matching brightness ranks."""
    px = lin[ground]                                           # N x 3 linear RGB
    y = px @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    order = np.argsort(y)
    px, y = px[order], y[order]
    n = len(y)
    hist = np.bincount(ortho_values, minlength=256).astype(np.float64)
    hist[0] = 0                                                # 0 = no data in the orthophoto
    cdf = np.cumsum(hist) / hist.sum()
    lo_q = np.concatenate([[0.0], cdf[:-1]])
    lut = np.zeros((256, 3), np.float32)
    for v in range(1, 256):
        q0, q1 = lo_q[v], cdf[v]
        mid = 0.5 * (q0 + q1)
        half = max(0.5 * (q1 - q0), 0.0025)                    # at least 0.5 % of the ground pixels per entry
        i0 = int(np.clip((mid - half) * n, 0, n - 1))
        i1 = int(np.clip((mid + half) * n, i0 + 1, n))
        lut[v] = np.median(px[i0:i1], axis=0)
    lut[0] = lut[int(np.argmax(hist))]
    srgb = np.round(linear_to_srgb(lut) * 255).astype(np.uint8)
    return srgb, {"ground_pixels_used": int(n), "rank_window_min": 0.005}


def sky_colours(lin, sky):
    top = np.zeros_like(sky); hor = np.zeros_like(sky)
    for c in np.where(sky.sum(axis=0) >= 3 * SKY_EDGE_PX)[0]:   # columns with enough sky
        rr = np.where(sky[:, c])[0]
        top[rr[:SKY_EDGE_PX], c] = True                           # highest sky in this column
        hor[rr[-SKY_EDGE_PX:], c] = True                          # sky just above the horizon in this column
    to8 = lambda m: [int(v) for v in np.round(linear_to_srgb(np.median(lin[m], axis=0)) * 255)]
    return {"horizon_srgb": to8(hor), "top_srgb": to8(top), "sky_pixels_used": int(sky.sum()),
            "note": "the panorama's sky reaches only part-way up; colour above its top is the top colour"}


def ground_median(lin, ground):
    return [int(v) for v in np.round(linear_to_srgb(np.median(lin[ground], axis=0)) * 255)]
