import { useState } from "react";
import { DATA } from "../lib/mission.js";

// Drag to compare: left = Curiosity's original Navcam photo, right = the same photo coloured by our AI.
// Original photo: data/raw/<same name> if you copied it there, else NASA's raw image server.
// If no original can be loaded, only the AI picture is shown.
export function rawSources(stop) {
  const name = (stop.image || "").split("/").pop();
  if (!name) return [];
  const base = name.replace(/\.(jpe?g|png)$/i, "");
  const sol = String(stop.sol).padStart(5, "0");
  return [
    `${DATA}raw/${name}`,
    `${DATA}raw/${base}.JPG`,
    `https://mars.nasa.gov/msl-raw-images/proj/msl/redops/ods/surface/sol/${sol}/opgs/edr/ncam/${base}.JPG`,
  ];
}

export default function PhotoSlider({ stop }) {
  const [pos, setPos] = useState(50);
  const [srcI, setSrcI] = useState(0);
  const srcs = rawSources(stop);
  const rawOk = srcI < srcs.length;
  const ai = DATA + stop.image;

  if (!rawOk) return <img src={ai} alt={`Curiosity Navcam photo at sol ${stop.sol}, coloured by our AI`} />;
  return (
    <div className="slider">
      <div className="sliderBox">
        <img src={srcs[srcI]} alt={`Original Curiosity Navcam photo, sol ${stop.sol}`} onError={() => setSrcI((i) => i + 1)} />
        <img src={ai} alt={`Same photo coloured by our AI`} className="top" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
        <div className="handle" style={{ left: `${pos}%` }} />
        <span className="lab l">NASA photo</span><span className="lab r">our AI</span>
      </div>
      <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(+e.target.value)} aria-label="Compare original photo and AI result" />
      <small className="muted">Photo: NASA/JPL-Caltech · drag to compare</small>
    </div>
  );
}
