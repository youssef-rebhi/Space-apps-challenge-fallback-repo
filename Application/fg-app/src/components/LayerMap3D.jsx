import { useEffect, useMemo, useRef, useState } from "react";

// The tablet's 3D map: the team's coloured GO / NO-GO 3D map and its layer-by-layer animation
// (Map_layer/martian_map/web/explode/, copied into the app as map3d/ by scripts/map3d.mjs).
// No route chosen  -> the whole boxwork map; the animation splits all of it.
// Route chosen     -> only the section around the route (lib/sections.js, path + 100 m margin, assumption A31),
//                     floating above the flat 2D map of the area around it; the animation splits that section.
// One button runs the animation: 1st click = two maps, 2nd = all layers, 3rd = back together.
const STEPS = ["Map", "Two maps", "All layers"];
const NEXT = ["Separate layers", "Show all layers", "Combine back"];
const MAX_PTS = 120; // route points sent in the URL (evenly picked along the route)
const EXAG = { whole: 1.5, route: 2 }; // relief height on screen (display only)

const pick = (pts, n) => (pts.length <= n ? pts : Array.from({ length: n }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (n - 1))]));

export default function LayerMap3D({ routePts, routeColour, onFallback }) {
  const frame = useRef(null);
  const hasRoute = routePts?.length > 1;
  const routeTxt = useMemo(() => (hasRoute ? pick(routePts, MAX_PTS).map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join(";") : ""), [routePts, hasRoute]);
  const [mode, setMode] = useState(hasRoute ? "route" : "whole");
  useEffect(() => setMode(hasRoute ? "route" : "whole"), [routeTxt]); // a new route: show its section
  const [st, setSt] = useState({ ready: false, step: 0, caption: "", section: null, err: "" });

  const src = useMemo(() => {
    const q = new URLSearchParams({ embed: "1", exag: String(EXAG[mode === "route" && hasRoute ? "route" : "whole"]) });
    if (hasRoute) { q.set("route", routeTxt); q.set("rc", (routeColour || "#3cff8f").replace("#", "")); }
    if (mode === "route" && hasRoute) { q.set("section", "path:" + routeTxt); q.set("base", "1"); }
    return "map3d/explode/?" + q.toString();
  }, [mode, routeTxt, routeColour, hasRoute]);

  useEffect(() => {
    setSt({ ready: false, step: 0, caption: "", section: null, err: "" });
    const onMsg = (e) => {
      const d = e.data;
      if (!d || d.fg3d !== 1 || e.source !== frame.current?.contentWindow) return;
      if (d.type === "ready") setSt((s) => ({ ...s, ready: true, step: d.step, section: d.section, err: d.secErr ? `Route section not shown: ${d.secErr}` : "" }));
      else if (d.type === "state") setSt((s) => ({ ...s, step: d.step, caption: d.caption }));
      else if (d.type === "error") setSt((s) => ({ ...s, err: d.msg || "could not load" }));
    };
    addEventListener("message", onMsg);
    const t = setTimeout(() => setSt((s) => (s.ready ? s : { ...s, err: s.err || "the 3D map did not start (WebGL, or no internet for three.js)" })), 30000);
    return () => { removeEventListener("message", onMsg); clearTimeout(t); };
  }, [src]);

  const send = (m) => frame.current?.contentWindow?.postMessage({ fg3d: 1, ...m }, location.origin);
  const failed = st.err && !st.ready;

  return (
    <div className="lm3d">
      <iframe ref={frame} key={src} src={src} title="3D GO / NO-GO map, layer by layer" />
      <div className="lm3d-top">
        <div className="seg2" role="group" aria-label="What the 3D map shows">
          <button className={mode === "route" && hasRoute ? "on" : ""} disabled={!hasRoute} onClick={() => setMode("route")} title={hasRoute ? "Only the ground around the chosen route" : "Find a route first"}>Route section</button>
          <button className={mode === "whole" || !hasRoute ? "on" : ""} onClick={() => setMode("whole")}>Whole map</button>
        </div>
        <button className="ghost" onClick={() => send({ type: "reset" })} disabled={!st.ready} title="Back to the starting view">⟲ View</button>
      </div>
      {st.ready && <p className="lm3d-cap">{st.caption}{mode === "route" && hasRoute && st.section ? <small>Route section {st.section.w} × {st.section.h} m, over the 2D map around it</small> : !hasRoute ? <small>Choose a route to see only its section</small> : null}</p>}
      {failed && (
        <div className="lm3d-fail">
          <p>⚠ 3D map: {st.err}.</p>
          {onFallback && <button onClick={onFallback}>Use the simple 3D view</button>}
        </div>
      )}
      <div className="lm3d-anim" aria-live="polite">
        <div className="lm3d-dots">{STEPS.map((s, i) => <span key={s} className={st.step === i ? "on" : ""}><i />{s}</span>)}</div>
        <button onClick={() => send({ type: "next" })} disabled={!st.ready}>{NEXT[st.step]}</button>
      </div>
      {st.err && st.ready && <p className="lm3d-warn">⚠ {st.err}</p>}
    </div>
  );
}
