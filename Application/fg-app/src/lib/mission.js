// Shared mission logic: data loading, our 4-colour rule, Mars distances.
// All thresholds are TEAM ASSUMPTIONS (also listed in ASSUMPTIONS.md).

export const DATA = "data/"; // stops.json + overlays/ live in public/data/
export const MARS_R = 3389500; // Mars mean radius, metres

export async function loadStops() {
  const r = await fetch(DATA + "stops.json");
  if (!r.ok) throw new Error("could not load data/stops.json");
  return r.json();
}

// Our 4 colours: green GO · orange careful · red don't go · grey no data
export function colourOf(s) {
  if (!s || s.sand_pct == null) return "grey";
  if (s.sand_pct > 0.3 || s.bigrock_pct > 0.02) return "red";
  if (s.sand_pct >= 0.1) return "orange";
  return "green";
}

export const COLOURS = { green: "#2e8b4a", orange: "#e07a1f", red: "#d43d3d", grey: "#9aa0a6" };

export function hazardText(s) {
  const c = colourOf(s);
  if (c === "grey") return "NO DATA";
  if (s.bigrock_pct > 0.02) return `ROCKS ${Math.round(s.bigrock_pct * 100)}%`;
  if (c === "green") return "FIRM";
  return `SAND ${Math.round(s.sand_pct * 100)}%`;
}

const rad = (d) => (d * Math.PI) / 180;
export function dist(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_R * Math.asin(Math.sqrt(h));
}

export function stepToward(a, b, m) {
  const d = dist(a, b);
  if (d <= m) return { lat: b.lat, lon: b.lon };
  const f = m / d;
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
}

export function say(text, on = true) {
  if (!on || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  speechSynthesis.speak(u);
}
