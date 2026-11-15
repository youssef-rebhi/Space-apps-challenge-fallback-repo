# Running Marsouine

Everything runs on one laptop. The tablet view opens in a browser on the laptop, and the helmet and phone portal open on an Android phone on the same Wi-Fi. Nothing needs an internet connection once the data is in the folder.

## What you need

| Tool | Why | Version used |
|---|---|---|
| Python 3 | the app server (`server.py`, standard library only), map pipeline | 3.12 |
| Node.js + npm | only to rebuild the app from source | see `Application/fg-app/package.json` |
| OpenSSL | only for the phone (https certificate) | 3.5.7 |
| Google Chrome on Android | phone portal (WebXR AR needs Chrome with Google Play Services for AR; Samsung Internet does not start AR) | — |
| QGIS | optional, to open the GIS projects | 4.2.3 |

## 1. The app (tablet + helmet + phone portal)

A built copy is in the repository, so you don't need to build first:

```bash
cd Application/marsouine-app-built
python server.py
```

- `http://localhost:8000` is the **tablet**.
- `https://<this PC's Wi-Fi IP>:8443` is for the **phone**. It's only there when `certs/` exists (see section 2). The server prints the address.

To rebuild after changing the source:

```bash
cd Application/fg-app
npm install      # once
node build.js    # writes Application/marsouine-app-built and copies the 3D map pages
```

## 2. The https certificate for the phone

Phone sensors, the camera and WebXR AR only work over https. The certificate is made on your own PC and kept out of git; the folder `Application/marsouine-app-built/certs/` is in `.gitignore`. To make one, put your PC's Wi-Fi address in place of `192.168.1.10`:

```bash
cd Application/marsouine-app-built
mkdir certs
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=marsouine-local" -addext "subjectAltName=IP:192.168.1.10,IP:127.0.0.1,DNS:localhost"
```

The certificate is self-signed, so the phone shows a warning the first time. Accept it once.

## 3. Using it

1. **Tablet:** open `http://localhost:8000`.
   - Pick **A** (start) and **B** (destination) with 📍 *On map*, on the 3D or the 2D map.
   - Press *Find routes* and choose a route. A QR code appears.
2. **Phone, in Chrome:** scan the QR code to open the **helmet** view.
3. **3D portal:** press **🌄 3D Mars portal**, then *Enter AR portal* or *Compass + steps*.
   - The astronaut starts at A.
   - Green chevrons on the ground lead to B.
   - The tablet shows the astronaut live.

## 4. The map pages on their own

```bash
cd Map_layer/martian_map
python -m http.server 8765 --directory web
```

Then open these pages:
- http://localhost:8765/viewer3d/: the 3D GO/NO-GO map
- http://localhost:8765/explode/: the layer-by-layer animation
- http://localhost:8765/section/: map sections
- http://localhost:8765/walk/: the astronaut's view

They must be served over http. If you open them as files, browsers block their data.

## 5. Other parts

| Part | How to run |
|---|---|
| Drone simulator | open `Drone/Drone_Simulator.html` in a browser |
| AI model | `Ai_model/nasa_training.ipynb` in Google Colab, with a GPU |
| Elevation layer | `Map_layer/Layer2_Elevation/qgis/layer2_elevation_POSSIBLE.qgz` in QGIS |
| GIS map and GO/NO-GO | `Map_layer/martian_map/qgis/martian_map.qgz` in QGIS |
| Map pipeline | the scripts in `Map_layer/martian_map/pipeline/`; Python packages are pinned in `requirements.lock.txt` |

## Not in git (too large, or private)

| File | Size | How to get it |
|---|---|---|
| USGS 25 cm orthophoto, map box | 113 MB | `Map_layer/martian_map/pipeline/10_fetch_basemap.py` |
| NASA PIA26693 Mastcam panorama | 179 MB | `Map_layer/martian_map/pipeline/12_fetch_color_ref.py` (MD5 checked) |
| `node_modules/` | — | `npm install` in `Application/fg-app` |
| `certs/` (https key) | — | make your own, as in section 2; never commit it |

The app and map pages run without the first two. They are only needed to re-run the map pipeline.
