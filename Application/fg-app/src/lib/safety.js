// Certainty, oxygen GO/NO-GO and (simulated) live sensors.
// Every number here is a TEAM ASSUMPTION or a value from a NASA source named next to it.
import { colourOf, dist } from "./mission.js";

// ---------- suit & walk (assumptions) ----------
export const SPEED = 0.8;          // m/s walking in a suit (team assumption)
export const RETURN_FACTOR = 1.2;  // the way back is 20% longer than a straight line (assumption)
export const O2_H = 8;             // suit oxygen, hours. NASA ISS EMU: about 6.5-8 h + 30 min reserve
export const RESERVE_MIN = 30;     // never plan into the 30-min reserve (NASA ISS EVA planning keeps 30 min reserve)
export const STOP_MIN = 15;        // time spent working at each stop (assumption)
export const START_HOUR = 9;       // EVA starts 09:00 local Mars time (assumption)
export const UNSURE = 0.75;        // below this certainty the AI asks for the scout first (assumption)

// ---------- AI certainty ----------
// If stops.json has "certainty" (from our model's probabilities, Colab cell), use it.
// Otherwise ESTIMATE it from how far the stop is from our colour thresholds:
// sand 8% is close to the 10% line → unsure; sand 0% → sure.
export function certaintyOf(s, live) {
  if (live) return { v: 0.95, src: "live scout reading" };
  if (!s || s.sand_pct == null) return { v: 0, src: "no data" };
  if (s.certainty != null) return { v: s.certainty, src: "model probability" };
  const sand = s.sand_pct, rock = s.bigrock_pct ?? 0;
  const mSand = Math.min(Math.abs(sand - 0.1), Math.abs(sand - 0.3)) / 0.1;
  const mRock = Math.abs(rock - 0.02) / 0.02;
  const m = Math.max(0, Math.min(1, Math.min(mSand, mRock)));
  return { v: 0.5 + 0.5 * m, src: "estimate: distance to thresholds" };
}

// Live reading (scout) replaces the stored AI result: newer and on site.
export function effective(s, live) {
  return live ? { ...s, sand_pct: live.sand_pct, bigrock_pct: live.bigrock_pct } : s;
}

// Final colour shown to the astronaut. Team rule: green = GO with HIGH certainty,
// orange = risky / LOWER certainty. So a green stop the AI is unsure about becomes orange.
export function finalColour(s, live) {
  const e = effective(s, live), c = colourOf(e), cert = certaintyOf(s, live).v;
  if (c === "green" && cert < UNSURE) return "orange";
  return c;
}

export function advice(s, live) {
  const e = effective(s, live), c = colourOf(e), cert = certaintyOf(s, live).v;
  if (c === "grey") return { text: "No data here. Send the scout first.", scout: true };
  if (c === "red") return { text: e.slope_class === 3 && !(e.sand_pct > 0.3 || e.bigrock_pct > 0.02) ? "Don't go. Slope 25° or more (team DEM)." : "Don't go. Too much sand or big rocks.", scout: false };
  if (!live && cert < UNSURE) return { text: "The AI is not sure here. Better send the scout before you go.", scout: true };
  if (c === "orange") return { text: e.slope_class === 2 && e.sand_pct < 0.1 ? "Risky: slope 15–25°. Slow steps, go only with extreme care." : "Risky: go only with extreme care, slow steps, stay on rock.", scout: !live };
  return { text: live ? "GO. Confirmed by the scout." : "GO. Firm ground, AI is confident.", scout: false };
}

// ---------- oxygen / mission GO-NO-GO ----------
export function routeMetres(stops) {
  let m = 0;
  for (let i = 1; i < stops.length; i++) m += dist(stops[i - 1], stops[i]);
  return m;
}

// Plan check on the tablet, before leaving
export function missionCheck(stops, evaMin) {
  if (stops.length < 2) return null;
  const out = routeMetres(stops) / SPEED;
  const back = (dist(stops[stops.length - 1], stops[0]) * RETURN_FACTOR) / SPEED;
  const work = STOP_MIN * 60 * stops.filter((x) => !x.via).length; // no work stop at path points
  const need = out + work + back;
  const o2 = O2_H * 3600 - RESERVE_MIN * 60;
  const limit = Math.min(evaMin * 60, o2);
  return { need, limit, o2, go: need <= limit, by: o2 < evaMin * 60 ? "oxygen" : "EVA time" };
}

// Live, in the helmet
export function o2LeftS(elapsedS) { return O2_H * 3600 - elapsedS; }

// ---------- simulated environment sensors ----------
// SIMULATED values in the range measured by Curiosity in Gale crater:
// REMS air temperature about -70 °C before dawn to a few °C above 0 in the afternoon;
// RAD dose about 0.67 mSv/day at the surface (Hassler et al., Science 2014).
export function envAt(elapsedS, seed = 0) {
  const hour = START_HOUR + elapsedS / 3600;
  const tempC = -35 + 37 * Math.sin(((hour - 8) / 24) * 2 * Math.PI) + 2 * Math.sin(seed * 1.7);
  const radMsvDay = 0.67 * (1 + 0.04 * Math.sin(seed * 3.1 + elapsedS / 900));
  return { tempC: Math.round(tempC), radMsvDay: +radMsvDay.toFixed(2), hour };
}

export const hm = (s) => (s <= 0 ? "0h00" : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`);
