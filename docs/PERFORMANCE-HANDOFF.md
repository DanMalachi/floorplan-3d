# Performance workstream — handoff

**For the next session. Read this first, then `docs/PERFORMANCE.md` for the full plan.**

Branch: `perf-integrated-gpu` (off `accounts-cloud-sync`). Three commits:
`77da52e`, `e6e7d7d`, `6d7704d`. Not merged, not deployed. Merging is
`git checkout accounts-cloud-sync && git merge perf-integrated-gpu`.

---

# ⚠ START HERE — state at end of session 2026-08-28

All of the session's work is **committed** — five commits, `2dce53f` through
`28946a6`, on top of `6d7704d`. Still unmerged and undeployed. It typechecks
clean (`npx tsc --noEmit`, exit 0) and lints clean apart from one pre-existing
`react-hooks/exhaustive-deps` warning in `src/render/RoomLights.tsx` that this
work did not touch.

| Landed 2026-08-28 | What it is | State |
|---|---|---|
| `src/render/perf/furnish{Plan,Params,Bridge}.ts`, `PerfFurnishRig.tsx` | the `--furnish N` benchmark scene | **works, verified by real runs** |
| `scripts/perf/measure.ts` | `--furnish` / `--furnish-mix` wiring + loud shortfall warning | works |
| `src/render/perf/PerfRig.tsx` | mounts the furnish rig | works |
| `src/render/renderDebugFlags.ts` + `AmbientOcclusion.tsx` | `?ao=transparent` / `?ao=off` hatch for issue A | works, **never looked at by Dan** |
| `src/parametric/ParametricModel.tsx` | conditional material clone + memo key (Phase 4) | done, verified 112→3 materials |
| `src/viewport3d/walkthrough/collision.ts` | scratch object, ~0 real saving | done, kept for robustness not perf |
| `scripts/perf/baselines/2026-08-28-*.json` | first furnished baselines | reference data |
| `docs/perf-drawcalls.md` | draw-call inventory | complete |

`docs/NAMING.md` / `docs/NAMING-BRIEF.md` are untracked and belong to the
branding work, **not** to this workstream. They were deliberately left out of
these commits. Leave them alone.

Two servers may still be running from that session: dev on `:3000`, a production
build on `:3001` bound to `0.0.0.0` for measuring from another machine on the
LAN (`http://192.168.7.14:3001`). **The `:3001` build predates every change in
the table above** — it is the pre-Phase-4 baseline. Rebuild before drawing any
conclusion from it.

## Do these next, in this order

1. **Fix the door-swing cascade.** Biggest known unfixed cost, fully specified in
   the CORRECTED block under finding 5 below. Three `useMemo` dep arrays to
   narrow in `WalkthroughMode.tsx` (copy the `colliders` precedent at `:162`) and
   a proportionate fix for `ShadowRefreshRig` re-rendering every shadow map every
   frame during a door swing. Protected files — keep the diff surgical. Careful
   with `blockingColliders`: it tracks door open/closed state, and getting it
   wrong means walking through a closed door.
2. **`React.memo` the leaves under `src/viewport3d/`.** There is currently *zero*
   memo there. It will actually pay, because the per-frame store write is a
   shallow spread — `{...liveScene, openings}` keeps `scene.walls`/`nodes`/`rooms`
   and every element inside them at their original references, so memoized leaves
   bail out immediately. **Map prop stability before adding a single `memo()`**:
   it is pure added cost on any component whose parent hands it a fresh array or
   inline closure. Note `jsMs` excludes React render/commit, so the perf harness
   cannot see this change — do not claim a measured win.
3. **Re-scope Phase 3 once Dan rules on KTX2** (see open decisions). Do not spend
   effort on the 1024 cap before that ruling: measurement says it is a ~2x win
   against a bar that needs ~7x.
4. **Remaining Phase 4:** rAF-throttle the 9 `onPointerMove` → `updateGesture`
   sites (a shared helper in `src/render/` keeps the protected diff to one line
   each), and code-split the viewport behind `next/dynamic`.
5. **Issue A screenshot A/B.** Never done — the agent assigned to it died before
   writing a line. The `?ao=` hatch it was going to drive does work. Drive a
   headed Chromium the way `scripts/perf/measure.ts` does (headless falls back to
   SwiftShader and would render a software rasteriser's idea of anti-aliasing,
   which is the exact thing under test), point the camera at windows and rails,
   and produce a contrast-boosted difference image. Dan judges it, not you.

## Open decisions that are Dan's, not yours

1. **KTX2.** Measurement says no uncompressed-RGBA8 path reaches the <250 MB exit
   bar. Dan previously ruled KTX2 out deliberately (`encoder:null` fails closed by
   design). **ANSWERED 2026-08-30: conditionally yes — acceptable if it does not
   change actual visual quality. Dan asked for a PILOT on a few representative
   items first, judged by his eye, before it goes near the whole catalog.**
   Pilot in flight.
2. **Wall mode during the 23.8 ms p95 reading** — **ANSWERED 2026-08-30: SOLID.**
   So `WallMesh.tsx` (~:319) allocating a fresh material array per wall per frame
   during cutaway fades is NOT implicated in that reading — it only runs in
   `wallMode === "cutaway"`. Drop it as a suspect for the 23.8 ms tail; the
   door-swing cascade is the remaining candidate. Do not spend effort there.
3. **`tagTint()` on kitchen generators.** Switching them to the narrower
   `tagTintOfMaterial` (as `wardrobe` already does) would hold the 112→3 material
   win when a user picks a colour — but it changes what the colour wheel *does*
   to a kitchen (tints tagged meshes only, not carcass and handles). A look
   decision. **ANSWERED 2026-08-30: approved, conditional on a visual check** —
   implement it, then show Dan what changed so he can judge the look in the app.

## Two process notes worth keeping

- **Five parallel agents all died at once on a weekly account rate limit.** Two
  had landed complete work, one had written its document, two had done nothing.
  Everything above survived because each agent owned a disjoint file set. Keep
  doing that.
- **A hollow run is worse than a failed one.** `--furnish-mix blenderkit`
  reported numbers identical to an empty house because all 40 models silently
  failed to load. The truth was in the results JSON and nowhere else. That class
  of bug is what `scripts/perf/README.md`'s "four things that will silently
  produce wrong numbers" is about — assume there is a fifth.

---

---

## Where things stand

| Phase | State |
|---|---|
| 0 — perf HUD (`?perf=1`) | shipped |
| 1 — free GPU wins | shipped |
| 2 — render on demand | shipped |
| 3 — cap IKEA textures | blocked on licensing — and **now also mis-scoped**, see 2026-08-28 below: a 1024 cap cannot reach the exit bar |
| 4 — CPU re-render cascade | **started 2026-08-28.** `ParametricModel` conditional clone + memo key: done. `React.memo`, rAF-throttled pointer moves, code-split viewport, door-swing cascade: not started |
| 5 — quality tiers | not started, deliberately gated — and measurement keeps arguing it is the wrong lever (the app is CPU-bound, 91-94% furnished) |

Dan verified by hand on a GTX 1060: shadows correct, hover works, cutaway fades complete, WASD moves, furniture pops to full size. **Nothing has been measured on an integrated GPU.** Every number in `docs/PERFORMANCE.md` is still estimated from source.

---

## First real measurements (2026-08-27)

Supersedes "every number in `docs/PERFORMANCE.md` is still estimated from source".
Two sources: hand readings on Dan's GTX 1060 / 75 Hz display, and
`npm run perf:measure` (see `scripts/perf/README.md`), which runs vsync-free.

**The scene measured was UNFURNISHED.** Every number below is a floor, not a
worst case, and none of it bears on Phase 3.

### The hand readings were clamped

All of them came back at 13.3 ms p50 with a p95 0.2 ms above it — 1000/75, the
refresh interval. Facing a blank wall (42 draw calls) cost exactly as much as
looking across the house (687). That is vsync, not the app.

**Issue B is not a defect on this hardware.** "Walkthrough hits 60% GPU" is what
a vsync-capped app that comfortably makes its deadline looks like — 40% of each
frame the GPU is idle by choice. It should stop being described as a live defect.

### Vsync-free, DPR 1, unfurnished (GTX 1060, 1730x883, 1.53 MP)

| scenario | frame p50 | fps | js p50 | js share | renders | calls | tris | tri/call |
|---|---|---|---|---|---|---|---|---|
| editor:city | 1.15 ms | 870 | 1.00 ms | 87% | 12 | 140 | 2943 | 21 |
| editor:studio | 1.00 ms | 1000 | 0.90 ms | 90% | 12 | 120 | 1483 | 12 |
| editor:suburb | 1.10 ms | 909 | 1.00 ms | 91% | 12 | 129 | 172055 | 1334 |
| walk:still | 0.70 ms | 1429 | 0.60 ms | 86% | 12 | 62 | 355 | 6 |
| walk:forward | 0.60 ms | 1667 | 0.50 ms | 83% | 12 | 38 | 247 | 7 |
| walk:look | 0.60 ms | 1667 | 0.50 ms | 83% | 12 | 62 | 355 | 6 |

### Findings

**1. The app is CPU-bound, not GPU-bound. `js` is 83–91% of every frame.**
`jsMs` excludes React render/commit and all GPU execution, so this is pure
`useFrame` + composer + GL submission cost. The GPU is not the constraint here.

**2. DPR is not "the biggest and most linear lever". It is nearly free.**
`--dpr 2` quadruples the drawing buffer (1.53 → 6.11 MP, verified in the results
JSON) and costs **0.05–0.10 ms**: 1.15 → 1.20 ms in editor:city, 0.70 → 0.80 ms
in walk:still. Lead #2 in the walkthrough section below is refuted on discrete
hardware. It may still hold on integrated GPUs, where bandwidth and tile memory
are the scarce resources — but it is now a hypothesis about hardware nobody has
tested, not an established lever.

> **NARROWED 2026-08-28.** True for the median, false for the tail — and the tail
> is what users feel. Furnished at DPR 2, p50 is still flat (3.6 → 3.7 ms) while
> p95 goes 6-17 ms → **88-123 ms**. See the furnished section below.

**3. Draw calls are pathologically unbatched.** 22 triangles per draw call in the
hand readings (687 calls / 15.4k tris), and 6–21 across the automated ones.
Healthy is thousands. Every wall segment, window frame, mullion and rail post is
its own submission — which is why the frame is CPU-bound. Measured cost is
**~7.5 µs per draw call over a ~1.28 ms floor**, fitted across four hand readings
(29 / 42 / 508 / 687 calls). Nothing in Phases 3–5 addresses this; Phase 4 targets
React commit work, which `jsMs` does not even measure.

**4. `gl.render calls` is 12 per displayed frame, invariant.** Identical in all
four hand readings and all six automated scenarios, regardless of scene content —
a fixed 12-pass composer chain. Free on a 1060; this is the cost most likely to
dominate on an integrated GPU, and the one number here that should transfer
worst.

**5. Heap sawtooth under motion.** The hand readings swing 83 → 165 MB, roughly
50 KB of garbage per frame while moving; automated runs show 15–43 MB swings. The
only bad frame-time number in the entire hand dataset — p95 23.8 ms against a
13.5 ms baseline, i.e. dropped frames — appeared only while moving. A GC pause of
that size is the obvious candidate.

> **CORRECTED 2026-08-28 — the attribution in this finding was wrong.**
> `walkthrough/collision.ts` and `furnitureCollision.ts` were audited and
> measured: they allocate **~0 bytes per frame** in steady state. The one object
> literal there is scalar-replaced by TurboFan's escape analysis (old 1.8 B/call
> vs new 4.5 B/call over 200 k calls with the scavenger suppressed — both noise),
> and the broad-phase cull is far tighter than it looks: mean 2.5 segments pass
> over 10 509 sample points, max 7. Nominal ceiling from both files is
> 0.4–1.4 KB/frame, under 3% of the measured garbage. The scratch-object change
> was kept anyway — it guarantees zero rather than relying on the optimizer — but
> it is not the fix.
>
> The mechanism that IS coupled to movement is the **door-swing cascade**.
> Walking within 1.5 m of a door starts a 1–2 s animation during which
> `WalkthroughMode.tsx:517-524` calls `updateGesture({...liveScene, openings})`
> **every frame**. New `Scene` identity per frame ⇒ (a) `Viewport.tsx` subscribes
> to the whole scene and there is zero `React.memo` under `src/viewport3d/`, so
> every wall, room, fixture and furniture item re-executes; (b) three `useMemo`s
> re-run — `blockingColliders` (`:163`, which re-runs `buildJoinery` per closed
> door per frame), `doorAnchors` (`:168`), `stairGround` (`:189`) — while
> `colliders` (`:162`) was already narrowed to `[scene.nodes, scene.walls]` and
> correctly does not; and (c) `doorGestureActive` makes `ShadowRefreshRig.tsx:86-91`
> re-render the 2048² sun map **plus all six faces of every point-light cube,
> every frame**, reinstating precisely the cost Phase 1 removed. **Not yet fixed.**
>
> Also open, and cheap to settle: `WallMesh.tsx` (~:319) allocates a fresh
> material array per wall per frame while cutaway fades run, and camera motion
> keeps them from settling — ~10–15 KB/frame on a 200-wall house. This only
> applies in `wallMode === "cutaway"`; **ask Dan which mode the 23.8 ms reading
> was taken in** before chasing it.
>
> `performance.memory.usedJSHeapSize` is quantised to ~5 MB buckets and published
> at 4 Hz, so "50 KB/frame" derived from the sawtooth is order-of-magnitude at
> best. A DevTools allocation-sampling profile over 10 s of walking would name
> the retaining sites directly and is better value than more source reading.

**6. Suburb is 172k triangles** against Studio's 1.5k, in only 129 draw calls.
Well batched, and not a problem at these frame times — noted because it is a 100x
geometry difference nobody had quantified.

### Corrections to this document

- **"You cannot verify 3D in an MCP browser tab" is WRONG.** The canvas starts at
  300x150 but sizes to the real 1730x883 once the page settles, and the scene
  renders correctly. What actually fails is *timing*: the tab is
  background-throttled, rAF does not tick, and the HUD reports frame periods in
  the tens of seconds. Resource counts and draw calls from an MCP tab are usable;
  timing never is.
- **`?perf=1` works directly on `/v/<id>`.** No need to fight the redirect.

### Open bug found while measuring

`gl.context.alpha: expected false, got true` — the render contract throws this on
every dev page load on this branch, and the HUD's own device line reads
`alpha on`. `Viewport.tsx` passes `alpha: CONTEXT.alpha` (false) to the Canvas,
so either R3F is overriding it or a dependency default changed. Pre-existing, not
caused by the perf work, and left unfixed because `Viewport.tsx` is a protected
path. Per `contract.ts`: amend the contract or fix the code, never silence it.

---

## Second measurement pass (2026-08-28) — the first FURNISHED numbers

The previous section's own caveat was "the scene measured was UNFURNISHED —
every number is a floor, not a worst case". There was no furnished scene to
measure: both live Liveblocks rooms (`de882e79`, `949025ae-…`) are the same
near-empty house, 0 catalog furniture between them.

`--furnish N` now builds one. `src/render/perf/furnishPlan.ts` places N real
catalog items deterministically (same count, seed and mix ⇒ identical
placements), perf-gated and never written to the live room. Baselines:
`baselines/2026-08-28-dpr1-furnished40.json` and its DPR 2 twin.

### 40 items, GTX 1060, DPR 1, editor:city

| scene | frame p50 | js share | draw calls | triangles | **texture MB** | textures |
|---|---|---|---|---|---|---|
| unfurnished | 1.2 ms | 83% | 140 | 2 943 | **20** | 40 |
| BlenderKit ×40 | 4.8 ms | 94% | 399 | 973 865 | **869** | 197 |
| mix ×40 | 3.5 ms | 91% | 321 | 902 583 | **1 328** | 183 |
| IKEA ×40 | 2.3 ms | 91% | 186 | 534 677 | **1 692** | 148 |

### What this changes

**1. Texture memory is far worse than the plan assumed, and the §5 exit bar is
not reachable the way Phase 3 proposes.** The plan estimates a furnished scene at
~700 MB and sets the bar at <250 MB. **Forty items already cost 1 692 MB on the
IKEA path** — 42 MB per item — and a furnished 3-bed is not 40 items. Note what
the BlenderKit column means: those assets are *already* what Phase 3 would
produce (1024 px, WebP, Draco), and they still cost **869 MB / 21.7 MB per
item**, 3.5x over the bar on their own. A 1024 px cap is a ~2x win, not a ~7x
one. Nothing that keeps textures as uncompressed RGBA8 reaches <250 MB; only a
GPU-compressed format (KTX2/Basis → BC7/ASTC) does, and that is the thing this
repo has deliberately not installed (`material-spec-m3-pipeline`, Dan's ruling,
`encoder:null` fails closed by design). **Phase 3 needs re-scoping and the KTX2
ruling needs revisiting — ask Dan before spending anything on the 1024 cap.**
Note WebP buys download size, not GPU bytes: it decodes to RGBA either way.

**2. The app stays CPU-bound when furnished — more so.** `js` share goes 83% →
91-94%. Phase 5's quality tiers trade image quality for *fragment* cost, which is
not what is expensive here. It should stay last, and it may stay unnecessary.

**3. DPR: the previous pass's refutation holds for the median and is WRONG for
the tail.** At DPR 2 furnished, p50 is unchanged (3.6 → 3.7 ms) exactly as
before — but p95 goes from 6-17 ms to **88-123 ms**, consistently across all four
editor scenarios and both environments, with `p95Worst` sitting right beside p95
rather than far above it. Dropped frames are what "laggy" feels like; medians are
not. Leading hypothesis, unconfirmed: at 6.11 MP a 12-pass RGBA16F composer chain
plus 1.33 GB of scene textures over-commits the 1060's 6 GB and the driver
stalls. **If that is the mechanism it is strictly worse on an M2**, which has no
dedicated VRAM to hide it in. Caveat: n≈19-25 samples, so p95 is effectively the
second-worst frame of each run — reproducible across eight independent runs, but
worth a longer-duration confirmation before it is built on.

**4. `walk:*` is the CHEAP mode when furnished, not the expensive one** (0.8-1.4
ms, 44-91 draw calls). Frustum culling means first-person sees a fraction of the
house. Issue B's "walkthrough is the worst case" framing does not survive
measurement: the expensive mode is the editor, looking at everything at once.

### Harness bug found and fixed while doing this

`--furnish-mix blenderkit` first reported 140 draw calls and 2 943 triangles —
byte-identical to an empty house. Every model had failed to load: the rig guessed
Draco from the asset id (IKEA yes, BlenderKit no) but `scripts/blenderkit/optimize.ts`
Draco-compresses its output too, and 65 of the 75 GLBs carry
`KHR_draco_mesh_compression`. `ItemBoundary` swallowed all 40 throws. The count
was in the results JSON (`placed 0 / failed 40`) and only the JSON. Fixed both
halves: the rig now always passes the decoder path, matching what
`FurnitureLayer.tsx:222` actually does, and the harness prints a loud stderr
block when `placed < requested` so a hollow run cannot be read as a real one.

---

## The two live issues — start here

### A. Outlines look aliased / "spikey"

Dan's report after Phase 1+2. **Treat this as a likely regression from Phase 1, not a pre-existing condition.**

Two suspects, both one-line toggles. A/B them in that order:

1. **`transparencyAware = false`** (`src/render/AmbientOcclusion.tsx`) — the prime suspect. The GPU audit explicitly said this "stops AO accounting for transparent surfaces (glass at 0.22 opacity, cutaway walls at 0.13)" and that it *"needs an A/B screenshot before shipping"* — **that A/B was never done.** Dan's scene is a large house with many windows, which is exactly where it would show.

   **No longer needs a rebuild to test (2026-08-28).** `src/render/renderDebugFlags.ts` adds a per-page-load hatch read by `AmbientOcclusion.tsx`: `?ao=transparent` restores the pre-Phase-1 behaviour, `?ao=off` disables the pass entirely. The third value matters — it separates "AO is drawing this artifact" from "AO's *transparency mode* is drawing this artifact", which a two-way comparison cannot. Same rules as `?perf=1`: opt-in per load, nothing persisted, and it survives being pasted into a message, which is the actual workflow when the eye judging it is on another machine. These change the image, so none of them may become a product setting without going through `docs/render-contract.md`.
   *If this is the cause, do not simply revert it* — it is worth ~15% of frame time and it triples the shadow cost. Look for a middle path first: AO settings (`aoRadius`, `intensity`, `denoiseSamples`) or reinstating transparency-awareness only where glass is actually present.

2. **`antialias: false`** (`src/viewport3d/Viewport.tsx`, recorded in `contract.ts` `CONTEXT`) — second suspect. The reasoning for removing it was that MSAA only anti-aliases primitive edges and the only primitive drawn to the default framebuffer is the composer's fullscreen triangle, whose edges are off-screen. That reasoning is believed sound but **was never tested against Dan's eye**. Flip it to `true` and look. If it changes anything visible, the model of the pipeline is wrong and that matters more than the setting.

3. If neither is the cause, it is pre-existing SMAA weakness. SMAA is morphological and is weakest on exactly this content — long near-horizontal edges and thin high-contrast geometry like window mullions and rail posts. `docs/render-contract.md` §3.1 already notes penumbra widths are "widened only by SMAA". Options then: SMAA preset/quality, or MSAA on the composer (see the trap below).

**Trap:** §2.3 of the render contract forbids composer `multisampling` *while SMAA is present*. With SMAA removed it becomes legal — but the GPU audit deliberately recommended against it, because MSAA on an RGBA16F target costs 32 B/px of *tile* memory, and tile memory is the scarce resource on the Apple GPUs this whole workstream targets. It would likely be a net loss on the target hardware while looking fine on the 1060.

### B. Walkthrough hits 60% GPU on a 1060

Expected, and the honest reading is that it is the worst-case mode:

- Walkthrough is the one mode pinned to `frameloop="always"` — it is a first-person simulation with pointer-lock mouse-look, so **Phase 2 buys it nothing**.
- First-person means close-up geometry and a wide view of the scene at once.
- Dan's scene has many lights. The render contract's §10 has its own tripwire for this: non-shadow-casting point lights add per-fragment forward-lighting cost that scales **unboundedly with room count**, and that cost multiplies by 2.86x at Retina DPR. Nothing in Phases 0-2 touched it.

Leads, cheapest first:
1. **Measure before optimising.** Open walkthrough with `?perf=1` and read draw calls, triangles and program count. That says whether this is fill/lighting, draw calls, or CPU.
2. **DPR is the biggest and most linear lever** and walkthrough is the best place to spend it — motion hides softness, and Phase 5's Balanced tier (DPR 1.5) is a 44% fragment cut. A walkthrough-only DPR drop is arguably better than a global tier.
3. **Light culling.** Cap the number of point lights contributing per frame by distance to the camera, the way `RoomLights` already ranks shadow casters. This is the untouched cost and probably the real answer.
4. AO could be dropped in walkthrough entirely — motion hides it, and it is the single most expensive pass.

---

## What else is already scoped

**Phase 3 — cap IKEA textures. Blocked, and it is the biggest single memory win.**
IKEA's 390 models ship with **no texture cap** (measured up to 3118px); BlenderKit's 75 get 1024px + WebP + Draco and are ~4x cheaper on the GPU. A furnished scene is an estimated ~700MB of uncompressed texture memory, which a 1060 hides in dedicated VRAM and an M2 cannot.
**The blocker is not technical.** BlenderKit's assets are CC0; IKEA's are not, and re-encoding a hosted model is a redistribution question. Dan is checking. If the answer is no, fall back to a runtime downscale on texture load for low tiers.
Mirror `scripts/blenderkit/optimize.ts`; verify with `verify-optimized.ts`.

**Phase 4 — the CPU cascade.** `Viewport.tsx` subscribes to the whole `scene` object and there is **zero `React.memo`** under `src/viewport3d/`, so every gesture tick re-executes every wall, room, fixture and furniture item in the plan. Nine `onPointerMove` handlers write to the store unthrottled. Three is also in the initial bundle for users who never open the 3D view.

**Phase 5 — quality tiers.** Deliberately last: it is the only phase that costs visual quality, and this is a design product. Do not start it before Phase 0 numbers exist from real hardware.

---

## Things that will bite you

- **`docs/PROTECTED_PATHS.md` is real.** Dan gave explicit sign-off for this workstream on 2026-08-27 — that approval covers performance work and nothing else. Keep the protected diff small; put new logic in new files under `src/render/`.
- **`src/render/contract.ts` throws in dev on violation.** Two amendments are already recorded (`CONTEXT`, and the DPR clause if Phase 5 proceeds). Amend it, never silence it.
- **Never drop the composer to `UnsignedByteType`.** It halves every full-res target and is the largest bandwidth saving available — and §2.1 forbids it by name, because an 8-bit target clamps radiance before tone mapping and destroys the physical lighting system.
- **Never vary `SHADOW.mapSize` per tier.** §3.2 forbids scene-dependent shadow resolution, and 1024 is already below the contract's own stated quality floor.
- **`src/viewport3d/**` is excluded from ESLint** by the repo's own config, so lint will not catch mistakes there. Typecheck and build do.
- **The React Compiler's `react-hooks/immutability` rule fires on renderer mutation.** The established workaround in this branch is `useStore()` + `getState()` rather than `useThree(s => s.gl)`. See `ShadowRefreshRig.tsx`.
- **Most source files are CRLF.** Do not round-trip them through PowerShell; use the Edit/Write tools, or Node with `\r?\n`-tolerant matching.
- **You cannot verify 3D in an MCP browser tab.** The R3F drawing buffer never leaves its 300x150 default there, on every route. Do not spend a session proving that again — hand visual checks to Dan. `?perf=1` mounting IS a usable signal that the tree mounted.
- **`/` redirects to `/v/<id>` for a live project and drops query params.** Re-append `&perf=1`.

---

## Suggested first move — SUPERSEDED 2026-08-28

> This section said: ask Dan to open walkthrough with `?perf=1` and paste the HUD.
> That has been overtaken. The harness now measures automatically and vsync-free,
> walkthrough turned out to be the *cheap* mode, and the question it was meant to
> answer (is B fill, draw calls or CPU?) is answered — CPU, at 83-94% of the
> frame, in every scenario measured. **Use the "Do these next" list at the top of
> this document instead.**
>
> The one reading still genuinely missing is an **integrated GPU**, and it is
> still worth getting. The route that works: `npm run build`, then
> `npx next start -p 3001 -H 0.0.0.0`, and Dan opens
> `http://<LAN-ip>:3001/v/<room>?perf=1&furnish=40` on the M2. A local production
> build beats a Vercel preview — no deployment-protection prompt, no OAuth
> redirect whitelist problem, and it is a real production build rather than a dev
> one, which matters a great deal when the bottleneck is CPU. Measure
> **furnished**; an unfurnished reading is a floor and will understate the case
> on unified memory, where 1.3 GB of texture has nowhere to hide.
