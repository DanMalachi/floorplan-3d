"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useStore, useThree } from "@react-three/fiber";
import { publishPerfSample, resetPerfStore, type PerfSample } from "./perfStore";

/**
 * The Phase 0 frame sampler (`docs/PERFORMANCE.md` §3, Phase 0).
 *
 * Mounted INSIDE the Canvas by `PerfRig`, and only when `?perf=1` is set. It
 * writes to a module store at frame rate and notifies React at `PUBLISH_HZ` —
 * see `perfStore.ts` for why that split is not an optimisation but a
 * correctness requirement for the measurement.
 *
 * ---------------------------------------------------------------------------
 * PRIORITY 0 IS LOAD-BEARING. DO NOT RAISE IT.
 * ---------------------------------------------------------------------------
 * `useFrame(cb, priority)` with a POSITIVE priority tells R3F the subscriber has
 * "taken rendering into its own hands": R3F's store increments an internal
 * counter and its loop then skips `gl.render()` entirely
 * (`if (!state.internal.priority && state.gl.render) state.gl.render(...)`).
 * A perf HUD that renders nothing would therefore blank the viewport the moment
 * the composer is absent. It does not blank it today only because
 * `<EffectComposer>` already claims priority 1 and draws the frame itself —
 * i.e. the safety here would be borrowed from an unrelated component.
 *
 * Priority 0 is also what puts this callback in the right PLACE. R3F sorts
 * subscribers ascending by priority, so a 0 runs before the composer's 1 — this
 * callback executes immediately BEFORE the frame's rendering work, which is
 * exactly where the read-then-reset below has to happen.
 *
 * ---------------------------------------------------------------------------
 * `gl.info.autoReset` — the trap this instrument exists to avoid falling into.
 * ---------------------------------------------------------------------------
 * `WebGLInfo.autoReset` defaults to true, and `WebGLRenderer.render()` does
 * `info.render.frame++; if (info.autoReset) info.reset();` at the TOP of every
 * call (three r185, `WebGLRenderer.js`). This app's composer issues a whole
 * chain of `render()` calls per displayed frame, so with autoReset left on, any
 * read of `info.render.calls` reports the counters of whichever pass happened to
 * run last — for this app, the final fullscreen blit, i.e. one draw call. The
 * HUD would confidently show "1 draw call" on a scene doing hundreds.
 *
 * So: `autoReset = false` on mount, and this callback reads the totals
 * accumulated since its own previous reset — which is precisely one complete
 * displayed frame, every pass included — then resets. `info.reset()` clears only
 * `calls/triangles/points/lines`; `memory` and `programs` are resident counts
 * and are deliberately untouched by it.
 *
 * Consequence to be aware of: while this is mounted, `gl.info.render.*` means
 * "since the sampler's last reset" for every other reader. A repo grep found no
 * other reader in `src/`, and the flag is restored on unmount.
 *
 * `info.render.frame` is NOT reset by `reset()`, so its per-frame delta counts
 * `render()` invocations per displayed frame — the direct measurement of the
 * §2.1 pass-count and §2.2 triple-shadow-render claims, both of which are
 * currently estimates from source.
 */

/** Rolling window for the timing percentiles. ~2 s at 60 fps — long enough to
 *  be stable, short enough that a stutter is still visible in p95 rather than
 *  being averaged into irrelevance. */
const WINDOW_FRAMES = 120;

/** React update rate. Fast enough to watch a number climb while dragging, slow
 *  enough that the HUD's own commit cost stays out of the frame budget. */
const PUBLISH_HZ = 4;
const PUBLISH_INTERVAL_MS = 1000 / PUBLISH_HZ;

/** Scene texture walk cadence. This one is a full `scene.traverse`, so it is
 *  deliberately much slower than the publish rate — see
 *  `estimateSceneTextureBytes`. */
const TEXTURE_WALK_INTERVAL_MS = 2000;

/**
 * Fixed-capacity ring of frame samples.
 *
 * A plain array with `push`/`shift` would allocate and copy every frame, which
 * on a tool measuring GC-sensitive frame times is self-defeating. Two
 * `Float32Array`s — one storage, one sort scratch — mean the steady-state
 * allocation of this whole sampler is zero.
 */
class SampleRing {
  private readonly buf: Float32Array;
  private readonly scratch: Float32Array;
  private head = 0;
  private filled = 0;

  constructor(capacity: number) {
    this.buf = new Float32Array(capacity);
    this.scratch = new Float32Array(capacity);
  }

  push(value: number): void {
    this.buf[this.head] = value;
    this.head = (this.head + 1) % this.buf.length;
    if (this.filled < this.buf.length) this.filled++;
  }

  get length(): number {
    return this.filled;
  }

  /**
   * Nearest-rank percentile, computed only at publish time (4/s), never per
   * frame. Sorting happens in the scratch view so the ring's own ordering
   * survives; `TypedArray.prototype.sort` with no comparator is numeric, unlike
   * `Array.prototype.sort`.
   *
   * Note the ring is unordered in time once it wraps — irrelevant for a
   * percentile, which is order-independent by definition.
   */
  percentile(p: number): number {
    if (this.filled === 0) return 0;
    const view = this.scratch.subarray(0, this.filled);
    view.set(this.buf.subarray(0, this.filled));
    view.sort();
    const index = Math.min(this.filled - 1, Math.max(0, Math.round((p / 100) * (this.filled - 1))));
    return view[index];
  }
}

/** Chromium-only, and absent from the DOM lib types. */
interface JsHeapMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function readHeapMb(): number | null {
  if (typeof performance === "undefined") return null;
  const memory = (performance as Performance & { memory?: JsHeapMemory }).memory;
  // Feature-detected, never assumed: this is Chromium-only, and it is also
  // quantised into ~5 MB buckets and reports only the JS heap. It does NOT
  // include GPU-side texture or buffer allocations, which is the memory
  // `docs/PERFORMANCE.md` §2.5 is actually about — hence the separate texture
  // estimate below. `performance.measureUserAgentSpecificMemory()` would be more
  // honest but is async, requires cross-origin isolation, and can take hundreds
  // of milliseconds; both disqualify it from a frame loop.
  if (!memory || typeof memory.usedJSHeapSize !== "number") return null;
  return memory.usedJSHeapSize / (1024 * 1024);
}

/**
 * Every texture slot a `MeshStandardMaterial`/`MeshPhysicalMaterial` can carry.
 * Enumerated rather than discovered by iterating material keys, because
 * `Object.keys` on a material walks ~60 properties per material per walk and
 * would make this cost scale with material count rather than texture count.
 */
const TEXTURE_SLOTS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "alphaMap",
  "bumpMap",
  "displacementMap",
  "lightMap",
  "envMap",
  "specularMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "transmissionMap",
  "thicknessMap",
  "iridescenceMap",
  "anisotropyMap",
] as const;

function bytesPerTexel(texture: THREE.Texture): number {
  // The driver picks the real internal format and may pad, swizzle or
  // block-compress; three does not expose what it chose. RGBA8 is the honest
  // default because that is what an ordinary JPEG/PNG decodes to on upload,
  // which is the §2.5 finding's whole premise.
  if (texture.type === THREE.HalfFloatType) return 8;
  if (texture.type === THREE.FloatType) return 16;
  return 4;
}

function textureBytes(texture: THREE.Texture): number {
  // A compressed texture reports its true GPU size directly, per mip level.
  const compressed = texture as unknown as { isCompressedTexture?: boolean; mipmaps?: unknown[] };
  if (compressed.isCompressedTexture && Array.isArray(compressed.mipmaps)) {
    let bytes = 0;
    for (const level of compressed.mipmaps) {
      const data = (level as { data?: { byteLength?: number } } | null)?.data;
      if (data && typeof data.byteLength === "number") bytes += data.byteLength;
    }
    return bytes;
  }

  const image = texture.image as { width?: number; height?: number } | null | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!width || !height) return 0;
  // Mip chain adds ~1/3 again. Cube maps carry six faces.
  const faces = (texture as unknown as { isCubeTexture?: boolean }).isCubeTexture ? 6 : 1;
  const mipFactor = texture.generateMipmaps ? 4 / 3 : 1;
  return width * height * bytesPerTexel(texture) * mipFactor * faces;
}

/**
 * Estimated GPU texture bytes reachable from the scene graph.
 *
 * This is an ESTIMATE and the HUD labels it as one. It is right about the thing
 * §2.5 cares about — a 3118px uncapped IKEA albedo decoding to ~39 MB of RGBA8
 * — and it is wrong or blind about several others:
 *
 * - It cannot see render targets. The composer chain's own buffers (the ~624 MB
 *   in §1.2) are not in the scene graph and are not counted here.
 * - It cannot see textures three still holds but nothing references, which is
 *   exactly the shape an undisposed leak takes. Cross-read it against
 *   `gl.info.memory.textures`, which counts what the RENDERER has resident: the
 *   two diverging is the leak signature, not either one alone.
 * - The driver's actual allocation may differ (format promotion, alignment).
 *
 * Cost is a full `scene.traverse` plus a Set of unique textures, which is why it
 * runs at `TEXTURE_WALK_INTERVAL_MS`, not per frame and not per publish.
 */
function estimateSceneTextureBytes(scene: THREE.Scene): number {
  const seen = new Set<THREE.Texture>();
  let bytes = 0;

  const account = (texture: THREE.Texture | null | undefined): void => {
    if (!texture || seen.has(texture)) return;
    seen.add(texture);
    bytes += textureBytes(texture);
  };

  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      const slots = entry as unknown as Record<string, unknown>;
      for (const slot of TEXTURE_SLOTS) {
        const value = slots[slot];
        if (value && (value as THREE.Texture).isTexture) account(value as THREE.Texture);
      }
    }
  });

  // The IBL environment and any background texture are scene-level, not on a
  // material, and the PMREM environment is one of the larger single textures in
  // a typical frame — omitting it would understate by a lot.
  if (scene.environment) account(scene.environment);
  if (scene.background && (scene.background as THREE.Texture).isTexture) {
    account(scene.background as THREE.Texture);
  }

  return bytes;
}

interface SamplerState {
  frameMs: SampleRing;
  jsMs: SampleRing;
  lastFrameStart: number;
  lastRenderCounter: number;
  lastPublish: number;
  lastTextureWalk: number;
  textureMb: number | null;
  seq: number;
  drawingBuffer: THREE.Vector2;
}

/**
 * Samples the renderer once per frame and publishes at 4 Hz.
 *
 * Returns nothing — everything reaches the HUD through `perfStore`. Must be
 * called from a component inside the Canvas, and must not be called at all when
 * the HUD is off (see `PerfRig`).
 */
export function usePerfSampler(): void {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // Reads go through `gl` above; the one place that MUTATES the renderer (the
  // info-counter ownership effect below) goes through the store instead, to stay
  // out of the React Compiler's "don't modify a hook's return value" path — a
  // rule that models React state, not a retained-mode graphics API.
  const store = useStore();

  const stateRef = useRef<SamplerState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = {
      frameMs: new SampleRing(WINDOW_FRAMES),
      jsMs: new SampleRing(WINDOW_FRAMES),
      lastFrameStart: 0,
      lastRenderCounter: 0,
      lastPublish: 0,
      lastTextureWalk: 0,
      textureMb: null,
      seq: 0,
      drawingBuffer: new THREE.Vector2(),
    };
  }

  // Take ownership of the info counters for as long as the HUD is mounted, and
  // hand them back exactly as found. See the header for why this is mandatory
  // rather than a convenience.
  useEffect(() => {
    const info = store.getState().gl.info;
    const previousAutoReset = info.autoReset;
    info.autoReset = false;
    info.reset();
    const state = stateRef.current;
    if (state) state.lastRenderCounter = info.render.frame;
    return () => {
      info.autoReset = previousAutoReset;
      info.reset();
      resetPerfStore();
    };
  }, [store]);

  useFrame(() => {
    const state = stateRef.current;
    if (!state) return;
    const now = performance.now();

    // ---- 1. frame period ---------------------------------------------------
    // rAF-to-rAF wall clock. This is the number the §5 exit bar is stated
    // against, and the only one that reflects vsync, compositor back-pressure
    // and dropped frames. It says nothing about WHERE the time went — that is
    // what the JS measure below is for.
    if (state.lastFrameStart > 0) state.frameMs.push(now - state.lastFrameStart);
    state.lastFrameStart = now;

    // ---- 2. renderer counters for the frame that just finished -------------
    const info = gl.info;
    const rendersPerFrame = info.render.frame - state.lastRenderCounter;
    state.lastRenderCounter = info.render.frame;
    const drawCalls = info.render.calls;
    const triangles = info.render.triangles;
    const points = info.render.points;
    const lines = info.render.lines;
    info.reset();

    // ---- 3. main-thread cost inside the R3F frame --------------------------
    // A microtask queued from inside a rAF callback runs at the microtask
    // checkpoint immediately after that callback returns — and R3F runs its
    // whole loop (every `useFrame` subscriber, then the composer's draw) in ONE
    // rAF callback. So this interval covers: every subscriber ordered after this
    // one, plus the composer's pass chain, plus all the GL command submission
    // that entails.
    //
    // It EXCLUDES React's own render/commit work and any subscriber registered
    // before this one, and — because WebGL is asynchronous — it excludes GPU
    // execution entirely. A large gap between this and the frame period is the
    // signature of a GPU-bound frame; the two tracking together means CPU-bound.
    // That distinction is the whole reason both numbers are here.
    queueMicrotask(() => {
      state.jsMs.push(performance.now() - now);
    });

    // ---- 4. throttled publish ---------------------------------------------
    if (now - state.lastPublish < PUBLISH_INTERVAL_MS) return;
    state.lastPublish = now;

    if (now - state.lastTextureWalk >= TEXTURE_WALK_INTERVAL_MS) {
      state.lastTextureWalk = now;
      state.textureMb = estimateSceneTextureBytes(scene) / (1024 * 1024);
    }

    gl.getDrawingBufferSize(state.drawingBuffer);
    const frameMsP50 = state.frameMs.percentile(50);

    const sample: PerfSample = {
      seq: ++state.seq,
      frameMsP50,
      frameMsP95: state.frameMs.percentile(95),
      fps: frameMsP50 > 0 ? 1000 / frameMsP50 : 0,
      jsMsP50: state.jsMs.percentile(50),
      jsMsP95: state.jsMs.percentile(95),
      rendersPerFrame,
      drawCalls,
      triangles,
      points,
      lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      // `programs` is the array three keys its shader-program cache by. It is
      // null until the renderer initialises, and it is the number that exposes a
      // material-clone blowup: every distinct program cache key compiles and
      // holds its own GLSL program for the life of the context.
      programs: info.programs?.length ?? 0,
      dpr: gl.getPixelRatio(),
      drawingBufferWidth: state.drawingBuffer.x,
      drawingBufferHeight: state.drawingBuffer.y,
      shadowAutoUpdate: gl.shadowMap.autoUpdate,
      heapMb: readHeapMb(),
      textureMb: state.textureMb,
    };

    publishPerfSample(sample);
  }, 0);
}
