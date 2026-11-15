# Application: tablet + helmet app

| Folder | What |
|---|---|
| [`fg-app/`](fg-app/) | React source (Vite). Develop here. |
| [`marsouine-app-built/`](marsouine-app-built/) | Built copy of the app with its data, ready to serve with `server.py`. Use this for the demo. |
| [`data/`](data/) | `stops.json` (55 boxwork stops with the AI percentages and certainty) and `overlays/` (AI-coloured Navcam photos). Same files as `fg-app/public/data/`. |

## Demo in 1 minute

```bash
cd marsouine-app-built
python server.py
```
Open `http://localhost:8000` on the PC (tablet view). On a phone on the same Wi-Fi, open `http://<this-PC-IP>:8000` and scan the QR code from the tablet to get the helmet view. `server.py` uses only the Python standard library and also relays scout reports from the tablet to the helmet.

## Data flow

1. `Ai_model/nasa_training.ipynb` reads the Navcam photos and writes `stops.json` + the coloured overlays.
2. They are copied to `Application/data/`, `fg-app/public/data/` and `marsouine-app-built/data/`.
3. The app colours each stop with the team rule in [`ASSUMPTIONS.md`](../ASSUMPTIONS.md).

After changing the source, rebuild with `npm run build` in `fg-app/` and copy `dist/` over `marsouine-app-built/` (keep its `data/` and `server.py`).
