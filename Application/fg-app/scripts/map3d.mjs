// The tablet's 3D map is the team's layer-by-layer page (Map_layer/martian_map/web/explode/), shown inside the app.
// Its files stay in Map_layer (one source). This script copies only what that page needs (crew on foot) into the
// built app as map3d/, and serves them under /map3d/ while `npm run dev` runs. Never edit the copies.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MAP3D_SRC = path.resolve(here, "..", "..", "..", "Map_layer", "martian_map", "web");

// read by explode/index.html: layers.json -> terrain.json, heightmaps, combined_report.json, overlays.json (sections),
// and the foot-profile textures listed in layers.json
export const MAP3D_FILES = [
  "explode/index.html",
  "lib/sections.js",
  "layers.json",
  "overlays.json",
  "data/combined_report.json",
  "terrain/terrain.json",
  "terrain/height_4m.bin",
  "terrain/height_2m.bin",
  "terrain/texture_photo.jpg",
  "textures/combined_over_photo_foot.jpg",
  "textures/combined_foot.png",
  "textures/conv_slope_foot.png",
  "textures/conv_roughness.png",
  "textures/conv_terrain.png",
  "textures/conv_groundtruth.png",
  // three.js r160, local copy (no internet needed)
  "vendor/three/LICENSE",
  "vendor/three/README.txt",
  "vendor/three/build/three.module.js",
  "vendor/three/examples/jsm/controls/OrbitControls.js",
  "vendor/three/examples/jsm/renderers/CSS2DRenderer.js",
  "vendor/three/examples/jsm/lines/Line2.js",
  "vendor/three/examples/jsm/lines/LineSegments2.js",
  "vendor/three/examples/jsm/lines/LineGeometry.js",
  "vendor/three/examples/jsm/lines/LineSegmentsGeometry.js",
  "vendor/three/examples/jsm/lines/LineMaterial.js",
];

export function copyMap3d(dest) {
  let bytes = 0;
  for (const f of MAP3D_FILES) {
    const from = path.join(MAP3D_SRC, f), to = path.join(dest, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    bytes += fs.statSync(to).size;
  }
  fs.writeFileSync(path.join(dest, "COPIED_FROM.txt"),
    "Copied by Application/fg-app/scripts/map3d.mjs from Map_layer/martian_map/web.\n" +
    "Do not edit here: change the files in Map_layer, then rebuild the app.\n");
  // same rule as Map_layer/martian_map/.gitattributes: raw heightmaps keep their bytes
  fs.writeFileSync(path.join(dest, ".gitattributes"), "*.bin binary\n");
  console.log(`map3d: copied ${MAP3D_FILES.length} files (${(bytes / 1e6).toFixed(1)} MB) to ${dest}`);
}

// vite plugin: /map3d/* from Map_layer during dev, copied into dist/map3d on build
export function map3dPlugin() {
  let outDir = "dist";
  const TYPES = { ".txt": "text/plain", "": "text/plain", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".bin": "application/octet-stream" };
  return {
    name: "firmground-map3d",
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const u = decodeURIComponent((req.url || "").split("?")[0]);
        if (!u.startsWith("/map3d/")) return next();
        let rel = u.slice("/map3d/".length);
        if (rel.endsWith("/")) rel += "index.html";
        if (!MAP3D_FILES.includes(rel)) return next();
        res.setHeader("Content-Type", TYPES[path.extname(rel)] || "application/octet-stream");
        fs.createReadStream(path.join(MAP3D_SRC, rel)).pipe(res);
      });
    },
    closeBundle() { copyMap3d(path.join(outDir, "map3d")); },
  };
}
