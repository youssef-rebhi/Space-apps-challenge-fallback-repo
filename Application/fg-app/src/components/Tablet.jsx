import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MiniMap from "./MiniMap.jsx";
import Map3D from "./Map3D.jsx";
import ScoutResult from "./ScoutResult.jsx";
import PairQR from "./PairQR.jsx";
import Assistant from "./Assistant.jsx";
import PhotoSlider from "./PhotoSlider.jsx";
import { greyCells, keyOf } from "../lib/grey.js";
import { publish } from "../lib/live.js";
import { loadStops, colourOf, COLOURS, DATA, say } from "../lib/mission.js";
import { hardnessOf, verdict, playZap } from "../lib/acoustic.js";
import { certaintyOf, effective, finalColour, advice, missionCheck, envAt, hm, O2_H, RESERVE_MIN } from "../lib/safety.js";

const EVA_MIN = 240;

export default function Tablet() {
  const [stops, setStops] = useState([]);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [route, setRoute] = useState([]);
  const [drone, setDrone] = useState(null);
  const [laser, setLaser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scouted, setScouted] = useState({}); // sol → live reading
  const [view3d, setView3d] = useState(false);
  const [change, setChange] = useState(false);
  const raf = useRef(0);

  useEffect(() => { loadStops().then((s) => { setStops(s); setSel(s[0]); }).catch((e) => setErr(e.message)); return () => cancelAnimationFrame(raf.current); }, []);

  const greys = useMemo(() => greyCells(stops), [stops]);
  const colourFor = useCallback((s) => finalColour(s, scouted[keyOf(s)]), [scouted]);
  const inRoute = sel && !sel.grey && route.includes(sel.sol);
  const toggleRoute = () => setRoute((r) => (inRoute ? r.filter((x) => x !== sel.sol) : [...r, sel.sol]));

  function sendScout() {
    if (!sel || busy) return;
    const base = stops.find((s) => s.sol === route[0]) || stops[0];
    const target = sel, t0 = performance.now(), FLY = 1800, changed = change;
    setBusy(true); setLaser(false);
    const fly = (t) => {
      const k = Math.min(1, (t - t0) / FLY);
      setDrone({ lat: base.lat + (target.lat - base.lat) * k, lon: base.lon + (target.lon - base.lon) * k + 0.00012 * Math.sin(k * Math.PI) });
      if (k < 1) { raf.current = requestAnimationFrame(fly); return; }
      // SIMULATED reading: our AI result for this stop (+25% sand if "conditions changed" is on)
      const add = changed ? 0.25 : 0;
      // grey area: no Curiosity photo there, so the SIMULATED reading uses the nearest stop's AI result
      const src = target.grey ? target.nearest : target;
      const reading = { ...src, sand_pct: Math.min(1, (src.sand_pct ?? 0) + add), bedrock_pct: Math.max(0, (src.bedrock_pct ?? 0) - add) };
      const h = hardnessOf(reading), v = verdict(reading);
      setLaser(true); playZap(h);
      setTimeout(() => {
        setLaser(false); setBusy(false);
        setScouted((m) => ({ ...m, [keyOf(target)]: { sol: src.sol, grey: !!target.grey, h, verdict: v, sand_pct: reading.sand_pct, bigrock_pct: reading.bigrock_pct ?? 0, env: envAt(0, src.sol), changed } }));
        say(`Scout report. ${v.label.replace(":", ".")}.`);
        publish({ type: "scout", key: keyOf(target), sol: target.grey ? null : target.sol, near: src.sol, grey: !!target.grey, lat: target.lat, lon: target.lon,
          sand_pct: reading.sand_pct, bigrock_pct: reading.bigrock_pct ?? 0, verdict: v, changed });
      }, 1200);
    };
    raf.current = requestAnimationFrame(fly);
  }

  if (err) return <p className="err">⚠ {err}. Put stops.json in public/data/.</p>;

  const routeStops = route.map((sol) => stops.find((s) => s.sol === sol)).filter(Boolean);
  const plan = missionCheck(routeStops, EVA_MIN);
  const live = sel && scouted[keyOf(sel)];
  const cert = sel && certaintyOf(sel, live);
  const adv = sel && advice(sel, live);
  const fc = sel && finalColour(sel, live);
  const ctx = sel && {
    stop: sel, eff: effective(sel, live), colour: fc === "green" ? "go" : fc === "orange" ? "careful" : fc === "red" ? "don't go" : "no data",
    cert: cert.v, certSrc: cert.src, advice: adv.text, adviceScout: adv.scout, live, plan, env: live?.env || envAt(0, sel.sol),
  };

  return (
    <div className="tablet">
      <header>
        <h1>Firm Ground · Tablet</h1>
        <span className="tag">Boxwork, Mount Sharp · {stops.length} stops · AI on Curiosity Navcam</span>
        <div className="switch" role="group" aria-label="Map view">
          <button className={!view3d ? "on" : ""} onClick={() => setView3d(false)}>2D</button>
          <button className={view3d ? "on" : ""} onClick={() => setView3d(true)}>3D</button>
        </div>
      </header>
      <main>
        <section className="mapCol">
          {view3d
            ? <Map3D stops={stops} route={route} selected={sel} onSelect={setSel} colourFor={colourFor} />
            : <MiniMap stops={stops} greys={greys} route={route} selected={sel} onSelect={setSel} drone={drone} laser={laser} scouted={scouted} colourFor={colourFor} />}
          <div className="legend">
            {["green", "orange", "red", "grey"].map((c) => (
              <span key={c}><i style={{ background: COLOURS[c] }} />{{ green: "GO · AI sure", orange: "careful · or AI unsure", red: "don't go", grey: "unexplored · send scout" }[c]}</span>
            ))}
            <span>🎤 = live scout reading</span>
          </div>
        </section>
        <section className="side">
          {sel && (
            <div className="card">
              <h2 style={{ color: COLOURS[fc] }}>{sel.grey ? "Unexplored area" : `Sol ${sel.sol}`}</h2>
              {sel.grey
                ? <p className="muted">No Curiosity photo here. About {sel.metres} m from the stop of sol {sel.nearest.sol}. Only the scout can tell what the ground is.</p>
                : <>
                    {sel.image && <PhotoSlider key={sel.sol} stop={sel} />}
                    <p className="pcts">
                      🟫 soil {pct(sel.soil_pct)} · ⬜ bedrock {pct(sel.bedrock_pct)} · 🟨 <b>sand {pct(sel.sand_pct)}</b> · 🟥 big rock {pct(sel.bigrock_pct)}
                    </p>
                  </>}
              <div className="certainty">
                <div className="bar"><i style={{ width: `${Math.round(cert.v * 100)}%`, background: cert.v >= 0.75 ? COLOURS.green : COLOURS.orange }} /></div>
                <small>AI certainty <b>{Math.round(cert.v * 100)}%</b> · {cert.src}</small>
              </div>
              <p className={"advice " + (adv.scout ? "warnbox" : "")} style={{ borderColor: COLOURS[fc] }}>{adv.scout ? "🚁 " : ""}{adv.text}</p>
              <div className="btns">
                <button onClick={toggleRoute} disabled={sel.grey} title={sel.grey ? "Scout it first; routes use Curiosity stops" : ""}>{inRoute ? "➖ Remove from route" : "➕ Add to route"}</button>
                <button onClick={sendScout} disabled={busy} className={adv.scout ? "on" : ""}>{busy ? "🚁 Scouting…" : "🚁 Send scout"}</button>
              </div>
              <label className="muted chk"><input type="checkbox" checked={change} onChange={(e) => setChange(e.target.checked)} /> Simulate a change on site (wind moved +25% sand) for the next scout</label>
              <ScoutResult result={live} />
            </div>
          )}
          <div className="card">
            <h3>Route ({route.length} stops)</h3>
            <p className="muted">{route.length ? route.map((s) => `sol ${s}`).join(" → ") : "Click stops on the map, then ➕ Add to route."}</p>
            {plan && (
              <div className={"gonogo " + (plan.go ? "go" : "nogo")}>
                <b>{plan.go ? "GO" : "NO GO"}</b>
                <span>Needs {hm(plan.need)} (walk + {route.length}×15 min work + way back) · limit {hm(plan.limit)} ({plan.by})</span>
                <small>Oxygen {O2_H} h, {RESERVE_MIN} min reserve never planned · EVA {EVA_MIN / 60} h · team assumptions</small>
              </div>
            )}
            <PairQR routeSols={route} />
          </div>
          {ctx && <div className="card"><Assistant ctx={ctx} /></div>}
        </section>
      </main>
    </div>
  );
}

const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
