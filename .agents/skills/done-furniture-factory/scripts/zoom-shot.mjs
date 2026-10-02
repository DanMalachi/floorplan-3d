// node zoom-shot.mjs <name> <outdir> [ticks] [x,y]...  -> full.png (whole canvas) then zoom_<i>.png per point (fresh front view each)
import { createRequire } from "module";
import path from "path";
import fs from "fs";
const [name, out, ticksArg, ...pts] = process.argv.slice(2);
const ticks = Number(ticksArg || 2);
const { chromium } = createRequire("C:/Users/dandu/fp-wt/nightstands/package.json")("playwright");
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await p.goto("http://localhost:3140/dev/furniture", { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(15000);
await p.getByText(name, { exact: false }).first().click({ timeout: 60000 });
await p.waitForTimeout(9000);
await p.screenshot({ path: path.join(out, "full.png"), clip: { x: 290, y: 60, width: 1210, height: 900 } });
console.log("wrote full");
for (let i = 0; i < pts.length; i++) {
  const [x, y] = pts[i].split(",").map(Number);
  await p.getByRole("button", { name: "front", exact: true }).click();
  await p.waitForTimeout(2500);
  await p.mouse.move(x, y);
  for (let k = 0; k < ticks; k++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(600); }
  await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(out, `zoom_${i}.png`), clip: { x: 290, y: 60, width: 1210, height: 900 } });
  console.log("wrote zoom", i);
}
await b.close();
