#!/usr/bin/env node
/**
 * In-app viewer check as ONE command: open /dev/furniture, select a candidate by (part of) its listed name, screenshot it.
 * The app viewer differs from Blender (tone mapping, dark environment): metals go black, fabric reads darker, a high normal
 * strength aliases. Run it on the FIRST draft, not after the owner complains.
 *
 *   node app-shot.mjs --worktree <dev worktree with node_modules/playwright> --name "Grey Chaise Sectional" --out <dir>
 *                     [--views front,left,right] [--port 3105] [--clip 290,200,1210,490] [--wait 9000]
 * Writes <out>/app_<view>.png. Needs the dev server (npx next dev -p 3105 in the worktree). Views are the page buttons
 * (front, right, back, left, top). The default clip crops the 3D canvas without the side list (x,y,w,h).
 */
import { createRequire } from "module";
import path from "path";
import fs from "fs";

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const worktree = path.resolve(opt("--worktree", process.env.FACTORY_WORKTREE || ""));
const name = opt("--name");
const out = path.resolve(opt("--out", "."));
if (!name || !opt("--worktree", process.env.FACTORY_WORKTREE)) { console.error("usage: --worktree <dir> --name <listed name> --out <dir>"); process.exit(2); }
const views = opt("--views", "front").split(",");
const port = opt("--port", "3105");
const [cx, cy, cw, ch] = opt("--clip", "290,200,1210,490").split(",").map(Number);
const wait = Number(opt("--wait", "9000"));

const { chromium } = createRequire(path.join(worktree, "package.json"))("playwright");
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await p.goto(`http://localhost:${port}/dev/furniture`, { waitUntil: "networkidle", timeout: 90000 });
await p.getByText(name, { exact: false }).first().click();
await p.waitForTimeout(wait);
for (const v of views) {
  if (v !== "front") { await p.getByRole("button", { name: v, exact: true }).click(); await p.waitForTimeout(3500); }
  const file = path.join(out, `app_${v}.png`);
  await p.screenshot({ path: file, clip: { x: cx, y: cy, width: cw, height: ch } });
  console.log("wrote", file);
}
await b.close();
