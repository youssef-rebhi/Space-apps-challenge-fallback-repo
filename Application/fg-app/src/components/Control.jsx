import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { COLOURS } from "../lib/mission.js";
import { GEO, loadGeo } from "../lib/geo.js";
import { subscribe, publish } from "../lib/live.js";
import { hm } from "../lib/safety.js";

// Mission control: live telemetry from the helmet, alert log, messages and recall.
// Mars delay: real one-way radio time Earth↔Mars is about 3 to 22 minutes; the demo uses seconds.
const DELAYS = [0, 20, 60];

export default function Control() {
  const [tele, setTele] = useState(null);
  const [log, setLog] = useState([]);
  const [text, setText] = useState("");
  const [delay, setDelay] = useState(0);
  const [pending, setPending] = useState(0);
  const last = useRef({}), delayRef = useRef(0); delayRef.current = delay;
  const box = useRef(null), map = useRef(null), lay = useRef({});

  const add = (kind, msg, colour) => setLog((l) => [{ t: new Date().toLocaleTimeString(), kind, msg, colour }, ...l].slice(0, 60));

  useEffect(() => subscribe((e) => {
    const apply = () => {
      if (e.type === "telemetry") {
        const p = last.current;
        if (p.colour && p.colour !== e.colour) add("GROUND", `${e.next}: ${e.haz}`, e.colour);
        if (p.i != null && p.i !== e.i) add("STOP", `heading to ${e.next} (${e.i + 1}/${e.n})`);
        if (p.back > 900 && e.back <= 900) add("TIME", "15 min before turn-back", "orange");
        if (p.o2Pct >= 25 && e.o2Pct < 25) add("O₂", "oxygen under 25%", "red");
        last.current = e; setTele(e);
      } else if (e.type === "sample") add("SAMPLE", `🧪 samples taken at ${e.name}`, "green");
      else if (e.type === "scout") add("SCOUT", `${e.verdict.label} · ${e.label || (e.sol ? `sol ${e.sol}` : "area")}`, e.verdict.colour);
    };
    // telemetry coming from Mars arrives late
    if (e.type === "telemetry" && delayRef.current) setTimeout(apply, delayRef.current * 1000); else apply();
  }), []);

  // map
  useEffect(() => {
    loadGeo().then((g) => {
      const m = L.map(box.current, { crs: L.CRS.Simple, zoomSnap: 0.25, minZoom: 6, maxZoom: 17, attributionControl: false });
      const b = g.bounds["elevation_box.png"].bounds; m.fitBounds(b);
      L.imageOverlay(GEO + "elevation_box.webp", b, { opacity: 0.9 }).addTo(m);
      L.polyline(g.traverse.map(([la, lo]) => [la, lo]), { color: "#fff", weight: 2, opacity: 0.5, dashArray: "2 4" }).addTo(m);
      lay.current.grp = L.layerGroup().addTo(m); map.current = m;
    }).catch(() => {});
    return () => map.current?.remove();
  }, []);
  const fitted = useRef(false);
  useEffect(() => {
    const g = lay.current.grp; if (!g || !tele) return;
    g.clearLayers();
    if (tele.route?.length > 1) L.polyline(tele.route, { color: "#7fb3ff", weight: 4, dashArray: "8 6" }).addTo(g);
    L.circleMarker([tele.lat, tele.lon], { radius: 9, color: "#fff", weight: 3, fillColor: COLOURS[tele.colour], fillOpacity: 1 }).bindTooltip("astronaut").addTo(g);
    if (!fitted.current && tele.route?.length) { fitted.current = true; map.current.fitBounds(L.latLngBounds([...tele.route, [tele.lat, tele.lon]]), { padding: [40, 40] }); }
  }, [tele]);

  function send(kind, payload) {
    setPending((n) => n + 1);
    add("SENT", kind === "recall" ? "RECALL to base" : `"${payload}"`, "grey");
    setTimeout(() => { publish(kind === "recall" ? { type: "recall" } : { type: "msg", text: payload }); setPending((n) => n - 1); }, delay * 1000);
  }

  const T = tele;
  const cell = (v, k, colour) => <div className="tcell"><b style={{ color: colour }}>{v}</b><small>{k}</small></div>;
  const status = !T ? ["WAITING FOR HELMET…", "grey"] : T.back <= 0 ? ["TURN BACK NOW", "red"] : T.colour === "red" ? ["NO-GO AHEAD", "red"] : T.colour === "orange" ? ["CAUTION", "orange"] : T.colour === "grey" ? ["GROUND UNKNOWN · SCOUT FIRST", "orange"] : ["EVA NOMINAL", "green"];
  return (
    <div className="control">
      <header>
        <h1>Firm Ground · Mission Control</h1>
        <span className="tag">telemetry from the helmet · suit values SIMULATED</span>
        <a href={location.pathname} className="tag">← tablet</a>
      </header>
      <main>
        <section>
          <div className="statusbar" style={{ borderColor: COLOURS[status[1]], color: COLOURS[status[1]] }}>{status[0]}{T && ` · ${T.running ? "walking to" : "next:"} ${T.next}`}</div>
          <div className="tgrid">
            {cell(T ? `${T.o2Pct}%` : "–", "OXYGEN LEFT", T?.o2Pct < 25 ? COLOURS.red : undefined)}
            {cell(T ? `${T.rad}` : "–", "RADIATION mSv/day (sim)")}
            {cell(T ? `${T.tempC} °C` : "–", "OUTSIDE AIR (sim)")}
            {cell(T ? T.next : "–", `NEXT STOP${T ? ` ${T.i + 1}/${T.n}` : ""}`)}
            {cell(T ? `${Math.round(T.d)} m` : "–", "DISTANCE TO NEXT")}
            {cell(T ? (T.back <= 0 ? "NOW" : hm(T.back)) : "–", `TURN BACK IN${T ? ` · ${T.backBy}` : ""}`, T?.back < 900 ? COLOURS.red : undefined)}
            {cell(T ? `${T.heading}°` : "–", "FACING")}
            {cell(T ? T.haz : "–", "GROUND AHEAD", T ? COLOURS[T.colour] : undefined)}
            {cell(T ? `${Math.round(T.cert * 100)}%` : "–", "AI CERTAINTY", T?.cert < 0.75 ? COLOURS.orange : undefined)}
            {cell(T ? hm(T.elapsed) : "–", "TIME OUTSIDE")}
          </div>
          <div className="alertlog">
            <h3>Alert log</h3>
            {log.length === 0 && <p className="muted">Nothing yet. Open the helmet and press Start walk.</p>}
            {log.map((x, k) => <p key={k}><span className="muted">{x.t}</span> <b style={{ color: x.colour ? COLOURS[x.colour] : undefined }}>{x.kind}</b> {x.msg}</p>)}
          </div>
        </section>
        <section>
          <div ref={box} className="cmap" role="application" aria-label="Map with the astronaut position" />
          <div className="card">
            <h3>Message to astronaut</h3>
            <form className="askrow" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { send("msg", text.trim()); setText(""); } }}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Take a sample at the next stop" aria-label="Message to astronaut" />
              <button type="submit">Send</button>
            </form>
            <div className="btns" style={{ marginTop: 8 }}>
              <button className="danger" onClick={() => send("recall")}>⟲ Recall to base</button>
              <label className="muted chk">Mars delay
                <select value={delay} onChange={(e) => setDelay(+e.target.value)}>{DELAYS.map((d) => <option key={d} value={d}>{d ? `${d} s (demo)` : "off"}</option>)}</select>
              </label>
            </div>
            {pending > 0 && <p className="muted">📡 {pending} message(s) travelling to Mars…</p>}
            <small className="muted">Real Earth–Mars radio delay is about 3 to 22 minutes one way, so the helmet must decide alone; mission control only advises.</small>
          </div>
        </section>
      </main>
    </div>
  );
}
