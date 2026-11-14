// SIMULATED "zap and listen" scout, inspired by NASA Perseverance SuperCam:
// a laser hits the ground and a microphone records the sound; the sound depends on hardness.
// Our simulation does NOT measure anything: it turns OUR AI result for that stop into a
// plausible sound, so the demo shows what a real scout would report.

// hardness 0 (loose sand) .. 1 (solid rock), from the AI percentages at the stop
export function hardnessOf(s) {
  const h = (s.bedrock_pct ?? 0) * 1 + (s.bigrock_pct ?? 0) * 1 + (s.soil_pct ?? 0) * 0.5 + (s.sand_pct ?? 0) * 0.1;
  return Math.max(0, Math.min(1, h));
}

// One laser shot: a damped ring. Hard ground → louder and rings longer; sand → weak, dies fast.
export function waveform(h, n = 400, seed = 1) {
  let x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280) - 0.5;
  const amp = 0.25 + 0.75 * h, decay = 4 + 26 * (1 - h), f = 18;
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    return amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * f * t) + 0.04 * rnd();
  });
}

// Energy of 30 shots on the same spot. SuperCam lab studies: the energy drop with the
// number of shots relates to hardness/density. Simulated: soft ground drops faster.
export function shotEnergies(h, shots = 30) {
  const e0 = 0.3 + 0.7 * h, k = 0.01 + 0.09 * (1 - h);
  return Array.from({ length: shots }, (_, i) => e0 * Math.exp(-k * i));
}

export function verdict(s) {
  const sand = s.sand_pct ?? 0;
  if (sand > 0.3) return { label: "SOFT SAND", colour: "red" };
  if (sand >= 0.1) return { label: "MIXED: CAREFUL", colour: "orange" };
  return { label: "HARD GROUND", colour: "green" };
}

// Play the simulated "zap" (needs a click first: browser rule)
export function playZap(h) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = new AC(), len = Math.floor(ac.sampleRate * 0.6);
  const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  const decay = 6 + 40 * (1 - h);
  for (let i = 0; i < len; i++) {
    const t = i / ac.sampleRate;
    d[i] = (Math.random() * 2 - 1) * Math.exp(-decay * t) * (0.3 + 0.7 * h);
  }
  const src = ac.createBufferSource(); src.buffer = buf;
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600 + 3000 * h;
  src.connect(lp).connect(ac.destination); src.start();
  src.onended = () => ac.close();
}
