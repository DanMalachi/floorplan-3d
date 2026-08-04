// M1b verification harness: exposure calibration + sun-angle sweep for the
// sun-through-ceiling fix and for shadow acne on the zero-thickness ceiling.
//
//   node scripts/render/verify-m1b.mjs <outDir>
//
// Headless Chromium with SwiftShader. Probes are anchored to WORLD points via
// window.__probe(planX, planZ, y) so a camera change cannot silently move a
// measurement onto different geometry.
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

const setMode = async (m) => { await page.evaluate((x) => window.__setMode(x), m); await settle(40); };
const setHour = async (h) => { await page.evaluate((x) => window.__setHour(x), h); await settle(30); };
const probe = (px, pz, y) => page.evaluate(([a, b, c]) => window.__probe(a, b, c), [px, pz, y]);

await page.goto("http://localhost:3000/calibration", { waitUntil: "networkidle" });
await settle(90);

// ------------------------------------------------------------------ exposure
const exposure = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    srgb: t.match(/measured sRGB\s+([\d, ]+)/)?.[1]?.trim(),
    linear: parseFloat(t.match(/measured linear\s*([\d.]+)/)?.[1] ?? "0"),
    expected: parseFloat(t.match(/expected\s+([\d.]+)/)?.[1] ?? "0"),
  };
});
await page.screenshot({ path: `${OUT}/exposure.png` });

const HOURS = [6.5, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 17.5];
const rows = [];

// ---------------------------------------------------------------------- roof
// Acne would appear on the sunlit TOP of the ceiling plane. The room's ceiling
// spans plan x 0..3 / z 0..5 at WALL_HEIGHT 2.4; sample well inside it.
await setMode("roof");
await page.evaluate(() => window.__setUi(false));
for (const h of HOURS) {
  await setHour(h);
  const roof = await probe(1.5, 2.0, 2.4);
  rows.push({ rig: "roof", hour: h, ...roof });
  if ([7.5, 12, 16.5].includes(h)) await page.screenshot({ path: `${OUT}/roof-${h}.png` });
}

// ------------------------------------------------------------------ interior
// The leak test. Camera is inside the roofed room; the floor must stay dark
// except where the window admits sun. Two points:
//   deep  — far from the window, must never see direct sun
//   patch — in front of the window, must brighten with an evening sun
await setMode("interior");
for (const wallMode of ["full", "cutaway", "top"]) {
  await page.evaluate(() => window.__setUi(true));
  await page.getByRole("button", { name: wallMode, exact: true }).click();
  await page.evaluate(() => window.__setUi(false));
  await settle(40);
  for (const h of HOURS) {
    await setHour(h);
    // deep  — plan (4.2, 1.2): far from the window. At noon the window's
    //         projection reaches only x ~0.7, so this point can ONLY be lit by
    //         sun coming through the roof. It is the leak detector.
    // patch — plan (3.0, 1.7): inside the afternoon window projection, so it
    //         must brighten as the sun drops. It is the window detector.
    const deep = await probe(4.2, 1.2, 0.02);
    const patch = await probe(3.0, 1.7, 0.02);
    rows.push({
      rig: `interior-${wallMode}`, hour: h,
      deep: deep.mean, deepVis: deep.visible,
      patch: patch.mean, patchVis: patch.visible,
    });
    if ([12, 16.5, 17.5].includes(h)) await page.screenshot({ path: `${OUT}/int-${wallMode}-${h}.png` });
  }
}

writeFileSync(`${OUT}/result.json`, JSON.stringify({ exposure, rows, log }, null, 2));

const f = (v) => (Number.isFinite(v) ? v.toFixed(1).padStart(6) : "  OFFSCR");
console.log("EXPOSURE", JSON.stringify(exposure));
console.log("\nROOF (acne: adjDelta = mean |adjacent pixel delta|)");
for (const r of rows.filter((x) => x.rig === "roof"))
  console.log(`  h=${String(r.hour).padStart(4)}  vis=${r.visible}  mean=${f(r.mean)}  adjDelta=${Number.isFinite(r.adjDelta) ? r.adjDelta.toFixed(3) : "n/a"}`);
for (const m of ["full", "cutaway", "top"]) {
  console.log(`\nINTERIOR ${m}  (deep = leak detector, patch = window detector)`);
  for (const r of rows.filter((x) => x.rig === `interior-${m}`))
    console.log(`  h=${String(r.hour).padStart(4)}  deep=${f(r.deep)}(${r.deepVis ? "ok" : "OFF"})  patch=${f(r.patch)}(${r.patchVis ? "ok" : "OFF"})`);
}
const offscreen = rows.filter((r) => r.visible === false || r.deepVis === false || r.patchVis === false);
if (offscreen.length) console.log(`\n!! ${offscreen.length} probe(s) off-screen — those rows measure nothing`);
if (log.length) console.log("\nLOG", log.slice(0, 6));
await browser.close();
