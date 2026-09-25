#!/usr/bin/env node
// Capture the /dev/doors showroom: one browser, several looks x shots.
//
//   node scripts/doors/shoot.mjs --out <dir> [--port 3107]
//        [--interior shaker-white] [--entry walnut-groove-entry]
//        [--shots row,door,handle] [--w 1400 --h 900]
//
// Renders under SwiftShader (headless), so budget ~20-40 s per shot. Each
// shot is taken twice: the first frame after a change is often stale.

import { createRequire } from "module";
import path from "path";
import fs from "fs";

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const { chromium } = createRequire(path.join(root, "package.json"))("playwright");

const out = path.resolve(opt("--out", "."));
const port = opt("--port", "3107");
const shots = opt("--shots", "row").split(",");
const interior = opt("--interior");
const entry = opt("--entry");
const W = Number(opt("--w", "1400"));
const H = Number(opt("--h", "900"));
const tag = opt("--tag", "");
fs.mkdirSync(out, { recursive: true });

const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 300)); });
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await p.goto(`http://localhost:${port}/en/dev/doors`, { waitUntil: "networkidle", timeout: 240000 });
await p.waitForFunction(() => !!window.__setLooks, null, { timeout: 120000 });
await p.evaluate(({ interior, entry }) => {
  const P = window.__presets;
  window.__setUi(false);
  window.__setLooks({ interior: interior ? P[interior] : undefined, entry: entry ? P[entry] : undefined });
}, { interior, entry });
await p.evaluate(() => {
  for (const el of document.querySelectorAll("div,section,aside")) {
    if (el.textContent?.startsWith("This app uses only") && getComputedStyle(el).position === "fixed") el.remove();
  }
  document.querySelectorAll("nextjs-portal").forEach((e) => e.remove());
});
await p.waitForTimeout(6000); // textures
for (const s of shots) {
  await p.evaluate((s) => window.__setShot(s), s);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(out, `_warm.png`) });
  const file = path.join(out, `${tag}${s}.png`);
  await p.screenshot({ path: file });
  console.log("wrote", file);
}
fs.rmSync(path.join(out, "_warm.png"), { force: true });
await b.close();
