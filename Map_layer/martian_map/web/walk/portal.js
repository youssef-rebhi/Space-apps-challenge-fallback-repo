// Phone portal for the walk view (open walk/?portal=1 on the phone, over https).
// The phone is a window onto Mars: where it points, you look; where you walk, you move.
//
// Two modes, picked by what the phone can do:
//  - "AR" (WebXR immersive-ar, Chrome on Android with ARCore): the phone tracks its own position
//    and turn from the camera. Real walking moves you on Mars 1:1 (or ×20 with Boost).
//    Mars is drawn opaque over the camera picture, so you only see Mars.
//  - "Compass" (any phone): the phone's orientation sensor turns the view; each detected step
//    moves you STEP_M (×20 with Boost) the way the phone faces.
// GO/NO-GO rules stay: NO-GO, unknown or cut-off ground stops you (the view does not move).
//
// Team display choices (ASSUMPTIONS, not NASA values): step 0.7 m and Boost ×20 are the
// app's existing phone-walk values (Application/fg-app/src/components/Helmet.jsx, STEP_M, SCALE).
// Step detection thresholds are the same as the helmet's.

export const STEP_M = 0.7, BOOST = 20;

export function startPortal(api) {
  const { THREE, st, camera, rig, renderer, tryMove, heightAt, toScene, say, EYE } = api;
  const $ = (id) => document.getElementById(id);
  const P = { mode: null, boost: 1, steps: 0, eyeOffset: 0 };
  document.body.classList.add("portal");

  // ---------------------------------------------------------------- UI ----
  const ui = document.createElement("div");
  ui.id = "portalui";
  ui.innerHTML = `
    <div id="pstart">
      <h2>Mars portal</h2>
      <p>Hold the phone up in front of you. Turn, look up at the sky, and walk: you move on Mars.</p>
      <button id="pAR" hidden>Enter AR portal (best)</button>
      <button id="pCompass">Compass + steps mode</button>
      <p id="pinfo" class="pmuted">Checking what this phone can do…</p>
    </div>
    <div id="pbar" hidden>
      <span id="pground">–</span>
      <span id="pwalked">0 m</span>
      <button id="pboost">Boost ×${BOOST}</button>
      <button id="precenter" hidden>Re-center</button>
      <button id="pexit">Exit</button>
    </div>
    <div id="pmsg"></div>
    <div id="psim" hidden><b>Simulated</b> rocks, ripples and close-up texture · real terrain (USGS), colours (NASA PIA26693), sun (Mars24) · GO/NO-GO from the team map</div>`;
  document.body.append(ui);

  const flash = (t) => { const m = $("pmsg"); m.textContent = t; m.style.display = "block"; clearTimeout(flash.t); flash.t = setTimeout(() => (m.style.display = "none"), 2200); };
  P.say = flash;
  $("pboost").onclick = () => { P.boost = P.boost === 1 ? BOOST : 1; $("pboost").textContent = P.boost === 1 ? `Boost ×${BOOST}` : "Boost off (×1)"; $("pboost").classList.toggle("on", P.boost !== 1); };
  $("pexit").onclick = () => exit();

  const info = [];
  if (!window.isSecureContext) info.push("⚠ Not https: the phone will block the sensors. Open the https address.");
  const xrOk = navigator.xr ? navigator.xr.isSessionSupported("immersive-ar").catch(() => false) : Promise.resolve(false);
  xrOk.then((ok) => {
    $("pAR").hidden = !ok;
    info.push(ok ? "AR tracking available (WebXR)." : "No WebXR AR on this browser: use Compass mode.");
    $("pinfo").textContent = info.join(" ");
  });
  $("pAR").onclick = () => startAR().catch((e) => { $("pinfo").textContent = "AR did not start: " + (e?.message || e); });
  $("pCompass").onclick = () => startCompass().catch((e) => { $("pinfo").textContent = "Compass mode did not start: " + (e?.message || e); });

  function showBar(mode) {
    $("pstart").hidden = true; $("pbar").hidden = false; $("psim").hidden = false;
    $("precenter").hidden = mode !== "compass";
    P.mode = mode;
  }
  function exit() {
    if (P.mode === "ar") renderer.xr.getSession()?.end();
    stopCompass();
    P.mode = null; $("pstart").hidden = false; $("pbar").hidden = true; $("psim").hidden = true;
    camera.position.set(0, 0, 0); camera.quaternion.identity(); rig.quaternion.identity();
  }

  // ---------------------------------------------------------------- AR (WebXR) ----
  const prev = new THREE.Vector3(), cur = new THREE.Vector3(), d = new THREE.Vector3(), fwd = new THREE.Vector3();
  let havePrev = false;
  async function startAR() {
    const session = await navigator.xr.requestSession("immersive-ar", {
      optionalFeatures: ["local-floor", "dom-overlay"], domOverlay: { root: ui },
    });
    // floor-level tracking if the phone has it; else the start pose, with the eye height of walk.json
    let type = "local-floor";
    try { await session.requestReferenceSpace("local-floor"); } catch { type = "local"; }
    P.eyeOffset = type === "local" ? EYE : 0;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType(type);
    renderer.xr.setFramebufferScaleFactor(0.8);       // lighter for a phone GPU (display choice)
    await renderer.xr.setSession(session);
    // the direction you face now = the direction the walk view was facing
    rig.rotation.set(0, st.yaw, 0);
    havePrev = false;
    session.addEventListener("end", () => { renderer.xr.enabled = false; if (P.mode === "ar") exit(); });
    showBar("ar");
    flash(`AR portal on (${type}). Walk to move on Mars.`);
  }

  // called every frame in AR, before rendering; camera.position is the phone's pose in rig space
  P.arFrame = () => {
    cur.copy(camera.position);
    if (havePrev) {
      d.subVectors(cur, prev).setY(0).applyQuaternion(rig.quaternion).multiplyScalar(P.boost);
      if (d.lengthSq() > 1e-8) {
        const dx = d.x, dy = -d.z;                  // scene x = east, scene -z = north
        if (!tryMove(dx, dy)) { tryMove(dx, 0) || tryMove(0, dy); }
      }
    }
    prev.copy(cur); havePrev = true;
    // put the rig so the phone sits exactly over the walker's spot, feet on the Mars ground
    const off = d.set(cur.x, 0, cur.z).applyQuaternion(rig.quaternion);
    P.gz = P.gz == null ? heightAt(st.x, st.y) : P.gz + (heightAt(st.x, st.y) - P.gz) * 0.2;
    const t = toScene(st.x, st.y, P.gz + P.eyeOffset);
    rig.position.set(t.x - off.x, t.y, t.z - off.z);
    // heading for the mini-map
    camera.getWorldDirection(fwd);
    st.yaw = Math.atan2(-fwd.x, -fwd.z);
  };

  // ---------------------------------------------------------------- compass + steps ----
  const zee = new THREE.Vector3(0, 0, 1), euler = new THREE.Euler(), q0 = new THREE.Quaternion(),
    q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), qDev = new THREE.Quaternion(),
    qYaw = new THREE.Quaternion(), qTarget = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let ori = null, yawOffset = 0, wantCenter = true, wake = null;
  const onOri = (e) => { if (e.alpha != null) ori = e; };
  // step = a bounce of the phone (same detector and thresholds as the helmet's phone walk)
  let g = null, lp = 0, upS = false, lastStep = 0;
  const onMotion = (e) => {
    const lin = e.acceleration, inc = e.accelerationIncludingGravity; let m;
    if (lin && lin.x != null) m = Math.hypot(lin.x, lin.y, lin.z);
    else if (inc && inc.x != null) { const v = Math.hypot(inc.x, inc.y, inc.z); g = g == null ? v : 0.95 * g + 0.05 * v; m = Math.abs(v - g); }
    else return;
    lp = 0.5 * lp + 0.5 * m; const t = performance.now();
    if (!upS && lp > 1.3 && t - lastStep > 330) { upS = true; lastStep = t; stepForward(); }
    if (lp < 0.6) upS = false;
  };
  function stepForward() {
    const dist = STEP_M * P.boost;
    tryMove(-Math.sin(st.yaw) * dist, Math.cos(st.yaw) * dist);
    P.steps++;
  }
  async function startCompass() {
    // ask for the motion sensors where the browser wants a tap-time permission; a refusal is only a
    // warning (some browsers send the data anyway), the 2 s check below says if nothing arrives
    let refused = "";
    for (const E of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) {
      if (E && typeof E.requestPermission === "function") { try { const r = await E.requestPermission(); if (r !== "granted") refused = r; } catch (e) { refused = e?.message || "error"; } }
    }
    addEventListener("deviceorientation", onOri); addEventListener("devicemotion", onMotion);
    // full screen and keep-awake are nice to have: never wait on them (they can stay pending)
    document.documentElement.requestFullscreen?.()?.catch?.(() => {});
    navigator.wakeLock?.request("screen").then((w) => (wake = w)).catch(() => {});
    wantCenter = true;
    $("precenter").onclick = () => { wantCenter = true; flash("Re-centred: you face the way the map faced."); };
    showBar("compass");
    setTimeout(() => { if (!ori) flash(`No orientation data${refused ? ` (permission ${refused})` : ""}: is the page on https, and motion sensors allowed in Chrome site settings?`); }, 2000);
  }
  function stopCompass() {
    removeEventListener("deviceorientation", onOri); removeEventListener("devicemotion", onMotion);
    try { wake?.release(); } catch {} wake = null;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  const yawOf = (q) => { fwd.set(0, 0, -1).applyQuaternion(q); return Math.atan2(-fwd.x, -fwd.z); };
  // device angles -> camera quaternion (W3C DeviceOrientation frame; the screen's own rotation too)
  P.compassFrame = () => {
    if (!ori) return false;
    const r = Math.PI / 180, orient = ((screen.orientation?.angle ?? window.orientation) || 0) * r;
    euler.set(ori.beta * r, ori.alpha * r, -ori.gamma * r, "YXZ");
    qDev.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
    if (wantCenter) { yawOffset = st.yaw - yawOf(qDev); wantCenter = false; camera.quaternion.copy(qYaw.setFromAxisAngle(up, yawOffset).multiply(qDev)); }
    qTarget.copy(qYaw.setFromAxisAngle(up, yawOffset)).multiply(qDev);
    camera.quaternion.slerp(qTarget, 0.35);          // smooth the sensor jitter
    st.yaw = yawOf(camera.quaternion);
    return true;
  };

  // ---------------------------------------------------------------- link to the app (helmet, tablet, mission control) ----
  // Opened from the helmet (?back=<helmet url>): the helmet's last telemetry is in sessionStorage.
  // Every second the portal sends that telemetry with the portal's own position, facing and ground,
  // through server.py (/api/events), so the tablet and mission control see the astronaut move.
  // Local metres <-> lon/lat: the box's eqc grid (lon_0 = 0, R = 3396190 m), SW corner from terrain.json.
  const q = new URLSearchParams(location.search), back = q.get("back");
  let snap = {}; try { snap = JSON.parse(sessionStorage.getItem("fg-helmet-tele") || "{}"); } catch {}
  let geo = null;
  fetch("../terrain/terrain.json").then((r) => r.json()).then((t) => {
    const [lonW, latS] = t.corners_lonlat.SW, mPerDeg = 3396190 * Math.PI / 180;
    geo = { toLonLat: (x, y) => [lonW + x / mPerDeg, latS + y / mPerDeg] };
  }).catch(() => {});
  const COL = ["grey", "green", "orange", "red"], HAZ = ["Unknown ground: scout first", "GO ground", "Caution ground: walk slowly", "NO-GO ground ahead: do not cross"];
  let lastCls = 1;
  const distM = (a, b) => { const r = Math.PI / 180, R = 3396190, dl = (b[1] - a.lat) * r, dn = (b[0] - a.lon) * r * Math.cos(a.lat * r); return R * Math.hypot(dl, dn); };
  setInterval(() => {
    if (!P.mode || !geo) return;
    const [lon, lat] = geo.toLonLat(st.x, st.y);
    const heading = Math.round(((-st.yaw * 180 / Math.PI) % 360 + 360) % 360);
    const goal = snap.goalLat != null ? [snap.goalLon, snap.goalLat] : null;
    const ev = { ...snap, type: "telemetry", src: "portal", lat, lon, heading, running: true,
      colour: COL[lastCls] ?? "grey", haz: HAZ[lastCls] ?? "–", walked: Math.round(st.walked), steps: P.steps,
      d: goal ? distM({ lat, lon }, goal) : (snap.d ?? 0), next: snap.next ?? "free walk (portal)", i: snap.i ?? 0, n: snap.n ?? 1,
      uid: Math.random().toString(36).slice(2), t: Date.now() };
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ev) }).catch(() => {});
  }, 1000);
  if (back) {
    $("pexit").textContent = "Back to helmet";
    $("pexit").onclick = () => { exit(); location.href = back; };
    $("pstart").insertAdjacentHTML("beforeend", `<button id="pback">Back to helmet</button>`);
    $("pback").onclick = () => (location.href = back);
  }

  // HUD numbers, every frame
  P.hud = (cls, CLASS) => {
    lastCls = cls;
    const g = $("pground"); g.textContent = CLASS[cls] ?? "–";
    g.style.background = ["#9e9e9e", "#1a9850", "#f4c430", "#d73027"][cls] ?? "#555";
    $("pwalked").textContent = `${st.walked.toFixed(0)} m${P.mode === "compass" ? ` · ${P.steps} steps` : ""}`;
  };
  return P;
}
