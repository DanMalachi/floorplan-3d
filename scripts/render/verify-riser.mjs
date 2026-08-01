// Riser-panel verification: shadow acne on the riser strip across a sun sweep.
//
//   node scripts/render/verify-riser.mjs <outDir>
//
// Risers only exist where a SHARED wall is taller than a room's own ceiling, so
// this drives the dedicated /calibration "riser" fixture — the sample scene
// produces none, which is why the riser stayed untested through M1b.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const log = [];
page.on("console", (m) => { if (/contract|error/i.test(m.text())) log.push(m.text()); });
page.on("pageerror", (e) => log.push(`[pageerror] ${e.message}`));

const settle = (n = 30) =>
  page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const tick = () => (++i >= k ? res() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);

await page.goto("http://localhost:3000/calibration", { waitUntil: "networkidle" });
await settle(80);
await page.evaluate(() => window.__setMode("riser"));
await settle(60);
await page.evaluate(() => window.__setUi(false));
await settle(20);

const HOURS = [6.5, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 17.5];
const rows = [];
for (const h of HOURS) {
  await page.evaluate((x) => window.__setHour(x), h);
  await settle(30);
  // Ceiling of room A, and the riser strip itself. The shared wall runs along
  // x = 4 from z 0..3; ceilings sit at 2.4 and the wall tops out at 3.2, so the
  // riser face lives at x = 4, y between 2.4 and 3.2.
  const ceil = await page.evaluate(() => window.__probe(2.0, 1.5, 2.4, 12, true));
  const riser = await page.evaluate(() => window.__probe(4.0, 1.5, 2.8, 8, true));
  rows.push({ hour: h, ceil, riser });
  if ([7.5, 12, 16.5].includes(h)) await page.screenshot({ path: `${OUT}/riser-${h}.png` });
}

writeFileSync(`${OUT}/riser.json`, JSON.stringify({ rows, log }, null, 2));
const f = (v) => (Number.isFinite(v) ? v.toFixed(1).padStart(6) : "  OFFSCR");
console.log("RISER FIXTURE  (adjDelta = acne signal)");
for (const r of rows)
  console.log(
    `  h=${String(r.hour).padStart(4)}` +
    `  ceil=${f(r.ceil.mean)}/d${Number.isFinite(r.ceil.adjDelta) ? r.ceil.adjDelta.toFixed(3) : "n/a"}(${r.ceil.visible ? "ok" : "OFF"})` +
    `  riser=${f(r.riser.mean)}/d${Number.isFinite(r.riser.adjDelta) ? r.riser.adjDelta.toFixed(3) : "n/a"}(${r.riser.visible ? "ok" : "OFF"})`,
  );
const bad = rows.filter((r) => !r.ceil.visible || !r.riser.visible);
if (bad.length) console.log(`\n!! ${bad.length} row(s) had an off-screen probe — those measure nothing`);
if (log.length) console.log("LOG", log.slice(0, 6));
await browser.close();
