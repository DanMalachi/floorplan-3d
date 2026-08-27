# Performance Plan — smooth on integrated GPUs

**Status:** Phases 0, 1 and 2 SHIPPED (unverified on integrated-GPU hardware — see §8). Phase 3 blocked on the IKEA licensing question in §7.3. Phases 4 and 5 not started.
**Written:** 2026-08-27. Based on four parallel read-only audits (frame scheduling, GPU fill, scene/geometry, CPU/main-thread).

**Sign-off recorded 2026-08-27:** Dan approved (1) edits to the protected 3D layer for this workstream and (2) the two render-contract amendments in §7.2. The IKEA licensing question (§7.3) is still open and is the only thing blocking Phase 3.

**Confirmed by Dan after Phase 1:** shadows still look correct under `shadowMap.autoUpdate = false`. GPU load on the 1060 remained 40-50% on a large plan with many windows and lights — consistent with the change, since Phase 1's shadow win lands on *static* frames and that reading was taken while interacting. Many lights is a separate, untouched cost (contract §10's own tripwire: non-shadow-casting point lights add per-fragment forward-lighting cost that scales with room count).

**Target:** the app is smooth on machines with no dedicated GPU — Apple M-series MacBooks first, Intel/AMD integrated second — without degrading the design fidelity the product's north star rests on.

**Baseline today:** GTX 1060 6GB @1080p, 30-50% utilisation, smooth. M2/M5 MacBook: laggy, hot.

---

## 1. Why a machine faster than the 1060 runs this worse

An M2 has a *better* GPU than a GTX 1060 by most measures. It runs this app worse for four reasons that compound, and every one of them is close to free on a discrete card:

1. **Retina doubles the pixel count.** `dpr={[1,2]}` (`src/render/contract.ts:30`) means a 1512x982 MacBook viewport renders 3024x1964 = 5.94 Mpx, against the 1060's 2.07 Mpx at 1080p. Every screen-sized pass costs **2.86x** more. Shadows cost the same on both — which is why the naive "it's just Retina" reading understates it.
2. **Memory is shared, and this app eats a lot of it.** Render targets alone total ~624 MB on the Mac (~240 MB on the 1060), and a furnished scene adds an estimated **~700 MB of uncompressed furniture textures**. The 1060 absorbs that into 6 GB of dedicated VRAM. The M2 carves it out of the same pool the OS, browser and CPU are using.
3. **Bandwidth, not compute, is the wall.** Estimated render-target traffic is ~1.6-2.0 GB/frame on the Mac. An M2's unified bus is ~100 GB/s *shared with the CPU and display*; the 1060 has 192 GB/s dedicated. At the observed frame rates this app consumes an estimated **50-60% of the Mac's entire memory bus** before a single material texture is read. On the 1060 it's 20-23%. That is the arithmetic behind "runs hot".
4. **Apple GPUs are tile-based (TBDR), and three settings in this app defeat tiling directly** — `preserveDrawingBuffer: true`, a per-frame depth blit, and two full-screen `gl_FragDepth` writes that disable hidden-surface removal. These are neutral-to-free on NVIDIA's immediate-mode architecture and actively hostile on Apple's.

**The headline:** roughly **5x the pressure for the same code.** None of this is visible on the hardware you develop on, which is exactly why it survived this long.

---

## 2. What the audits actually found

Five findings dominate. Three were surprises.

### 2.1 The post chain is 14 passes, not 3

`Viewport.tsx:501-513` reads `N8AO -> ToneMapping -> SMAA`. What executes per frame is 15 passes, 5 of them full-resolution, plus a redundant full-res half-float memcpy inside N8AO itself (`n8ao/dist/N8AO.js:1790-1795`, ~95 MB/frame).

### 2.2 N8AO silently latched into `transparencyAware` mode, and it triples the shadow cost

**The single most expensive accident in the codebase.** N8AO auto-detects transparent materials once and latches the flag permanently (`N8AO.js:1414`). Your scene guarantees a frame-one hit — wall glass (`WallMesh.tsx:626`), rail glass (`:1059`), cutaway fades (`:237,270`), the drei `<Grid>`, every ghost and pick plane.

Once latched, each frame adds 4 more `scene.traverse` calls, 2 full-res RGBA16F clears, 2 full-screen `gl_FragDepth` writes (which disable HSR on Apple GPUs) — and **2 extra `renderer.render()` calls**. Because `WebGLRenderer.render()` invokes `shadowMap.render()` unconditionally and N8AO only hides objects that have a material (lights stay visible), **every shadow map re-renders three times per frame**: 3 x (2048² + 6x1024²) = **31.4 M shadow texels and 21 render-target binds per frame.** Two of the three produce near-empty maps nothing ever samples.

### 2.3 Shadows re-render every frame for a scene that is static most of the time

`gl.shadowMap.autoUpdate` is never set anywhere in `src/` and defaults to `true`. That's 10.5 M shadow texels, 7 RT binds and 7 geometry submissions **per `gl.render`** — tripled by 2.2.

Critically: **orbiting the camera changes neither shadow map.** The sun's ortho frustum is anchored to the model (`Environment3d.tsx:104`) and cube shadows to fixture positions. The most common interaction in the app pays the full shadow bill for zero pixels of change.

### 2.4 A GPU memory leak on ordinary furniture placement

`FurnitureLayer.tsx:106-114` builds a cloned scene graph — including cloned materials — in a `useMemo` with **no disposal**. The file contains **zero** `.dispose()` calls; the structurally identical `ParametricModel.tsx:62-77` has the cleanup done correctly.

The trigger makes it worse than it sounds: `tint` sits in the memo's dependency array, and `tint` flips red/null from a collision check on **every pointermove while dragging** (`:373`). Sliding a sofa along a wall discards a full set of cloned `MeshStandardMaterial`s per pointer event, none of them ever freed. The tab's GPU footprint grows for its whole life.

The comment at `ParametricModel.tsx:60` shows how it slipped in — *"unlike GLTF clones, which drei's cache still owns"*. True of the **geometry** (`Object3D.clone()` shares `BufferGeometry` by reference), false of the **materials**, because `normalize()` clones those. The clones are owned by nobody. On 6 GB of dedicated VRAM this takes a long time to hurt; on shared laptop memory it is a direct route to swapping and thermal throttling. **This alone may account for the "gets worse the longer you use it" half of the symptom.**

### 2.5 Furniture textures are an unbounded asset-pipeline problem

| Catalog | Count | On disk | Mean/item | Ingest |
|---|---|---|---|---|
| IKEA | 390 | 376.8 MB | 0.97 MB | **no cap, no re-encode** — IKEA's `glb_draco` shipped as-is |
| BlenderKit | 75 | 19.2 MB | 0.26 MB | 1024px cap + WebP + Draco (`scripts/blenderkit/optimize.ts:38`) |

Disk size badly understates GPU cost. IKEA textures are uncapped — measured 528px to **3118px**, median ~1680px — and JPEG/PNG decode to uncompressed RGBA8 on the GPU. Median IKEA item = **~30 MB of GPU texture memory**; BlenderKit's capped median = ~16.8 MB. A 25-item furnished scene lands near **700 MB**.

BlenderKit already proves the fix works. IKEA never got the same treatment.

### 2.6 The CPU side: one cascade, unthrottled

`Viewport.tsx:311` subscribes to the whole `scene` object, and there is **zero** `React.memo` anywhere under `src/viewport3d/`. Every gesture tick replaces the top-level `scene`, so React re-executes *every* wall, opening, room, furniture item and fixture in the plan — not just the one that moved. Drag handlers call `updateGesture` straight from `onPointerMove` with no rAF throttle (9 call sites), and pointermove is not clamped to display refresh, so on a high-poll-rate trackpad the whole cascade can run more than once per painted frame.

Per-item selectors are actually good (they return booleans/strings). That hygiene is defeated because the parent re-render forces children to run regardless.

### 2.7 What is already correct — do not "fix" these

The audits cleared a lot, and these are the in-repo reference patterns for the work below:
- `Suburb.tsx` / `City.tsx` — **fully instanced**, correct `frustumCulled={false}` on InstancedMesh. Copy this pattern.
- `useGLTF` caching + `Object3D.clone()` — geometry is correctly shared across placements. No re-fetch or re-parse anywhere.
- Module-level texture caches (`materials.ts:974`, `textures.ts:181`, etc.) — correct "small bounded set, share forever" design.
- `Rain` is already one draw call. `<Environment>` renders once, not per frame. `<Sky>` is correctly depth-rejected.
- Snap grids, drag ghosts and run handles fully unmount when idle.
- `triangulateFloor` is correctly memoized off `[scene.rooms, scene.nodes]`, so it does **not** re-run during drags.
- Konva/trace and Liveblocks were both suspected and both cleared — see §6.

---

## 3. The plan

Sequenced so that **everything visually free ships before anything that trades quality.** The tier ladder is last on purpose: this is a design product, and degrading fidelity fights the north star. It may also prove unnecessary — Phases 1-3 could be enough on their own.

### Phase 0 — Measure on the real hardware — SHIPPED (HUD only)

Nothing here is verifiable on a 1060. `done.design` is live and public, so the loop is: instrument, open the live URL on an M-series Mac, read real numbers.

- Dev-only perf HUD behind `?perf=1`: `renderer.info` (draw calls, triangles, geometries, textures, **programs**), frame time p50/p95, JS heap, `WEBGL_debug_renderer_info` GPU string, resolved DPR.
- A GPU-memory counter that makes the §2.4 leak visible as a rising line while dragging furniture.
- Extend the existing Playwright pattern (`scripts/render/capture-m1c.mjs`) into a frame-timing regression harness, so later phases have before/after numbers rather than vibes.
- **No perf number in any later phase is accepted without a before/after capture on an actual integrated-GPU machine.** Every figure in this document is an estimate from source until Phase 0 replaces it.

**New files only. No protected files touched.**

### Phase 1 — The free wins — SHIPPED

Ships as **one** change. Estimated **-35 to -45% of Mac GPU frame time**, plus the leak fix.

| # | Fix | Where | Est. win |
|---|---|---|---|
| 1 | `shadowMap.autoUpdate = false` + `needsUpdate` on a defined trigger list | `Viewport.tsx`, `RoomLights.tsx` | -18% |
| 2 | `transparencyAware = false` (also kills the per-frame `scene.traverse`) | new `src/render/AmbientOcclusion.tsx` | -15% |
| 3 | `antialias: false, alpha: false` | `Viewport.tsx:414` | -6% |
| 4 | Drop `preserveDrawingBuffer`, capture via a `useFrame(cb, 2)` rig | new `ThumbCaptureRig.tsx` | -5% (wide error bar) |
| 5 | Keep N8AO mounted, toggle `pass.enabled` instead of unmounting | `AmbientOcclusion.tsx` | removes a ~250 MB alloc hitch at every drag start/end |
| 6 | **Dispose cloned materials in `GlbModel`** | `FurnitureLayer.tsx:106` | fixes the leak in §2.4 |

Notes:
- #1 needs a complete refresh-trigger list: `timeOfDay`, `envPreset`, `weather`, `scene` identity, live gesture (every frame for its duration), door gesture, `wallMode`/`showCeilings`, RoomLights caster-set change, and **async GLB arrival** — the one trigger with no store event. Safety net: keep `autoUpdate` on for ~3 frames after any Suspense boundary resolves.
- #2 changes AO behaviour on transparent surfaces (glass at 0.22 opacity, cutaway walls at 0.13). Expected subtle. **A/B screenshot required before shipping.**
- #3 is visually free by construction: the MSAA backbuffer anti-aliases exactly one fullscreen triangle whose three edges are off-screen. It cannot change a pixel. `antialias` and `alpha` should be **added to the contract's assertion set** so a future R3F bump can't silently reinstate them — this is precisely the §1.1 failure mode the contract exists to catch, and it slipped through because `gl={{...}}` spreads *over* R3F's defaults rather than replacing them.
- #4: `viewportCapture.ts` is protected; leave it in place unused rather than editing it. There is exactly one caller (`ProjectsOverlay.tsx:55`), needing one 480px JPEG on overlay mount.

### Phase 2 — Stop rendering when nothing changes — SHIPPED

The idle-heat fix. `frameloop` is unset, so R3F renders at 60fps forever whether or not anything moved. A laptop sitting on a design for an hour renders 216,000 identical frames.

Build/furnish/view in the Studio preset can run on `demand` with **zero visual change**. Only three states need continuous rendering:

```
frameloop = (walkthroughMounted || envPreset === "suburb" || (envPreset !== "none" && weather === "rain"))
  ? "always" : "demand"
```

City is static (its night glow is a `useLayoutEffect`). The time-of-day slider is event-driven, not frame-driven. `CameraControls` already self-pins and releases correctly — verified in drei 10.7.7.

**Ten blockers, all in code that bypasses React.** R3F invalidates on every prop change, so drags, undo/redo and mode switches repaint for free. What breaks is imperative work:
- Hover highlights written straight to `material.emissiveIntensity` in a `useEffect` (~7 sites) — **hover would silently stop working**, while selection would accidentally keep working. Most dangerous item on the list.
- Damped animations freeze mid-transition: cutaway wall fades stick half-transparent, furniture placement pop freezes at ~85% scale.
- WASD camera dies on the first keypress — `keydown` only sets a ref; the movement lives in `useFrame`, and no frame is scheduled.
- Async texture fills (floors, window/door frames, TV stills, wall art) never trigger a repaint.
- `RenderContractCheck` needs a guaranteed second frame.
- Thumbnail capture could read a stale buffer.

Each is a one-line `invalidate()`. **They must all land together** or the mode ships visibly broken.

One trap worth recording: `Rain` and `Suburb` clamp `dt` with `Math.min(dt, 0.05)`, so they'd time-dilate under sparse frames. That's why they need `"always"` rather than an `invalidate()` fix.

### Phase 3 — Cap the furniture textures

Pure asset-pipeline work. **No app code, no protected files, no visual change at normal viewing distance.**

Mirror `scripts/blenderkit/optimize.ts` for the IKEA catalog: 1024px cap, WebP, Draco, then re-verify the way `verify-optimized.ts` already does. One-time batch over 390 GLBs, re-upload to Vercel Blob.

Estimated furnished-scene texture memory: **~700 MB -> ~200 MB.** Also cuts download and parse time.

**Check IKEA's terms tolerate re-encoding before running.** BlenderKit's assets are CC0; IKEA's are not, and this is a redistribution question, not just a technical one. If re-encoding is not permitted, the fallback is a runtime downscale on texture load for integrated-GPU tiers — worse (it costs decode time on the client) but legally clean.

Also free while in there: furniture GLB textures get no anisotropy at all (default 1), while floors get 8. One line, and furniture is very often viewed at grazing angles.

### Phase 4 — Cut the CPU cascade

- `React.memo` the leaf components under `src/viewport3d/` — their existing scalar selectors make bail-out cheap.
- rAF-throttle the 9 `onPointerMove` -> `updateGesture` call sites.
- Code-split the viewport behind `next/dynamic(..., { ssr: false })`. Today `three` + `drei` + `postprocessing` are all in the initial bundle, and because `appMode` defaults to `"trace"` and is not in `DURABLE_KEYS`, **every session mounts the Trace UI first and pays the full 3D parse cost anyway** — including users who never open the 3D view.
- Drop the `JSON.stringify(spec)` memo key in `ParametricModel.tsx:58` — it runs on every render before the memo can skip it. Mostly subsumed by memoizing the component.
- Make the material clone in `ParametricModel.tsx:30-33` and `FurnitureLayer.tsx:76-92` **conditional** — it currently clones unconditionally even when no tint or opacity is in play, collapsing ~90 materials per kitchen run down to ~3.

### Phase 5 — Quality tiers (only if Phases 1-4 aren't enough)

New `src/render/quality.ts` with `detectDefaultTier()` (GPU string + DPR + a frame-time probe), user-overridable from the Scene panel. Default High on discrete, Balanced on integrated.

| Knob | High | Balanced | Low |
|---|---|---|---|
| DPR cap | 2 | **1.5** | **1.25** |
| N8AO | on, halfRes | on, halfRes, 8 samples / 1 denoise | **off** |
| AA | SMAA | FXAA | FXAA |
| Room-light shadow casters | 1 | 1 | **0** |
| Rain particles | 2600 | 2600 | 800 |
| Est. cumulative Mac win | -38% | **-65%** | **-78%** |

**DPR is the single largest and most linear lever** — 2 -> 1.5 is 44% fewer fragments on every full-res pass, and on a Retina panel still reads as "slightly soft", not pixelated.

**Do not vary `SHADOW.mapSize`.** §3.2 forbids scene-dependent shadow resolution, per-tier is the same hazard renamed, and 1024 sits *below* the contract's own stated quality floor (3.4 cm/texel, past the point §3.2 itself calls "a chair leg's contact shadow disappears"). Phase 1 #1 gets the entire shadow win at zero image cost anyway.

**Do not drop the composer to `UnsignedByteType`.** It would halve every full-res target and is the largest single bandwidth saving available — and §2.1 forbids it by name, because an 8-bit target clamps radiance before tone mapping and destroys the physical-units system the whole render stack rests on. Recorded here so nobody proposes it later.

---

## 4. Sequencing

```
Phase 0 (measure) ─┬─> Phase 1 (free GPU wins)   ─┐
                   ├─> Phase 2 (frameloop demand) ─┤
                   ├─> Phase 3 (asset re-ingest)  ─┼─> re-measure ─> Phase 5 only if needed
                   └─> Phase 4 (CPU cascade)      ─┘
```

Phase 0 gates everything. Phases 1-4 are independent and parallelisable. Phase 5 is deliberately gated on re-measurement — **do not start it until the free wins are measured**, because it is the only phase that costs visual quality and it may turn out to be unnecessary.

---

## 5. Exit bars

| Metric | Today (est.) | Bar |
|---|---|---|
| Idle GPU frame time, M-series, Studio build mode | 60 fps of identical frames | **0 rendered frames** |
| Furnished-scene texture VRAM | ~700 MB | **< 250 MB** |
| GPU memory after 5 min of furniture dragging | unbounded growth | **flat** |
| Interactive frame time p95, M2, furnished 3-bed | unmeasured, "laggy" | **< 16.7 ms** |
| Render-target traffic share of Mac memory bus | ~50-60% | **< 25%** |
| Visual output at High tier | — | **unchanged** (calibration cells re-captured and matching) |

---

## 6. Cleared, with caveats

- **Konva / 2D trace editor** — the `<Stage>` genuinely unmounts when hidden (its `ResizeObserver` collapses to 0x0), and there is no background `Konva.Animation` loop. *Caveat: inferred from source, not confirmed in a browser. A 5-minute DevTools check — switch to Build mode, confirm the Konva `<canvas>` elements are gone from the DOM — would settle it.* The real Konva cost is at load time (§2.6).
- **Liveblocks / Yjs** — presence is throttled to 16 ms and drags only commit to the Yjs doc at `endGesture`, not per frame. It rides the §2.6 cascade but adds no new mechanism.
- **`squareUpScene`** — grep found **no production call site**; it appears to be reachable only from tests. Either it's genuinely unwired or there's a path the audit missed. Worth a sanity check against the "squareUp solve at Generate" assumption, but it is not a perf issue either way.
- **A second `WebGLRenderer`** lives in a module-level singleton at `src/furniture/thumbnails.ts:14-21`, created lazily and never released, driving furniture-browser thumbnails. Two live GL contexts is a real cost on Apple silicon. Not yet quantified — worth a look during Phase 0.

---

## 7. Governance — needs Dan's sign-off before any code is written

1. **Protected files.** `docs/PROTECTED_PATHS.md` lists `Viewport.tsx`, `WallMesh.tsx`, `FurnitureLayer.tsx`, `environment/*` and `walkthrough/*` — every file this work needs. That rule is scoped to the extraction rebuild and says to stop and ask. **This document is the ask.** The proposal keeps the protected diff deliberately small: ~6 lines in `Viewport.tsx`, one disposal effect in `FurnitureLayer.tsx`, ~7 one-line `invalidate()` calls in Phase 2. All new logic lives in new unprotected files under `src/render/`.
2. **Contract amendments** (`docs/render-contract.md`):
   - §1.1 — record `antialias: false` / `alpha: false` and add them to the assertion set. *(A gap, not a conflict: §2.3 already forbids the mirror case by name.)*
   - §1.1 — amend the DPR clause if Phase 5 proceeds. The existing text forbids dpr *above* 2 without amendment; a tier ladder makes it a variable and should be recorded as one.
   - Baseline rule: `docs/calibration/` captures at **High only**, with the tier recorded per cell — the same mechanism already used for the `cutaway`/`top` departures. Balanced and Low carry no correctness claim.
3. **IKEA re-encoding rights** — a licensing question, not a technical one. Blocks Phase 3.

---

## 8. Confidence

Every number in this document is **estimated from source**. No profiler was run and no measurement was taken on the failing hardware — Phase 0 exists precisely to replace these figures with measured ones. The *mechanisms* are traced through actual library source (three r185, postprocessing 6.39.2, n8ao, R3F 9.6.1) and are solid; the *magnitudes* are arithmetic on stated assumptions and should be treated as directional.

Two findings need no measurement to justify fixing, because they are defects rather than tuning: the undisposed material clones (§2.4) and the triple shadow render (§2.2).
