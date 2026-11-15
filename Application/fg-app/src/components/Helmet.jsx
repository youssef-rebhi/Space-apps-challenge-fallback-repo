import { useEffect, useRef, useState } from "react";
import { loadStops, COLOURS, DATA, dist, stepToward, hazardText, say } from "../lib/mission.js";
import { finalColour as colourOfStop, finalColour, certaintyOf, advice, envAt, o2LeftS, hm, RESERVE_MIN, O2_H } from "../lib/safety.js";
import Assistant from "./Assistant.jsx";
import { subscribe, bearing, publish } from "../lib/live.js";
import { effective } from "../lib/safety.js";
import { keyOf, labelOf, pointFrom } from "../lib/grey.js";
import { scienceTargets, HUMAN, LABEL, siteNear, openOf, samplesOf } from "../lib/science.js";
import { buildPath, navigate, turnWords, lookAhead, OFF_M, STEP_LEN } from "../lib/copilot.js";
import { safePath } from "../lib/routes.js";

// Team assumptions (ASSUMPTIONS.md)
const STEP_M = 0.7, SCALE = 20, ARRIVE_M = 15; // phone walk: 0.7 m step ×20 on Mars (demo scale, assumption)
const SPEED = 0.8, SIM_X = 20, RETURN_FACTOR = 1.2, NEAR_M = 60; // same as safety.js

export default function Helmet() {
  const q = new URLSearchParams(location.search);
  const evaMin = +(q.get("eva") || 240);
  const why = q.get("why") || "";
  // copilot: the safe walking path to the next stop, and where I am on it
  const [path, setPath] = useState(null);
  const pIdx = useRef(1);
  // guardian: emergency check ("are you OK?") then SOS on its own
  const [alarm, setAlarm] = useState(null); // { reason, left }
  const [sos, setSos] = useState(null);
  const lastStepAt = useRef(Date.now()), homeSet = useRef(false), aheadK = useRef(null), arrived = useRef(""), pausedMode = useRef(null);
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
  const [droneHaz, setDroneHaz] = useState([]);
  const [targets, setTargets] = useState([]);
  const [allStops, setAllStops] = useState([]);
  const [sciOpen, setSciOpen] = useState(null);
  const [sampled, setSampled] = useState({}); // drone scan spots sent by the tablet (SIMULATED)
  const stepRef = useRef(() => {});
  // arrival: science targets get their own message
  const arrive = (S, target) => {
    const t = siteNear(target, S.targets || [], dist);
    if (target.home) { say("You are back at the start. Walk finished.", S.voice); return; }
    if (t) {
      setNews({ text: `🔬 SCIENCE TARGET · ${t.name}`, colour: "green", at: Date.now() });
      say(`Science target. ${t.name}. ${t.why}`, S.voice);
    } else if (target.home) say("You are back at the start.", S.voice);
    else if (!target.via) say(S.i >= S.route.length - 1 ? "Destination reached." : `Arrived at ${labelOf(target)}.`, S.voice);
  };
  // move m metres along the safe path (falls back to a straight line if there is no path yet)
  const advance = (from, m, S) => {
    let p = from, left = m;
    const P = S.path?.pts;
    if (!P || P.length < 2) return stepToward(from, S.route[S.i], m);
    while (left > 0 && pIdx.current < P.length) {
      const c = P[pIdx.current], d = dist(p, c);
      if (d <= left) { p = { lat: c.lat, lon: c.lon }; left -= d; pIdx.current++; } else { p = stepToward(p, c, left); left = 0; }
    }
    return p;
  };
  // one step: along the safe path to the next stop (guided walk; the compass only turns the view)
  stepRef.current = () => {
    const S = st.current, target = S.route[S.i]; if (!target || !S.pos) return;
    const np = advance(S.pos, STEP_M * SCALE, S);
    lastStepAt.current = Date.now();
    setPos(np); setSteps((n) => n + 1);
    const ak = S.i + ":" + keyOf(target) + ":" + S.route.length;
    if (dist(np, target) < ARRIVE_M && arrived.current !== ak) { // announce each arrival once
      arrived.current = ak;
      arrive(S, target);
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
        try { const g = await loadGeo(); r.forEach((p) => { if (p.custom) { p.slope_class = g.slopeAt(p.lat, p.lon); p.map_class = g.mapAt ? g.mapAt(p.lat, p.lon) : null; p.elev = elevAt(g.elev, p.lat, p.lon); } }); setRoute([...r]); } catch {}
      });
      setRoute(r); setPos({ lat: r[0].lat, lon: r[0].lon }); setI(r.length > 1 ? 1 : 0);
      scienceTargets(all, dist).then(setTargets); setAllStops(all);
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
    let g = null, n = 0, fallT = 0;
    const onMotion = (e) => {
      const lin = e.acceleration, inc = e.accelerationIncludingGravity;
      let m;
      if (lin && lin.x != null) m = Math.hypot(lin.x, lin.y, lin.z);
      else if (inc && inc.x != null) { const v = Math.hypot(inc.x, inc.y, inc.z); g = g == null ? v : 0.95 * g + 0.05 * v; m = Math.abs(v - g); }
      else return;
      if (++n % 6 === 0) setMotionLevel(m);
      // fall: near free-fall (< 3 m/s²) then a hard hit (> 25 m/s²) within 1 s (team assumption)
      if (inc && inc.x != null) { const v = Math.hypot(inc.x, inc.y, inc.z), now = performance.now(); if (v < 3) fallT = now; else if (fallT && now - fallT < 1000 && v > 25) { fallT = 0; raise("Fall detected"); } }
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

  // build the safe path to the next stop whenever the target changes (team map, Safest weights)
  const legKey = route[i] ? keyOf(route[i]) + ":" + i + ":" + route.length : "";
  useEffect(() => {
    const S = st.current; if (!geo?.mapAt || !allStops.length || !S.pos || !route[i]) return;
    const pth = buildPath(geo, allStops, [S.pos, route[i]]);
    pIdx.current = 1; setPath(pth);
  }, [geo, allStops, legKey]);

  // guardian: countdown after a fall or no movement → SOS by itself
  const raise = (reason) => { if (st.current.alarmOn) return; setAlarm({ reason, left: 15 }); say(`${reason}. Are you OK? Say I'm OK or tap the button. SOS in 15 seconds.`, true); };
  useEffect(() => {
    if (!alarm) return;
    if (alarm.left <= 0) {
      const S = st.current;
      publish({ type: "sos", reason: alarm.reason, lat: S.pos?.lat, lon: S.pos?.lon });
      setSos({ reason: alarm.reason, at: Date.now() }); setAlarm(null);
      say("No answer. SOS sent to mission control with your position. Stay where you are.", true);
      return;
    }
    const t = setTimeout(() => setAlarm((a) => (a ? { ...a, left: a.left - 1 } : a)), 1000);
    return () => clearTimeout(t);
  }, [alarm]);
  const imOk = () => { if (alarm) publish({ type: "ok", reason: alarm.reason }); setAlarm(null); setSos(null); say("OK. Continue carefully.", voice); };
  // no movement for 2 minutes during a phone walk (team assumption)
  useEffect(() => {
    if (!phoneWalk) return;
    lastStepAt.current = Date.now();
    const id = setInterval(() => { if (Date.now() - lastStepAt.current > 120000) { lastStepAt.current = Date.now(); raise("No movement for 2 minutes"); } }, 5000);
    return () => clearInterval(id);
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
      const np = advance(s.pos, SPEED * dt, s);
      setPos(np); setElapsed((e) => e + dt);
      const ak = s.i + ":" + keyOf(target) + ":" + s.route.length;
      if ((dist(np, target) < 1 || (s.path && pIdx.current >= s.path.pts.length)) && arrived.current !== ak) {
        arrived.current = ak;
        arrive(s, target);
        if (s.i < s.route.length - 1) setI(s.i + 1); else { setRunning(false); return; }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [running]);

  st.current = { route, i, pos, voice, heading, steps, targets, path, alarmOn: !!alarm };
  if (err) return <p className="err">⚠ {err}</p>;
  if (!route.length || !pos) return <p className="muted">Loading mission…</p>;

  // the next real destination (path points every 200 m are only for guidance, not announced)
  const gi = (() => { for (let k = i; k < route.length; k++) if (!route[k].via) return k; return route.length - 1; })();
  const goal = route[gi], goalN = route.slice(0, gi + 1).filter((r) => !r.via).length, realN = route.filter((r) => !r.via).length;
  const goalM = (route[i] ? dist(pos, route[i]) : 0) + route.slice(i, gi + 1).reduce((acc, r, k, a) => acc + (k ? dist(a[k - 1], r) : 0), 0);
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
  // ── copilot: next turn, danger ahead, off route ──
  const nav = path ? navigate(path, pos, Math.min(pIdx.current, path.pts.length - 1)) : null;
  const turnTxt = nav ? (nav.turn ? turnWords(nav.turn) : `Keep straight for ${Math.round(d)} metres to ${labelOf(s)}.`) : "";
  const moving = running || phoneWalk;
  if (moving && nav?.turn && nav.turn.m < 40) {
    const k = "t" + legKey + ":" + nav.turn.k + (nav.turn.m < 6 ? "now" : "");
    if (!announced.current.has(k)) { announced.current.add(k); say(nav.turn.m < 6 ? turnWords(nav.turn) : `In ${Math.round(nav.turn.m)} metres, ${nav.turn.deg > 0 ? "turn right" : "turn left"}.`, voice); }
  }
  const ahead = path ? lookAhead(geo, path, pos, Math.min(pIdx.current, path.pts.length - 1), droneHaz) : null;
  const aheadTxt = !ahead ? "" : ahead.k === 3 ? `STOP. NO-GO ground in ${Math.round(ahead.m)} m (${ahead.src}). Do not cross.` : ahead.k === 0 ? `Unknown ground in ${Math.round(ahead.m)} m: scout first or go very slowly.` : `Caution ground in ${Math.round(ahead.m)} m (${ahead.src}): slow, short steps.`;
  if ((ahead?.k ?? 1) !== aheadK.current?.k) {
    const prev = aheadK.current; aheadK.current = { k: ahead?.k ?? 1, at: Date.now() };
    // say it when it gets worse, or when it comes back after 30 s (no repeating every few metres)
    if (ahead && moving && (!prev || ahead.k === 3 || Date.now() - (prev.saidAt || 0) > 30000)) { say(aheadTxt, voice); aheadK.current.saidAt = Date.now(); }
    else if (prev) aheadK.current.saidAt = prev.saidAt;
  }
  const offRoute = nav && nav.off > OFF_M;
  if (offRoute && !announced.current.has("off" + legKey)) { announced.current.add("off" + legKey); const r2 = ((bearing(pos, path.pts[Math.min(pIdx.current, path.pts.length - 1)]) - (heading ?? brg) + 540) % 360) - 180; say(`Off route by ${Math.round(nav.off)} metres. Turn ${r2 > 0 ? "right" : "left"} to get back.`, voice); }
  // ── what the conversation needs: the way home, the nearest science, and the actions it may take (always after a yes) ──
  let homeCache = null;
  const homeInfo = () => {
    if (homeCache) return homeCache;
    const start = route[0], going = !!route[route.length - 1]?.home && i === route.length - 1;
    let m = Math.round(dist(pos, start) * RETURN_FACTOR), goPct = null;
    try {
      const pts = geo?.mapAt ? safePath(geo, allStops, pos, start) : null;
      if (pts) { let L2 = 0, go = 0; for (let k = 1; k < pts.length; k++) { const dd = dist(pts[k - 1], pts[k]); L2 += dd; if (geo.mapAt(pts[k].lat, pts[k].lon) === 1) go += dd; } m = Math.round(L2); goPct = L2 ? Math.round((100 * go) / L2) : 100; }
    } catch {}
    const min = Math.max(1, Math.ceil(m / SPEED / 60));
    const o2Min = Math.floor(Math.min(o2Usable, evaMin * 60 - elapsed) / 60);
    homeCache = { m, min, goPct, o2Min, atStart: dist(pos, start) < 15, going };
    return homeCache;
  };
  const sciAsk = (() => {
    const o = targets.filter((t) => t.lat != null && !sampled[t.key]).map((t) => ({ t, m: dist(pos, t) })).filter((o) => o.m < 300).sort((a, b) => a.m - b.m)[0];
    if (!o) return null;
    const r2 = ((bearing(pos, o.t) - (heading ?? brg) + 540) % 360) - 180;
    return { key: o.t.key, name: o.t.name, m: Math.round(o.m), side: o.m < 10 ? "right here" : Math.abs(r2) < 25 ? "ahead" : r2 > 0 ? "on your right" : "on your left", why: o.t.why, samples: samplesOf(o.t).slice(0, 2).join("; ") };
  })();
  const actions = {
    home: (a) => {
      homeSet.current = true;
      setRoute((r) => [...r.slice(0, i), { ...r[0], home: true }]);
      publish({ type: "auto", text: `Astronaut asked to go back to the start${a?.reason ? ` (${a.reason})` : ""}: route home set` });
      if (!running && !phoneWalk && pausedMode.current) { pausedMode.current === "phone" ? setPhoneWalk(true) : setRunning(true); pausedMode.current = null; }
    },
    sos: (a) => { publish({ type: "sos", reason: `astronaut asked: ${a?.reason || "SOS"}`, lat: pos.lat, lon: pos.lon }); setSos({ reason: "asked by astronaut", at: Date.now() }); },
    pause: () => { pausedMode.current = phoneWalk ? "phone" : running ? "auto" : pausedMode.current; setRunning(false); setPhoneWalk(false); },
    resume: () => { if (pausedMode.current === "phone") setPhoneWalk(true); else setRunning(true); pausedMode.current = null; },
    detour: (a) => { const t = targets.find((x) => x.key === a.key); if (!t) return; const p0 = pointFrom(t.lat, t.lon, allStops, dist); setRoute((r) => [...r.slice(0, i), p0, ...r.slice(i)]); publish({ type: "auto", text: `Astronaut added a science detour: ${t.name}` }); },
  };
  const ctx = { stop: s, eff: effective(s, L), live: L, colour: c === "green" ? "go" : c === "orange" ? "careful" : c === "red" ? "don't go" : "no data",
    cert: cert.v, certSrc: cert.src, advice: adv.text, adviceScout: adv.scout, o2Left: o2Usable, back, distNext: d, env, why, turnTxt, aheadTxt, get home() { return homeInfo(); }, goal: labelOf(goal), distGoal: goalM, sciNear: sciAsk, actions };
  const warn = (c === "red" || c === "orange") && d < NEAR_M && !s.via;
  // science nearby (on or off the route), within 120 m
  const sciNear = targets.filter((t) => t.lat != null && allStops.length).map((t) => ({ t, s: pointFrom(t.lat, t.lon, allStops, dist) }))
    .map((o) => ({ ...o, d: dist(pos, o.s), rel: ((bearing(pos, o.s) - (heading ?? brg) + 540) % 360) - 180 }))
    .filter((o) => o.d < 120 && !sampled[o.t.key]).sort((a, b) => a.d - b.d)[0];
  if (sciNear && !announced.current.has("sci" + sciNear.t.key)) {
    announced.current.add("sci" + sciNear.t.key);
    say(`Science nearby. ${sciNear.t.name}, ${sciNear.d < 10 ? "right here" : `${Math.round(sciNear.d)} metres ${Math.abs(sciNear.rel) < 25 ? "ahead" : sciNear.rel > 0 ? "on your right" : "on your left"}`}.`, voice);
  }
  const nearHaz = droneHaz.find((h) => dist(h, pos) < 25);
  if (nearHaz && !announced.current.has("dh" + nearHaz.lat)) { announced.current.add("dh" + nearHaz.lat); say(`Drone warning. ${nearHaz.r === "steep" ? "Steep ground" : "Sand"} right here. Slow down.`, voice); }
  const gL = live[keyOf(goal)];
  tele.current = { o2Pct, back, backBy, tempC: env.tempC, rad: env.radMsvDay, d: goalM, next: labelOf(goal), colour: finalColour(goal, gL), haz: hazardText(effective(goal, gL)), i: goalN - 1, n: realN, running, heading: Math.round(heading ?? brg), lat: pos.lat, lon: pos.lon, elapsed, cert: cert.v, route: route.map((r) => [r.lat, r.lon]) };
  const aKey = keyOf(s) + ":" + c;
  if (warn && !announced.current.has(aKey)) {
    announced.current.add(aKey);
    say(c === "red" ? `Warning. ${haz.toLowerCase()} ahead. Do not cross.` : `Caution. ${haz.toLowerCase()} ahead. Walk slowly.`, voice);
  }

  // guardian: out of time / oxygen → set the route home by itself (once)
  if (back <= 0 && !homeSet.current && i > 0) {
    homeSet.current = true;
    setTimeout(() => {
      setRoute((r) => [...r.slice(0, i), { ...r[0], home: true }]);
      publish({ type: "auto", text: `Turn-back time reached (${backBy}): helmet set the route home by itself` });
      say("Turn back time reached. Route home set. Follow the arrows.", voice);
    }, 0);
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
  // status line: what is really ahead on the path (team map + drone), then the destination's own ground
  const gc = finalColour(goal, live[keyOf(goal)]);
  const status = back <= 0 ? ["TURN BACK NOW", "red"] : sos ? ["SOS SENT", "red"]
    : ahead?.k === 3 ? ["NO-GO AHEAD · STOP", "red"] : ahead?.k === 2 ? ["CAUTION AHEAD", "orange"] : ahead?.k === 0 ? ["UNKNOWN GROUND AHEAD", "orange"]
    : !s.via && c === "red" ? ["NO-GO AT STOP", "red"] : !s.via && c === "orange" ? ["CAUTION AT STOP", "orange"]
    : ["EVA NOMINAL", "green"];
  const eta = Math.round(d / SPEED / 60);
  const eye = (key) => (
    <div className="eye" key={key}>
      {cam ? <video className="bg" ref={setVideo} autoPlay playsInline muted /> : (s.image || s.nearest?.image) && <img className="bg" src={DATA + (s.image || s.nearest.image)} alt="" />}
      <div className="visor" />
      <div className="hud2">
        <Tape heading={heading ?? brg} target={brg} colour={COLOURS[c]} real={heading != null} />
        <div className="status" style={{ color: COLOURS[status[1]] }}>{status[0]} · {running || phoneWalk ? "WALKING TO" : "NEXT"} {labelOf(goal).toUpperCase()}</div>
        {news && <div className="news" style={{ borderColor: COLOURS[news.colour] }}>{news.text}</div>}
        {nav && (running || phoneWalk) && (
          <div className={"navbar" + (ahead?.k === 3 ? " stop" : ahead ? " care" : "")}>
            <span className="arr">{nav.turn && nav.turn.m < 60 ? (nav.turn.deg > 0 ? "↱" : "↰") : "↑"}</span>
            <span>{nav.turn && nav.turn.m < 60 ? `${Math.round(nav.turn.m)} m · ${nav.turn.deg > 0 ? "RIGHT" : "LEFT"} (~${Math.round(nav.turn.m / STEP_LEN)} steps)` : `STRAIGHT · ${Math.round(d)} m`}</span>
            {ahead && <em>{ahead.k === 3 ? "⛔ NO-GO" : ahead.k === 0 ? "? UNKNOWN" : "⚠ CAUTION"} in {Math.round(ahead.m)} m</em>}
            {offRoute && <em>↩ OFF ROUTE {Math.round(nav.off)} m</em>}
          </div>
        )}
        {sos && <div className="news sos">🆘 SOS SENT · {sos.reason.toUpperCase()} · MISSION CONTROL HAS YOUR POSITION</div>}
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
        {sciNear && (
          <button className="scibanner" onClick={() => setSciOpen(sciNear)}>
            🔬 SCIENCE {sciNear.d < 10 ? "HERE" : `${Math.round(sciNear.d)} m ${Math.abs(sciNear.rel) < 25 ? "AHEAD" : sciNear.rel > 0 ? "→ RIGHT" : "← LEFT"}`} · {(LABEL[sciNear.t.type] || "science").toUpperCase()} · tap
          </button>
        )}
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
          <small>{gi === route.length - 1 ? "DESTINATION" : `NEXT · STOP ${goalN}/${realN}`}{siteNear(goal, targets, dist) ? " · 🔬 SCIENCE TARGET" : ""}</small>
          <b>{goal.home ? "START (HOME)" : goal.via ? "PATH" : labelOf(goal).toUpperCase()}</b>
          <span>{Math.round(goalM)} m · {Math.round(goalM / SPEED / 60)} MIN · <em style={{ color: COLOURS[finalColour(goal, live[keyOf(goal)])] }}>{hazardText(effective(goal, live[keyOf(goal)]))}</em>{goal.sand_pct != null ? ` · AI ${Math.round(certaintyOf(goal, live[keyOf(goal)]).v * 100)}%` : " · ground from orbit"}</span>
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
        <button title="Demo: test the guardian (simulated fall)" onClick={() => raise("Fall detected (test)")}>🧪 Fall</button>
        <button title="Demo: jump to turn-back time" onClick={() => setElapsed(evaMin * 60)}>🧪 Low O₂</button>
      </div>
      {sciOpen && (
        <div className="sciPanel" role="dialog" aria-label="Science target">
          <b>🔬 {sciOpen.t.name} · {Math.round(dist(pos, sciOpen.s))} m</b>
          <small>{sciOpen.t.why}</small>
          {sciOpen.t.nasa && <small className="muted">NASA site · Curiosity sol {sciOpen.t.sol} · position ±{sciOpen.t.pos_m} m</small>}
          <i>Still unknown (NASA's open questions):</i>
          <ul>{openOf(sciOpen.t).map((q) => <li key={q}>{q}</li>)}</ul>
          <i>Take for the lab:</i>
          <ul>{samplesOf(sciOpen.t).map((q) => <li key={q}>{q}</li>)}</ul>
          <small>Why a person: {HUMAN}</small>
          {colourOfStop(sciOpen.s) === "red" && <small className="wtxt">⚠ Our AI marks this spot DON'T GO: look from the edge, do not step in.</small>}
          <div className="btns">
            {!route.some((r) => dist(r, sciOpen.t) < 12) && <button onClick={() => { setRoute((r) => [...r.slice(0, i), sciOpen.s, ...r.slice(i)]); say("Detour added. Walk to the science target.", voice); setSciOpen(null); }}>➕ Detour here</button>}
            <button onClick={() => { setSampled((m) => ({ ...m, [sciOpen.t.key]: true })); publish({ type: "sample", sol: sciOpen.t.sol, name: sciOpen.t.name, kind: sciOpen.t.type }); say("Sample logged.", voice); setSciOpen(null); }}>🧪 Samples taken</button>
            <button onClick={() => setSciOpen(null)}>Close</button>
          </div>
        </div>
      )}
      {alarm && (
        <div className="guard" role="alertdialog" aria-label="Are you OK?">
          <b>⚠ {alarm.reason.toUpperCase()}</b>
          <span>Are you OK? SOS in <big>{alarm.left}</big> s</span>
          <button onClick={imOk}>✅ I'm OK</button>
          <button className="sosnow" onClick={() => setAlarm((a) => ({ ...a, left: 0 }))}>🆘 Send SOS now</button>
        </div>
      )}
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
