import { useEffect, useRef, useState } from "react";
import MiniMap from "./MiniMap.jsx";
import ScoutResult from "./ScoutResult.jsx";
import PairQR from "./PairQR.jsx";
import { loadStops, colourOf, COLOURS, DATA, say } from "../lib/mission.js";
import { hardnessOf, verdict, playZap } from "../lib/acoustic.js";

export default function Tablet() {
  const [stops, setStops] = useState([]);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [route, setRoute] = useState([]);
  const [drone, setDrone] = useState(null);
  const [laser, setLaser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scouted, setScouted] = useState({}); // sol → result
  const raf = useRef(0);

  useEffect(() => { loadStops().then((s) => { setStops(s); setSel(s[0]); }).catch((e) => setErr(e.message)); return () => cancelAnimationFrame(raf.current); }, []);

  const inRoute = sel && route.includes(sel.sol);
  const toggleRoute = () => setRoute((r) => (inRoute ? r.filter((x) => x !== sel.sol) : [...r, sel.sol]));

  function sendScout() {
    if (!sel || busy) return;
    const base = stops.find((s) => s.sol === route[0]) || stops[0];
    const target = sel, t0 = performance.now(), FLY = 1800;
    setBusy(true); setLaser(false);
    const fly = (t) => {
      const k = Math.min(1, (t - t0) / FLY);
      setDrone({ lat: base.lat + (target.lat - base.lat) * k, lon: base.lon + (target.lon - base.lon) * k + 0.00012 * Math.sin(k * Math.PI) });
      if (k < 1) { raf.current = requestAnimationFrame(fly); return; }
      const h = hardnessOf(target), v = verdict(target);
      setLaser(true); playZap(h);
      setTimeout(() => {
        setLaser(false); setBusy(false);
        setScouted((m) => ({ ...m, [target.sol]: { sol: target.sol, h, verdict: v } }));
        say(`Scout report. ${v.label.replace(":", ".")}.`);
      }, 1200);
    };
    raf.current = requestAnimationFrame(fly);
  }

  if (err) return <p className="err">⚠ {err}. Put stops.json in public/data/.</p>;
  return (
    <div className="tablet">
      <header>
        <h1>Firm Ground · Tablet</h1>
        <span className="tag">Boxwork, Mount Sharp · {stops.length} stops · AI on Curiosity Navcam</span>
      </header>
      <main>
        <section className="mapCol">
          <MiniMap stops={stops} route={route} selected={sel} onSelect={setSel} drone={drone} laser={laser} scouted={scouted} />
          <div className="legend">
            {["green", "orange", "red", "grey"].map((c) => (
              <span key={c}><i style={{ background: COLOURS[c] }} />{{ green: "GO", orange: "careful", red: "don't go", grey: "no data" }[c]}</span>
            ))}
          </div>
        </section>
        <section className="side">
          {sel && (
            <div className="card">
              <h2 style={{ color: COLOURS[colourOf(sel)] }}>Sol {sel.sol}</h2>
              {sel.image && <img src={DATA + sel.image} alt={`Curiosity Navcam photo at sol ${sel.sol}, coloured by our AI`} />}
              <p className="pcts">
                🟫 soil {pct(sel.soil_pct)} · ⬜ bedrock {pct(sel.bedrock_pct)} · 🟨 <b>sand {pct(sel.sand_pct)}</b> · 🟥 big rock {pct(sel.bigrock_pct)}
              </p>
              <div className="btns">
                <button onClick={toggleRoute}>{inRoute ? "➖ Remove from route" : "➕ Add to route"}</button>
                <button onClick={sendScout} disabled={busy}>{busy ? "🚁 Scouting…" : "🚁 Send scout"}</button>
              </div>
              <ScoutResult result={scouted[sel.sol]} />
            </div>
          )}
          <div className="card">
            <h3>Route ({route.length} stops)</h3>
            <p className="muted">{route.length ? route.map((s) => `sol ${s}`).join(" → ") : "Click stops on the map, then ➕ Add to route."}</p>
            <PairQR routeSols={route} />
          </div>
        </section>
      </main>
    </div>
  );
}

const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
