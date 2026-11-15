// Export tools for Marsouine Martian EVA mission packages: GeoJSON, GPX, and Printable Briefing.
import { dist } from "./mission.js";
import { hm, O2_H, RESERVE_MIN } from "./safety.js";

export function exportGeoJSON(routeOpt, waypoints = [], abortData = null, targets = []) {
  if (!routeOpt || !routeOpt.pts || !routeOpt.pts.length) return;
  const features = [];

  // 1. Primary planned traverse
  features.push({
    type: "Feature",
    properties: {
      name: routeOpt.label || "Marsouine Planned Traverse",
      type: "planned_traverse",
      distance_m: Math.round(routeOpt.len || 0),
      walk_minutes: Math.round(routeOpt.minutes || 0),
      go_percent: routeOpt.goPct ?? 100,
      caution_m: Math.round(routeOpt.caution || 0),
      color: routeOpt.colour || "#3cff8f",
    },
    geometry: {
      type: "LineString",
      coordinates: routeOpt.pts.map((p) => [p.lon, p.lat, p.elev != null ? +p.elev.toFixed(1) : 0]),
    },
  });

  // 2. Abort Corridors
  if (abortData?.abortPaths) {
    abortData.abortPaths.forEach((ap, idx) => {
      features.push({
        type: "Feature",
        properties: {
          name: `Emergency Abort Corridor W${ap.fromIndex} -> Lander`,
          type: "abort_corridor",
          from_waypoint: ap.fromIndex,
          distance_m: Math.round(ap.dist || 0),
          minutes: Math.round(ap.minutes || 0),
          past_pnr: !!ap.pastPNR,
        },
        geometry: {
          type: "LineString",
          coordinates: ap.pts.map((p) => [p.lon, p.lat]),
        },
      });
    });
  }

  // 3. Waypoint Points
  waypoints.forEach((wp, idx) => {
    features.push({
      type: "Feature",
      properties: {
        name: wp.label || (idx === 0 ? "W0 (Lander / Base)" : `W${idx}`),
        index: idx,
        type: idx === 0 ? "base" : "waypoint",
      },
      geometry: {
        type: "Point",
        coordinates: [wp.lon, wp.lat],
      },
    });
  });

  // 4. Science Targets nearby
  targets.forEach((t) => {
    if (t.lat == null) return;
    features.push({
      type: "Feature",
      properties: {
        name: t.name,
        type: "science_target",
        science_type: t.type,
        why: t.why,
      },
      geometry: {
        type: "Point",
        coordinates: [t.lon, t.lat],
      },
    });
  });

  const geojson = {
    type: "FeatureCollection",
    metadata: {
      generator: "Marsouine · Martian Map EVA System",
      site: "Mount Sharp, Gale Crater, Mars (boxwork region)",
      timestamp: new Date().toISOString(),
      coordinate_system: "Mars IAU 2000 / USGS Gale DEM 1m",
    },
    features,
  };

  downloadFile("marsouine_mission_traverse.geojson", JSON.stringify(geojson, null, 2), "application/geo+json");
}

export function exportGPX(routeOpt, waypoints = []) {
  if (!routeOpt || !routeOpt.pts || !routeOpt.pts.length) return;

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Marsouine Martian EVA Navigation" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(routeOpt.label || "Marsouine Martian Traverse")}</name>
    <desc>Martian Surface EVA Traverse at Mount Sharp, Gale Crater</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
`;

  // Waypoints
  waypoints.forEach((wp, idx) => {
    gpx += `  <wpt lat="${wp.lat.toFixed(7)}" lon="${wp.lon.toFixed(7)}">
    <name>${escapeXml(wp.label || (idx === 0 ? "W0-Base" : `W${idx}`))}</name>
    <sym>${idx === 0 ? "Lander" : "Flag"}</sym>
  </wpt>\n`;
  });

  // Track
  gpx += `  <trk>
    <name>${escapeXml(routeOpt.label || "EVA Traverse")}</name>
    <trkseg>\n`;

  routeOpt.pts.forEach((pt) => {
    const eleTag = pt.elev != null ? `<ele>${pt.elev.toFixed(1)}</ele>` : "";
    gpx += `      <trkpt lat="${pt.lat.toFixed(7)}" lon="${pt.lon.toFixed(7)}">${eleTag}</trkpt>\n`;
  });

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  downloadFile("marsouine_mission_traverse.gpx", gpx, "application/gpx+xml");
}

export function printMissionBriefing({ routeOpt, waypoints = [], plan = null, elevStats = null, abortData = null, targets = [] }) {
  if (!routeOpt) return;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return alert("Please allow pop-ups to open the printable EVA Mission Briefing.");

  const totalDist = Math.round(routeOpt.len || 0);
  const walkMin = Math.round(routeOpt.minutes || 0);
  const scienceStops = waypoints.length > 2 ? waypoints.length - 2 : 0;
  const workMin = scienceStops * 15;
  const estTotalMin = walkMin + workMin;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>EVA Mission Traverse Briefing · Marsouine</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 24px; color: #111; line-height: 1.45; }
    h1 { margin-bottom: 2px; font-size: 22px; text-transform: uppercase; letter-spacing: 0.5px; }
    .subtitle { color: #555; margin-top: 0; font-size: 13px; margin-bottom: 20px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
    .badge-go { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .badge-caution { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
    .badge-nogo { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    th { background: #f7f7f7; font-weight: 600; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
    .card { border: 1px solid #ccc; border-radius: 6px; padding: 12px; background: #fafafa; }
    .card h3 { margin-top: 0; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    .metric { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
    .metric b { font-family: monospace; }
    .warn-box { border-left: 4px solid #ff9800; background: #fff8e1; padding: 8px 12px; margin: 12px 0; font-size: 12px; }
    @media print {
      body { margin: 10mm; font-size: 11pt; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px;">
    <button onclick="window.print()" style="padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer;">🖨 Print Briefing / Save as PDF</button>
    <button onclick="window.close()" style="padding: 8px 16px; margin-left: 8px; font-size: 14px; cursor: pointer;">Close</button>
  </div>

  <h1>Marsouine · Martian Surface EVA Briefing</h1>
  <div class="subtitle">Study Site: Gale Crater, Mount Sharp (Boxwork Region) · USGS 1 m DEM Reference</div>

  <div style="margin-bottom: 12px;">
    Traverse Status: <span class="badge ${routeOpt.goPct >= 80 ? "badge-go" : "badge-caution"}">${routeOpt.goPct}% GO Ground · ${routeOpt.label}</span>
    ${plan?.go ? '<span class="badge badge-go" style="margin-left: 8px;">✓ Consumables GO</span>' : '<span class="badge badge-nogo" style="margin-left: 8px;">⚠ Consumables Check Required</span>'}
  </div>

  <div class="grid2">
    <div class="card">
      <h3>Traverse Distance & Time</h3>
      <div class="metric"><span>Total Traverse Length:</span><b>${totalDist} m</b></div>
      <div class="metric"><span>Estimated Walk Time:</span><b>${walkMin} min (at 0.8 m/s)</b></div>
      <div class="metric"><span>Field Science Stops:</span><b>${scienceStops} stops (${workMin} min)</b></div>
      <div class="metric"><span>Estimated Total EVA:</span><b>${estTotalMin} min (${(estTotalMin / 60).toFixed(1)} h)</b></div>
      <div class="metric"><span>Oxygen Budget:</span><b>${O2_H} h (${RESERVE_MIN} min reserve)</b></div>
    </div>

    <div class="card">
      <h3>Topography & Safety Profile</h3>
      <div class="metric"><span>Elevation Gain:</span><b>+${Math.round(elevStats?.gain || 0)} m</b></div>
      <div class="metric"><span>Elevation Loss:</span><b>-${Math.round(elevStats?.loss || 0)} m</b></div>
      <div class="metric"><span>Elevation Range:</span><b>${Math.round(elevStats?.minElev || 0)} m to ${Math.round(elevStats?.maxElev || 0)} m</b></div>
      <div class="metric"><span>Average Metabolic Multiplier:</span><b>${elevStats?.avgMultiplier ? elevStats.avgMultiplier.toFixed(2) + "x" : "1.00x"}</b></div>
      <div class="metric"><span>Ground Firmness:</span><b>${routeOpt.goPct}% GO · ${Math.round(routeOpt.caution || 0)} m caution</b></div>
    </div>
  </div>

  ${abortData?.pnrIndex != null ? `
    <div class="warn-box">
      <b>Point of No Return (PNR):</b> Waypoint W${abortData.pnrIndex} is the mission turnaround boundary. Beyond this point, direct emergency return exceeds the planned EVA oxygen threshold.
    </div>
  ` : ""}

  <h3>Waypoint Manifest</h3>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Label / Objective</th>
        <th>Martian Lat</th>
        <th>Martian Lon</th>
        <th>Direct Leg</th>
        <th>Abort to Base</th>
      </tr>
    </thead>
    <tbody>
      ${waypoints.map((wp, i) => {
        const prev = i > 0 ? waypoints[i - 1] : null;
        const legDist = prev ? Math.round(dist(prev, wp)) : 0;
        const abortLeg = abortData?.abortPaths?.find((a) => a.fromIndex === i);
        return `<tr>
          <td><b>W${i}</b></td>
          <td>${escapeXml(wp.label || (i === 0 ? "Lander / Base (Start)" : `Waypoint ${i}`))}${wp.target ? ` · 🔬 ${escapeXml(wp.target.name)}` : ""}</td>
          <td>${wp.lat.toFixed(6)}°S</td>
          <td>${wp.lon.toFixed(6)}°E</td>
          <td>${i === 0 ? "–" : `${legDist} m`}</td>
          <td>${i === 0 ? "Base" : abortLeg ? `${Math.round(abortLeg.dist)} m (${Math.round(abortLeg.minutes)} min)${abortLeg.pastPNR ? " ⚠ PAST PNR" : " ✓"}` : "–"}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>

  <h3>Crew Safety & Rules of Engagement</h3>
  <ul style="font-size: 12px; color: #333;">
    <li><b>Slope Limits:</b> Maintain route within GO (< 15°) corridors. Exercise extreme caution in 15–25° transition zones. Slopes ≥ 25° are absolute NO-GO.</li>
    <li><b>Sand Hazards:</b> Keep minimum 15 m separation from AI-flagged loose sand dunes (> 30% sand fraction).</li>
    <li><b>Oxygen Buffer:</b> Maintain minimum ${RESERVE_MIN} minutes uncommitted reserve in suit primary PLSS.</li>
    <li><b>Scout Drone Validation:</b> If terrain condition along route is flagged UNKNOWN, deploy scout drone laser sounder before boot ingress.</li>
  </ul>

  <div style="margin-top: 30px; font-size: 11px; color: #777; border-top: 1px solid #ddd; padding-top: 8px;">
    Marsouine Martian Map System · NASA Space Apps Challenge 2026 · Gale Crater Boxwork EVA Traverse
  </div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
    }
  });
}
