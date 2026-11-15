// Mission assistant. It answers ONLY from the mission data on screen (stops, AI, oxygen, sensors),
// so it cannot invent facts. Rule-based for the demo; an LLM can be plugged in later
// with this same context (see README).
import { hazardText } from "./mission.js";
import { hm } from "./safety.js";

const has = (q, words) => words.some((w) => q.includes(w));

export function answer(raw, c) {
  const q = (raw || "").toLowerCase();
  const stop = c.stop;
  const where = stop ? (stop.sol != null && !stop.grey && !stop.custom ? `stop sol ${stop.sol}` : stop.custom ? "your point" : "this unexplored area") : "this stop";

  if (has(q, ["why", "3lech", "pourquoi", "this route", "chose", "choose"]))
    return c.why || "This route was planned on the team GO/NO-GO map with the Safest weights: it keeps to firm ground and never crosses NO-GO ground.";
  if (!has(q, ["back", "return"]) && has(q, ["turn", "left", "right", "direction", "which way", "straight", "nav"]))
    return c.turnTxt || "Keep straight on the path.";
  if (has(q, ["danger", "ahead", "khatar", "hazard"]))
    return c.aheadTxt || "Next 20 metres: firm GO ground on the team map.";
  if (has(q, ["sos", "help me", "emergency", "fell", "hurt"]))
    return "Say I'm OK if you are fine. If you do not answer within 15 seconds after a fall, the helmet sends an SOS with your position to mission control by itself.";
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
    return "Ask me: why this route, next turn, danger ahead, can I go, is the AI sure, oxygen, when to turn back, sand, next stop, temperature, radiation.";
  return "I only answer about this mission: ask can I go, oxygen, turn back, sand, scout, next stop, temperature or radiation.";
}

// ── Conversation with actions (helmet). It understands an intention, ASKS before acting, then acts.
// Rule-based and offline; every number comes from the mission data in ctx.
const YES = ["yes", "yeah", "yep", "ok", "okay", "sure", "do it", "go ahead", "please", "oui", "ey", "ih", "eh", "aye", "confirm", "affirm"];
const NO = ["no", "nope", "non", "le", "la ", "cancel", "don't", "dont", "not now", "stop it"];
const word = (q, w) => new RegExp(`(^|[^a-z])${w.trim()}([^a-z]|$)`).test(q);
const isYes = (q) => YES.some((w) => word(q, w)) && !NO.some((w) => word(q, w));
const isNo = (q) => NO.some((w) => word(q, w)) || q.trim() === "la";

const HOME_WORDS = ["go back", "going back", "back to start", "back to the start", "back home", "back to base", "go home", "take me home", "take me back", "bring me back",
  "return to", "head home", "head back", "turn around", "home", "base", "starting point", "start point", "abort",
  "nraja", "nrja", "rja3", "raja3", "rawa7", "rawah", "nrawa7", "nrawah", "retour", "rentrer", "revenir", "rebrousser"];
const TIME_Q = ["when", "how long", "how much time", "9adech", "kadech", "quand", "turn back in", "turn back?"];
const UNWELL = ["tired", "exhausted", "dizzy", "not feeling", "feel sick", "sick", "ta3ban", "ta3bet", "fatigu", "nausea", "headache", "pain", "hurt", "cold hands"];
const URGENT = ["can't breathe", "cant breathe", "no air", "leak", "suit is", "pressure", "mayday", "bleeding", "broken", "fell down", "i fell"];
const LOST = ["lost", "where am i", "win ena", "perdu", "où suis", "ou suis", "which way home"];
const PAUSE = ["pause", "stop walking", "wait here", "hold on", "rest", "break", "nostanna", "stanna"];
const SCI = ["sample", "science", "drill", "rock to take", "interesting", "what's nearby", "whats nearby", "near me"];

export function respond(raw, c, pending) {
  const q = (raw || "").toLowerCase().replace(/[’']/g, "'");
  // 1) an answer to my last question
  if (pending) {
    if (isYes(q)) return { text: pending.yes(c), act: pending.act };
    if (isNo(q)) return { text: pending.no || "OK. Continuing the walk." };
  }
  // 2) emergencies first
  if (URGENT.some((w) => q.includes(w)))
    return { text: "This sounds urgent. Do you want me to send an SOS with your position to mission control now?", ask: { act: { type: "sos", reason: raw }, yes: () => "SOS sent. Stay where you are, breathe slowly. Mission control has your position.", no: "OK, no SOS. Say SOS at any time and I will send it." } };
  // 3) going back to the start
  const wantsHome = HOME_WORDS.some((w) => q.includes(w)) || (word(q, "back") && !q.includes("turn back in"));
  const advise = /(should i|do i need|do i have to|must i|lazem)/.test(q);
  const timeQ = TIME_Q.some((w) => q.includes(w)) && !advise && !/(i want|i wanna|take me|let's|lets|bring me|nheb|n7eb|je veux)/.test(q);
  if (wantsHome && /(how far|distance|9adech|kadech|combien)/.test(q))
    return { text: `The start is about ${c.home?.m ?? "?"} metres away on the safe path, ${c.home?.min ?? "?"} minutes walking.` };
  if (wantsHome && !timeQ) {
    if (c.home?.atStart) return { text: "You are already at the start." };
    if (c.home?.going) return { text: `You are already on the way back. ${c.home.m} metres to go. ${c.turnTxt || ""}` };
    const pre = advise ? (c.back != null && c.back > 0 ? `You do not have to yet: turn-back is in ${hm(c.back)}. ` : "Yes, it is time to go back. ") : "";
    return { text: `${pre}Do you want to go back to the start? It is about ${c.home?.m ?? "?"} metres, ${c.home?.min ?? "?"} minutes on the safe path. Say yes or no.`,
      ask: { act: { type: "home" }, yes: (cc) => homeAdvice(cc), no: `OK, we keep going to ${c.goal || "the next stop"}.` } };
  }
  // 4) not feeling well
  if (UNWELL.some((w) => q.includes(w)))
    return { text: `Stop and rest a minute, breathe slowly. You are ${c.home?.m ?? "?"} metres from the start. Do you want to go back now?`,
      ask: { act: { type: "home", reason: "astronaut not feeling well" }, yes: (cc) => "Going back. " + homeAdvice(cc) + " Mission control has been told.", no: "OK. Rest, then continue slowly. Tell me if it gets worse." } };
  // 5) lost
  if (LOST.some((w) => q.includes(w)))
    return { text: c.home?.going ? `You are on the way back, ${Math.round(c.distGoal ?? c.home.m)} metres from the start. ${c.turnTxt || "Follow the arrow at the top of the visor."}`
      : `You are ${c.home?.m ?? "?"} metres from the start and ${Math.round(c.distGoal ?? c.distNext ?? 0)} metres from ${c.goal || "the next stop"}. ${c.turnTxt || "Follow the arrow at the top of the visor."}` };
  // 6) pause
  if (PAUSE.some((w) => q.includes(w)) && !q.includes("where"))
    return { text: "Walk paused. Say continue when you are ready.", act: { type: "pause" } };
  if (/(continue|resume|keep going|go on|yalla)/.test(q)) return { text: `Continuing to ${c.goal || "the next stop"}. ${c.turnTxt || ""}`, act: { type: "resume" } };
  // 7) science near me → offer a detour
  if (SCI.some((w) => q.includes(w)) || (c.sciNear && q.includes(c.sciNear.name.toLowerCase().split(" ")[0]))) {
    const s = c.sciNear;
    if (!s) return { text: "No science target within 300 metres. The nearest ones are on the map with a microscope icon." };
    return { text: `${s.name} is ${s.m} metres away${s.side ? `, ${s.side}` : ""}. ${s.why} Do you want to add it to your route?`,
      ask: { act: { type: "detour", key: s.key }, yes: () => `Added. Walk to ${s.name}. Take: ${s.samples}.`, no: "OK, no detour." } };
  }
  // 8) everything else: the data answers
  return { text: answer(raw, c) };
}

function homeAdvice(c) {
  const h = c.home || {}, tips = [];
  tips.push(`Route home set: ${h.m} metres, about ${h.min} minutes.`);
  if (h.o2Min != null) tips.push(h.o2Min >= h.min ? `Oxygen is enough: ${h.o2Min} minutes before the reserve.` : `Oxygen is tight: only ${h.o2Min} minutes before the reserve. Walk steadily, do not stop.`);
  if (h.goPct != null) tips.push(h.goPct >= 90 ? `The way back is ${h.goPct} percent firm ground.` : `The way back is ${h.goPct} percent firm ground: slow, short steps on the caution parts.`);
  tips.push("Follow the arrows; I will tell you each turn.");
  return tips.join(" ");
}
