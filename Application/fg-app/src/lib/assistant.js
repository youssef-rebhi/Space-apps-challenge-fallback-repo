// Mission assistant. It answers ONLY from the mission data on screen (stops, AI, oxygen, sensors),
// so it cannot invent facts. Rule-based for the demo; an LLM could be plugged in later
// with this same context.
import { hazardText } from "./mission.js";
import { hm } from "./safety.js";

const has = (q, words) => words.some((w) => q.includes(w));

export function answer(raw, c) {
  const q = (raw || "").toLowerCase();
  const stop = c.stop;
  const where = stop ? `stop sol ${stop.sol}` : "this stop";

  if (has(q, ["safe", "can i go", "go?", "should i", "nemchi", "najem", "est-ce que", "danger", "risk"]))
    return `${where}: ${c.colour.toUpperCase()}. ${c.advice}${c.cert != null ? ` AI certainty ${Math.round(c.cert * 100)} percent.` : ""}`;
  if (has(q, ["sure", "certain", "confiden", "trust"]))
    return c.cert == null ? "No AI result here." : `AI certainty ${Math.round(c.cert * 100)} percent, from ${c.certSrc}.${c.cert < 0.75 ? " That is low: send the scout first." : ""}`;
  if (has(q, ["scout", "drone", "robot"]))
    return c.live ? `The scout already checked ${where}: ${c.live.verdict.label.toLowerCase()}.` : c.adviceScout ? "Yes. Send the scout to this stop before you walk there." : "Not needed here, but you can send it to confirm.";
  if (has(q, ["oxygen", "o2", "air", "oxyg"]))
    return c.o2Left != null ? `Oxygen left: ${hm(c.o2Left)}, not counting the 30 minute reserve.` : c.plan ? `Plan needs ${hm(c.plan.need)}. You have ${hm(c.plan.o2)} of oxygen before the reserve. ${c.plan.go ? "GO." : "NO GO."}` : "Add at least 2 stops to plan oxygen.";
  if (has(q, ["back", "return", "turn", "time", "how long", "rjou", "retour"]))
    return c.back != null ? (c.back <= 0 ? "Turn back now." : `Turn back in ${hm(c.back)}.`) : c.plan ? `Round trip needs ${hm(c.plan.need)}; limit ${hm(c.plan.limit)} set by ${c.plan.by}.` : "Add stops to the route first.";
  if (has(q, ["sand", "rock", "ground", "terrain", "ramel", "sable"]))
    return stop ? `Ground at ${where}: ${hazardText(c.eff).toLowerCase()}. Sand ${Math.round((c.eff.sand_pct ?? 0) * 100)} percent, big rocks ${Math.round((c.eff.bigrock_pct ?? 0) * 100)} percent${c.live ? ", from the scout" : ", from our AI on the Curiosity photo"}.` : "No stop selected.";
  if (has(q, ["far", "distance", "next", "where", "9adech", "loin"]))
    return c.distNext != null ? `Next stop is ${Math.round(c.distNext)} metres away.` : "Select stops on the map.";
  if (has(q, ["temp", "cold", "hot", "froid", "bard"]))
    return c.env ? `Air about ${c.env.tempC} degrees Celsius. Simulated, in the range Curiosity measured.` : "No reading.";
  if (has(q, ["radiation", "rad", "dose"]))
    return c.env ? `Radiation about ${c.env.radMsvDay} millisievert per day. Simulated, based on Curiosity RAD.` : "No reading.";
  if (has(q, ["help", "what can", "aide"]))
    return "Ask me: can I go, is the AI sure, oxygen, when to turn back, sand, next stop, temperature, radiation.";
  return "I only answer about this mission: ask can I go, oxygen, turn back, sand, scout, next stop, temperature or radiation.";
}
