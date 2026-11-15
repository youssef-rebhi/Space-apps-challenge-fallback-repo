import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { map3dPlugin } from "./scripts/map3d.mjs";
// base "./" so the built app works from any folder (GitHub Pages, Vercel, Netlify)
// map3dPlugin: the 3D layer map (Map_layer/martian_map/web/explode/) under /map3d/
export default defineConfig({ plugins: [react(), map3dPlugin()], base: "./" });
