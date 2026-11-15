// Science targets on the boxwork.
// Default: NASA science sites (data/science_sites.json, from Youssef's Layer 5). Fallback below: our Curiosity stops. The TYPE is chosen by our team from our AI result:
//   ridge  = mostly bedrock, almost no sand  (the mineral-hardened ridges)
//   hollow = clear sand                      (the sandy depressions between ridges)
// Team-chosen targets in data/science_targets.json ({sol, type, name, why}) replace the automatic ones.
// "Why" texts summarise NASA's Curiosity boxwork findings (see README / sources).
import { DATA } from "./mission.js";

export const WHY = {
  ridge: "Boxwork ridge: groundwater once left minerals in the cracks; they hardened and stayed when wind wore the rock away. Look for mineral veins and pea-size nodules. Curiosity's team looks in cemented ridges for organic molecules and signs of an ancient habitable environment.",
  hollow: "Sandy hollow between ridges: the low ground where sand collects. The floor can also hold mineral nodules from old groundwater. Science here means soft ground: go slowly.",
};
export const LABEL = { ridge: "Boxwork ridge", hollow: "Boxwork hollow", contact: "Geologic contact", crystals: "Possible crystals" };

// Open questions NASA's Curiosity team has stated about the boxwork (paraphrased; sources in README)
export const OPEN = {
  ridge: [
    "Why did the ridges harden into these big patterns, and why only here on Mount Sharp?",
    "Groundwater seems to have flowed here later than expected: for how long?",
    "Do the cemented ridges keep organic molecules or other signs of an old habitable environment?",
  ],
  hollow: [
    "How did such a wide network of ridges and hollows form?",
    "Groundwater seems to have flowed here later than expected: for how long?",
  ],
};

// What a person can do here that a rover does slowly or not at all (our idea, not a NASA statement)
export const HUMAN = "A rover drills a few holes in months and analyses on board. An astronaut can look around, choose by eye, take many small samples in minutes and bring them home to Earth labs.";

export const SAMPLES = {
  ridge: ["Chip of the ridge cement, with a vein if you see one", "A nodule from the ridge top", "Photo with a scale bar; note ridge height and direction"],
  hollow: ["Scoop of floor sand (top 5 cm)", "Nodules lying on the floor", "Photo of the ridge-to-hollow contact"],
};

let teamCache;
export async function loadTeamTargets() {
  if (teamCache !== undefined) return teamCache;
  try { const r = await fetch(DATA + "science_targets.json"); teamCache = r.ok ? await r.json() : null; } catch { teamCache = null; }
  return teamCache;
}

// Up to 3 ridges (most bedrock, AI sure) + 2 hollows (most sand), spread out (≥ 40 m apart)
export function autoTargets(stops, distFn) {
  const sure = (s) => (s.certainty ?? 1) >= 0.75;
  const pick = (list, n) => {
    const out = [];
    for (const s of list) { if (out.length >= n) break; if (out.every((o) => distFn(o, s) >= 40)) out.push(s); }
    return out;
  };
  const ridges = pick(stops.filter((s) => s.sand_pct != null && s.bedrock_pct >= 0.8 && s.sand_pct < 0.05 && sure(s)).sort((a, b) => b.bedrock_pct - a.bedrock_pct), 3);
  const hollows = pick(stops.filter((s) => s.sand_pct >= 0.1).sort((a, b) => b.sand_pct - a.sand_pct), 2);
  return [
    ...ridges.map((s) => ({ lat: s.lat, lon: s.lon, sol: s.sol, type: "ridge", name: `Ridge at sol ${s.sol}`, why: WHY.ridge, auto: true, basis: `bedrock ${Math.round(s.bedrock_pct * 100)}%, sand ${Math.round(s.sand_pct * 100)}% (our AI)` })),
    ...hollows.map((s) => ({ lat: s.lat, lon: s.lon, sol: s.sol, type: "hollow", name: `Hollow at sol ${s.sol}`, why: WHY.hollow, auto: true, basis: `sand ${Math.round(s.sand_pct * 100)}% (our AI)` })),
  ];
}

// NASA science sites in the box (Youssef's Layer 5 POIs: drill sites and targets named by NASA's Curiosity team)
let siteCache;
export async function loadSites() {
  if (siteCache !== undefined) return siteCache;
  try { const r = await fetch(DATA + "science_sites.json"); siteCache = r.ok ? (await r.json()).sites : null; } catch { siteCache = null; }
  return siteCache;
}

export async function scienceTargets(stops, distFn) {
  const sites = await loadSites();
  if (Array.isArray(sites) && sites.length) return sites.map((x) => ({ ...x, type: x.kind, why: x.what, nasa: true, key: x.id }));
  const team = await loadTeamTargets();
  const withPos = (t) => { const st = stops.find((s) => s.sol === t.sol); return st ? { lat: st.lat, lon: st.lon, ...t } : t; };
  if (Array.isArray(team) && team.length) return team.map((t) => withPos({ ...t, why: t.why || WHY[t.type] || "", auto: false, key: "t" + t.sol }));
  return autoTargets(stops, distFn).map((t) => ({ ...t, key: "t" + t.sol }));
}

// the science target at a point (within r metres), if any
export const siteNear = (p, targets, distFn, r = 12) => (p && p.lat != null ? targets.find((t) => t.lat != null && distFn(p, t) <= r) : null) || null;
export const openOf = (t) => t.open || OPEN[t.type] || OPEN.ridge;
export const samplesOf = (t) => t.samples || SAMPLES[t.type] || SAMPLES.ridge;
