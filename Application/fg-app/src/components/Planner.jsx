import { useState } from "react";
import { loadGeo } from "../lib/geo.js";
import { routeOptions, inBox, RULES } from "../lib/routes.js";

// Route planner: A → B by typing coordinates or picking on the map; several options like a maps app.
export default function Planner({ targets = [], stops, A, B, setA, setB, pickFor, setPickFor, sel, options, setOptions, chosen, setChosen, onUse }) {
  const [via, setVia] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function find() {
    setErr("");
    if (!A || !B) return setErr("Set A and B first.");
    const g = await loadGeo();
    if (!inBox(g, A.lat, A.lon) || !inBox(g, B.lat, B.lon)) return setErr("A and B must be inside the mapped area (lat −4.83 to −4.78, lon 137.36 to 137.40).");
    setBusy(true); await new Promise((r) => setTimeout(r, 20));
    const o = routeOptions(g, stops, A, B, via, targets);
    setBusy(false);
    if (!o.length) { setOptions([]); return setErr("No safe way: every way crosses a slope ≥ 25° or sand our AI flagged."); }
    setOptions(o); setChosen(o.findIndex((x) => x.tags.includes("least risk")) >= 0 ? o.findIndex((x) => x.tags.includes("least risk")) : 0);
  }

  // typed coordinates are applied when you leave the field (or press Enter)
  const row = (name, P, setP) => {
    const commit = (field, txt) => { const v = parseFloat(String(txt).replace(",", ".")); if (isNaN(v)) return; setP({ lat: field === "lat" ? v : P?.lat ?? -4.8, lon: field === "lon" ? v : P?.lon ?? 137.38, label: "typed" }); setOptions([]); };
    const inp = (field, ph) => (
      <input key={`${name}-${field}-${P ? P[field] : "x"}`} aria-label={`${name} ${field === "lat" ? "latitude" : "longitude"}`} inputMode="decimal"
        defaultValue={P ? P[field].toFixed(5) : ""} placeholder={ph}
        onBlur={(e) => commit(field, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit(field, e.target.value); }} />
    );
    return (
      <div className="prow">
        <b className={"pin " + name}>{name}</b>
        {inp("lat", "lat −4.80")}{inp("lon", "lon 137.38")}
        <button className={pickFor === name ? "on" : ""} onClick={() => setPickFor(pickFor === name ? null : name)} title="Click on the map to set it">📍</button>
        {sel && <button onClick={() => { setP({ lat: sel.lat, lon: sel.lon, label: sel.sol && !sel.custom ? `sol ${sel.sol}` : "picked point" }); setOptions([]); }} title="Use the selected stop / point">= selected</button>}
      </div>
    );
  };

  return (
    <div className="card planner">
      <h3>🧭 Route planner</h3>
      {row("A", A, setA)}
      {row("B", B, setB)}
      {pickFor && <small className="ok">Click on the map to set {pickFor}.</small>}
      <div className="prow">
        <label className="muted">Science target
          <select value={via} onChange={(e) => setVia(e.target.value)}>
            <option value="auto">auto (nearest science target)</option>
            {targets.map((t) => <option key={t.key} value={t.key}>🔬 {t.name}</option>)}
            <option disabled>── any Curiosity stop ──</option>
            {stops.map((s) => <option key={s.sol + "-" + s.lon} value={"s" + s.sol}>sol {s.sol}</option>)}
          </select>
        </label>
        <button onClick={() => { const a = A; setA(B); setB(a); setOptions([]); }}>⇅</button>
        <button className="primary" onClick={find} disabled={busy}>{busy ? "Finding…" : "Find routes"}</button>
      </div>
      {err && <p className="advice warnbox">{err}</p>}
      {options.map((o, k) => (
        <button key={o.id} className={"opt" + (k === chosen ? " chosen" : "")} onClick={() => setChosen(k)} style={{ borderColor: k === chosen ? o.colour : undefined }}>
          <span className="optt"><i style={{ background: o.colour }} /><b>{o.label}</b>{o.tags.map((t) => <em key={t}>{t}</em>)}</span>
          <span><b>{Math.round(o.len)} m</b> · {Math.round(o.minutes)} min walk · <b className="mc1">{o.goPct}% GO</b>{o.science.length ? ` · within 30 m of ${o.science.length} Curiosity stop${o.science.length > 1 ? "s" : ""}` : ""}</span>
          {o.target && <small className="sci">🔬 {o.target.type === "ridge" ? "Mineral ridge from old groundwater" : "Sandy hollow between ridges"}</small>}
          {o.warn.length ? o.warn.map((w) => <small key={w} className="wtxt">⚠ {w}</small>) : <small className="ok">✓ firm, known ground</small>}
        </button>
      ))}
      {options.length > 0 && <button className="primary" onClick={() => onUse(options[chosen])}>➕ Use “{options[chosen].label}” as the route</button>}
      <small className="muted">{RULES} Weights are team assumptions.</small>
    </div>
  );
}
