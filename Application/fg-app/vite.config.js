import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// base "./" so the built app works from any folder (GitHub Pages, Vercel, Netlify)
export default defineConfig({ plugins: [react()], base: "./" });
