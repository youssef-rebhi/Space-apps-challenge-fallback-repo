import { useEffect, useRef, useState } from "react";
import { loadStops, colourOf, COLOURS, DATA, dist, stepToward, hazardText, say } from "../lib/mission.js";

// Team assumptions (ASSUMPTIONS.md)
const SPEED = 0.8, SIM_X = 20, RETURN_FACTOR = 1.2, NEAR_M = 60;

export default function Helmet() {
  const q = new URLSearchParams(location.search);
  const evaMin = +(q.get("eva") || 240);
  const [route, setRoute] = useState([]);
  const [i, setI] = useState(1);
  const [pos, setPos] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [vr, setVr] = useState(false);
  const [cam, setCam] = useState(false);
  const [voice, setVoice] = useState(true);
  const [err, setErr] = useState("");
  const st = useRef({}), video = useRef(null), stream = useRef(null), announced = useRef(new Set());

  useEffect(() => {
    loadStops().then((all) => {
      const want = (q.get("stops") || "").split(",").map(Number).filter(Boolean);
      const r = want.length ? want.map((s) => all.find((x) => x.sol === s)).filter(Boolean) : all.slice(0, 5);
      setRoute(r); setPos({ lat: r[0].lat, lon: r[0].lon }); setI(r.length > 1 ? 1 : 0);
    }).catch((e) => setErr(e.message));
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

  const s = route[i], c = colourOf(s), d = dist(pos, s), haz = hazardText(s);
  const back = evaMin * 60 - elapsed - (dist(pos, route[0]) * RETURN_FACTOR) / SPEED;
  const backTxt = back <= 0 ? "NOW" : `${Math.floor(back / 3600)}h${String(Math.floor((back % 3600) / 60)).padStart(2, "0")}`;
  const warn = (c === "red" || c === "orange") && d < NEAR_M;
  if (warn && !announced.current.has(s.sol)) {
    announced.current.add(s.sol);
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
          <div className="row"><span className="tag">{cam ? "CAMERA · AR PREVIEW" : "MARS · SIMULATED"}</span><span className="tag">stop {i + 1}/{route.length} · sol {s.sol}</span></div>
        </div>
        {(warn || back <= 0) && <div className="alert" style={{ background: c === "orange" && back > 0 ? "#c46a00dd" : undefined }}>{back <= 0 ? "⟲ TURN BACK NOW" : `⚠ ${haz} AHEAD`}</div>}
        <div className="row nums">
          <div className="num"><b style={{ color: back < 900 ? COLOURS.red : undefined }}>{backTxt}</b><small>⟲ turn back in</small></div>
          <div className="num"><b>{Math.round(d)} m</b><small>▶ next stop</small></div>
          <div className="num"><b style={{ color: COLOURS[c] }}>{haz}</b><small>⚠ ground ahead</small></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={"helmet" + (vr ? " vr" : "")}>
      <div className="eyes">{eye("L")}{vr && eye("R")}</div>
      <div className="ctl">
        <button onClick={() => { setRunning((r) => !r); if (!running) say("Walk started. Follow the route.", voice); }}>{running ? "⏸ Pause" : "▶ Start walk"}</button>
        <button onClick={toggleCam}>{cam ? "🔴 Mars view" : "📷 Camera"}</button>
        <button className={vr ? "on" : ""} onClick={() => setVr((v) => !v)}>👓 VR box</button>
        <button onClick={() => setVoice((v) => !v)}>{voice ? "🔊 Voice on" : "🔇 Voice off"}</button>
      </div>
    </div>
  );
}
