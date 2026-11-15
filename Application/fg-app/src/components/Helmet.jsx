import { useEffect, useRef, useState } from "react";
import { loadStops, COLOURS, DATA, dist, stepToward, hazardText, say } from "../lib/mission.js";
import { finalColour, certaintyOf, advice, envAt, o2LeftS, hm, RESERVE_MIN, O2_H } from "../lib/safety.js";
import Assistant from "./Assistant.jsx";
import { subscribe, bearing, publish } from "../lib/live.js";
import { effective } from "../lib/safety.js";
import { keyOf, labelOf, pointFrom } from "../lib/grey.js";

// Team assumptions (ASSUMPTIONS.md)
const STEP_M = 0.7, SCALE = 20, ARRIVE_M = 15; // phone walk: 0.7 m step ×20 on Mars (demo scale, assumption)
const SPEED = 0.8, SIM_X = 20, RETURN_FACTOR = 1.2, NEAR_M = 60; // same as safety.js

export default function Helmet() {
  const q = new URLSearchParams(location.search);
  const evaMin = +(q.get("eva") || 240);
  const [route, setRoute] = useState([]);
  const [i, setI] = useState(1);
  const [pos, setPos] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [phoneWalk, setPhoneWalk] = useState(false); // move with the phone: real steps + real compass
  const [steps, setSteps] = useState(0);
  const [motionOk, setMotionOk] = useState(false);
  const [motionLevel, setMotionLevel] = useState(0);
  const [motionPerm, setMotionPerm] = useState("");
  const [droneHaz, setDroneHaz] = useState([]); // drone scan spots sent by the tablet (SIMULATED)
  const stepRef = useRef(() => {});
  // one step: towards the next stop (guided walk; the compass only turns the view)
  stepRef.current = () => {
    const S = st.current, target = S.route[S.i]; if (!target || !S.pos) return;
    const dd = Math.min(STEP_M * SCALE, dist(S.pos, target));
    const np = stepToward(S.pos, target, dd);
    setPos(np); setSteps((n) => n + 1);
    if (dist(np, target) < ARRIVE_M) {
      say(`Arrived at stop ${S.i + 1}. ${hazardText(target).toLowerCase()}.`, S.voice);
      if (S.i < S.route.length - 1) setI(S.i + 1);
    }
  };
  const [cam, setCam] = useState(false);
  const [voice, setVoice] = useState(true);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(false);
  const [live, setLive] = useState({}); // key → scout reading received from the tablet
  const [news, setNews] = useState(null); // last scout alert shown on the visor
  const [heading, setHeading] = useState(null); // real phone compass if available
  const [msg, setMsg] = useState(null); // message from mission control
  const [geo, setGeo] = useState(null);
  const tele = useRef(null), st = useRef({}), video = useRef(null), stream = useRef(null), announced = useRef(new Set());

  useEffect(() => {
    loadStops().then((all) => {
      const toks = (q.get("stops") || "").split(",").filter(Boolean);
      const near = (lat, lon) => all.reduce((b, s) => (dist(s, { lat, lon }) < dist(b, { lat, lon }) ? s : b), all[0]);
      const r0 = toks.map((t) => {
        if (t[0] !== "p" && t[0] !== "v") return all.find((x) => x.sol === +t);
        const [lat, lon] = t.slice(1).split("_").map(Number);
        return { ...pointFrom(lat, lon, all, dist), id: t, via: t[0] === "v" };
      }).filter(Boolean);
      const r = r0.length ? r0 : all.slice(0, 5);
      // slope + height for picked points (team DEM)
      import("../lib/geo.js").then(async ({ loadGeo, elevAt }) => {
        try { const g = await loadGeo(); r.forEach((p) => { if (p.custom) { p.slope_class = g.slopeAt(p.lat, p.lon); p.elev = elevAt(g.elev, p.lat, p.lon); } }); setRoute([...r]); } catch {}
      });
      setRoute(r); setPos({ lat: r[0].lat, lon: r[0].lon }); setI(r.length > 1 ? 1 : 0);
    }).catch((e) => setErr(e.message));
  }, []);

  // scout reports from the tablet (live data replaces stored AI data)
  const openedAt = useRef(Date.now()).current;
  useEffect(() => subscribe((e) => {
    if (e.t && e.t < openedAt - 5000) { if (e.type === "dronescan") setDroneHaz(e.cells || []); if (e.type !== "scout") return; }
    if (e.type === "msg") { setMsg({ text: e.text }); say(`Message from mission control. ${e.text}`, st.current.voice); return; }
    if (e.type === "dronescan") {
      setDroneHaz(e.cells || []);
      setNews({ text: `🚁 DRONE SCAN (SIM): ${e.sand} sand · ${e.steep} steep spots on your way${e.changed ? " · ROUTE UPDATED" : ""}`, colour: e.sand || e.steep ? "orange" : "green", at: Date.now() });
      say(`Drone scan done. ${e.sand ? `${e.sand} sand spots found.` : "No sand found."}${e.changed ? " Your route was updated." : ""}`, st.current.voice);
      return;
    }
    if (e.type === "recall") { setMsg({ text: "RECALL · return to the start now" }); setI(0); say("Mission control recalls you. Return to the start now.", st.current.voice); return; }
    if (e.type !== "scout") return;
    setLive((m) => ({ ...m, [e.key]: e }));
    if (e.t && e.t < openedAt - 5000) return; // older report: keep the data, no alert
    const where = e.label || (e.grey ? `unexplored area near sol ${e.near}` : `sol ${e.sol}`);
    const ahead = st.current.route.slice(st.current.i).some((r) => keyOf(r) === e.key);
    setNews({ text: `🚁 SCOUT · ${e.verdict.label} · ${where}${ahead ? " · ON YOUR ROUTE" : ""}`, colour: e.verdict.colour, at: Date.now() });
    say(`Scout report. ${e.verdict.label.replace(":", ".")}. ${where}.${ahead ? " This is on your route." : ""}`, st.current.voice);
  }), []);
  useEffect(() => { if (!news) return; const t = setTimeout(() => setNews(null), 7000); return () => clearTimeout(t); }, [news]);

  useEffect(() => { import("../lib/geo.js").then(({ loadGeo }) => loadGeo().then(setGeo)).catch(() => {}); }, []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 12000); return () => clearTimeout(t); }, [msg]);

  // phone compass (works on phones over https; on a PC the map stays north-up)
  useEffect(() => {
    const on = (e) => { const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null); if (h != null) setHeading(h); };
    window.addEventListener("deviceorientationabsolute", on); window.addEventListener("deviceorientation", on);
    return () => { window.removeEventListener("deviceorientationabsolute", on); window.removeEventListener("deviceorientation", on); };
  }, []);

  // telemetry to mission control every 2 s (simulated suit + walk)
  useEffect(() => {
    const id = setInterval(() => { const t = tele.current; if (t) publish({ type: "telemetry", ...t, steps: st.current.steps }); }, 1000);
    return () => clearInterval(id);
  }, []);

  // PHONE WALK: every real step moves you STEP_M × SCALE metres on Mars, in the direction the phone faces
  // (no compass → towards the next stop). Time runs ×SCALE too, so a room-size demo covers Mars distances.
  useEffect(() => {
    if (!phoneWalk) return;
    let last = 0, lp = 0, lastStep = 0, up = false;
    // step = a bounce of the phone. Use acceleration without gravity when the phone gives it,
    // else remove gravity with a slow average. Works whatever way the phone is held.
    let g = null, n = 0;
    const onMotion = (e) => {
      const lin = e.acceleration, inc = e.accelerationIncludingGravity;
      let m;
      if (lin && lin.x != null) m = Math.hypot(lin.x, lin.y, lin.z);
      else if (inc && inc.x != null) { const v = Math.hypot(inc.x, inc.y, inc.z); g = g == null ? v : 0.95 * g + 0.05 * v; m = Math.abs(v - g); }
      else return;
      if (++n % 6 === 0) setMotionLevel(m);
      setMotionOk(true);
      lp = 0.5 * lp + 0.5 * m; const t = performance.now();
      if (!up && lp > 1.3 && t - lastStep > 330) { up = true; lastStep = t; step(); }
      if (lp < 0.6) up = false;
    };
    const step = () => stepRef.current();
    const _unused = () => {
      const S = st.current, target = S.route[S.i]; if (!target || !S.pos) return;
      const dir = bearing(S.pos, target), d = STEP_M * SCALE;
      const r = Math.PI / 180, M = 3396190 * r;
      const np = { lat: S.pos.lat + (d * Math.cos(dir * r)) / M, lon: S.pos.lon + (d * Math.sin(dir * r)) / (M * Math.cos(S.pos.lat * r)) };
      setPos(np); setSteps((n) => n + 1);
      if (dist(np, target) < ARRIVE_M) {
        say(`Arrived at stop ${S.i + 1}. ${hazardText(target).toLowerCase()}.`, S.voice);
        if (S.i < S.route.length - 1) setI(S.i + 1);
      }
    };
    const clock = setInterval(() => setElapsed((x) => x + SCALE), 1000);
    window.addEventListener("devicemotion", onMotion);
    return () => { window.removeEventListener("devicemotion", onMotion); clearInterval(clock); };
  }, [phoneWalk]);

  async function togglePhoneWalk() {
    if (phoneWalk) { setPhoneWalk(false); return; }
    try {
      // iPhone: motion + compass need a permission asked from a button press
      let r = "granted";
      if (typeof DeviceMotionEvent !== "undefined" && DeviceMotionEvent.requestPermission) r = await DeviceMotionEvent.requestPermission();
      if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission().catch(() => {});
      setMotionPerm(r);
    } catch (err) { setMotionPerm("error: " + (err?.message || err)); }
    setRunning(false); setPhoneWalk(true);
    say("Walk with the phone. Each step moves you on Mars.", voice);
  }

  // walk simulation loop
  useEffect(() => {
    if (!running) return;
    let last = 0, id;
    const tick = (t) => {
      const dt = last ? ((t - last) / 1000) * SIM_X : 0; last = t;
      const s = st.current;
      const target = s.route[s.i];
      const np = stepToward(s.pos, target, SPEED * dt);
      setPos(np); setElapsed((e) => e + dt);
      if (dist(np, target) < 1) {
        say(`Arrived at stop ${s.i + 1}. ${hazardText(target).toLowerCase()}.`, s.voice);
        if (s.i < s.route.length - 1) setI(s.i + 1); else { setRunning(false); return; }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [running]);

  st.current = { route, i, pos, voice, heading, steps };
  if (err) return <p className="err">⚠ {err}</p>;
  if (!route.length || !pos) return <p className="muted">Loading mission…</p>;

  const s = route[i], L = live[keyOf(s)], c = finalColour(s, L), d = dist(pos, s), haz0 = hazardText(effective(s, L));
  const haz = c === "orange" && haz0 === "FIRM" ? "AI UNSURE" : haz0;
  const cert = certaintyOf(s, L), adv = advice(s, L), env = envAt(elapsed, s.sol ?? 7);
  const o2 = o2LeftS(elapsed), o2Usable = o2 - RESERVE_MIN * 60;
  const ret = (dist(pos, route[0]) * RETURN_FACTOR) / SPEED;
  const back = Math.min(evaMin * 60 - elapsed, o2Usable) - ret;
  const backBy = o2Usable < evaMin * 60 - elapsed ? "oxygen" : "EVA time";
  const backTxt = back <= 0 ? "NOW" : hm(back);
  const brg = bearing(pos, s);
  const o2Pct = Math.max(0, Math.round((o2 / (O2_H * 3600)) * 100));
  const ctx = { stop: s, eff: effective(s, L), live: L, colour: c === "green" ? "go" : c === "orange" ? "careful" : c === "red" ? "don't go" : "no data",
    cert: cert.v, certSrc: cert.src, advice: adv.text, adviceScout: adv.scout, o2Left: o2Usable, back, distNext: d, env };
  const warn = (c === "red" || c === "orange") && d < NEAR_M;
  const nearHaz = droneHaz.find((h) => dist(h, pos) < 25);
  if (nearHaz && !announced.current.has("dh" + nearHaz.lat)) { announced.current.add("dh" + nearHaz.lat); say(`Drone warning. ${nearHaz.r === "steep" ? "Steep ground" : "Sand"} right here. Slow down.`, voice); }
  tele.current = { o2Pct, back, backBy, tempC: env.tempC, rad: env.radMsvDay, d, next: labelOf(s), colour: c, haz, i, n: route.length, running, heading: Math.round(heading ?? brg), lat: pos.lat, lon: pos.lon, elapsed, cert: cert.v, route: route.map((r) => [r.lat, r.lon]) };
  const aKey = keyOf(s) + ":" + c;
  if (warn && !announced.current.has(aKey)) {
    announced.current.add(aKey);
    say(c === "red" ? `Warning. ${haz.toLowerCase()} ahead. Do not cross.` : `Caution. ${haz.toLowerCase()} ahead. Walk slowly.`, voice);
  }

  async function toggleCam() {
    if (cam) { setCam(false); return; }
    try {
      stream.current = stream.current || (await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }));
      setCam(true);
    } catch { alert("Camera blocked: open the page over https and allow the camera."); }
  }

  const setVideo = (v) => { if (v && stream.current && v.srcObject !== stream.current) v.srcObject = stream.current; };
  const rel = ((brg - (heading ?? brg) + 540) % 360) - 180; // target angle vs where you face (sim: you face the way you walk)
  const status = back <= 0 ? ["TURN BACK NOW", "red"] : c === "red" ? ["NO-GO AHEAD", "red"] : c === "orange" ? ["CAUTION AHEAD", "orange"] : c === "grey" ? ["GROUND UNKNOWN · SCOUT FIRST", "orange"] : ["EVA NOMINAL", "green"];
  const eta = Math.round(d / SPEED / 60);
  const eye = (key) => (
    <div className="eye" key={key}>
      {cam ? <video className="bg" ref={setVideo} autoPlay playsInline muted /> : (s.image || s.nearest?.image) && <img className="bg" src={DATA + (s.image || s.nearest.image)} alt="" />}
      <div className="visor" />
      <div className="hud2">
        <Tape heading={heading ?? brg} target={brg} colour={COLOURS[c]} real={heading != null} />
        <div className="status" style={{ color: COLOURS[status[1]] }}>{status[0]} · {running || phoneWalk ? "WALKING TO" : "NEXT"} {labelOf(s).toUpperCase()}</div>
        {news && <div className="news" style={{ borderColor: COLOURS[news.colour] }}>{news.text}</div>}
        {msg && <div className="news msg">📡 MISSION CONTROL: {msg.text}</div>}
        <div className="lt">
          <Gauge label="O₂" value={`${o2Pct}%`} frac={o2Pct / 100} warn={o2Pct < 25} />
          <div className="kv"><b style={{ color: back < 900 ? COLOURS.red : undefined }}>{backTxt}</b><small>TURN BACK IN · {backBy.toUpperCase()}</small></div>
          <div className="kv"><b>{env.tempC}°C</b><small>OUTSIDE AIR (SIM)</small></div>
          <div className="kv"><b>{env.radMsvDay}</b><small>mSv/DAY RADIATION (SIM)</small></div>
          <div className="kv"><b>{cam ? "AR" : "PHOTO"}</b><small>{cam ? "CAMERA + MISSION DATA" : "CURIOSITY NAVCAM"} · {phoneWalk ? `PHONE WALK ×${SCALE}` : running ? "AUTO WALK" : "STOPPED"}</small></div>
        </div>
        <div className="rt"><Radar route={route} i={i} pos={pos} live={live} geo={geo} heading={heading} drone={droneHaz} /></div>
        {Math.abs(rel) < 55 && (
          <div className="target" style={{ left: `${50 + (rel / 55) * 42}%`, color: COLOURS[c] }}>
            <svg viewBox="-20 -20 40 40"><path d="M0,-14 L12,0 L0,14 L-12,0 Z" fill="none" stroke="currentColor" strokeWidth="2.5" /><circle r="3" fill="currentColor" /></svg>
            <span>{labelOf(s)} · {Math.round(d)} m</span>
          </div>
        )}
        {Math.abs(rel) >= 55 && <div className={"edge " + (rel > 0 ? "r" : "l")} style={{ color: COLOURS[c] }}>{rel > 0 ? "▶" : "◀"}</div>}
        {nearHaz && !(warn || back <= 0) && <div className="alert2" style={{ borderColor: "#ffb020", color: "#ffb020" }}>🚁 DRONE: {nearHaz.r === "steep" ? "STEEP" : "SAND"} WITHIN 25 m (SIM)</div>}
        {(warn || back <= 0) && <div className="alert2" style={{ borderColor: COLOURS[back <= 0 ? "red" : c], color: COLOURS[back <= 0 ? "red" : c] }}>{back <= 0 ? "⟲ TURN BACK NOW" : `⚠ ${haz} AHEAD`}</div>}
        {phoneWalk && (
          <div className="hint2">
            {motionOk ? `Motion ${motionLevel.toFixed(1)} · steps ${steps} · walk to move`
              : motionPerm && motionPerm !== "granted" ? `Motion permission: ${motionPerm}. Allow "Motion & Orientation" for this site, or tap 👣 Step.`
              : "No motion data from this phone/browser: tap 👣 Step (or open the link in Safari / Chrome)."}
          </div>
        )}
        <div className="card2" style={{ borderColor: COLOURS[c] }}>
          <small>NEXT · STOP {i + 1}/{route.length}</small>
          <b>{labelOf(s).toUpperCase()}</b>
          <span>{Math.round(d)} m · {eta} MIN · <em style={{ color: COLOURS[c] }}>{haz}</em> · AI {Math.round(cert.v * 100)}%</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={"helmet" + (cam ? " ar" : "")}>
      <div className="eyes">{eye("L")}</div>
      <div className="ctl">
        <button className={phoneWalk ? "on" : ""} onClick={togglePhoneWalk}>{phoneWalk ? `🚶 ${steps} steps · stop` : "🚶 Walk with phone"}</button>
        {phoneWalk && <button onClick={() => stepRef.current()}>👣 Step</button>}
        {!phoneWalk && <button onClick={() => { setRunning((r) => !r); if (!running) say("Walk started. Follow the route.", voice); }}>{running ? "⏸ Pause" : "▶ Auto walk"}</button>}
        <button onClick={toggleCam}>{cam ? "🪐 Mars photo (simulated)" : "📷 AR camera"}</button>
        <button onClick={() => setVoice((v) => !v)}>{voice ? "🔊 Voice on" : "🔇 Voice off"}</button>
        <button className={ask ? "on" : ""} onClick={() => setAsk((a) => !a)}>🤖 Ask</button>
      </div>
      {ask && <div className="askPanel"><Assistant ctx={ctx} voice={voice} compact /></div>}
    </div>
  );
}

// Arrow to the next stop. With a phone compass it turns with you; on a PC it is north-up.
function Compass({ deg, north, real }) {
  return (
    <svg className="compass" viewBox="-50 -50 100 100" aria-label={`Next stop direction ${Math.round(deg)} degrees`}>
      <circle r="46" fill="#0009" stroke="#ffffff55" strokeWidth="2" />
      <g transform={`rotate(${north})`}><text y="-32" textAnchor="middle" fontSize="13" fill="#ff8080" fontWeight="700">N</text></g>
      <g transform={`rotate(${deg})`}><path d="M0,-34 L13,10 L0,3 L-13,10 Z" fill="#7fb3ff" stroke="#000" /></g>
      <text y="40" textAnchor="middle" fontSize="9" fill="#ccc">{real ? "compass" : "north-up"}</text>
    </svg>
  );
}

// Corner map: route, you, stops coloured with live scout data when it exists.
function HelmetMap({ route, i, pos, live }) {
  const W = 150, P = 12, pts = [...route, pos, ...Object.values(live)];
  const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
  const x0 = Math.min(...lons), y0 = Math.min(...lats);
  const span = Math.max(Math.max(...lons) - x0, Math.max(...lats) - y0) || 1e-4;
  const X = (lon) => P + ((lon - x0) / span) * (W - 2 * P), Y = (lat) => W - P - ((lat - y0) / span) * (W - 2 * P);
  return (
    <svg className="hmap" viewBox={`0 0 ${W} ${W}`} aria-label="Route map">
      <rect width={W} height={W} rx="10" fill="#000a" stroke="#ffffff44" />
      {Object.values(live).filter((e) => e.grey).map((e) => <rect key={e.key} x={X(e.lon) - 5} y={Y(e.lat) - 5} width="10" height="10" fill={COLOURS[e.verdict.colour]} opacity=".85" />)}
      <polyline points={route.map((r) => `${X(r.lon)},${Y(r.lat)}`).join(" ")} fill="none" stroke="#7fb3ff" strokeWidth="2" strokeDasharray="4 3" />
      {route.map((r, k) => <circle key={keyOf(r)} cx={X(r.lon)} cy={Y(r.lat)} r={k === i ? 6 : r.via ? 2.2 : 4.5} fill={COLOURS[finalColour(r, live[keyOf(r)])]} stroke={k === i ? "#fff" : "#000"} strokeWidth={k === i ? 2 : 1} />)}
      <circle cx={X(pos.lon)} cy={Y(pos.lat)} r="5" fill="#fff" stroke="#000" />
    </svg>
  );
}

// compass tape across the top: where you face, and the target diamond
function Tape({ heading, target, colour, real }) {
  const W = 600, span = 120, x = (deg) => W / 2 + ((((deg - heading + 540) % 360) - 180) / (span / 2)) * (W / 2);
  const ticks = []; for (let d = 0; d < 360; d += 15) { const px = x(d); if (px < 0 || px > W) continue; const big = d % 90 === 0;
    ticks.push(<g key={d}><line x1={px} x2={px} y1={big ? 4 : 12} y2={24} stroke="currentColor" strokeWidth={big ? 2 : 1} />{d % 45 === 0 && <text x={px} y={40} textAnchor="middle" fontSize="13">{["N", "NE", "E", "SE", "S", "SW", "W", "NW"][d / 45]}</text>}</g>); }
  const tx = x(target);
  return (
    <svg className="tape" viewBox={`0 0 ${W} 50`} aria-label={`Heading ${Math.round(heading)} degrees`}>
      {ticks}
      <line x1={W / 2} x2={W / 2} y1={0} y2={30} stroke="#fff" strokeWidth="3" />
      {tx >= 0 && tx <= W && <path d={`M${tx},26 l7,8 l-7,8 l-7,-8 z`} fill={colour} />}
      <text x={W - 4} y={12} textAnchor="end" fontSize="11">{Math.round((heading + 360) % 360)}° {real ? "" : "(walk dir.)"}</text>
    </svg>
  );
}

function Gauge({ label, value, frac, warn }) {
  return (
    <div className="gauge"><small>{label}</small><b style={{ color: warn ? "#d43d3d" : undefined }}>{value}</b>
      <i><u style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: warn ? "#d43d3d" : undefined }} /></i></div>
  );
}

// round radar map: team DEM under you, route, you in the centre (~400 m around)
function Radar({ route, i, pos, live, geo, heading, drone }) {
  const R = 400, M = 3396190 * Math.PI / 180, cos = Math.cos((pos.lat * Math.PI) / 180);
  const X = (lon) => (lon - pos.lon) * M * cos, Y = (lat) => -(lat - pos.lat) * M;
  const b = geo?.bounds?.["elevation_box.png"]?.bounds;
  const rot = heading != null ? -heading : 0;
  return (
    <svg className="radar" viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} aria-label="Map around you">
      <defs><clipPath id="rc"><circle r={R - 6} /></clipPath></defs>
      <circle r={R - 4} fill="#000a" />
      <g clipPath="url(#rc)"><g transform={`rotate(${rot})`}>
        {b && <image href={DATA + "geo/elevation_box.webp"} x={X(b[0][1])} y={Y(b[1][0])} width={X(b[1][1]) - X(b[0][1])} height={Y(b[0][0]) - Y(b[1][0])} preserveAspectRatio="none" opacity="0.75" />}
        {(drone || []).map((h, k) => <circle key={k} cx={X(h.lon)} cy={Y(h.lat)} r="7" fill={h.r === "steep" ? "#6a1fd1" : "#ffb020"} />)}
        <polyline points={route.map((r) => `${X(r.lon)},${Y(r.lat)}`).join(" ")} fill="none" stroke="#fff" strokeWidth="6" strokeDasharray="14 10" />
        {route.map((r, k) => <circle key={keyOf(r)} cx={X(r.lon)} cy={Y(r.lat)} r={k === i ? 18 : r.via ? 6 : 12} fill={COLOURS[finalColour(r, live[keyOf(r)])]} stroke="#000" strokeWidth="3" />)}
        <text x="0" y={-R + 50} textAnchor="middle" fontSize="44" fill="#ff8080" fontWeight="700">N</text>
      </g></g>
      <path d="M0,-26 L18,22 L0,10 L-18,22 Z" fill="#fff" stroke="#000" strokeWidth="3" />
      <circle r={R - 4} fill="none" stroke="currentColor" strokeWidth="6" />
      <text y={R - 24} textAnchor="middle" fontSize="40" fill="currentColor">400 m</text>
    </svg>
  );
}
