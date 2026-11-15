import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MiniMap from "./MiniMap.jsx";
import Map3D from "./Map3D.jsx";
import GeoMap from "./GeoMap.jsx";
import Terrain3D from "./Terrain3D.jsx";
import LayerMap3D from "./LayerMap3D.jsx";
import { SLOPE_TXT, MAP_TXT } from "../lib/geo.js";
import ScoutResult from "./ScoutResult.jsx";
import PairQR from "./PairQR.jsx";
import Assistant from "./Assistant.jsx";
import PhotoSlider from "./PhotoSlider.jsx";
import { greyCells, keyOf, pickId, labelOf, pointFrom, NEAR_AI_M } from "../lib/grey.js";
import { loadGeo, elevAt } from "../lib/geo.js";
import { dist } from "../lib/mission.js";
import { safestPath, samplePath, WEIGHTS, droneScan, cellLatLon } from "../lib/pathfind.js";
import { scoutNeeds, scoutRun, rerouteScanned, cellCentre } from "../lib/routes.js";
import Planner from "./Planner.jsx";
import ElevationProfile from "./ElevationProfile.jsx";
import { samplePts } from "../lib/routes.js";
import { scienceTargets, LABEL, siteNear, openOf, samplesOf, HUMAN } from "../lib/science.js";
import { publish, subscribe } from "../lib/live.js";
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
  const [view3d, setView3d] = useState(true); // 3D by default; off = the 2D map
  const [simple3d, setSimple3d] = useState(false); // the 3D layer map could not start: use the drawn 3D view
  const [change, setChange] = useState(false);
  const [noGeo, setNoGeo] = useState(false);
  const [picks, setPicks] = useState([]); // points the user clicked on the map
  const [path, setPath] = useState(null); // safest path result
  const [busyPath, setBusyPath] = useState(false);
  const [droneMap, setDroneMap] = useState({}); // cell → "sand" | "clear" | "steep" (SIMULATED drone scans)
  const [droneCells, setDroneCells] = useState([]);
  // route planner A → B (several options)
  const [A, setA] = useState(null), [B, setB] = useState(null), [pickFor, setPickFor] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [planMode, setPlanMode] = useState("direct"); // route planner: "direct" (A → B) or "multi" (W0..Wk)
  const [abortData, setAbortData] = useState(null);
  const [hoverCoord, setHoverCoord] = useState(null);
  const [loadedGeo, setLoadedGeo] = useState(null);
  const [options, setOptions] = useState([]), [chosen, setChosen] = useState(0);
  const [targets, setTargets] = useState([]);
  useEffect(() => { loadGeo().then(setLoadedGeo).catch(() => {}); }, []);
  useEffect(() => { if (stops.length) scienceTargets(stops, dist).then(setTargets); }, [stops]);
  const targetOf = (s) => (s && !s.grey ? siteNear(s, targets, dist) : null);
  // LIVE astronaut from the helmet (telemetry every second through server.py)
  const [astro, setAstro] = useState(null), [trail, setTrail] = useState([]);
  useEffect(() => subscribe((e) => {
    if (e.type !== "telemetry" || e.lat == null) return;
    if (e.t && Date.now() - e.t > 15000) return; // old
    setAstro({ ...e, seen: Date.now() });
    setTrail((tr) => { const l = tr[tr.length - 1]; return !l || dist(l, e) > 2 ? [...tr.slice(-800), { lat: e.lat, lon: e.lon }] : tr; });
  }), []);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 2000); return () => clearInterval(id); }, []);
  const astroLive = astro && Date.now() - astro.seen < 6000;
  useEffect(() => { if (stops.length && !A) { const last = stops.reduce((a, b) => (b.sol > a.sol ? b : a), stops[0]); setA({ lat: last.lat, lon: last.lon, label: `sol ${last.sol}` }); } }, [stops]);
  const raf = useRef(0);

  useEffect(() => { loadStops().then((s) => { setStops(s); setSel(s[0]); }).catch((e) => setErr(e.message)); return () => cancelAnimationFrame(raf.current); }, []);

  const greys = useMemo(() => greyCells(stops), [stops]);
  const colourFor = useCallback((s) => finalColour(s, scouted[keyOf(s)]), [scouted]);
  const resolve = (k) => stops.find((s) => s.sol === k) || picks.find((p) => p.id === k) || greys.find((g) => g.id === k);
  const inRoute = sel && route.includes(keyOf(sel));
  const toggleRoute = () => setRoute((r) => (inRoute ? r.filter((x) => x !== keyOf(sel)) : [...r, keyOf(sel)]));

  // click anywhere on the map → a point with the DEM slope/height; no AI photo there → scout it
  async function pick(lat, lon) {
    if (pickFor) {
      if (pickFor === "A") setA({ lat, lon, label: "picked on map" });
      else if (pickFor === "B") setB({ lat, lon, label: "picked on map" });
      else if (pickFor.startsWith("W")) {
        const idx = parseInt(pickFor.slice(1));
        setWaypoints((wps) => {
          const next = [...wps];
          next[idx] = { ...next[idx], lat, lon, label: idx === 0 ? "W0 (Base)" : `W${idx}` };
          return next;
        });
      }
      setPickFor(null);
      setOptions([]);
      return;
    }
    let slope_class = null, elev = null, map_class = null;
    try { const g = await loadGeo(); slope_class = g.slopeAt(lat, lon); elev = elevAt(g.elev, lat, lon); map_class = g.mapAt ? g.mapAt(lat, lon) : null; } catch {}
    const p = { ...pointFrom(lat, lon, stops, dist), slope_class, elev, map_class };
    setPicks((ps) => [...ps.filter((x) => route.includes(x.id)).slice(-60), p]);
    setSel(p);
  }

  const handleMoveWaypoint = (idx, newLat, newLon) => {
    setWaypoints((wps) => {
      const next = [...wps];
      next[idx] = { ...next[idx], lat: newLat, lon: newLon };
      return next;
    });
    setOptions([]);
  };

  const pins3d = useMemo(() => (planMode === "multi"
    ? waypoints.map((w, i) => w && { label: `W${i}`, kind: i === 0 ? "a" : "w", lat: w.lat, lon: w.lon })
    : [A && { label: "A", kind: "a", lat: A.lat, lon: A.lon }, B && { label: "B", kind: "b", lat: B.lat, lon: B.lon }]
  ).filter(Boolean), [planMode, waypoints, A, B]);

  const elevStats = useMemo(() => {
    const pts = options[chosen]?.pts;
    if (!pts || pts.length < 2 || !loadedGeo?.elev) return null;
    let gain = 0, loss = 0, minZ = Infinity, maxZ = -Infinity, multSum = 0;
    for (let i = 0; i < pts.length; i++) {
      const z = pts[i].elev != null ? pts[i].elev : (elevAt(loadedGeo.elev, pts[i].lat, pts[i].lon) ?? -4400);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      let slope = 0;
      if (i > 0) {
        const prevZ = pts[i - 1].elev != null ? pts[i - 1].elev : (elevAt(loadedGeo.elev, pts[i - 1].lat, pts[i - 1].lon) ?? -4400);
        const dz = z - prevZ;
        if (dz > 0) gain += dz; else loss += Math.abs(dz);
        const d = dist(pts[i - 1], pts[i]);
        slope = d > 0 ? (Math.atan(Math.abs(dz) / d) * 180) / Math.PI : 0;
      }
      const uphill = slope > 0 ? (slope / 15) * 0.25 : 0;
      multSum += (1.0 + uphill);
    }
    return { gain, loss, minElev: minZ, maxElev: maxZ, avgMultiplier: multSum / pts.length };
  }, [options, chosen, loadedGeo]);

  // start of the walk: last point of the route, else Curiosity's latest stop (our "base")
  const startPoint = () => (route.length ? resolve(route[route.length - 1]) : stops.reduce((a, b) => (b.sol > a.sol ? b : a), stops[0]));
  async function findPath() {
    if (!sel) return;
    setBusyPath(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const g = await loadGeo(), a = startPoint();
      const r = safestPath(g, stops, a, sel, droneMap);
      setPath(r ? { ...r, from: a, to: sel } : { none: true, from: a, to: sel });
    } catch { setPath({ none: true, err: true }); }
    setBusyPath(false);
  }
  // the drone flies over every stretch where the ground is unknown, then we plan again with what it saw
  async function droneFirst() {
    if (!path?.pts || busy) return;
    const g = await loadGeo();
    const way = path.pts.filter((_, k) => path.unsure[k]);
    if (!way.length) return;
    setBusy(true);
    const t0 = performance.now(), T = Math.min(6000, 1500 + way.length * 15);
    await new Promise((done) => {
      const fly = (t) => {
        const k = Math.min(way.length - 1, Math.floor(((t - t0) / T) * way.length));
        setDrone(way[k]); setLaser(true);
        if (t - t0 < T) requestAnimationFrame(fly); else done();
      };
      requestAnimationFrame(fly);
    });
    setLaser(false); setDrone(null);
    const scan = { ...droneMap, ...droneScan(g, stops, path) };
    setDroneMap(scan);
    setDroneCells(Object.entries(scan).map(([i, r]) => { const [lat, lon] = cellLatLon(g, stops, +i); return { lat, lon, r }; }));
    const r = safestPath(g, stops, path.from, path.to, scan);
    const ents = Object.entries(scan).map(([i, v]) => { const [lat, lon] = cellLatLon(g, stops, +i); return { lat, lon, r: v }; });
    const sand = ents.filter((x) => x.r === "sand").length, steep = ents.filter((x) => x.r === "steep").length, clear = ents.length - sand - steep;
    const changed = !!r && Math.abs(r.len - path.len) > 5;
    setPath(r ? { ...r, from: path.from, to: path.to, replanned: true, sandCells: sand, scan: { sand, steep, clear, before: path.len } } : { none: true, from: path.from, to: path.to });
    // the scan now COUNTS: your points near scanned spots get the drone's ground reading (SIMULATED)
    const groundFrom = (p) => {
      const near = ents.filter((x) => dist(x, p) < 15); if (!near.length || p.aiFrom != null) return p;
      const ns = near.filter((x) => x.r === "sand").length / near.length, st = near.some((x) => x.r === "steep");
      return { ...p, sand_pct: ns >= 0.3 ? 0.35 : ns > 0 ? 0.15 : 0.02, bigrock_pct: 0, soil_pct: 0.3, bedrock_pct: 0.6, certainty: 0.85, slope_class: st ? 3 : p.slope_class, droneRead: true };
    };
    setPicks((ps) => ps.map(groundFrom));
    if (sel?.custom) setSel((x) => groundFrom(x));
    setBusy(false);
    say(`Drone scan done. ${sand ? `${sand} sand spots found and avoided.` : "No sand found. Path confirmed."}`);
    // tell the helmet: hazard spots for its map + alerts
    publish({ type: "dronescan", sand, steep, changed, cells: ents.filter((x) => x.r !== "clear").slice(0, 600).map((x) => ({ lat: +x.lat.toFixed(6), lon: +x.lon.toFixed(6), r: x.r })) });
  }

  // chosen option → route for the helmet (A, points every ~200 m, the science stop, B)
  const [routeWhy, setRouteWhy] = useState("");
  function whyOf(o) {
    const others = options.filter((x) => x !== o && x.pts);
    const parts = [`${o.label}: ${Math.round(o.len)} m, ${o.goPct}% firm GO ground on the team map`];
    others.forEach((x) => { if (x.goPct < o.goPct) parts.push(`${x.label} is ${Math.round(x.len)} m but only ${x.goPct}% GO${x.caution > 20 ? `, with ${Math.round(x.caution)} m of caution ground` : ""}`); });
    if (o.scouted) parts.push(`the drone checked it and ${Math.round(o.droneStat?.confirmed || 0)} m are confirmed`);
    if (o.target) parts.push(`it passes ${o.target.name} for science`);
    parts.push("NO-GO ground is never crossed");
    return parts.join(". ") + ".";
  }
  function useOption(o) {
    setRouteWhy(whyOf(o));
    const mk = (q, via) => {
      const st = stops.find((x) => dist(x, q) < 3); if (st && !via) return st;
      return { ...pointFrom(q.lat, q.lon, stops, dist), id: pickId(q.lat, q.lon, via), via };
    };
    const a = mk(A, false), b = mk(B, false);
    const mids = samplePts(o.pts).slice(1, -1).map((q) => mk(q, true));
    if (o.viaPt) {
      const vs = o.viaSol ? stops.find((x) => x.sol === o.viaSol) : mk(o.viaPt, false);
      let bi = 0, bd = Infinity; mids.forEach((m, k) => { const d = dist(m, vs); if (d < bd) { bd = d; bi = k; } });
      if (mids.length) mids.splice(bi, 1, vs); else mids.push(vs);
    }
    const all = [a, ...mids, b];
    setPicks((ps) => [...ps, ...all.filter((x) => x.custom)]);
    setRoute(all.map(keyOf));
  }

  // ── drone scout on the chosen route (SIMULATED) ──
  const [need, setNeed] = useState(null), [scoutBusy, setScoutBusy] = useState(false);
  useEffect(() => {
    const o = options[chosen]; if (!o?.cells) { setNeed(null); return; }
    loadGeo().then((g) => setNeed(scoutNeeds(g, stops, o))).catch(() => setNeed(null));
  }, [options, chosen, stops]);
  async function scoutRoute() {
    const o = options[chosen]; if (!o || !need || scoutBusy) return;
    const g = await loadGeo();
    const way = need.segs.flatMap((sg) => sg.pts);
    if (!way.length) return;
    setScoutBusy(true);
    const t0 = performance.now(), T = Math.min(7000, 1500 + way.length * 12);
    await new Promise((done) => {
      const fly = (t) => { setDrone(way[Math.min(way.length - 1, Math.floor(((t - t0) / T) * way.length))]); if (t - t0 < T) requestAnimationFrame(fly); else done(); };
      requestAnimationFrame(fly);
    });
    setDrone(null);
    const { scan, src } = await scoutRun(g, stops, o);
    const r = rerouteScanned(g, stops, o.pts[0], o.pts[o.pts.length - 1], scan, o.id === "fastest" ? "fastest" : "safest");
    const ents = Object.entries(scan).map(([i, v]) => ({ ...cellCentre(g, stops, +i), r: v.r, src: v.src }));
    const cnt = (k) => ents.filter((e) => e.r === k).length;
    const res = { sand: cnt("sand"), steep: cnt("steep") + cnt("obstacle"), caution: cnt("caution"), clear: cnt("clear"), sim: src.sim, dem: src.dem, before: o.len, unknownM: need.unknown, uncertainM: need.uncertain };
    setDroneCells(ents.filter((e, k) => e.r !== "clear" || k % 3 === 0));
    let changed = false;
    if (r) {
      changed = Math.abs(r.len - o.len) > 5;
      const goPct = Math.round((100 * r.droneStat.go) / r.len);
      const nopt = { ...o, ...r, id: o.id + "-drone", label: o.label.replace(/ · drone-checked$/, "") + " · drone-checked", goPct, tags: [...o.tags.filter((t) => t !== "drone-checked"), "drone-checked"], warn: [], scouted: res };
      if (r.droneStat.sand > 5) nopt.warn.push(`${Math.round(r.droneStat.sand)} m on sand the drone found: go slowly`);
      if (r.droneStat.caution > 20) nopt.warn.push(`${Math.round(r.droneStat.caution)} m on CAUTION ground (15–25° or rough): go slowly`);
      setOptions((os) => os.map((x, k) => (k === chosen ? nopt : x)));
    }
    setScoutBusy(false);
    say(`Drone scout done. ${res.sand ? `${res.sand} sand spots, ` : ""}${res.steep ? `${res.steep} steep or obstacle spots, ` : ""}${changed ? "route changed to avoid them." : "route confirmed."}`);
    publish({ type: "dronescan", sand: res.sand, steep: res.steep, changed, cells: ents.filter((x) => x.r === "sand" || x.r === "steep" || x.r === "obstacle").slice(0, 600).map((x) => ({ lat: +x.lat.toFixed(6), lon: +x.lon.toFixed(6), r: x.r === "obstacle" ? "steep" : x.r })) });
  }

  function usePath() {
    if (!path?.pts) return;
    const vias = samplePath(path.pts, 200).slice(1, -1).map((q) => ({ ...pointFrom(q.lat, q.lon, stops, dist), id: pickId(q.lat, q.lon, true), via: true }));
    setPicks((ps) => [...ps, ...vias, ...(path.to.custom ? [path.to] : [])]);
    setRoute((r) => {
      const out = r.length ? [...r] : [keyOf(path.from)];
      vias.forEach((v) => out.push(v.id));
      if (!out.includes(keyOf(path.to))) out.push(keyOf(path.to));
      return out;
    });
  }

  function sendScout() {
    if (!sel || busy) return;
    const base = resolve(route[0]) || stops[0];
    const target = sel, t0 = performance.now(), FLY = 1800, changed = change;
    setBusy(true); setLaser(false);
    const fly = (t) => {
      const k = Math.min(1, (t - t0) / FLY);
      setDrone({ lat: base.lat + (target.lat - base.lat) * k, lon: base.lon + (target.lon - base.lon) * k + 0.00012 * Math.sin(k * Math.PI) });
      if (k < 1) { raf.current = requestAnimationFrame(fly); return; }
      // SIMULATED reading: our AI result for this stop (+25% sand if "conditions changed" is on)
      const add = changed ? 0.25 : 0;
      // grey area: no Curiosity photo there, so the SIMULATED reading uses the nearest stop's AI result
      const noData = target.sand_pct == null, src = noData ? target.nearest : target;
      const reading = { ...src, slope_class: target.slope_class, sand_pct: Math.min(1, (src.sand_pct ?? 0) + add), bedrock_pct: Math.max(0, (src.bedrock_pct ?? 0) - add) };
      const h = hardnessOf(reading), v = verdict(reading);
      setLaser(true); playZap(h);
      setTimeout(() => {
        setLaser(false); setBusy(false);
        setScouted((m) => ({ ...m, [keyOf(target)]: { sol: src.sol, grey: noData, h, verdict: v, sand_pct: reading.sand_pct, bigrock_pct: reading.bigrock_pct ?? 0, env: envAt(0, src.sol), changed } }));
        say(`Scout report. ${v.label.replace(":", ".")}.`);
        publish({ type: "scout", key: keyOf(target), sol: noData ? null : target.sol, near: src.sol, grey: noData, label: labelOf(target, routeStops), lat: target.lat, lon: target.lon,
          sand_pct: reading.sand_pct, bigrock_pct: reading.bigrock_pct ?? 0, verdict: v, changed });
      }, 1200);
    };
    raf.current = requestAnimationFrame(fly);
  }

  if (err) return <p className="err">⚠ {err}. Put stops.json in public/data/.</p>;

  const routeStops = route.map(resolve).filter(Boolean);
  const show3d = view3d; // A / B / waypoints can be placed on the 3D map too
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
        <a className="tag" href="?view=control" target="_blank" rel="noreferrer">📡 Mission control</a>
        {astroLive
          ? <span className="tag live">● LIVE astronaut · {astro.running || astro.steps ? "walking to" : "next:"} {astro.next} · {Math.round(astro.d)} m{astro.steps ? ` · ${astro.steps} steps` : ""}</span>
          : <span className="tag muted">helmet not connected</span>}
      </header>
      <main>
        <section className="mapCol">
          <div className="mapbar">
            <div className="mapbar-title">
              <b>{show3d ? "3D GO / NO-GO map" : "2D map"}</b>
              <span>{pickFor ? `Click the ground to place ${pickFor}` : show3d ? (options[chosen]?.pts ? `Route: ${options[chosen].label} · ${Math.round(options[chosen].len)} m · layer by layer` : "The whole boxwork area · layer by layer") : "Drag to move · scroll to zoom · click to check a spot"}</span>
            </div>
            <label className="toggle" title="3D map on / off">
              <input type="checkbox" role="switch" checked={view3d} onChange={(e) => setView3d(e.target.checked)} />
              <i aria-hidden="true" />
              <span>3D</span>
            </label>
          </div>
          {show3d
            ? (!simple3d ? <LayerMap3D routePts={options[chosen]?.pts} routeColour={options[chosen]?.colour} pins={pins3d} picking={pickFor} onPick={pick} onCancelPick={() => setPickFor(null)} onFallback={() => setSimple3d(true)} />
              : noGeo ? <Map3D stops={stops} route={routeStops} selected={sel} onSelect={setSel} colourFor={colourFor} />
                     : <Terrain3D stops={stops} route={routeStops} picks={picks} pathPts={options[chosen]?.pts} pathUnsure={null} hoverCoord={hoverCoord} onPick={pick} selected={sel} onSelect={setSel} colourFor={colourFor} onFail={() => setNoGeo(true)} />)
            : (noGeo ? <MiniMap stops={stops} greys={greys} route={routeStops} selected={sel} onSelect={setSel} drone={drone} laser={laser} scouted={scouted} colourFor={colourFor} />
                     : <GeoMap targets={targets} astro={astroLive ? astro : null} trail={trail} stops={stops} greys={[]} picks={picks} pathPts={options[chosen]?.pts} pathColour={options[chosen]?.colour} altPaths={options.filter((_, k) => k !== chosen)} onChooseAlt={(o) => setChosen(options.indexOf(o))} ab={{ A, B }} waypoints={planMode === "multi" ? waypoints : []} onMoveWaypoint={handleMoveWaypoint} abortPaths={abortData?.abortPaths || []} hoverCoord={hoverCoord} droneCells={droneCells} scoutSegs={options[chosen]?.scouted ? [] : need?.segs || []} onPick={pick} route={routeStops} selected={sel} onSelect={setSel} drone={drone} laser={laser} scouted={scouted} colourFor={colourFor} onFail={() => setNoGeo(true)} />)}
          <div className="legend">
            {show3d && !simple3d
              ? GONOGO_KEY.map(([c, t]) => <span key={t}><i className="sq" style={{ background: c }} />{t}</span>)
              : <>
                  {["green", "orange", "red", "grey"].map((c) => (
                    <span key={c}><i style={{ background: COLOURS[c] }} />{{ green: "GO · AI sure", orange: "careful · or AI unsure", red: "don't go", grey: "no ground data · send scout" }[c]}</span>
                  ))}
                  <span>🎤 = live scout reading</span>
                </>}
          </div>
          <ElevationProfile routePts={options[chosen]?.pts} geo={loadedGeo} stops={stops} onHoverCoord={setHoverCoord} hoveredCoord={hoverCoord} />
        </section>
        <section className="side">
          <label className="gostop">Go to stop:
            <select value={sel && !sel.custom && !sel.grey ? sel.sol : ""} onChange={(e) => { const x = stops.find((q) => q.sol === +e.target.value); if (x) setSel(x); }}>
              <option value="">choose…</option>
              {stops.map((q) => <option key={q.sol + "-" + q.lon} value={q.sol}>sol {q.sol} · {{ green: "GO", orange: "careful", red: "don't go", grey: "no data" }[colourFor(q)]} · sand {Math.round((q.sand_pct ?? 0) * 100)}%</option>)}
            </select>
          </label>
          {!noGeo && <Planner targets={targets} stops={stops} A={A} B={B} setA={setA} setB={setB} waypoints={waypoints} setWaypoints={setWaypoints} pickFor={pickFor} setPickFor={setPickFor} sel={sel}
            options={options} setOptions={setOptions} chosen={chosen} setChosen={setChosen} onUse={useOption} need={need} onScout={scoutRoute} scoutBusy={scoutBusy}
            abortData={abortData} setAbortData={setAbortData} plan={plan} elevStats={elevStats} mode={planMode} setMode={setPlanMode} />}
          {sel && (
            <div className="card">
              {targetOf(sel) && (
                <div className="scibox">
                  <b>🔬 Science target · {LABEL[targetOf(sel).type] || targetOf(sel).type}</b>
                  <b>{targetOf(sel).name}</b>
                  <span>{targetOf(sel).why}</span>
                  <small><b>Still unknown:</b> {openOf(targetOf(sel)).join(" · ")}</small>
                  <small><b>Take for the lab:</b> {samplesOf(targetOf(sel)).join(" · ")}</small>
                  {targetOf(sel).nasa && <small>NASA site, Curiosity sol {targetOf(sel).sol} · position ±{targetOf(sel).pos_m} m · <a href={targetOf(sel).src} target="_blank" rel="noreferrer">NASA source</a></small>}
                  {targetOf(sel).auto && <small>Chosen by our team from our AI result ({targetOf(sel).basis}).</small>}
                </div>
              )}
              <h2 style={{ color: COLOURS[fc] }}>{sel.custom ? (l => l[0].toUpperCase() + l.slice(1))(labelOf(sel, routeStops)) : sel.grey ? "Unexplored area" : `Sol ${sel.sol}`}</h2>
              {(sel.grey || (sel.custom && sel.aiFrom == null && !sel.droneRead))
                ? <>
                    <p className="muted">No Curiosity photo here: the nearest one is {sel.metres} m away (sol {sel.nearest.sol}). Slope and height come from the team DEM; only the scout can tell what the ground is.</p>
                    {(sel.slope_class || sel.elev != null) && <p className="pcts">⛰ {sel.slope_class ? <b>{SLOPE_TXT[sel.slope_class]}</b> : "slope: no data"}{sel.elev != null && ` · height ${Math.round(sel.elev)} m`} <span className="muted">(team DEM)</span></p>}
                    {sel.map_class != null && <p className="pcts">🗺 Team GO/NO-GO map: <b className={"mc" + sel.map_class}>{MAP_TXT[sel.map_class]}</b> <span className="muted">(slope, roughness, geology, Curiosity path)</span></p>}
                  </>
                : <>
                    {sel.custom && sel.droneRead && <p className="muted">🚁 Ground from the drone scan (SIMULATED).</p>}
                    {sel.custom && !sel.droneRead && <p className="muted">Ground from our AI on the Curiosity photo of sol {sel.aiFrom}, {sel.metres} m away (within {NEAR_AI_M} m).</p>}
                    {sel.image && !sel.droneRead && <PhotoSlider key={sel.image} stop={sel.custom ? sel.nearest : sel} />}
                    <p className="pcts">
                      🟫 soil {pct(sel.soil_pct)} · ⬜ bedrock {pct(sel.bedrock_pct)} · 🟨 <b>sand {pct(sel.sand_pct)}</b> · 🟥 big rock {pct(sel.bigrock_pct)}
                    </p>
                    {(sel.slope_class || sel.elev != null) && <p className="pcts">⛰ {sel.slope_class ? <b>{SLOPE_TXT[sel.slope_class]}</b> : "slope: no data"}{sel.elev != null && ` · height ${Math.round(sel.elev)} m`} <span className="muted">(team DEM)</span></p>}
                    {sel.map_class != null && <p className="pcts">🗺 Team GO/NO-GO map: <b className={"mc" + sel.map_class}>{MAP_TXT[sel.map_class]}</b> <span className="muted">(slope, roughness, geology, Curiosity path)</span></p>}
                  </>}
              <div className="certainty">
                <div className="bar"><i style={{ width: `${Math.round(cert.v * 100)}%`, background: cert.v >= 0.75 ? COLOURS.green : COLOURS.orange }} /></div>
                <small>AI certainty <b>{Math.round(cert.v * 100)}%</b> · {cert.src}</small>
              </div>
              <p className={"advice " + (adv.scout ? "warnbox" : "")} style={{ borderColor: COLOURS[fc] }}>{adv.scout ? "🚁 " : ""}{adv.text}</p>
              <div className="btns">
                <button onClick={toggleRoute}>{inRoute ? "➖ Remove from route" : "➕ Add to route"}</button>
                <button onClick={sendScout} disabled={busy} className={adv.scout ? "on" : ""}>{busy ? "🚁 Scouting…" : "🚁 Send scout"}</button>
              </div>
              <label className="muted chk"><input type="checkbox" checked={change} onChange={(e) => setChange(e.target.checked)} /> Simulate a change on site (wind moved +25% sand) for the next scout</label>
              <ScoutResult result={live} />
            </div>
          )}
          <div className="card">
            <h3>Route ({route.length} points)</h3>
            <p className="muted">{route.length ? routeStops.reduce((acc, p) => { if (p.via) { const l = acc[acc.length - 1]; if (typeof l === "number") acc[acc.length - 1] = l + 1; else acc.push(1); } else acc.push(labelOf(p, routeStops)); return acc; }, []).map((x) => (typeof x === "number" ? `(${x} path points)` : x)).join(" → ") : "Click a stop, or anywhere on the map, then ➕ Add to route."}</p>
            {plan && (
              <div className={"gonogo " + (plan.go ? "go" : "nogo")}>
                <b>{plan.go ? "GO" : "NO GO"}</b>
                <span>Needs {hm(plan.need)} (walk + {routeStops.filter((x) => !x.via).length}×15 min work + way back) · limit {hm(plan.limit)} ({plan.by})</span>
                <small>Oxygen {O2_H} h, {RESERVE_MIN} min reserve never planned · EVA {EVA_MIN / 60} h · team assumptions</small>
              </div>
            )}
            <PairQR routePts={routeStops} why={routeWhy} />
          </div>
          {ctx && <div className="card"><Assistant ctx={ctx} /></div>}
        </section>
      </main>
    </div>
  );
}

const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
// colours of the combined GO / NO-GO map (Map_layer/martian_map/web/layers.json legend, crew on foot)
const GONOGO_KEY = [["#1a9850", "GO"], ["#f4c430", "CAUTION"], ["#d73027", "NO-GO"], ["#9e9e9e", "no data · send the scout"]];
