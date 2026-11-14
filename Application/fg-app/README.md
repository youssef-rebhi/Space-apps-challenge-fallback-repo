# Firm Ground · Tablet + Helmet (React)

Two views in one small React app (Vite):

- **Tablet** (`/`): map of Curiosity's boxwork stops coloured by our AI, stop card with the
  AI-coloured Navcam photo, **🚁 Send scout** (simulated laser + microphone, inspired by NASA
  Perseverance SuperCam), route builder and **QR pairing** to the helmet.
- **Helmet** (`/?view=helmet&stops=4580,4589&eva=240`): HUD with the ground colour, turn-back time,
  distance to next stop, hazard; Mars view (AI photo) or camera (AR preview); VR-box split; voice alerts.

## Run
```bash
npm install
# put the data: unzip firmground_stops_v2.zip into public/data/  (stops.json + overlays/)
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (deploy to Vercel / Netlify / GitHub Pages)
```
The phone camera needs **https** → test the camera on the deployed site.

## Files
| File | What |
|---|---|
| `src/lib/mission.js` | load stops, our 4-colour rule, Mars distance, voice |
| `src/lib/acoustic.js` | SIMULATED scout sound (from our AI result) + zap sound |
| `src/components/Tablet.jsx` | tablet page, scout animation, route |
| `src/components/MiniMap.jsx` | SVG map of the stops (offline) |
| `src/components/ScoutResult.jsx` | waveform + 30-shot energy + verdict |
| `src/components/PairQR.jsx` | route → helmet link → QR code |
| `src/components/Helmet.jsx` | helmet HUD + walk simulation |

## Honest limits
- The scout is **simulated**: no sound is measured. Its verdict comes from our AI's terrain result at that stop.
- The walk is simulated (×20 speed, straight lines). AI colours are computed in advance, not live.
- Thresholds are team assumptions: sand >30% or big rock >2% = red, sand 10–30% = orange, 0.8 m/s, return ×1.2.

## Credits
React, Vite, qrcode-generator (MIT). Scout concept inspired by NASA/JPL-Caltech/LANL/CNES Perseverance SuperCam
("SuperCam can hear hardness"). Code drafted with help from Claude (Anthropic), reviewed and tested by the team.
