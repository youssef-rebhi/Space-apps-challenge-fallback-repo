import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { COLOURS } from "../lib/mission.js";
import { GEO, loadGeo } from "../lib/geo.js";
import { keyOf, labelOf } from "../lib/grey.js";

// Real 2D map: pan + zoom. Background layers from the team's geo work (USGS MSL Gale DEM 1 m,
// slope classes, whole Gale crater). Coordinates are Mars lon/lat (L.CRS.Simple, not Earth).
const BASES = {
  gonogo: { file: "gonogo_photo_box.webp", key: "gonogo_photo_box.webp", label: "GO / NO-GO over photo (team map)" },
  photo: { file: "photo_box.webp", key: "photo_box.webp", label: "Photo (USGS orthophoto 25 cm)" },
  elevation: { file: "elevation_box.webp", key: "elevation_box.png", label: "Elevation (USGS Gale DEM 1 m)" },
  slope: { file: "slope_classes_box.png", key: "slope_classes_box.png", label: "Slope GO / caution / NO-GO" },
  crater: { file: "regional_gale_elevation.webp", key: "regional_gale_elevation.png", label: "Whole Gale crater" },
};

export default function GeoMap({ targets = [], astro, trail = [], stops, greys, picks = [], pathPts, pathUnsure, pathColour = "#3cff8f", altPaths = [], onChooseAlt, ab = {}, waypoints = [], onMoveWaypoint, abortPaths = [], hoverCoord = null, droneCells = [], scoutSegs = [], onPick, route, selected, onSelect, drone, laser, scouted, colourFor, onFail }) {
  const box = useRef(null), map = useRef(null), layers = useRef({}), geo = useRef(null), fitted = useRef(false);
  const fitStops = (m) => stops.length && m.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lon])), { padding: [50, 50] });
  const [base, setBase] = useState("gonogo");
  const [ready, setReady] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [showDrone, setShowDrone] = useState(false);
  const pickRef = useRef(onPick); pickRef.current = onPick;

  // create the map once
  useEffect(() => {
    let dead = false;
    loadGeo().then((g) => {
      if (dead) return;
      geo.current = g;
      const m = L.map(box.current, { crs: L.CRS.Simple, zoomSnap: 0.25, attributionControl: true, minZoom: 6, maxZoom: 17 });
      m.attributionControl.setPrefix(false);
      m.attributionControl.addAttribution("USGS MSL Gale DEM 1 m + orthophoto 25 cm · team GO/NO-GO map · stops: Curiosity + our AI");
      const b = g.bounds["elevation_box.png"].bounds;
      m.fitBounds(b);
      layers.current.base = L.imageOverlay(GEO + BASES.elevation.file, g.bounds[BASES.elevation.key].bounds, { opacity: 0.95 }).addTo(m);
      layers.current.trav = L.polyline(g.traverse.map(([la, lo]) => [la, lo]), { color: "#ffffff", weight: 2, opacity: 0.55, dashArray: "2 4" }).addTo(m).bindTooltip("Curiosity's real path (MMGIS waypoints)");
      layers.current.items = L.layerGroup().addTo(m);
      layers.current.fx = L.layerGroup().addTo(m);
      m.on("click", (e) => pickRef.current?.(e.latlng.lat, e.latlng.lng));
      map.current = m; setReady(true);
    }).catch(() => onFail?.());
    return () => { dead = true; map.current?.remove(); map.current = null; };
  }, []);

  // switch background
  useEffect(() => {
    const m = map.current, g = geo.current; if (!m || !g) return;
    layers.current.base?.remove();
    const B = BASES[base];
    layers.current.base = L.imageOverlay(GEO + B.file, g.bounds[B.key].bounds, { opacity: 0.95 }).addTo(m);
    layers.current.base.bringToBack();
    if (base === "crater") m.fitBounds(g.bounds[B.key].bounds); else fitStops(m);
  }, [base, ready]);

  // stops, grey cells, route
  useEffect(() => {
    const grp = layers.current.items; if (!grp) return;
    grp.clearLayers();
    if (!fitted.current && stops.length) { fitted.current = true; fitStops(map.current); }
    const bx = geo.current.bounds["elevation_box.png"].bounds;
    L.rectangle(bx, { color: "#ffd84d", weight: 2, fill: false, dashArray: "6 4", interactive: false }).addTo(grp);
    if (base === "crater") L.marker([(bx[0][0] + bx[1][0]) / 2, bx[1][1]], { icon: L.divIcon({ className: "boxLabel", html: "◀ our boxwork area (5 km)", iconSize: [170, 20], iconAnchor: [-8, 10] }), interactive: false }).addTo(grp);
    greys.forEach((g) => {
      const h = g.cell / 2, c = colourFor(g), sel = selected?.id === g.id;
      L.rectangle([[g.lat - h, g.lon - h], [g.lat + h, g.lon + h]], { color: sel ? "#fff" : COLOURS[c], weight: sel ? 2 : 0.5, fillColor: COLOURS[c], fillOpacity: scouted[g.id] ? 0.7 : 0.25, bubblingMouseEvents: false })
        .on("click", () => onSelect(g)).bindTooltip("Unexplored · no Curiosity photo").addTo(grp);
    });
    const DC = { sand: "#ffb020", clear: "#3ecf8e", steep: "#6a1fd1", obstacle: "#ff3b3b", caution: "#b57cff" };
    scoutSegs.forEach((sg) => L.polyline(sg.pts.map((q) => [q.lat, q.lon]), { color: sg.reason === "unknown" ? "#cfcfcf" : "#ff9a2e", weight: 14, opacity: 0.45, interactive: false }).addTo(grp));
    droneCells.forEach((d) => L.circleMarker([d.lat, d.lon], { radius: 2.5, stroke: false, fillColor: DC[d.r], fillOpacity: 0.85, interactive: false }).addTo(grp));
    // other route options: thin, click to choose
    altPaths.forEach((o) => {
      L.polyline(o.pts.map((q) => [q.lat, q.lon]), { color: "#000", weight: 6, opacity: 0.35, bubblingMouseEvents: false }).addTo(grp);
      L.polyline(o.pts.map((q) => [q.lat, q.lon]), { color: o.colour, weight: 3, opacity: 0.8, dashArray: "4 6", bubblingMouseEvents: false })
        .on("click", () => onChooseAlt?.(o)).bindTooltip(`${o.label} · ${Math.round(o.len)} m · click to choose`).addTo(grp);
    });
    if (pathPts?.length > 1) {
      L.polyline(pathPts.map((q) => [q.lat, q.lon]), { color: "#000", weight: 8, opacity: 0.6, interactive: false }).addTo(grp);
      // green where the ground is known, yellow dashes where it is not (drone should go first)
      let run = [pathPts[0]], un = pathUnsure?.[0];
      const flush = () => run.length > 1 && L.polyline(run.map((q) => [q.lat, q.lon]), un ? { color: "#ffe14d", weight: 4, dashArray: "6 6", interactive: false } : { color: pathColour, weight: 5, interactive: false }).addTo(grp);
      for (let k = 1; k < pathPts.length; k++) {
        const u = !!pathUnsure?.[k];
        if (u !== !!un) { run.push(pathPts[k]); flush(); run = [pathPts[k]]; un = u; } else run.push(pathPts[k]);
      }
      flush();
    }
    // Abort Corridors
    abortPaths.forEach((ap) => {
      L.polyline(ap.pts.map((q) => [q.lat, q.lon]), {
        color: ap.pastPNR ? "#d73027" : "#ff7733",
        weight: 2.5,
        opacity: 0.85,
        dashArray: "4 6",
        interactive: true,
      }).bindTooltip(`🚨 Emergency Abort Corridor W${ap.fromIndex} → Base (${Math.round(ap.dist)} m, ${Math.round(ap.minutes)} min)${ap.pastPNR ? " ⚠ PAST PNR" : ""}`).addTo(grp);
    });

    // Waypoints (draggable) or fallback to A / B pins
    if (waypoints && waypoints.length > 0) {
      waypoints.forEach((wp, idx) => {
        if (!wp) return; // not placed yet
        const isBase = idx === 0;
        const icon = L.divIcon({
          className: `abpin ${isBase ? "A" : "wp"}`,
          html: isBase ? "W0" : `W${idx}`,
          iconSize: [28, 28],
        });
        const mkr = L.marker([wp.lat, wp.lon], { icon, draggable: true, zIndexOffset: 850 }).addTo(grp);
        mkr.bindTooltip(`${isBase ? "W0 (Base / Lander)" : `Waypoint W${idx}`} · drag to adjust`);
        mkr.on("dragend", (e) => {
          const ll = e.target.getLatLng();
          onMoveWaypoint?.(idx, ll.lat, ll.lng);
        });
      });
    } else {
      ["A", "B"].forEach((k) => { const P = ab[k]; if (P) L.marker([P.lat, P.lon], { icon: L.divIcon({ className: "abpin " + k, html: k, iconSize: [26, 26] }), interactive: false }).addTo(grp); });
    }
    targets.forEach((t) => {
      if (t.lat == null) return;
      L.marker([t.lat, t.lon], { icon: L.divIcon({ className: "sciIcon " + t.type, html: "🔬", iconSize: [26, 26] }), bubblingMouseEvents: false, zIndexOffset: 500 })
        .on("click", () => pickRef.current?.(t.lat, t.lon)).bindTooltip(`${t.name}${t.nasa ? " · NASA science site" : " · science target"}`).addTo(grp);
    });
    const rp = route;
    if (rp.length > 1) L.polyline(rp.map((s) => [s.lat, s.lon]), { color: "#7fb3ff", weight: 4, dashArray: "8 6" }).addTo(grp);
    (showStops ? stops : stops.filter((s) => route.includes(s) || (!selected?.custom && selected?.sol === s.sol))).forEach((s) => {
      const c = colourFor(s), sel = !selected?.grey && !selected?.custom && selected?.sol === s.sol;
      L.circleMarker([s.lat, s.lon], { radius: sel ? 11 : 8, color: sel ? "#fff" : "#000", weight: sel ? 3 : 1, fillColor: COLOURS[c], fillOpacity: 1, bubblingMouseEvents: false })
        .on("click", () => onSelect(s)).bindTooltip(`sol ${s.sol}${scouted[keyOf(s)] ? " · 🎤 scouted" : ""}`).addTo(grp);
    });
    picks.forEach((p) => {
      const c = colourFor(p), sel = selected?.id === p.id;
      if (!sel && !route.includes(p) && !p.via) return;
      if (p.via && !sel) { L.circleMarker([p.lat, p.lon], { radius: 3, color: "#3cff8f", weight: 1, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(grp); return; }
      L.circleMarker([p.lat, p.lon], { radius: sel ? 9 : 7, color: "#fff", weight: sel ? 3 : 2, dashArray: "3 2", fillColor: COLOURS[c], fillOpacity: 0.9, bubblingMouseEvents: false })
        .on("click", () => onSelect(p)).bindTooltip(labelOf(p, route)).addTo(grp);
    });
  }, [targets, stops, greys, picks, pathPts, pathUnsure, pathColour, altPaths, ab, waypoints, abortPaths, droneCells, scoutSegs, route, selected, scouted, colourFor, ready, base, showStops]);

  // Synchronized elevation profile hover crosshair
  useEffect(() => {
    const fx = layers.current.fx; if (!fx) return;
    if (layers.current.hoverMkr) { layers.current.hoverMkr.remove(); layers.current.hoverMkr = null; }
    if (hoverCoord && hoverCoord.lat != null) {
      layers.current.hoverMkr = L.circleMarker([hoverCoord.lat, hoverCoord.lon], {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: hoverCoord.color || "#3cff8f",
        fillOpacity: 1,
        className: "profile-hover-marker",
        interactive: false,
      }).addTo(fx);
    }
  }, [hoverCoord, ready]);

  // drone scan layer (SIMULATED, by the team's drone simulator): display only, not used for decisions
  const DRONE_STYLE = { clear: "#3ecf8e", sand: "#ffb020", slope_caution: "#b57cff", slope_nogo: "#6a1fd1", obstacle: "#ff5a5a", obstacle_point: "#ff5a5a" };
  useEffect(() => {
    const m = map.current; if (!m) return;
    layers.current.drone?.remove(); layers.current.drone = null;
    if (!showDrone) return;
    let dead = false;
    fetch(GEO + "drone_hazards.geojson").then((r) => r.json()).then((d) => {
      if (dead || !map.current) return;
      layers.current.drone = L.geoJSON(d, {
        style: (f) => ({ color: DRONE_STYLE[f.properties.hazard], weight: f.properties.hazard === "clear" ? 4 : 7, opacity: 0.95 }),
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, color: "#000", weight: 1, fillColor: DRONE_STYLE.obstacle_point, fillOpacity: 1 }),
        onEachFeature: (f, l) => { const p = f.properties; l.bindTooltip(`SIMULATED drone · ${p.hazard === "obstacle_point" ? `obstacle ${p.height_m} m` : `${p.hazard} · ${p.length_m} m`} · flight ${p.flight} (near sol ${p.near_sol})`); },
        bubblingMouseEvents: false,
      }).addTo(m);
    }).catch(() => {});
    return () => { dead = true; };
  }, [showDrone, ready]);

  // live astronaut position + walked trail (from the helmet)
  useEffect(() => {
    const m = map.current; if (!m) return;
    layers.current.astro?.remove();
    const g = L.layerGroup();
    if (astro?.route?.length > 1) L.polyline(astro.route, { color: "#7fb3ff", weight: 3, opacity: 0.7, dashArray: "6 6", interactive: false }).addTo(g);
    if (trail.length > 1) L.polyline(trail.map((q) => [q.lat, q.lon]), { color: "#ffd08a", weight: 3, opacity: 0.9, interactive: false }).addTo(g);
    if (astro) L.marker([astro.lat, astro.lon], { icon: L.divIcon({ className: "astroIcon", html: "<span>👩‍🚀</span>", iconSize: [34, 34] }), interactive: false, zIndexOffset: 1000 }).addTo(g);
    g.addTo(m); layers.current.astro = g;
  }, [astro, trail, ready]);

  // drone + laser
  useEffect(() => {
    const fx = layers.current.fx; if (!fx) return;
    fx.clearLayers();
    if (!drone) return;
    L.marker([drone.lat, drone.lon], { icon: L.divIcon({ className: "droneIcon", html: "🚁", iconSize: [28, 28] }), interactive: false }).addTo(fx);
    if (laser && selected) L.polyline([[drone.lat, drone.lon], [selected.lat, selected.lon]], { color: "#ff3b3b", weight: 3, className: "laser" }).addTo(fx);
  }, [drone, laser, selected, ready]);

  return (
    <div className="geomap">
      <div ref={box} className="geomapBox" role="application" aria-label="Map of the boxwork area: drag to move, scroll to zoom, click to pick a point" />
      <div className="baseSwitch" role="group" aria-label="Background layer">
        {Object.entries(BASES).map(([k, b]) => <button key={k} className={base === k ? "on" : ""} onClick={() => setBase(k)}>{b.label}</button>)}
      </div>
      <div className="mapopts">
        <small className="muted">Drag to move · scroll to zoom · <b>click anywhere to check that spot</b></small>
        <label className="muted chk"><input type="checkbox" checked={showDrone} onChange={(e) => setShowDrone(e.target.checked)} /> Drone scan (SIMULATED: real terrain, synthetic rocks &amp; sand)</label>
        <label className="muted chk"><input type="checkbox" checked={showStops} onChange={(e) => setShowStops(e.target.checked)} /> Show Curiosity photo stops (our AI)</label>
      </div>
      {base === "gonogo" && <small className="muted legend4"><i style={{ background: "#1a9850" }} />GO <i style={{ background: "#f4c430" }} />CAUTION <i style={{ background: "#d73027" }} />NO-GO <i style={{ background: "#9e9e9e" }} />UNKNOWN · worst of slope, roughness, geology, Curiosity's path and our AI stops (team map, Map_layer/martian_map)</small>}
      {base === "slope" && <small className="muted">Slope classes: GO &lt; 15°, caution 15–25°, NO-GO ≥ 25° (team assumptions, 3 m DEM slope).</small>}
    </div>
  );
}
