"use client";

import type * as THREE from "three";

/**
 * One-shot device identification for the Phase 0 HUD.
 *
 * Everything here is read once and cached at module level. None of it changes
 * for the life of the document, and two of the reads (the debug-renderer
 * extension, `MAX_TEXTURE_SIZE`) are synchronous GL queries that stall the
 * pipeline, so they must not sit anywhere near a frame callback.
 *
 * The point of the string is `docs/PERFORMANCE.md` §8: every number in that
 * document is estimated, and the first thing any capture has to establish is
 * WHICH machine produced it. A frame time with no device attached to it is the
 * "vibes" the doc is trying to replace.
 */

/**
 * A coarse bucket, used for labelling a capture and (later) for Phase 5's
 * default tier. Deliberately four values, not a taxonomy.
 */
export type DeviceClass = "apple-silicon" | "integrated" | "discrete" | "unknown";

export interface GpuInfo {
  /** UNMASKED_RENDERER_WEBGL, or the plain RENDERER string, or null if both are
   *  masked. */
  renderer: string | null;
  /** UNMASKED_VENDOR_WEBGL, or the plain VENDOR string, or null. */
  vendor: string | null;
  /** Whether the two strings above came from `WEBGL_debug_renderer_info`. When
   *  false they are the masked/generic values and the class guess is weak. */
  unmasked: boolean;
  deviceClass: DeviceClass;
  /** Logical cores. Chrome caps the reported value at 8 for anti-fingerprinting
   *  on some platforms, so a 10-core M-series may read as 8. */
  hardwareConcurrency: number | null;
  /** `window.devicePixelRatio` — the DISPLAY's ratio, before the contract's DPR
   *  clamp. Compare against the sampled `dpr` to see the clamp working. */
  devicePixelRatio: number;
  maxTextureSize: number | null;
  webgl2: boolean;
  /**
   * The attributes the context ACTUALLY got, not the ones requested. Phase 1 #3
   * and #4 both turn attributes off (`antialias`, `alpha`,
   * `preserveDrawingBuffer`); a request is not a guarantee, and this is the only
   * place the granted value is observable on the failing hardware.
   */
  contextAttributes: WebGLContextAttributes | null;
}

/**
 * What this heuristic CANNOT know, and must never be trusted for:
 *
 * - Whether memory is unified. That is the actual mechanism behind §1.2/§1.3 of
 *   the perf doc, and no browser API exposes it. "apple-silicon" implies it;
 *   nothing else here does.
 * - VRAM size, memory bandwidth, or tile-based vs immediate-mode rendering.
 * - An external GPU, or a laptop with switchable graphics that has handed the
 *   browser the integrated adapter while a discrete one is present.
 * - Anything at all when the browser masks the string — Firefox with
 *   `privacy.resistFingerprinting`, Safari in some configurations, and Brave by
 *   default all return a generic renderer. That case reports "unknown", which is
 *   the honest answer, rather than guessing from `platform`.
 *
 * On Windows every string arrives wrapped by ANGLE, e.g.
 * `ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)`;
 * on macOS Chrome it is `ANGLE (Apple, ANGLE Metal Renderer: Apple M2, ...)`,
 * and Safari reports a bare `Apple GPU`. Substring matching handles all three
 * without parsing the wrapper.
 *
 * Order matters below. Apple is tested first because "Apple M2" would otherwise
 * never be reached; integrated AMD is tested before discrete AMD because
 * `AMD Radeon(TM) Graphics` (a Vega iGPU) and `AMD Radeon RX 6800` differ only
 * by the model token.
 */
export function classifyRenderer(renderer: string | null): DeviceClass {
  if (!renderer) return "unknown";
  const s = renderer.toLowerCase();

  // Apple silicon: "apple m1/m2/m3...", "apple a15", or Safari's bare "apple gpu".
  if (/\bapple\s+(m\d|a\d|gpu)/.test(s)) return "apple-silicon";

  // Software rasterisers. Not integrated — they are a headless/blocklisted
  // fallback, and a frame time captured on one means nothing about hardware.
  if (/swiftshader|llvmpipe|software|microsoft basic|generic renderer/.test(s)) return "unknown";

  // Integrated, tested before the discrete families it shares vendor names with.
  if (/intel|\buhd\b|\biris\b|\bhd graphics\b|radeon\(tm\) graphics|radeon graphics|vega \d|\badreno\b|\bmali\b|powervr|\bxclipse\b/.test(s)) {
    return "integrated";
  }

  // Discrete.
  if (/nvidia|geforce|quadro|\brtx\b|\bgtx\b|radeon (rx|pro|hd)|\bfirepro\b|\barc a\d/.test(s)) {
    return "discrete";
  }

  return "unknown";
}

let cached: GpuInfo | null = null;

/**
 * Read device info, preferring the app's own renderer.
 *
 * Passing `gl` matters: without it this has to create a throwaway canvas and a
 * second WebGL context to ask the same questions. `docs/PERFORMANCE.md` §6
 * already flags a second live GL context (`src/furniture/thumbnails.ts`) as an
 * unquantified cost on Apple silicon, and a perf tool has no business adding a
 * third. The standalone path exists only so a harness outside the Canvas can
 * still label a capture; it loses the context immediately.
 */
export function readGpuInfo(gl?: THREE.WebGLRenderer): GpuInfo {
  if (cached) return cached;

  let ctx: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let disposable: WEBGL_lose_context | null = null;

  if (gl) {
    ctx = gl.getContext();
  } else if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    ctx = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    disposable = ctx?.getExtension("WEBGL_lose_context") ?? null;
  }

  const info: GpuInfo = {
    renderer: null,
    vendor: null,
    unmasked: false,
    deviceClass: "unknown",
    hardwareConcurrency:
      typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
        ? navigator.hardwareConcurrency
        : null,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    maxTextureSize: null,
    webgl2: false,
    contextAttributes: null,
  };

  if (ctx) {
    // May be null: the extension is gated behind an anti-fingerprinting setting
    // in every major browser and is absent outright in some. Falling through to
    // the plain RENDERER/VENDOR strings still gives *something* on Chrome 108+,
    // which now reports the real device there for most users.
    const debugExt = ctx.getExtension("WEBGL_debug_renderer_info");
    if (debugExt) {
      const renderer: unknown = ctx.getParameter(debugExt.UNMASKED_RENDERER_WEBGL);
      const vendor: unknown = ctx.getParameter(debugExt.UNMASKED_VENDOR_WEBGL);
      if (typeof renderer === "string") info.renderer = renderer;
      if (typeof vendor === "string") info.vendor = vendor;
      info.unmasked = info.renderer !== null;
    }
    if (info.renderer === null) {
      const renderer: unknown = ctx.getParameter(ctx.RENDERER);
      const vendor: unknown = ctx.getParameter(ctx.VENDOR);
      if (typeof renderer === "string") info.renderer = renderer;
      if (typeof vendor === "string") info.vendor = vendor;
    }

    const maxTextureSize: unknown = ctx.getParameter(ctx.MAX_TEXTURE_SIZE);
    if (typeof maxTextureSize === "number") info.maxTextureSize = maxTextureSize;

    info.webgl2 = typeof WebGL2RenderingContext !== "undefined" && ctx instanceof WebGL2RenderingContext;
    info.contextAttributes = ctx.getContextAttributes();
  }

  info.deviceClass = classifyRenderer(info.renderer);

  // Only the throwaway context is released. Losing the app's own context here
  // would black the viewport.
  disposable?.loseContext();

  cached = info;
  return info;
}

/** Short label for the HUD — the model token, not the ANGLE wrapper. */
export function shortRendererLabel(renderer: string | null): string {
  if (!renderer) return "renderer masked";
  // `ANGLE (vendor, model, backend)` -> `model`, which is the only interesting
  // third of the string and the only third that fits the panel.
  const angle = /^ANGLE \(([^,]+),\s*(.+?)(?:,\s*[^,]*)?\)$/.exec(renderer);
  const body = angle ? angle[2] : renderer;
  return body.replace(/\s*(Direct3D11|vs_\d_\d|ps_\d_\d|OpenGL Engine|ANGLE Metal Renderer:)\s*/g, " ").trim();
}
