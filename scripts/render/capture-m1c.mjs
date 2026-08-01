// M1c baseline capture: the calibration reference room, every lighting preset
// crossed with every camera mode.
//
//   npm run dev            (in another terminal)
//   node scripts/render/capture-m1c.mjs [outDir]      default: docs/calibration
//
// Writes one PNG per cell plus manifest.json, which records the contract values
// in force at capture time. Without that record a future session cannot tell a
// valid baseline from a stale one, and a stale baseline set is worse than none
// (docs/render-contract.md §2.4).
//
// Headless Chromium with SwiftShader — software rendering, so this is slow
// (minutes, not seconds). That is the price of a capture that does not depend
// on whose GPU it ran on.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const OUT = process.argv[2] ?? "docs/calibration";
const URL = "http://localhost:3000/calibration";

// 16:10. The `full` shot is framed for this aspect — the whole 11.5 m fixture
// fits at 45° fov, and a sphere in the gradient rows lands at ~50 px, which is
// enough to read roughness at.
const VIEWPORT = { width: 1600, height: 1000 };

const ENV_PRESETS = ["none", "suburb", "city"];
const WALL_MODES = ["full", "cutaway", "top"];

mkdirSync(OUT, { recursive: true });

const log = [];
const cells = [];

/**
 * One browser per lighting preset, not one for the whole run.
 *
 * Switching the preset live rebuilds the procedural environment map and the
 * whole ground/skyline rig; a clean context per preset keeps one preset's
 * rebuild from being paid for inside the next preset's frames, and means a run
 * that dies names the preset it died on instead of leaving a partial set that
 * looks finished.
 */
async function capturePreset(env) {
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
  const page = await browser.newPage({ viewport: VIEWPORT });
  // Playwright's 30 s default is a GPU-machine number. A single 1600x1000 frame
  // of the suburb or city preset takes well over that under SwiftShader, and
  // the failure looks like a screenshot timeout rather than "the renderer is
  // slow", which sends you hunting the wrong thing.
  page.setDefaultTimeout(240_000);
  page.on("console", (m) => { if (/contract|error/i.test(m.text())) log.push(`[${env}] ${m.text()}`); });
  page.on("pageerror", (e) => log.push(`[${env}][pageerror] ${e.message}`));

  // Frame-counted rather than time-based. The environment map is regenerated on
  // every preset change and the shadow map re-renders after it; a fixed sleep
  // either wastes time or captures a half-built frame, and the half-built frame
  // is the one that silently becomes a baseline.
  const settle = (n = 45) =>
    page.evaluate((k) => new Promise((res) => {
      let i = 0;
      const tick = () => (++i >= k ? res() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }), n);

  try {
    await page.goto(URL, { waitUntil: "networkidle", timeout: 60_000 });
    await settle(50);
    await page.evaluate(() => window.__setMode("reference"));
    await settle(60);
    await page.evaluate(() => window.__setUi(false));
    await page.evaluate((p) => window.__setEnv(p), env);
    await settle(60);

    for (const wallMode of WALL_MODES) {
      await page.evaluate((m) => window.__setWallMode(m), wallMode);
      await settle(40);
      const file = `${env}-${wallMode}.png`;
      await page.screenshot({ path: `${OUT}/${file}`, timeout: 240_000 });
      const cell = await page.evaluate(() => window.__calibrationManifest());
      cells.push({ file, ...cell });
      console.log(`  captured ${file}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

for (const env of ENV_PRESETS) {
  console.log(`preset ${env}...`);
  await capturePreset(env);
}

const manifest = {
  milestone: "M1c",
  // NOT FROZEN. §7 is still open: the environment map is in pre-§4 unitless
  // intensities and is the largest single light in the scene, so freezing would
  // ratify it. (§3.1 was the other blocker and is closed — r182 absorbed
  // PCFSoftShadowMap into PCFShadowMap, which is the soft filter; these frames
  // were never hard-shadowed.) See docs/calibration/README.md.
  status: "PROVISIONAL — §7 (IBL units) open; §3.1 closed at M1c-R",
  capturedAt: new Date().toISOString(),
  viewport: VIEWPORT,
  renderer: "headless chromium + swiftshader",
  // Baselines are invalidated by a change to ANY of these. They are recorded
  // per cell too; repeated here so the invalidation set is readable at a glance.
  invalidatedBy: [
    "tone-mapping operator (contract §2.4)",
    "shadow map type (§3.1)",
    "shadow resolution or frustum (§3.2)",
    "light units or RENDER_EXPOSURE (§4, §2.2)",
    "the reference room fixture or its camera shots (src/app/calibration/)",
  ],
  cells,
  log,
};
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));

console.log(`\n${cells.length} cells -> ${OUT}`);
if (log.length) console.log("LOG", log.slice(0, 8));
