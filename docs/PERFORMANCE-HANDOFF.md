# Performance workstream — handoff

**For the next session. Read this first, then `docs/PERFORMANCE.md` for the full plan.**

Branch: `perf-integrated-gpu` (off `accounts-cloud-sync`). One commit: `77da52e`.
Not merged, not deployed. Merging is `git checkout accounts-cloud-sync && git merge perf-integrated-gpu`.

---

## Where things stand

| Phase | State |
|---|---|
| 0 — perf HUD (`?perf=1`) | shipped |
| 1 — free GPU wins | shipped |
| 2 — render on demand | shipped |
| 3 — cap IKEA textures | **blocked on a licensing answer** (§7.3 of the plan) |
| 4 — CPU re-render cascade | not started |
| 5 — quality tiers | not started, deliberately gated |

Dan verified by hand on a GTX 1060: shadows correct, hover works, cutaway fades complete, WASD moves, furniture pops to full size. **Nothing has been measured on an integrated GPU.** Every number in `docs/PERFORMANCE.md` is still estimated from source.

---

## The two live issues — start here

### A. Outlines look aliased / "spikey"

Dan's report after Phase 1+2. **Treat this as a likely regression from Phase 1, not a pre-existing condition.**

Two suspects, both one-line toggles. A/B them in that order:

1. **`transparencyAware = false`** (`src/render/AmbientOcclusion.tsx`) — the prime suspect. The GPU audit explicitly said this "stops AO accounting for transparent surfaces (glass at 0.22 opacity, cutaway walls at 0.13)" and that it *"needs an A/B screenshot before shipping"* — **that A/B was never done.** Dan's scene is a large house with many windows, which is exactly where it would show. To test, comment out the two lines in the `useLayoutEffect` and compare.
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

## Suggested first move

Ask Dan to open walkthrough with `?perf=1` on the big house and paste the HUD numbers. That single reading tells you whether B is fill, draw calls or CPU, and it is the first real measurement this workstream will have had. Then A/B the AO toggle for issue A.
