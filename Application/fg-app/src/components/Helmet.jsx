import { useEffect, useRef, useState } from "react";
import { loadStops, COLOURS, DATA, dist, stepToward, hazardText, say } from "../lib/mission.js";
import { finalColour, certaintyOf, advice, envAt, o2LeftS, hm, RESERVE_MIN, O2_H } from "../lib/safety.js";
import Assistant from "./Assistant.jsx";
import { subscribe, bearing } from "../lib/live.js";
import { effective } from "../lib/safety.js";

// Team assumptions (ASSUMPTIONS.md)
const SPEED = 0.8, SIM_X = 20, RETURN_FACTOR = 1.2, NEAR_M = 60; // same as safety.js

export default function Helmet() {
  const q = new URLSearchParams(location.search);
  const evaMin = +(q.get("eva") || 240);
  const [route, setRoute] = useState([]);
  const [i, setI] = useState(1);
  const [pos, setPos] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [cam, setCam] = useState(false);
  const [voice, setVoice] = useState(true);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(false);
  const [live, setLive] = useState({}); // key → scout reading received from the tablet
  const [news, setNews] = useState(null); // last scout alert shown on the visor
  const [heading, setHeading] = useState(null); // real phone compass if available
  const st = useRef({}), video = useRef(null), stream = useRef(null), announced = useRef(new Set());

  useEffect(() => {
    loadStops().then((all) => {
      const want = (q.get("stops") || "").split(",").map(Number).filter(Boolean);
      const r = want.length ? want.map((s) => all.find((x) => x.sol === s)).filter(Boolean) : all.slice(0, 5);
      setRoute(r); setPos({ lat: r[0].lat, lon: r[0].lon }); setI(r.length > 1 ? 1 : 0);
    }).catch((e) => setErr(e.message));
  }, []);

  // scout reports from the tablet (live data replaces stored AI data)
  useEffect(() => subscribe((e) => {
    if (e.type !== "scout") return;
    setLive((m) => ({ ...m, [e.key]: e }));
    const where = e.grey ? `unexplored area near sol ${e.near}` : `sol ${e.sol}`;
    const ahead = !e.grey && st.current.route.slice(st.current.i).some((r) => r.sol === e.sol);
    setNews({ text: `🚁 SCOUT · ${e.verdict.label} · ${where}${ahead ? " · ON YOUR ROUTE" : ""}`, colour: e.verdict.colour, at: Date.now() });
    say(`Scout report. ${e.verdict.label.replace(":", ".")}. ${where}.${ahead ? " This is on your route." : ""}`, st.current.voice);
  }), []);
  useEffect(() => { if (!news) return; const t = setTimeout(() => setNews(null), 7000); return () => clearTimeout(t); }, [news]);

  // phone compass (works on phones over https; on a PC the map stays north-up)
  useEffect(() => {
    const on = (e) => { const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null); if (h != null) setHeading(h); };
    window.addEventListener("deviceorientationabsolute", on); window.addEventListener("deviceorientation", on);
    return () => { window.removeEventListener("deviceorientationabsolute", on); window.removeEventListener("deviceorientation", on); };
  }, []);

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

  st.current = { route, i, pos, voice };
  if (err) return <p className="err">⚠ {err}</p>;
  if (!route.length || !pos) return <p className="muted">Loading mission…</p>;

  const s = route[i], L = live[s.sol], c = finalColour(s, L), d = dist(pos, s), haz0 = hazardText(effective(s, L));
  const haz = c === "orange" && haz0 === "FIRM" ? "AI UNSURE" : haz0;
  const cert = certaintyOf(s, L), adv = advice(s, L), env = envAt(elapsed, s.sol);
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
  const aKey = s.sol + ":" + c;
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
  const eye = (key) => (
    <div className="eye" key={key}>
      {cam ? <video className="bg" ref={setVideo} autoPlay playsInline muted /> : s.image && <img className="bg" src={DATA + s.image} alt="" />}
      <div className="hud">
        <div>
          <div className="ground" style={{ background: COLOURS[c] }} />
          <div className="row"><span className="tag">{cam ? "AR · CAMERA + MISSION DATA" : "MARS PHOTO · SIMULATED WALK"}</span><span className="tag">stop {i + 1}/{route.length} · sol {s.sol}</span></div>
          <div className="row env">
            <span className="tag" style={{ color: o2Pct < 25 ? COLOURS.red : undefined }}>O₂ {o2Pct}%</span>
            <span className="tag">🌡 {env.tempC} °C</span>
            <span className="tag">☢ {env.radMsvDay} mSv/d</span>
            <span className="tag" style={{ color: cert.v < 0.75 ? COLOURS.orange : undefined }}>AI {Math.round(cert.v * 100)}% sure</span>
          </div>
        </div>
        <div className="mid">
          {news && <div className="news" style={{ borderColor: COLOURS[news.colour] }}>{news.text}</div>}
          {(warn || back <= 0) && <div className="alert" style={{ background: c === "orange" && back > 0 ? "#c46a00dd" : undefined }}>{back <= 0 ? "⟲ TURN BACK NOW" : `⚠ ${haz} AHEAD`}</div>}
        </div>
        <div className="navrow">
          <Compass deg={brg - (heading ?? 0)} north={heading == null ? 0 : -heading} real={heading != null} />
          <HelmetMap route={route} i={i} pos={pos} live={live} />
        </div>
        <div className="row nums">
          <div className="num"><b style={{ color: back < 900 ? COLOURS.red : undefined }}>{backTxt}</b><small>⟲ turn back in · {backBy}</small></div>
          <div className="num"><b>{Math.round(d)} m</b><small>▶ next stop</small></div>
          <div className="num"><b style={{ color: COLOURS[c] }}>{haz}</b><small>⚠ ground ahead</small></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={"helmet" + (cam ? " ar" : "")}>
      <div className="eyes">{eye("L")}</div>
      <div className="ctl">
        <button onClick={() => { setRunning((r) => !r); if (!running) say("Walk started. Follow the route.", voice); }}>{running ? "⏸ Pause" : "▶ Start walk"}</button>
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
      {route.map((r, k) => <circle key={r.sol} cx={X(r.lon)} cy={Y(r.lat)} r={k === i ? 6 : 4.5} fill={COLOURS[finalColour(r, live[r.sol])]} stroke={k === i ? "#fff" : "#000"} strokeWidth={k === i ? 2 : 1} />)}
      <circle cx={X(pos.lon)} cy={Y(pos.lat)} r="5" fill="#fff" stroke="#000" />
    </svg>
  );
}
