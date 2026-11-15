# Marsouine: development log, 15 November 2026

**Team y3m · NASA Space Apps 2026 · Martian Map / Marsouine**

This log covers two new pieces of the Marsouine app, built on 15 November 2026:

1. **The 3D GO / NO-GO layer map in the tablet app.** The team's coloured 3D map and its layer-by-layer animation now sit inside the tablet. You can place pins on it and plan routes on it.
2. **The phone as a portal into Mars.** An Android phone walks the astronaut's 3D point-of-view map in two ways: with WebXR AR, or with the compass plus step counting. The phone is linked to the tablet and the helmet view.

For each piece it records what was built, why, how it works, which tools and resources were used, how it was tested, and what is still open.

---

## Contents

1. [Summary](#1-summary)
2. [Where the work lives](#2-where-the-work-lives)
3. [Feature 1: 3D GO / NO-GO layer map in the tablet](#3-feature-1-3d-go--no-go-layer-map-in-the-tablet)
4. [Feature 2: the phone as a portal into the 3D Mars view](#4-feature-2-the-phone-as-a-portal-into-the-3d-mars-view)
5. [Server changes (shared by both features)](#5-server-changes-shared-by-both-features)
6. [How to run it](#6-how-to-run-it)
7. [Workflow](#7-workflow)
8. [Tools and libraries](#8-tools-and-libraries)
9. [Data and resources](#9-data-and-resources)
10. [Assumptions and display-only choices](#10-assumptions-and-display-only-choices)
11. [Testing and what was verified](#11-testing-and-what-was-verified)
12. [Problems met and how they were solved](#12-problems-met-and-how-they-were-solved)
13. [Open items and known limits](#13-open-items-and-known-limits)
14. [Commit timeline](#14-commit-timeline)

---

## 1. Summary

| Area | What changed |
|---|---|
| Tablet map | A **3D switch**, on by default; off shows the 2D map. The 3D view is the team's coloured GO / NO-GO map with its layer-split animation. |
| Two 3D modes | **No route:** the whole map splits into layers. **Route chosen:** only the section around the route is shown, floating above the flat 2D map, and only that section splits. |
| Animation | One button, three clicks: the first shows the two maps (flat GO / NO-GO map and plain 3D terrain), the second shows all the layers, the third combines them back. |
| Pins on the 3D map | A, B and multi-stop waypoints (W0…W7) can be placed by clicking the 3D ground. The map no longer switches to 2D for this. |
| Multi-stop bug | No more invented extra stop. Switching between A → B and Multi-stop starts clean. |
| Offline | three.js is a **local copy**, so all the map pages run with no internet. |
| Robustness | If a map page is opened as a file, or its code can't load, it now explains why instead of sitting on "Loading…" forever. The server tells browsers to re-check files after a rebuild. |
| Phone portal | `walk/?portal=1`: **WebXR AR** on Android Chrome (you walk and you move on Mars), or **compass + steps** on other phones. |
| Links | Tablet ↔ server ↔ phone: the QR code always gives the phone the https address. Live astronaut position appears on the tablet. |
| A → B | Route points are labelled **A (start)** and **B (destination)**. The astronaut starts at **A facing B**, with markers at A and B. |
| Server | One process serves **http :8000** (tablet) and **https :8443** (phone), plus the map pages under `/mars/`. |

---

## 2. Where the work lives

| What | Where |
|---|---|
| Team repository | `malek-mejaouel/Depo_nasa` on GitHub |
| Branch | `feature/app-3d-layer-map` (pushed). Pull request **#9** "Feature/app 3d layer map" (open, into `main`) |
| Working copy | `github/Depo_nasa_work`, a full copy of the team repo where all of this work happened |
| Clean reference | `github/Depo_nasa`, the original clone, kept untouched for comparison |
| Old portal copy | `github/Depo_nasa_portal`, a git worktree on branch `feature/phone-portal`. Its work is already merged into `feature/app-3d-layer-map`. It still holds an older commit message, so don't push it. |

Main folders inside the repo:

| Path | Role |
|---|---|
| `Application/fg-app/src/` | React source of the tablet and helmet app |
| `Application/fg-app/build.js` | build script (esbuild) writing into `Application/marsouine-app-built/` |
| `Application/fg-app/scripts/map3d.mjs` | copies the 3D map files from `Map_layer` into the built app as `map3d/` |
| `Application/marsouine-app-built/` | the built app and `server.py`, which serves everything |
| `Map_layer/martian_map/web/explode/` | the layer-by-layer animation page, also embedded in the tablet |
| `Map_layer/martian_map/web/walk/` | the astronaut point-of-view walk view and the phone portal (`portal.js`) |
| `Map_layer/martian_map/web/vendor/three/` | local copy of three.js r160 |
| `Map_layer/martian_map/web/lib/sections.js` | map sections (the piece of the map around a path) |

---

## 3. Feature 1: 3D GO / NO-GO layer map in the tablet

### 3.1 What was asked

- A switch on the tablet map, **on by default = 3D**, off = the existing 2D map.
- The 3D view is the team's **coloured GO / NO-GO 3D map**, using its existing layer-separation animation with the same logic.
- **Two modes:**
  - No route chosen: the whole map splits.
  - Route chosen: only the **section** covering the route splits. This reuses the existing map-sections feature.
  - With a route, the 3D section sits **above the 2D map**.
- A neater, more aesthetic display. Unnecessary things are dropped, for example the A / B coordinates.
- **One animation button:** the 1st click shows the first part, the 2nd shows the rest, the 3rd combines them back.
- Later requests:
  - Place the **A and B pins directly on the 3D map**.
  - Fix a **multi-stop** bug: an extra stop appeared, and it stayed after switching back to A → B.

### 3.2 How it works

**Embedding.** The tablet does not re-implement the 3D map.
- It shows the team's existing page `Map_layer/martian_map/web/explode/index.html` in an `<iframe>`, through the new React component `LayerMap3D.jsx`.
- At build time, `scripts/map3d.mjs` copies the page and the data files it needs into the built app as `map3d/`: 25 files, about 19 MB.
- In development (`npm run dev`) a small Vite middleware serves the same files straight from `Map_layer`.

**URL options added to the explode page.** Standalone use is unchanged.

| Option | Effect |
|---|---|
| `?embed=1` | No side panels. The tablet drives the steps through `postMessage`. |
| `&route=lat,lon;…` | Draws the route on the map sheets, with its A / B ends |
| `&rc=RRGGBB` | Route colour |
| `&section=path:…` | Shows only the section around the path (`lib/sections.js`; margin per assumption A31) |
| `&base=1` | With a section: draws the flat 2D colored map of the area under the floating 3D piece, with guide lines |
| `&exag=N` | Relief height on screen (display only, assumption A47) |

**Messages between the tablet and the page.** All messages use `postMessage`, same origin, with `{fg3d: 1, type}`.

| Direction | Type | Meaning |
|---|---|---|
| app → page | `next` / `step` / `reset` | Run the animation, or reset the view |
| app → page | `pins` | `[{label, kind: a\|b\|w, lat, lon}]`: the A / B / waypoint pins to draw |
| app → page | `picking` | Label of the pin the planner is waiting for, or `null`. Shows a crosshair cursor. |
| page → app | `ready` | Page loaded. Includes the section size, or why a section could not be made. |
| page → app | `state` | Current step and caption |
| page → app | `pick` | `lat, lon` of the ground point that was clicked while picking |
| page → app | `error` | Load error |

**Clicking the 3D ground.** The relief is shaped in the GPU shader, so a normal three.js raycast against the mesh would miss it. Instead, `groundAt()`:
1. casts the mouse ray;
2. marches along it through the height band of every visible layer, sampling the real heightmap (bilinear);
3. refines the hit by bisection.

If it misses the 3D piece, it falls back to the flat 2D map under a section. The hit is converted to lat / lon with the map frame from `lib/sections.js`.

**Pins.** CSS2D pins: A is white, B is yellow, waypoints are purple and widen for "W10". Where a pin is drawn:
- on the 3D terrain when its point is inside it;
- on the 2D base map when the point is outside the section;
- hidden otherwise.

**Multi-stop fix.** The planner mode was moved up into `Tablet.jsx`, so both maps follow it.
- A new waypoint has **no position** until it is clicked on a map. Before, positions were invented.
- Switching between A → B and Multi-stop clears the other mode's waypoints and routes. A and B are kept.

**Tablet display.**
- A title bar with the 3D switch.
- One colour legend per view, using the GO / CAUTION / NO-GO colours from `layers.json`.
- The route planner no longer shows coordinates: it shows the stop name or "point on the map", with **📍 On map** and **Selected** buttons.
- When the 3D page cannot start (no WebGL), a "Use the simple 3D view" fallback is offered.

### 3.3 Files changed (feature 1)

| File | Change |
|---|---|
| `Application/fg-app/src/components/LayerMap3D.jsx` | **new**: iframe, mode toggle (Route section / Whole map), animation button and step dots, pick banner, failure screen |
| `Application/fg-app/src/components/Tablet.jsx` | 3D switch (on by default), map title bar, legend, pins for the 3D map, planner mode lifted here |
| `Application/fg-app/src/components/Planner.jsx` | no coordinates, clean mode switching, unplaced waypoints |
| `Application/fg-app/src/components/GeoMap.jsx` | skips waypoints that are not placed yet |
| `Application/fg-app/src/styles.css` | map bar, switch, 3D panel, pick banner, pin badges |
| `Application/fg-app/scripts/map3d.mjs`, `vite.config.js`, `build.js` | copy and serve the 3D map files |
| `Map_layer/martian_map/web/explode/index.html` | embed mode, route, section base, pins, ground picking, load-failure message |
| `Map_layer/martian_map/web/vendor/three/` | **new**: local three.js r160 (only the files the pages use) |
| `section/`, `viewer3d/`, `walk/` `index.html` | import three.js from the local copy |
| `Map_layer/martian_map/docs/ASSUMPTIONS.md` | A47 (display-only settings of the embedded map) |
| `Application/fg-app/README.md` | how the 3D map works and is built |

---

## 4. Feature 2: the phone as a portal into the 3D Mars view

### 4.1 What was asked

- Use an **Android phone as a portal** into the astronaut point-of-view 3D map of Mars:
  - turning the phone turns the view;
  - walking moves you on the map;
  - pointing the phone at the sky shows the sky.
- Build it locally, for Android.
- Later requests:
  - **link it to the helmet and tablet**;
  - make the QR code give the phone the current address;
  - replace "your point" with A / B;
  - **always start the astronaut at A** (the start of the route), heading to B.

### 4.2 How it works

**Two ways to move**, both in `walk/portal.js`, opened as `walk/?portal=1`:

| Mode | How it moves you | Needs |
|---|---|---|
| **AR** (WebXR `immersive-ar`) | Real walking is tracked by the phone, and your real movement moves you on Mars (×20 boost available). | Chrome on Android with ARCore, over https |
| **Compass + steps** | Phone orientation (DeviceOrientation) turns the view, and detected steps (DeviceMotion) move you. Same step rule as the helmet. | Any phone with motion sensors, over https |

Other details of the portal:
- **Ground rules:** NO-GO, unknown and cut-off ground still block you, as in the walk view.
- **Labels:** a "simulated" label stays on screen.
- **Start-spot map:** a map with site buttons; "🗺 Move" works inside AR too.
- **A and B on the 3D view:** a post at A, a tall beacon at B, and A / B dots on the minimap. Their sizes and colours are display choices, not data.
- **Start at A:** when AR connects, the astronaut is placed **at A, facing B**. If A is moved on the tablet, the portal follows it (checked every few seconds).

**Link with the helmet and tablet.**
- The tablet's **QR code** (`PairQR.jsx`) always uses the address returned by `GET /api/phone-url`, which is `https://<PC Wi-Fi IP>:8443/`. The phone therefore gets the https address even when the tablet runs on `http://localhost:8000`.
- The helmet view has a **🌄 3D Mars portal** button. It opens the portal at A, facing B, with a "Back to helmet" button.
- The portal sends **telemetry** every second to `POST /api/events`, with `src: "portal"`, the position and the heading. The tablet shows **"● LIVE astronaut"** and the distance to B.
- The server remembers the latest route (`/api/pair?c=LATEST`). A portal opened without a route therefore still finds A and B.
- The tablet sends A and B as soon as they are picked, and sends them again if the server restarts.
- **Debug reporting:** the portal posts its progress and errors to `/api/events` with `type: "debug"`, so problems on the phone can be read from the laptop.

**Display fixes for AR in three.js r160:**
- the camera sits in a "rig" group;
- the render loop runs through `renderer.setAnimationLoop`;
- the WebGL context is created `xrCompatible` in portal mode;
- images load through `onload`;
- a double tap cannot start two AR sessions;
- a warning appears when the phone uses Samsung Internet, where AR does not start.

### 4.3 Files changed (feature 2)

| File | Change |
|---|---|
| `Map_layer/martian_map/web/walk/portal.js` | **new**: AR and compass modes, start map, telemetry, debug reporting, start at A facing B, follow A |
| `Map_layer/martian_map/web/walk/index.html` | camera rig, animation loop, xrCompatible context, portal UI styles, A / B markers |
| `Application/fg-app/src/components/Helmet.jsx` | "🌄 3D Mars portal" button |
| `Application/fg-app/src/components/PairQR.jsx` | QR and typed code always use the phone's https address. "Open it in Google Chrome on the phone" hint. |
| `Application/fg-app/src/components/Tablet.jsx` | sends A / B to the server as soon as they are picked |
| `Application/fg-app/src/lib/grey.js` | `labelOf`: the route's first stop is **A (start)**, the last is **B (destination)** |
| `.gitignore` | ignores `Application/marsouine-app-built/certs/` (the https certificate and key) |

---

## 5. Server changes (shared by both features)

`Application/marsouine-app-built/server.py` uses the Python standard library only.

| Change | Why |
|---|---|
| `Cache-Control: no-cache` on every file | `node build.js` keeps the same file names, so browsers could keep an old copy after a rebuild. Now they re-check every file (a quick 304 when it is unchanged). |
| `/mars/…` serves `Map_layer/martian_map/web` | The phone portal and the walk view are served by the same server as the app |
| http **:8000** and https **:8443** in **one process** | Phone sensors, camera and WebXR need https. One process means the tablet (http) and the phone (https) share pairing codes and live events. |
| `GET /api/phone-url` | Returns `https://<PC Wi-Fi IP>:8443/` for the QR code. The IP comes from the network card that reaches the LAN; no packet is sent. |
| `PAIRS["LATEST"]` | The latest pairing, so the portal can find A and B even when opened directly |
| `--port N`, `--https-port N` | Other ports, used for test servers |

The https certificate is **self-signed** and made on the PC with OpenSSL (RSA 2048, valid 30 days). It is kept in the git-ignored `certs/` folder and never committed. The phone shows a certificate warning the first time.

---

## 6. How to run it

```bash
# 1. Build the app (writes into Application/marsouine-app-built, copies map3d/)
cd Application/fg-app
npm install            # only once
node build.js
```

```bash
# 2. Start the server (http :8000 for the tablet, https :8443 for the phone when certs/ exists)
cd Application/marsouine-app-built
python server.py
```

- **Tablet:** open `http://localhost:8000` on the laptop.
  - The 3D switch is on by default.
  - Pick A and B with 📍 On map, either on the 3D map or on the 2D map, then find routes.
- **Phone (Android, Google Chrome):**
  1. Scan the tablet's QR code. It opens `https://<PC Wi-Fi IP>:8443/?h=CODE`, the helmet view.
  2. Press **🌄 3D Mars portal**.
  3. Choose **AR**, or **Compass + steps**.
- **Map pages alone,** without the app:

```bash
cd Map_layer/martian_map
python -m http.server 8765 --directory web
# then open http://localhost:8765/explode/  (also /walk/, /section/, /viewer3d/)
```

The pages must be served over http(s). Opened as files, browsers block their code and data. The explode page now says so.

---

## 7. Workflow

1. **Safe copy first.**
   - The team repo was brought up to date with GitHub `main`.
   - It was copied to `Depo_nasa_work`, where all work happened. The original clone stays untouched as a reference.
2. **Re-explain before building.** Each feature request was restated as a plan and approved by the team member before any file changed.
3. **Branches:**
   - Feature 1 was built on `feature/app-3d-layer-map`.
   - Feature 2 was built in a separate git worktree on `feature/phone-portal`, then merged into `feature/app-3d-layer-map`.
4. **Build:** `node build.js` (esbuild). It keeps the same bundle names and copies the 3D map files.
5. **Local servers:** the app on :8000 / :8443, and the map pages on :8768 for development. Test servers ran on other ports (for example :8770) so the live one was not disturbed.
6. **Test after every change** (see [section 11](#11-testing-and-what-was-verified)):
   - headless Chrome scripts for real clicks and animations;
   - the in-app browser for visual checks;
   - `curl` for server answers;
   - the real phone for AR.
7. **Two parallel working sessions, coordinated by messages:**
   - one on the tablet 3D map;
   - one on the phone portal.
   They shared one server and told each other about restarts, merges and pushes.
8. **Commits:**
   - only the files each change touched were staged;
   - messages describe what and why;
   - all commits are authored by the team member.
9. **Push** only with the team member's explicit OK, to the feature branch, never to `main`. The pull request into `main` (#9) is open for the team.

**Project rules followed throughout:**
- No invented numbers: every value comes from NASA or published sources, or is logged as a team ASSUMPTION.
- Raw data is never modified.
- Files are copied, never moved or deleted without approval.
- Keys and certificates stay out of the repo.
- No personal details are sent to outside services.

---

## 8. Tools and libraries

| Tool / library | Version | Used for |
|---|---|---|
| React, React DOM | 18.3.1 | tablet and helmet app |
| Leaflet | 1.9.4 | the 2D map |
| qrcode-generator | 1.5.2 | the pairing QR code |
| Vite + @vitejs/plugin-react | 5.4.21 | dev server (`npm run dev`), with a middleware for `map3d/` |
| esbuild | 0.21.5 | production build through `build.js` |
| Node.js | 24.18.0 | build scripts and test scripts |
| npm | (registry mirror `registry.yarnpkg.com`) | installing packages; `registry.npmjs.org` reset connections on this network, while the lockfile integrity checks still applied |
| three.js | r160 (0.160.0, MIT) | 3D map pages. Local copy: core module, OrbitControls, CSS2DRenderer, Line2 / LineMaterial / LineGeometry, GLTFLoader, BufferGeometryUtils. |
| WebXR Device API | browser API | AR mode (`immersive-ar`, `local-floor`, `dom-overlay`) |
| DeviceOrientation / DeviceMotion | browser APIs | compass + steps mode |
| Google Chrome for Android + ARCore | device | AR on the phone (Samsung Internet does not start AR) |
| Python 3 (`http.server`, `ssl`) | standard library | `server.py` (http + https in one process) |
| OpenSSL | 3.5.7 | self-signed https certificate |
| Git (worktrees, merges) + GitHub, `gh` CLI | n/a | branches, merge of the portal work, push, pull-request check |
| Google Chrome headless + Chrome DevTools Protocol | desktop Chrome | automated tests: real mouse clicks, animation steps, screenshots, error capture. Run with SwiftShader WebGL and internet blocked, to prove the pages work offline. |
| `curl` | n/a | checking server answers, headers and https endpoints |
| Claude Code (desktop app) | n/a | AI-assisted development in two working sessions, directed and reviewed by the team, with its in-app browser and local preview servers used for checks |

---

## 9. Data and resources

All map data comes from the team's existing Martian Map work. None of it was changed.

| Resource | Used by |
|---|---|
| `Map_layer/martian_map/web/layers.json`, `overlays.json` | layer list, GO / NO-GO colours, legend |
| `web/terrain/terrain.json`, `height_4m.bin`, `height_2m.bin` | the terrain frame (lat / lon ↔ metres) and heights |
| `web/data/combined_report.json` | GO / CAUTION / NO-GO shares shown on the map |
| `web/texture_photo.jpg` and the foot textures | the 3D map's look |
| `web/lib/sections.js` | the section of the map around a route |
| Curiosity stops and the team's AI results (app data) | the tablet's stops, scout and route planner |

Sources for these data (for example the USGS MSL Gale DEM used by the 2D map, and NASA's natural-colour panorama PIA26693 used for the walk view's ground and sky colours) are listed in the repo's `REFERENCES.md` and `Map_layer/martian_map/README.md`.

Technical references used:
- the three.js r160 documentation and examples (WebXR, CSS2DRenderer, Line2);
- the WebXR Device API (immersive-ar, DOM overlay);
- the DeviceOrientation and DeviceMotion events.

---

## 10. Assumptions and display-only choices

| Item | Value | Where it is recorded |
|---|---|---|
| Section margin around a path | 100 m | `Map_layer/martian_map/docs/ASSUMPTIONS.md` **A31** |
| Layer gap on a section | scaled from the whole-box gap | **A36** |
| Relief height inside the tablet | ×1.5 for the whole box, ×2 for a route section (display only) | **A47** |
| Phone walk: one step on Mars | 0.7 m × 20 (demo scale) | repo `ASSUMPTIONS.md` (Helmet `STEP_M`, `SCALE`), reused by the portal |
| Pin, marker and beacon colours and sizes | display choices | not data; no assumption needed |

---

## 11. Testing and what was verified

**Automated (headless Chrome over the DevTools Protocol, internet blocked):**
- **Tablet 3D map:** loads with no errors and no requests leaving the PC. The animation runs Map → Two maps → All layers → back, both standalone and inside the app.
- **Ground picking:** placing A, B and a third waypoint by real mouse clicks on the 3D map, the pin landed **within about 1 px of the click**. This held on the whole map, on a route section, and on the 2D map around a section.
- **Multi-stop:** Multi-stop → A → B leaves only the A and B pins (3D and 2D). "Add waypoint" waits for a click and does not invent a position.
- **Offline:** all the map pages (explode, section, viewer3d, walk) load three.js from the local copy, with no requests to the internet.
- **Load errors:**
  - opened as a file, the explode page explains how to serve it;
  - with three.js missing, it says the code could not load.

**In-app browser:** visual checks of the tablet, the 3D panel, the animation steps, and the planner rows and pins.

**Server checks (`curl`):**
- http :8000 and https :8443 answer from one process;
- `/api/phone-url` returns the https address;
- `/mars/walk/` is served;
- `Cache-Control: no-cache` is sent on every file.

**Portal on the laptop (test server, plain http):**
- Every link answers over the PC's IP address.
- Portal ↔ helmet ↔ tablet telemetry works: the tablet showed "● LIVE astronaut · walking to sol 4537 · 7 m · 14 steps".
- The start-spot map moves the astronaut to the chosen site.
- The http and https ports share pairing codes.
- Start at A, tested with the team member's steps (pick A and B, no "Use route"):
  - the astronaut was placed exactly at A;
  - after walking 80 m and reconnecting AR, he was back at A;
  - when A was moved on the tablet, he followed it.
  Real AR cannot run on a laptop, so the AR-connect check used the same placement step that AR start calls.

**Phone (team member, Android):**
- AR works in **Google Chrome**. It does not start in Samsung Internet.
- The final check of "start at A" on the phone was pending when this log was written.

---

## 12. Problems met and how they were solved

| Problem | Cause | Fix |
|---|---|---|
| Map pages needed the internet | three.js loaded from a CDN | local copy of three.js r160 in `web/vendor/three` |
| Explode page "not working" | 1) opened as a file, which browsers block; 2) an old copy cached in the browser | 1) the page now explains how to serve it; 2) the server sends `Cache-Control: no-cache` (one hard reload, Ctrl+Shift+R, cleared the old copy) |
| Setting A / B switched the map to 2D | picking was only possible on the 2D map | ground picking on the 3D map (ray march on the heightmap) |
| Extra stop in Multi-stop, still there in A → B | new waypoints got invented positions, and switching modes never cleared them | waypoints have no position until placed; switching modes starts clean |
| "W0" did not fit in its pin | fixed-width round badge | badges widen for longer labels |
| AR stuck at `requestSession` | the phone used Samsung Internet | use Chrome; the portal now warns about Samsung Internet |
| "There is already an active XRSession" | double tap on Start AR | start guard and clean-up of an old session |
| Old QR address on the tablet | the QR used the tablet's own address (localhost) | the QR always uses `/api/phone-url` (https, Wi-Fi IP) |
| "Your point" at B | picked points were labelled generically | route labels **A (start)** / **B (destination)** |
| Astronaut spawned at the rover base | the portal was opened without the route, or the server had lost it after a restart | server keeps `LATEST`; the tablet sends A / B on pick and again after a restart; AR connect places the astronaut at A |
| Animations frozen in tests | a hidden in-app browser pauses `requestAnimationFrame` | tests run in headless Chrome in real time |
| `registry.npmjs.org` connection resets | network | install through the `registry.yarnpkg.com` mirror (same packages, lockfile integrity checked) |

---

## 13. Open items and known limits

- **Not yet committed:** the latest portal changes are not part of commit `33e9499`. These are the tablet re-sending A / B, the portal following A, and `PAIRS["LATEST"]`. They wait for the team member's phone check before being committed.
- **Behind `main`:** the branch is 4 commits behind GitHub `main`, where PR #8 changed `Helmet.jsx` and the built bundle. PR #9 needs that merge, plus a rebuild, before it can go into `main`.
- **Phone check pending:** "start at A on AR connect" still needs one real try on the phone.
- **Certificate:** self-signed, valid until **15 Dec 2026**. The phone must accept the warning once.
- **Browsers:** AR needs **Chrome on Android with ARCore**. Samsung Internet does not start AR.
- **Cosmetic:** on the "Two maps" step, a pin on the lower 3D map can be drawn over the upper 2D map.
- **Pre-existing:** the `section/` page logs an error (`reading 'img'`) that was already there before this work.
- **Do not push** `feature/phone-portal` from `Depo_nasa_portal`. Its work is already in `feature/app-3d-layer-map`.

---

## 14. Commit timeline

Branch `feature/app-3d-layer-map`, on top of `main` at `3dcfa2c` (merge of PR #7). All times are 15 Nov 2026, local time.

| Commit | Time | What |
|---|---|---|
| `697b77a` | 09:43 | 3D GO / NO-GO layer map in the tablet, on by default |
| `a9859a4` | 09:56 | load three.js from a local copy, no internet needed |
| `741af36` | 10:04 | viewer3d, section and walk pages load three.js locally too |
| `f0dd8f0` | 10:38 | place A / B / waypoints on the 3D map; fix the leftover multi-stop waypoint |
| `8b5b7c1` | 10:47 | explode page explains how to open it instead of "Loading…" forever |
| `550b835` | 10:55 | server: `Cache-Control: no-cache` |
| `22e8b65` | 11:01 | phone portal: walk the 3D Mars view with an Android phone (WebXR AR or compass + steps) |
| `fcb9f8c` | 11:02 | merge of the phone portal into the 3D tablet map work |
| `33e9499` | 11:46 | one server for http 8000 + https 8443, phone QR always https, route A / B labels |

Pushed to GitHub as `feature/app-3d-layer-map` (head `33e9499`). Pull request: `malek-mejaouel/Depo_nasa#9`.
