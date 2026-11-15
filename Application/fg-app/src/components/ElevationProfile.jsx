import { useMemo, useState, useRef } from "react";
import { dist } from "../lib/mission.js";
import { elevAt } from "../lib/geo.js";

// Interactive bottom-docked elevation profile chart with slope cross-section,
// cumulative gain/loss, metabolic O2 cost multiplier, and map synchronization.
export default function ElevationProfile({ routePts = [], geo = null, stops = [], onHoverCoord = null, hoveredCoord = null }) {
  const [hoverDist, setHoverDist] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const svgRef = useRef(null);

  // Compute profile points: distance, elevation, slope, terrain class, metabolic multiplier
  const data = useMemo(() => {
    if (!routePts || routePts.length < 2 || !geo?.elev) return null;

    const pts = [];
    let cumDist = 0;
    let gain = 0;
    let loss = 0;
    let minElev = Infinity;
    let maxElev = -Infinity;
    let multSum = 0;

    for (let i = 0; i < routePts.length; i++) {
      const p = routePts[i];
      if (i > 0) {
        cumDist += dist(routePts[i - 1], p);
      }

      let z = p.elev != null ? p.elev : elevAt(geo.elev, p.lat, p.lon);
      if (z == null && pts.length > 0) z = pts[pts.length - 1].elev;
      if (z == null) z = -4400; // default Gale boxwork baseline

      if (z < minElev) minElev = z;
      if (z > maxElev) maxElev = z;

      let slope = 0;
      if (i > 0) {
        const d = dist(routePts[i - 1], p);
        const dz = z - pts[i - 1].elev;
        if (dz > 0) gain += dz;
        else loss += Math.abs(dz);
        slope = d > 0 ? (Math.atan(Math.abs(dz) / d) * 180) / Math.PI : 0;
      }

      // Check map safety class and nearby sand
      const mapClass = geo.mapAt ? geo.mapAt(p.lat, p.lon) : (slope >= 25 ? 3 : slope >= 15 ? 2 : 1);
      const isSandNear = stops.some((s) => s.sand_pct >= 0.1 && dist(s, p) < 20);

      // Metabolic multiplier: baseline 1.0 + uphill effort + loose sand
      const uphillEffort = slope > 0 ? (slope / 15) * 0.25 : 0;
      const sandPenalty = isSandNear ? 0.35 : 0;
      const multiplier = 1.0 + uphillEffort + sandPenalty;
      multSum += multiplier;

      // Color classification: GO (< 15°), Caution (15-25°), NO-GO (≥ 25°)
      let color = "#1a9850"; // GO green
      let safetyLabel = "GO (firm)";
      if (slope >= 25 || mapClass === 3) {
        color = "#d73027"; // NO-GO red
        safetyLabel = "NO-GO (steep ≥ 25°)";
      } else if (slope >= 15 || mapClass === 2 || isSandNear) {
        color = "#f4c430"; // Caution amber
        safetyLabel = isSandNear ? "Caution (sand)" : "Caution (slope 15–25°)";
      }

      pts.push({
        lat: p.lat,
        lon: p.lon,
        dist: cumDist,
        elev: z,
        slope,
        color,
        safetyLabel,
        multiplier,
      });
    }

    if (minElev === Infinity) minElev = -4450;
    if (maxElev === -Infinity) maxElev = -4400;
    if (maxElev - minElev < 8) {
      maxElev += 4;
      minElev -= 4;
    }

    const avgMultiplier = pts.length ? multSum / pts.length : 1.0;

    return {
      pts,
      totalDist: cumDist,
      gain,
      loss,
      minElev,
      maxElev,
      avgMultiplier,
    };
  }, [routePts, geo, stops]);

  if (!data || data.pts.length < 2) return null;

  const { pts, totalDist, gain, loss, minElev, maxElev, avgMultiplier } = data;
  const W = 800;
  const H = 100;
  const padX = 40;
  const padY = 16;
  const plotW = W - padX - 16;
  const plotH = H - padY * 2;

  const scaleX = (d) => padX + (totalDist > 0 ? (d / totalDist) * plotW : 0);
  const scaleY = (z) => H - padY - ((z - minElev) / (maxElev - minElev)) * plotH;

  // Active hover point
  let activePt = null;
  if (hoverDist != null) {
    let closestD = Infinity;
    for (const p of pts) {
      const d = Math.abs(p.dist - hoverDist);
      if (d < closestD) {
        closestD = d;
        activePt = p;
      }
    }
  }

  const handleMouseMove = (e) => {
    if (!svgRef.current || totalDist <= 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const normX = Math.max(0, Math.min(1, (clientX - (padX / W) * rect.width) / ((plotW / W) * rect.width)));
    const targetDist = normX * totalDist;
    setHoverDist(targetDist);

    // Find closest point and broadcast
    let closestPt = pts[0];
    let minD = Infinity;
    for (const p of pts) {
      const diff = Math.abs(p.dist - targetDist);
      if (diff < minD) {
        minD = diff;
        closestPt = p;
      }
    }
    if (onHoverCoord) {
      onHoverCoord(closestPt);
    }
  };

  const handleMouseLeave = () => {
    setHoverDist(null);
    if (onHoverCoord) onHoverCoord(null);
  };

  // Build SVG path segments with color classification
  const segments = [];
  for (let i = 1; i < pts.length; i++) {
    const x1 = scaleX(pts[i - 1].dist);
    const y1 = scaleY(pts[i - 1].elev);
    const x2 = scaleX(pts[i].dist);
    const y2 = scaleY(pts[i].elev);
    segments.push({
      x1,
      y1,
      x2,
      y2,
      color: pts[i].color,
    });
  }

  // Base polygon for background fill
  const polyPoints = [
    `${scaleX(0)},${H - padY}`,
    ...pts.map((p) => `${scaleX(p.dist)},${scaleY(p.elev)}`),
    `${scaleX(totalDist)},${H - padY}`,
  ].join(" ");

  return (
    <div className={`elev-dock ${collapsed ? "collapsed" : ""}`}>
      <div className="elev-header">
        <div className="elev-title">
          <span className="elev-icon">📈</span>
          <b>Elevation &amp; Slope Profile</b>
          <span className="elev-summary">
            Traverse: <b>{Math.round(totalDist)} m</b> · Gain: <b className="gain">+{Math.round(gain)} m</b> · Loss: <b className="loss">-{Math.round(loss)} m</b> · Metabolic Multiplier: <b>{avgMultiplier.toFixed(2)}×</b>
          </span>
        </div>
        <button className="elev-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand Elevation Profile" : "Collapse Profile"}>
          {collapsed ? "▲ Show Profile" : "▼ Hide"}
        </button>
      </div>

      {!collapsed && (
        <div className="elev-body">
          <div className="elev-svg-container" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="elev-svg">
              <defs>
                <linearGradient id="elevFillGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3cff8f" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#1a9850" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Background terrain polygon */}
              <polygon points={polyPoints} fill="url(#elevFillGrad)" />

              {/* Elevation grid & labels */}
              <line x1={padX} y1={scaleY(minElev)} x2={W - 16} y2={scaleY(minElev)} stroke="#444" strokeDasharray="3 3" strokeWidth="0.8" />
              <text x={padX - 6} y={scaleY(minElev) + 3} textAnchor="end" fill="#888" fontSize="10">{Math.round(minElev)}m</text>

              <line x1={padX} y1={scaleY(maxElev)} x2={W - 16} y2={scaleY(maxElev)} stroke="#444" strokeDasharray="3 3" strokeWidth="0.8" />
              <text x={padX - 6} y={scaleY(maxElev) + 4} textAnchor="end" fill="#888" fontSize="10">{Math.round(maxElev)}m</text>

              {/* Baseline */}
              <line x1={padX} y1={H - padY} x2={W - 16} y2={H - padY} stroke="#555" strokeWidth="1" />

              {/* Colored route segments */}
              {segments.map((s, idx) => (
                <line key={idx} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth="3.5" strokeLinecap="round" />
              ))}

              {/* Active hover crosshair */}
              {activePt && (
                <g className="elev-hover-group">
                  <line x1={scaleX(activePt.dist)} y1={padY} x2={scaleX(activePt.dist)} y2={H - padY} stroke="#fff" strokeWidth="1.5" strokeDasharray="2 2" />
                  <circle cx={scaleX(activePt.dist)} cy={scaleY(activePt.elev)} r="4.5" fill="#fff" stroke={activePt.color} strokeWidth="2.5" />
                </g>
              )}
            </svg>
          </div>

          {/* Hover Status Bar / Telemetry Indicator */}
          <div className="elev-telemetry">
            {activePt ? (
              <span className="hud-pill">
                Dist: <b>{Math.round(activePt.dist)} m</b> · Elev: <b>{Math.round(activePt.elev)} m</b> · Slope: <b>{activePt.slope.toFixed(1)}°</b> · Status: <span style={{ color: activePt.color }}>● {activePt.safetyLabel}</span> · O₂ Load: <b>{activePt.multiplier.toFixed(2)}×</b>
              </span>
            ) : (
              <span className="hud-hint">
                Hover cursor along profile to inspect elevation, slope gradient, and localized metabolic O₂ loading
              </span>
            )}
            <div className="elev-legend">
              <span><i style={{ background: "#1a9850" }} /> GO (&lt;15°)</span>
              <span><i style={{ background: "#f4c430" }} /> Caution (15–25°/sand)</span>
              <span><i style={{ background: "#d73027" }} /> NO-GO (≥25°)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
