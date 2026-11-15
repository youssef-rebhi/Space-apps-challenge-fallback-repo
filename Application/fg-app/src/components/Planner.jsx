import { useState } from "react";
import { loadGeo } from "../lib/geo.js";
import { routeOptions, multiWaypointRoute, calculateAbortCorridors, inBox, RULES } from "../lib/routes.js";
import { exportGeoJSON, exportGPX, printMissionBriefing } from "../lib/exportMission.js";

// Enhanced Route planner: A -> B or Multi-Waypoint Traverse, Abort Corridors, PNR calculation, and Mission Package Export.
export default function Planner({
  targets = [],
  stops = [],
  A,
  B,
  setA,
  setB,
  waypoints = [],
  setWaypoints,
  pickFor,
  setPickFor,
  sel,
  options = [],
  setOptions,
  chosen = 0,
  setChosen,
  onUse,
  need,
  onScout,
  scoutBusy,
  abortData,
  setAbortData,
  plan,
  elevStats,
}) {
  const [mode, setMode] = useState("direct"); // "direct" (A->B) | "multi" (W0..Wk)
  const [via, setVia] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Direct A -> B path finding
  async function findDirect() {
    setErr("");
    if (!A || !B) return setErr("Set A and B first.");
    const g = await loadGeo();
    if (!inBox(g, A.lat, A.lon) || !inBox(g, B.lat, B.lon)) {
      return setErr("A and B must be inside the mapped area (lat −4.83 to −4.78, lon 137.36 to 137.40).");
    }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    const o = routeOptions(g, stops, A, B, via, targets);
    setBusy(false);
    if (!o.length) {
      setOptions([]);
      return setErr("No safe way: every path crosses a slope ≥ 25° or sand flagged by AI.");
    }
    setOptions(o);
    const bestIdx = o.findIndex((x) => x.tags.includes("least risk"));
    setChosen(bestIdx >= 0 ? bestIdx : 0);

    // Calculate abort corridors for selected route
    const currentOpt = o[bestIdx >= 0 ? bestIdx : 0];
    const ab = calculateAbortCorridors(g, stops, [A, B], currentOpt);
    if (setAbortData) setAbortData(ab);
  }

  // Multi-waypoint path finding
  async function findMulti() {
    setErr("");
    if (!waypoints || waypoints.length < 2) return setErr("Add at least 2 waypoints (W0 Base and destination).");
    const g = await loadGeo();
    for (let i = 0; i < waypoints.length; i++) {
      if (!inBox(g, waypoints[i].lat, waypoints[i].lon)) {
        return setErr(`Waypoint W${i} is outside the mapped boxwork area.`);
      }
    }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    const res = multiWaypointRoute(g, stops, waypoints, "safest");
    setBusy(false);
    if (res?.error) {
      setOptions([]);
      return setErr(res.error);
    }
    if (!res) {
      setOptions([]);
      return setErr("Could not calculate traverse.");
    }

    setOptions([res]);
    setChosen(0);

    const ab = calculateAbortCorridors(g, stops, waypoints, res);
    if (setAbortData) setAbortData(ab);
  }

  // Coordinate row for A/B or Waypoint
  const row = (name, P, onUpdate, onRemove = null, onMoveUp = null, onMoveDown = null, isBase = false) => {
    const commit = (field, txt) => {
      const v = parseFloat(String(txt).replace(",", "."));
      if (isNaN(v)) return;
      onUpdate({ lat: field === "lat" ? v : P?.lat ?? -4.8, lon: field === "lon" ? v : P?.lon ?? 137.38, label: P?.label || "typed" });
      setOptions([]);
    };
    const inp = (field, ph) => (
      <input
        key={`${name}-${field}-${P ? P[field] : "x"}`}
        aria-label={`${name} ${field === "lat" ? "latitude" : "longitude"}`}
        inputMode="decimal"
        defaultValue={P ? P[field].toFixed(5) : ""}
        placeholder={ph}
        onBlur={(e) => commit(field, e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(field, e.target.value); }}
      />
    );
    return (
      <div className="prow" key={name}>
        <b className={"pin " + (isBase ? "A" : name.startsWith("W") ? "wp" : name)}>{name}</b>
        {inp("lat", "lat −4.80")}
        {inp("lon", "lon 137.38")}
        <button
          className={pickFor === name ? "on" : ""}
          onClick={() => setPickFor(pickFor === name ? null : name)}
          title="Click on the map to set it"
        >
          📍
        </button>
        {sel && (
          <button
            onClick={() => {
              onUpdate({
                lat: sel.lat,
                lon: sel.lon,
                label: sel.sol && !sel.custom ? `sol ${sel.sol}` : "picked point",
              });
              setOptions([]);
            }}
            title="Use the selected stop / point"
          >
            = sel
          </button>
        )}
        {onMoveUp && <button onClick={onMoveUp} title="Move Up" className="smallbtn">↑</button>}
        {onMoveDown && <button onClick={onMoveDown} title="Move Down" className="smallbtn">↓</button>}
        {onRemove && <button onClick={onRemove} title="Remove Waypoint" className="smallbtn danger">✕</button>}
      </div>
    );
  };

  const addWaypoint = () => {
    if (!waypoints.length) {
      const base = A || { lat: -4.805, lon: 137.375, label: "W0 (Base)" };
      const next = B || { lat: -4.810, lon: 137.380, label: "W1" };
      setWaypoints([base, next]);
      return;
    }
    const last = waypoints[waypoints.length - 1];
    const newWp = {
      lat: +(last.lat - 0.002).toFixed(5),
      lon: +(last.lon + 0.002).toFixed(5),
      label: `W${waypoints.length}`,
    };
    setWaypoints([...waypoints, newWp]);
    setOptions([]);
  };

  const removeWaypoint = (idx) => {
    if (waypoints.length <= 2) return;
    const next = waypoints.filter((_, i) => i !== idx).map((wp, i) => ({ ...wp, label: i === 0 ? "W0 (Base)" : `W${i}` }));
    setWaypoints(next);
    setOptions([]);
  };

  const moveWaypoint = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= waypoints.length) return;
    const arr = [...waypoints];
    const item = arr.splice(fromIdx, 1)[0];
    arr.splice(toIdx, 0, item);
    const renamed = arr.map((wp, i) => ({ ...wp, label: i === 0 ? "W0 (Base)" : `W${i}` }));
    setWaypoints(renamed);
    setOptions([]);
  };

  const updateWaypointAt = (idx, updated) => {
    const arr = [...waypoints];
    arr[idx] = { ...arr[idx], ...updated };
    setWaypoints(arr);
    setOptions([]);
  };

  const activeOption = options[chosen];

  return (
    <div className="card planner">
      <div className="planner-header">
        <h3>🧭 Route Planner</h3>
        <div className="planner-modes">
          <button className={mode === "direct" ? "on" : ""} onClick={() => setMode("direct")}>A → B</button>
          <button className={mode === "multi" ? "on" : ""} onClick={() => {
            setMode("multi");
            if (!waypoints.length && A && B) setWaypoints([A, B]);
          }}>Multi-Stop ({waypoints.length || 2})</button>
        </div>
      </div>

      {mode === "direct" ? (
        <>
          {row("A", A, setA, null, null, null, true)}
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
            <button className="primary" onClick={findDirect} disabled={busy}>{busy ? "Finding…" : "Find routes"}</button>
          </div>
        </>
      ) : (
        <div className="multi-planner">
          <small className="muted">Configure sequential traverse waypoints. Drag markers on the map to re-route dynamically.</small>
          {waypoints.map((wp, idx) => (
            row(
              `W${idx}`,
              wp,
              (updated) => updateWaypointAt(idx, updated),
              idx > 1 ? () => removeWaypoint(idx) : null,
              idx > 1 ? () => moveWaypoint(idx, idx - 1) : null,
              idx > 0 && idx < waypoints.length - 1 ? () => moveWaypoint(idx, idx + 1) : null,
              idx === 0
            )
          ))}
          <div className="prow">
            <button onClick={addWaypoint} disabled={waypoints.length >= 8}>➕ Add Waypoint</button>
            <button className="primary" onClick={findMulti} disabled={busy || waypoints.length < 2}>
              {busy ? "Routing…" : "Calculate Multi-Stop Route"}
            </button>
          </div>
          {pickFor && <small className="ok">Click on the map to set {pickFor}.</small>}
        </div>
      )}

      {err && <p className="advice warnbox">{err}</p>}

      {/* Options list */}
      {options.map((o, k) => (
        <button key={o.id} className={"opt" + (k === chosen ? " chosen" : "")} onClick={() => {
          setChosen(k);
          if (setAbortData) {
            loadGeo().then((g) => {
              const pts = mode === "multi" ? waypoints : [A, B];
              setAbortData(calculateAbortCorridors(g, stops, pts, o));
            });
          }
        }} style={{ borderColor: k === chosen ? o.colour : undefined }}>
          <span className="optt"><i style={{ background: o.colour }} /><b>{o.label}</b>{o.tags.map((t) => <em key={t}>{t}</em>)}</span>
          <span><b>{Math.round(o.len)} m</b> · {Math.round(o.minutes)} min walk · <b className="mc1">{o.goPct}% GO</b>{o.science?.length ? ` · near ${o.science.length} science stop${o.science.length > 1 ? "s" : ""}` : ""}</span>
          {o.target && <small className="sci">🔬 {o.target.type === "ridge" ? "Mineral ridge from old groundwater" : "Sandy hollow between ridges"}</small>}
          {o.warn?.length ? o.warn.map((w) => <small key={w} className="wtxt">⚠ {w}</small>) : <small className="ok">✓ firm, known ground</small>}
        </button>
      ))}

      {/* Drone scout box */}
      {options[chosen] && need && (
        <div className="scoutbox">
          {options[chosen].scouted ? (
            <>
              <b>🛸 Drone scout done (SIMULATED)</b>
              <small>{options[chosen].scouted.sim + options[chosen].scouted.dem} spots read · {options[chosen].scouted.sand} sand · {options[chosen].scouted.steep} steep · {options[chosen].scouted.caution} on 15–25° · the rest clear.</small>
              <small>Route {Math.round(options[chosen].scouted.before)} m → <b>{Math.round(options[chosen].len)} m</b>; {Math.round(options[chosen].droneStat?.confirmed || 0)} m confirmed.</small>
            </>
          ) : need.unknown + need.uncertain < 1 ? (
            <small className="ok">🛸 No drone needed: ground is firm and confirmed.</small>
          ) : (
            <>
              <b>🛸 Send the scout drone first?</b>
              <small><i className="sw u" /> <b>{Math.round(need.unknown)} m unknown</b>: no Curiosity photo or no map data</small>
              <small><i className="sw c" /> <b>{Math.round(need.uncertain)} m uncertain</b>: CAUTION ground or AI not sure</small>
              <button className="primary" onClick={onScout} disabled={scoutBusy}>{scoutBusy ? "🛸 Flying…" : "🛸 Scout this route (SIM)"}</button>
            </>
          )}
        </div>
      )}

      {/* Emergency Abort Corridors & PNR HUD */}
      {abortData?.abortPaths?.length > 0 && (
        <div className="abort-hud">
          <div className="abort-title">
            <span>🚨 Emergency Abort Corridors (Direct to W0 Lander)</span>
          </div>
          {abortData.pnrIndex != null ? (
            <div className="pnr-warning">
              <b>⚠ Point of No Return (PNR):</b> Waypoint <b>W{abortData.pnrIndex}</b> is the turnaround limit for current PLSS oxygen reserves.
            </div>
          ) : (
            <div className="pnr-ok">
              ✓ All waypoints within safe PLSS emergency abort oxygen return envelope.
            </div>
          )}
          <div className="abort-legs">
            {abortData.abortPaths.map((ap) => (
              <div key={ap.fromIndex} className={`abort-pill ${ap.pastPNR ? "pnr-alert" : ""}`}>
                <b>W{ap.fromIndex} → Base:</b> {Math.round(ap.dist)} m ({Math.round(ap.minutes)} min abort)
                {ap.pastPNR && <span className="pnr-badge">PAST PNR</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary Action Buttons & Export */}
      {options.length > 0 && (
        <div className="action-row">
          <button className="primary" onClick={() => onUse(options[chosen])}>
            ➕ Use “{options[chosen].label}” as the route
          </button>
        </div>
      )}

      {activeOption && (
        <div className="export-section">
          <h4>📦 EVA Mission Package Export</h4>
          <div className="export-btns">
            <button
              onClick={() => exportGeoJSON(activeOption, mode === "multi" ? waypoints : [A, B], abortData, targets)}
              title="Download RFC 7946 GeoJSON FeatureCollection with elevation coordinates"
            >
              📥 GeoJSON
            </button>
            <button
              onClick={() => exportGPX(activeOption, mode === "multi" ? waypoints : [A, B])}
              title="Download standard GPS Exchange Format (GPX 1.1) track and waypoints"
            >
              📥 GPX 1.1
            </button>
            <button
              className="export-print"
              onClick={() => printMissionBriefing({
                routeOpt: activeOption,
                waypoints: mode === "multi" ? waypoints : [A, B],
                plan,
                elevStats,
                abortData,
                targets,
              })}
              title="Generate printable EVA Traverse Briefing sheet / Save to PDF"
            >
              🖨 Briefing (PDF)
            </button>
          </div>
        </div>
      )}

      <small className="muted">{RULES} Weights are team assumptions.</small>
    </div>
  );
}
