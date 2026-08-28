/**
 * Vsync-free perf measurement harness (`docs/PERFORMANCE.md` Phase 0).
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * The first real readings this workstream got were taken by hand on a 75 Hz
 * display, and every one of them came back pinned to 13.3 ms with a p95 0.2 ms
 * above p50. That is the monitor, not the app: with vsync on and the frame
 * deadline being met, `frameMs` measures the refresh interval and nothing else,
 * so it cannot rank fill against draw calls against CPU — which is the entire
 * question Phase 0 was built to answer.
 *
 * Chromium can be told not to do that. `--disable-gpu-vsync` plus
 * `--disable-frame-rate-limit` lets the renderer run as fast as it can, at which
 * point `frameMs` becomes a measure of work again.
 *
 * ---------------------------------------------------------------------------
 * Two things here are load-bearing and easy to break
 * ---------------------------------------------------------------------------
 * 1. `headless: false`. Headless Chromium falls back to SwiftShader — a software
 *    rasteriser — and will happily report plausible-looking numbers that have
 *    nothing to do with any GPU. The run asserts the unmasked renderer string
 *    and refuses to continue if it sees SwiftShader or llvmpipe.
 *
 * 2. The backgrounding flags. A Chromium tab that is not frontmost gets its rAF
 *    throttled to zero; sampling then stops entirely and the HUD reports frame
 *    periods in the tens of seconds. Do not remove them, and do not cover the
 *    window while a run is in progress.
 *
 * ---------------------------------------------------------------------------
 * DPR, and why this can test the fill hypothesis without a Mac
 * ---------------------------------------------------------------------------
 * `--dpr 2` sets the context's `deviceScaleFactor`, so `devicePixelRatio` reads
 * 2 and the app's own DPR clamp (`contract.ts` `DPR = [1, 2]`) resolves to 2 —
 * no app change, no protected-path edit. CSS layout is identical and the
 * drawing buffer quadruples, which is the Retina fragment load the perf plan
 * keeps attributing cost to but has never once measured. Run the same scenario
 * set at `--dpr 1` and `--dpr 2` and the delta is the fill cost, isolated.
 *
 * ---------------------------------------------------------------------------
 * `--furnish N`, and why an unfurnished number is a floor
 * ---------------------------------------------------------------------------
 * `docs/PERFORMANCE-HANDOFF.md` says it in bold: every number this workstream
 * has ever measured came off an UNFURNISHED scene. The §5 exit bar is a p95
 * frame time on a FURNISHED 3-bed, and Phase 3 is sized against ~700 MB of
 * texture memory — neither of which any existing project can produce, because
 * the only two live rooms hold zero catalog furniture between them.
 *
 * `--furnish N` builds the missing scene: N real catalog items (IKEA's
 * uncapped-texture models, BlenderKit's 1024px WebP ones, or a deterministic
 * interleave of both), placed inside the plan's rooms by
 * `src/render/perf/furnishPlan.ts`. It is perf-gated, it is deterministic, and
 * it CANNOT reach the live Liveblocks room — the furniture is hung on the
 * three.js scene graph and never enters `scene.furniture`, so the collab sink
 * has nothing to diff. See the ownership note at the top of
 * `src/render/perf/PerfFurnishRig.tsx`.
 *
 * The furnish block is written into the results JSON on EVERY run, `--furnish 0`
 * included, so a furnished run can never be mistaken for an unfurnished one
 * afterwards.
 *
 * Usage:
 *   npm run perf:measure -- --room de882e79
 *   npm run perf:measure -- --room de882e79 --dpr 2
 *   npm run perf:measure -- --room de882e79 --only editor:city,editor:studio
 *   npm run perf:measure -- --room de882e79 --vsync        # control run
 *   npm run perf:measure -- --room de882e79 --furnish 40   # furnished scene
 *   npm run perf:measure -- --room de882e79 --furnish 40 --furnish-mix ikea
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "playwright";

// ---------------------------------------------------------------------------
// Sample shape. Structurally mirrors `PerfSample` in src/render/perf/perfStore.ts.
// Declared rather than imported: this script runs under tsx in Node, and that
// module is "use client" and pulls in React.
// ---------------------------------------------------------------------------

interface PerfSample {
  seq: number;
  frameMsP50: number;
  frameMsP95: number;
  fps: number;
  jsMsP50: number;
  jsMsP95: number;
  rendersPerFrame: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  programs: number;
  dpr: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  shadowAutoUpdate: boolean;
  heapMb: number | null;
  textureMb: number | null;
}

/** Mirrors `FurnishBridge` in src/render/perf/furnishBridge.ts. Redeclared for
 *  the same reason as `PerfSample`. */
interface FurnishStats {
  requested: number;
  mix: string;
  seed: number;
  planned: number;
  slots: number;
  distinctAssets: number;
  placed: number;
  failed: number;
  settled: boolean;
}

/** Mirrors the tap installed by `src/render/perf/perfBridge.ts`. Redeclared
 *  because the page-context callbacks below are typechecked against Node's lib,
 *  which knows nothing about the app's own global augmentation. */
declare global {
  interface Window {
    __PERF__?: {
      samples: PerfSample[];
      drain(): PerfSample[];
      clear(): void;
    };
    __PERF_FURNISH__?: FurnishStats;
  }
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface Options {
  room: string;
  base: string;
  dpr: number;
  durationMs: number;
  settleMs: number;
  width: number;
  height: number;
  vsync: boolean;
  /** Force a continuous render loop so frame timing is meaningful in demand-mode
   *  editor scenarios. Off means observe the app exactly as it ships. */
  continuousLoop: boolean;
  /** `?furnish=N` — items in the synthetic furnished benchmark scene. 0 = off. */
  furnish: number;
  furnishMix: string;
  furnishSeed: number;
  /** How long to wait for every furnished model to load before sampling.
   *  Generous: the IKEA half of the catalog is fetched from Vercel Blob. */
  furnishTimeoutMs: number;
  only: string[] | null;
  out: string | null;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };

  const room = get("--room");
  if (!room) {
    console.error(
      "error: --room is required.\n" +
        "  npm run perf:measure -- --room de882e79\n" +
        "It is the id in the /v/<id> URL of the project to measure.",
    );
    process.exit(1);
  }

  const only = get("--only");

  const furnishMix = get("--furnish-mix") ?? "mix";
  if (!["mix", "ikea", "blenderkit"].includes(furnishMix)) {
    console.error(`error: --furnish-mix must be one of mix, ikea, blenderkit (got "${furnishMix}").`);
    process.exit(1);
  }

  return {
    room,
    base: get("--base") ?? "http://localhost:3000",
    dpr: Number(get("--dpr") ?? 1),
    durationMs: Number(get("--dur") ?? 6000),
    settleMs: Number(get("--settle") ?? 2500),
    // Defaults match the hand-measured baseline (buffer 1730x883, 1.53 MP) so
    // the first automated run is directly comparable to it.
    width: Number(get("--width") ?? 1730),
    height: Number(get("--height") ?? 883),
    vsync: argv.includes("--vsync"),
    continuousLoop: !argv.includes("--demand"),
    furnish: Math.max(0, Math.floor(Number(get("--furnish") ?? 0)) || 0),
    furnishMix,
    furnishSeed: Math.floor(Number(get("--furnish-seed") ?? 1)) || 1,
    furnishTimeoutMs: Number(get("--furnish-timeout") ?? 180_000),
    only: only ? only.split(",").map((s) => s.trim()).filter(Boolean) : null,
    out: get("--out"),
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  description: string;
  /** Runs before the settle period. Put mode/environment changes here. */
  setup?: (page: Page) => Promise<void>;
  /** Runs concurrently with sampling, for scenarios that need sustained input.
   *  Must return within roughly `durationMs`. */
  during?: (page: Page, durationMs: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Click a labelled control in the viewport chrome.
 *
 * The environment and view-mode pills live in `Viewport.tsx`, which is a
 * protected path — so this addresses them the way a user does, by visible
 * label, rather than by reaching into the store. Role first, plain text as a
 * fallback, because a pill that is a styled `div` still has to be readable.
 */
async function clickControl(page: Page, label: string | RegExp): Promise<void> {
  const byRole = page.getByRole("button", { name: label });
  if ((await byRole.count()) > 0) {
    await byRole.first().click();
    return;
  }
  const byText = page.getByText(label, { exact: typeof label === "string" });
  if ((await byText.count()) > 0) {
    await byText.first().click();
    return;
  }
  throw new Error(`control not found: ${String(label)}`);
}

async function enterWalkthrough(page: Page): Promise<boolean> {
  await clickControl(page, /walk through/i);
  await sleep(900);

  // Pointer lock is requested from the canvas's own click handler
  // (`WalkthroughMode.tsx`), so it needs a real click on the canvas — not on the
  // button that opened the mode. Playwright's clicks are trusted input, so the
  // request is granted; this is verified rather than assumed because mouse-look
  // silently does nothing without it.
  const canvas = page.locator("canvas").first();
  await canvas.click({ position: { x: 400, y: 300 } });
  await sleep(400);

  return page.evaluate(() => document.pointerLockElement !== null);
}


/**
 * Continuous circular orbit drag.
 *
 * Every editor mode runs `frameloop="demand"` (Phase 2), so an idle camera
 * renders NOTHING and a scenario with no input collects zero samples — which is
 * Phase 2 working correctly, not a harness failure. Editor cost is only
 * meaningful while the user is actually driving the camera, so that is what
 * these scenarios do. A circle rather than a back-and-forth sweep because it
 * keeps the pointer on the canvas and the camera in a comparable pose band for
 * the whole run.
 */
async function orbitDrag(page: Page, durationMs: number): Promise<void> {
  const box = await page.locator("canvas").first().boundingBox();
  const cx = box ? box.x + box.width / 2 : 800;
  const cy = box ? box.y + box.height / 2 : 400;

  await page.mouse.move(cx, cy);
  await page.mouse.down();

  const until = Date.now() + durationMs;
  let angle = 0;
  while (Date.now() < until) {
    angle += 0.12;
    await page.mouse.move(cx + Math.cos(angle) * 160, cy + Math.sin(angle) * 70);
    await sleep(16);
  }

  await page.mouse.up();
}

/**
 * Dolly the editor camera back so the WHOLE plan is inside the frustum.
 *
 * Without this, the default framing crops a furnished scene and the run reports
 * whatever fraction of the furniture happened to survive frustum culling — a
 * number that moves with the camera rather than with the scene, which is the
 * confound `editor:wide` exists to remove. Wheel-down dollies out in
 * CameraControls' default map; the amount is fixed so every run frames alike.
 */
async function dollyOut(page: Page): Promise<void> {
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.move(box ? box.x + box.width / 2 : 800, box ? box.y + box.height / 2 : 400);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 240);
    await sleep(60);
  }
}

const SCENARIOS: Scenario[] = [
  {
    name: "editor:city",
    description: "Orbiting the camera, City environment — the default, and the baseline.",
    setup: async (page) => {
      await clickControl(page, "City");
    },
    during: orbitDrag,
  },
  {
    name: "editor:studio",
    description:
      "Orbiting the camera, Studio environment. Difference from editor:city is " +
      "the decorative environment's share of the frame — the open-view version " +
      "of the confound the hand readings could not separate.",
    setup: async (page) => {
      await clickControl(page, "Studio");
    },
    during: orbitDrag,
  },
  {
    name: "editor:suburb",
    description: "Orbiting the camera, Suburb — drives a wind shader every frame unconditionally.",
    setup: async (page) => {
      await clickControl(page, "Suburb");
    },
    during: orbitDrag,
  },
  {
    name: "editor:wide",
    description:
      "Orbiting with the whole plan dollied into frame, Studio. The editor's " +
      "furnished worst case: nothing culls, so draw calls and triangles are the " +
      "scene's true totals rather than the default framing's crop.",
    setup: async (page) => {
      await clickControl(page, "Studio");
      await dollyOut(page);
    },
    during: orbitDrag,
  },
  {
    name: "walk:still",
    description: "Walkthrough at the spawn pose, no input. frameloop is always here.",
    setup: async (page) => {
      await clickControl(page, "Studio");
      await enterWalkthrough(page);
    },
  },
  {
    name: "walk:forward",
    description:
      "Walkthrough holding W. Isolates per-frame allocation and the collision " +
      "path — the suspected source of the 82 MB heap sawtooth.",
    setup: async (page) => {
      await clickControl(page, "Studio");
      await enterWalkthrough(page);
    },
    during: async (page, durationMs) => {
      await page.keyboard.down("KeyW");
      await sleep(durationMs);
      await page.keyboard.up("KeyW");
    },
  },
  {
    name: "walk:look",
    description:
      "Walkthrough sweeping the view. Worst case for frustum contents: the " +
      "whole scene passes through the frustum without the camera translating.",
    setup: async (page) => {
      await clickControl(page, "Studio");
      await enterWalkthrough(page);
    },
    during: async (page, durationMs) => {
      const until = Date.now() + durationMs;
      let x = 400;
      let direction = 1;
      while (Date.now() < until) {
        x += direction * 40;
        if (x > 1200 || x < 200) direction *= -1;
        await page.mouse.move(x, 400);
        await sleep(16);
      }
    },
  },
  {
    name: "walk:spin",
    description:
      "Walkthrough turning continuously in one direction from the spawn pose. " +
      "Every furnished item in the room passes through the frustum during the " +
      "run, so the p95 catches the worst pose rather than whichever one " +
      "walk:look's sweep happened to stop at.",
    setup: async (page) => {
      await clickControl(page, "Studio");
      await enterWalkthrough(page);
    },
    during: async (page, durationMs) => {
      // Under pointer lock the camera integrates movementX, so a run of
      // same-sign moves is a continuous yaw in one direction. The wrap back to
      // the left edge is one large negative delta every ~40 steps — a single
      // fast counter-flick, not a bounce, so the camera keeps sweeping the room
      // the same way rather than oscillating across the same two walls the way
      // walk:look does.
      const until = Date.now() + durationMs;
      let x = 600;
      while (Date.now() < until) {
        x += 25;
        if (x > 1300) x = 300;
        await page.mouse.move(x, 400);
        await sleep(16);
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Aggregate {
  scenario: string;
  description: string;
  sampleCount: number;
  frameMsP50: number;
  frameMsP95: number;
  frameMsP95Worst: number;
  fps: number;
  jsMsP50: number;
  jsMsP95: number;
  /** Share of the frame spent on the main thread. The CPU-vs-GPU verdict. */
  jsShareOfFrame: number;
  rendersPerFrame: number;
  drawCalls: number;
  triangles: number;
  /** Triangles per draw call. Low values mean submission-bound by construction. */
  trianglesPerDrawCall: number;
  geometries: number;
  textures: number;
  programs: number;
  textureMb: number | null;
  heapMbMin: number | null;
  heapMbMax: number | null;
  /** Peak-to-trough heap movement across the scenario — the GC sawtooth. */
  heapMbSwing: number | null;
  dpr: number;
  megapixels: number;
  shadowAutoUpdate: boolean;
  /**
   * Furnished items actually in the scene graph WHILE THIS SCENARIO RAN.
   *
   * Per scenario, not just once per run, because each scenario reloads the page
   * — so a network hiccup can leave one scenario measuring 40 items and the next
   * measuring 12. Without this the two would be averaged into a single
   * confident, wrong table row.
   */
  furnishPlaced: number;
  furnishFailed: number;
}

function aggregate(
  scenario: Scenario,
  samples: PerfSample[],
  furnish: FurnishStats | null,
): Aggregate {
  const heaps = samples.map((s) => s.heapMb).filter((h): h is number => h !== null);
  const textureMbs = samples.map((s) => s.textureMb).filter((t): t is number => t !== null);
  const last = samples[samples.length - 1];

  const frameMsP50 = median(samples.map((s) => s.frameMsP50));
  const jsMsP50 = median(samples.map((s) => s.jsMsP50));
  const drawCalls = median(samples.map((s) => s.drawCalls));
  const triangles = median(samples.map((s) => s.triangles));

  return {
    scenario: scenario.name,
    description: scenario.description,
    sampleCount: samples.length,
    frameMsP50,
    frameMsP95: median(samples.map((s) => s.frameMsP95)),
    frameMsP95Worst: Math.max(...samples.map((s) => s.frameMsP95)),
    fps: frameMsP50 > 0 ? 1000 / frameMsP50 : 0,
    jsMsP50,
    jsMsP95: median(samples.map((s) => s.jsMsP95)),
    jsShareOfFrame: frameMsP50 > 0 ? jsMsP50 / frameMsP50 : 0,
    rendersPerFrame: median(samples.map((s) => s.rendersPerFrame)),
    drawCalls,
    triangles,
    trianglesPerDrawCall: drawCalls > 0 ? triangles / drawCalls : 0,
    geometries: last.geometries,
    textures: last.textures,
    programs: last.programs,
    textureMb: textureMbs.length ? textureMbs[textureMbs.length - 1] : null,
    heapMbMin: heaps.length ? Math.min(...heaps) : null,
    heapMbMax: heaps.length ? Math.max(...heaps) : null,
    heapMbSwing: heaps.length ? Math.max(...heaps) - Math.min(...heaps) : null,
    dpr: last.dpr,
    megapixels: (last.drawingBufferWidth * last.drawingBufferHeight) / 1e6,
    shadowAutoUpdate: last.shadowAutoUpdate,
    furnishPlaced: furnish?.placed ?? 0,
    furnishFailed: furnish?.failed ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function waitForFirstSamples(page: Page, timeoutMs = 60_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const tap = window.__PERF__;
      if (!tap || tap.samples.length < 4) return false;
      // The scene streams in; a sample taken mid-load measures loading, not the
      // scene. Wait for actual geometry to be submitted.
      return tap.samples[tap.samples.length - 1].drawCalls > 0;
    },
    undefined,
    { timeout: timeoutMs },
  );
}

/**
 * Block until every furnished model has resolved one way or the other.
 *
 * Waiting on a stopwatch instead is failure mode #5 in the README: the IKEA half
 * of the catalog is fetched from Vercel Blob and Draco-decoded, so a fixed
 * settle delay measures a half-built scene and files it under a "40 items"
 * label. `settled` means `placed + failed >= planned`, so this returns as soon
 * as the scene is final — including when some models failed, which the caller
 * reports rather than swallows.
 */
async function waitForFurnish(page: Page, timeoutMs: number): Promise<FurnishStats | null> {
  await page.waitForFunction(() => Boolean(window.__PERF_FURNISH__), undefined, { timeout: 30_000 });
  await page.waitForFunction(() => window.__PERF_FURNISH__?.settled === true, undefined, {
    timeout: timeoutMs,
  });
  return page.evaluate(() => window.__PERF_FURNISH__ ?? null);
}

async function readFurnish(page: Page): Promise<FurnishStats | null> {
  return page.evaluate(() => window.__PERF_FURNISH__ ?? null);
}

async function assertRealGpu(page: Page): Promise<string> {
  const renderer = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "no webgl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  });

  if (/swiftshader|llvmpipe|software/i.test(renderer)) {
    throw new Error(
      `refusing to measure a software rasteriser (${renderer}).\n` +
        "This run would produce numbers unrelated to any GPU. Check that the " +
        "browser launched headed and that the GPU is not blocklisted.",
    );
  }
  return renderer;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const scenarios = opts.only
    ? SCENARIOS.filter((s) => opts.only!.includes(s.name))
    : SCENARIOS;

  if (scenarios.length === 0) {
    console.error(
      `error: --only matched no scenarios.\nAvailable: ${SCENARIOS.map((s) => s.name).join(", ")}`,
    );
    process.exit(1);
  }

  const url =
    `${opts.base}/v/${opts.room}?perf=1` +
    (opts.continuousLoop ? "&loop=always" : "") +
    (opts.furnish > 0
      ? `&furnish=${opts.furnish}&furnishMix=${opts.furnishMix}&furnishSeed=${opts.furnishSeed}`
      : "");

  console.log(`\nperf harness`);
  console.log(`  url      ${url}`);
  console.log(`  dpr      ${opts.dpr}`);
  console.log(`  viewport ${opts.width}x${opts.height}`);
  console.log(`  vsync    ${opts.vsync ? "ON (control run)" : "OFF"}`);
  console.log(`  loop     ${opts.continuousLoop ? "forced continuous" : "as-shipped (demand)"}`);
  console.log(
    `  furnish  ${opts.furnish === 0 ? "0 (UNFURNISHED — a floor, not a worst case)" : `${opts.furnish} items · ${opts.furnishMix} · seed ${opts.furnishSeed}`}`,
  );
  console.log(`  scenarios ${scenarios.map((s) => s.name).join(", ")}\n`);

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      // Not negotiable — see the header. Headless means SwiftShader.
      headless: false,
      args: [
        ...(opts.vsync ? [] : ["--disable-gpu-vsync", "--disable-frame-rate-limit"]),
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
        // Without these a non-frontmost window has rAF throttled to zero and
        // sampling stops dead.
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: opts.width, height: opts.height },
      deviceScaleFactor: opts.dpr,
    });
    const page = await context.newPage();

    page.on("pageerror", (err) => console.warn(`  [page error] ${err.message}`));

    await page.goto(url, { waitUntil: "domcontentloaded" });

    const renderer = await assertRealGpu(page);
    console.log(`  gpu      ${renderer}\n`);

    const bridgePresent = await page.evaluate(() => Boolean(window.__PERF__));
    if (!bridgePresent) {
      // The tap installs on the first publish, so absence this early is normal;
      // waitForFirstSamples is the real check.
      console.log("  (waiting for first frames…)");
    }

    await waitForFirstSamples(page);

    const results: Aggregate[] = [];
    let furnishRun: FurnishStats | null = null;

    for (const scenario of scenarios) {
      process.stdout.write(`  ${scenario.name.padEnd(16)} `);

      try {
        // Every scenario starts from a freshly loaded editor.
        //
        // Unwinding walkthrough in-place does not work and is not worth more
        // effort: the canvas covers the Scene panel and swallows the pointer
        // events that would reach the exit button, and Escape is consumed by
        // the browser releasing pointer lock before the app's handler ever sees
        // it. A reload is a few seconds per scenario and makes every run start
        // from identical state — no mode bleed, no camera pose carried over
        // from whatever ran before.
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await waitForFirstSamples(page);

        // The furnished scene has to be COMPLETE before the camera moves, or
        // the scenario measures models still arriving over the network.
        let furnish: FurnishStats | null = null;
        if (opts.furnish > 0) {
          const started = Date.now();
          furnish = await waitForFurnish(page, opts.furnishTimeoutMs);
          process.stdout.write(
            `[${furnish?.placed ?? 0}/${furnish?.planned ?? 0} in ${((Date.now() - started) / 1000).toFixed(1)}s] `,
          );
        }

        if (scenario.setup) await scenario.setup(page);
        await sleep(opts.settleMs);
        // Re-read AFTER settling: a model can still fail late, and the row must
        // report what was on screen while the samples were taken.
        if (opts.furnish > 0) furnish = await readFurnish(page);
        if (furnish) furnishRun = furnish;
        await page.evaluate(() => window.__PERF__?.clear());

        const action = scenario.during?.(page, opts.durationMs);
        await sleep(opts.durationMs);
        if (action) await action;

        const samples = (await page.evaluate(
          () => window.__PERF__?.drain() ?? [],
        )) as PerfSample[];

        if (samples.length === 0) {
          console.log("no samples — skipped");
          continue;
        }

        const agg = aggregate(scenario, samples, furnish);
        results.push(agg);
        console.log(
          `${agg.frameMsP50.toFixed(1)} ms p50 · ${agg.fps.toFixed(0)} fps · ` +
            `${agg.drawCalls.toFixed(0)} calls · js ${agg.jsMsP50.toFixed(1)} ms ` +
            `(${(agg.jsShareOfFrame * 100).toFixed(0)}%)`,
        );
      } catch (err) {
        console.log(`FAILED — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (results.length === 0) {
      console.error("\nno scenario produced samples.\n");
      process.exitCode = 1;
      return;
    }

    printTable(results);

    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const furnishTag = opts.furnish > 0 ? `-furn${opts.furnish}-${opts.furnishMix}` : "-unfurnished";
    const outPath =
      opts.out ??
      join(
        scriptDir,
        "results",
        `perf-dpr${opts.dpr}-${opts.vsync ? "vsync" : "novsync"}${furnishTag}-${stamp}.json`,
      );

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          url,
          gpu: renderer,
          vsync: opts.vsync,
          dpr: opts.dpr,
          continuousLoop: opts.continuousLoop,
          viewport: { width: opts.width, height: opts.height },
          durationMs: opts.durationMs,
          // ALWAYS written, `--furnish 0` included. An unfurnished number is a
          // floor and a furnished one is not, and a results file that does not
          // say which it is will eventually be quoted as the other.
          furnish: {
            requested: opts.furnish,
            mix: opts.furnishMix,
            seed: opts.furnishSeed,
            planned: furnishRun?.planned ?? 0,
            slots: furnishRun?.slots ?? 0,
            distinctAssets: furnishRun?.distinctAssets ?? 0,
            placed: furnishRun?.placed ?? 0,
            failed: furnishRun?.failed ?? 0,
          },
          results,
        },
        null,
        2,
      ),
      "utf8",
    );

    // A furnished run whose models all failed to load reports the UNFURNISHED
    // scene under a furnished label — the exact failure mode this file's header
    // lists four of. It happened: `--furnish-mix blenderkit` once returned 140
    // calls and 2943 triangles, byte-identical to an empty house, because every
    // model threw in the loader and the rig's error boundary swallowed it. The
    // count was in the JSON the whole time and nobody was looking at the JSON.
    // Loud, on stderr, after the table, where it cannot be scrolled past.
    const shortfall = results.filter((r) => r.furnishFailed > 0 || (opts.furnish > 0 && r.furnishPlaced < opts.furnish));
    if (shortfall.length > 0) {
      console.error(
        `\n!! FURNISH INCOMPLETE — these numbers are NOT a furnished scene:\n` +
          shortfall
            .map((r) => `     ${r.scenario}: ${r.furnishPlaced}/${opts.furnish} placed, ${r.furnishFailed} failed`)
            .join("\n") +
          `\n   Do not promote this run to baselines/ and do not compare it against one.\n`,
      );
    }

    console.log(`\nwrote ${outPath}\n`);
  } finally {
    await browser?.close();
  }
}

function printTable(results: Aggregate[]): void {
  const columns: Array<[string, (a: Aggregate) => string]> = [
    ["scenario", (a) => a.scenario],
    ["frame p50", (a) => a.frameMsP50.toFixed(1)],
    ["frame p95", (a) => a.frameMsP95.toFixed(1)],
    ["fps", (a) => a.fps.toFixed(0)],
    ["js p50", (a) => a.jsMsP50.toFixed(1)],
    ["js %", (a) => `${(a.jsShareOfFrame * 100).toFixed(0)}%`],
    ["renders", (a) => a.rendersPerFrame.toFixed(0)],
    ["calls", (a) => a.drawCalls.toFixed(0)],
    ["tris", (a) => a.triangles.toFixed(0)],
    ["tri/call", (a) => a.trianglesPerDrawCall.toFixed(0)],
    ["heap swing", (a) => (a.heapMbSwing === null ? "—" : `${a.heapMbSwing.toFixed(0)}MB`)],
  ];

  const widths = columns.map(([header, get]) =>
    Math.max(header.length, ...results.map((r) => get(r).length)),
  );

  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");

  console.log(`\n${line(columns.map(([h]) => h))}`);
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const result of results) console.log(line(columns.map(([, get]) => get(result))));
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
