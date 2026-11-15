# Firm Ground · Tablet + Helmet (React)

Two views in one small React app (Vite):

- **Tablet** (`/`): map of Curiosity's boxwork stops coloured by our AI, stop card with a photo slider (original Navcam photo vs AI colours), AI certainty, grey "not explored" areas, **Send scout** (simulated laser + microphone, inspired by Perseverance's SuperCam), route builder with an oxygen GO/NO-GO check, 3D view, mission assistant and **QR pairing** to the helmet.
- **Helmet** (`/?view=helmet&stops=4580,4589&eva=240`): HUD with the ground colour, oxygen and turn-back time, distance and compass arrow to the next stop, corner mini-map, live scout alerts from the tablet, simulated suit sensors; Mars view (AI photo) or camera (AR preview); VR-box split; voice alerts.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```
The data (`stops.json` + `overlays/`) is already in `public/data/`.

To link a tablet and a phone (two devices), serve the build with `public/server.py` instead of `python -m http.server`: it adds a small `/api/events` relay. Two tabs in the same browser are linked without a server (BroadcastChannel). The phone camera and compass need **https**, so test them on a deployed site.

## Files

| File | What |
|---|---|
| `src/App.jsx` | chooses the tablet or helmet view |
| `src/lib/mission.js` | loads stops, the 4-colour rule, Mars distances, voice |
| `src/lib/safety.js` | AI certainty, oxygen GO/NO-GO, simulated suit sensors |
| `src/lib/grey.js` | grey (unexplored) cells beside the route |
| `src/lib/live.js` | tablet → helmet link for scout reports, compass bearing |
| `src/lib/acoustic.js` | SIMULATED scout sound (from our AI result) and zap sound |
| `src/lib/assistant.js` | rule-based mission assistant (answers only from the data on screen) |
| `src/components/Tablet.jsx` | tablet page, scout, route |
| `src/components/MiniMap.jsx` | SVG map of the stops (works offline) |
| `src/components/Map3D.jsx` | 3D bar view of the stops (bar height = sand + big rock %) |
| `src/components/PhotoSlider.jsx` | drag to compare the original Navcam photo with the AI colours |
| `src/components/ScoutResult.jsx` | waveform, 30-shot energy and verdict |
| `src/components/Assistant.jsx` | assistant panel (voice or typing) |
| `src/components/PairQR.jsx` | route → helmet link → QR code |
| `src/components/Helmet.jsx` | helmet HUD and walk simulation |
| `public/server.py` | static server + scout relay (standard library only) |

## Honest limits

- The scout is **simulated**: no sound is measured. Its verdict comes from our AI's terrain result at that stop (or the nearest stop, in a grey area).
- The walk is simulated (× 20 speed, straight lines). AI colours are computed in advance, not live.
- Suit sensors (temperature, radiation) are simulated values inside the ranges measured by Curiosity's REMS and RAD.
- All thresholds are team assumptions: see [`ASSUMPTIONS.md`](../../ASSUMPTIONS.md).

## Credits

React, Vite, qrcode-generator (MIT). Scout concept inspired by NASA/JPL-Caltech/LANL/CNES Perseverance SuperCam. Sources in [`REFERENCES.md`](../../REFERENCES.md). Code drafted with help from Claude (Anthropic), reviewed and tested by the team.
