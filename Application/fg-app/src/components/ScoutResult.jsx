import { useEffect, useRef } from "react";
import { waveform, shotEnergies } from "../lib/acoustic.js";
import { COLOURS } from "../lib/mission.js";

// Shows the SIMULATED acoustic result: one laser-shot waveform + energy over 30 shots.
export default function ScoutResult({ result }) {
  const wave = useRef(null), bars = useRef(null);

  useEffect(() => {
    if (!result) return;
    const draw = (cv, fn) => { const ctx = cv.getContext("2d"); ctx.clearRect(0, 0, cv.width, cv.height); fn(ctx, cv.width, cv.height); };
    draw(wave.current, (ctx, w, h) => {
      const ys = waveform(result.h, 400, result.sol);
      ctx.strokeStyle = "#7fe0a0"; ctx.lineWidth = 2; ctx.beginPath();
      ys.forEach((y, i) => { const px = (i / (ys.length - 1)) * w, py = h / 2 - y * (h / 2 - 6); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    });
    draw(bars.current, (ctx, w, h) => {
      const es = shotEnergies(result.h), bw = w / es.length;
      ctx.fillStyle = COLOURS[result.verdict.colour];
      es.forEach((e, i) => ctx.fillRect(i * bw + 1, h - e * (h - 4), bw - 2, e * (h - 4)));
    });
  }, [result]);

  if (!result) return null;
  return (
    <div className="scout">
      <div className="scoutHead">
        <b style={{ color: COLOURS[result.verdict.colour] }}>🎤 {result.verdict.label}</b>
        <span className="tag">SIMULATED · inspired by NASA Perseverance SuperCam</span>
      </div>
      <small>Sound of one laser shot (hard ground rings longer):</small>
      <canvas ref={wave} width="440" height="90" />
      <small>Sound energy over 30 shots on the same spot (drops faster on soft ground):</small>
      <canvas ref={bars} width="440" height="60" />
      <small>Hardness index {Math.round(result.h * 100)}/100 · computed from our AI's terrain result at sol {result.sol}.</small>
    </div>
  );
}
