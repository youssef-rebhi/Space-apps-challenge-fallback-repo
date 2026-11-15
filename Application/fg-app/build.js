import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const esbuildPath = path.join(__dirname, "node_modules", "esbuild", "bin", "esbuild");
const outJs = path.join(__dirname, "..", "firmground-app-built", "assets", "index-BroThxlx.js");
const outCss = path.join(__dirname, "..", "firmground-app-built", "assets", "index-BPlUwsGe.css");
const generatedCss = path.join(__dirname, "..", "firmground-app-built", "assets", "index-BroThxlx.css");

console.log("Building Firm Ground frontend with esbuild...");
execFileSync(process.execPath, [
  esbuildPath,
  path.join(__dirname, "src", "main.jsx"),
  "--bundle",
  "--minify",
  "--jsx=automatic",
  `--outfile=${outJs}`,
  "--loader:.js=jsx",
  "--loader:.png=dataurl"
], { stdio: "inherit" });

if (fs.existsSync(generatedCss)) {
  fs.copyFileSync(generatedCss, outCss);
  console.log("Synced CSS bundle to index-BPlUwsGe.css");
}
console.log("Build complete.");
