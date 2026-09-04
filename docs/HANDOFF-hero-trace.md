# Handoff — `feat/hero-trace`

Written 2026-09-04. Delete this file when the branch merges.

**Branch:** `feat/hero-trace`, 6 commits, **nothing pushed**. Working tree clean.
A push to `main` is a production deploy, so this branch is the safe place to sit.

Three paths are untracked and were deliberately left alone — they were already
there before this work: `docs/NAMING.md`, `docs/NAMING-BRIEF.md`, and
`public/furniture/blenderkit/opt-ktx2/` (the KTX2 set you are holding). An early
`git add -A` swept them in once; that commit was rewritten and they are untracked
again. **Do not `git add -A` on this branch.**

---

## What is done and verified

**The hero plays the product's core loop.** "see how it's done." traces the plan
by hand — two continuous strokes, 8 walls — places 4 windows and 2 doors in the
app's own colours (doors `#e0852b`, windows `#2bd4e0`, lifted from
`legacy/src/trace2d/TraceCanvas.tsx`), presses Generate, and the room builds for
real: `Wall.height` is a schema field, so the walls actually extrude through
ordinary scene patches. No protected file was touched for any of it.

Verified by seeking the animation frame by frame at t=3.0 / 7.4 / 9.0 and by
watching the built room in the browser.

**The demo sits in a macOS-style window** — traffic lights, centred title, one
frame around the viewport and the controls. The plan reads as a real drawing:
room names and areas, chained dimensions, slash ticks, `DIMENSIONS IN CM · 1:50`,
and a live centimetre readout counting up under the pen.

**Three bugs fixed along the way**, each found by running the page rather than
reading it:

1. `heroSequence` was imported from both the main chunk and DemoStage's lazy
   chunk. A module imported by two chunks is instantiated **once per chunk**, so
   the "singleton" was two variables — the button changed its own label while the
   animation sat still, and nothing threw. DemoRoom now owns the subscription and
   passes `stage` + setter across as props.
2. The hero was being **saved as the user's first project**. `doInit` captured
   its pristine defaults from the live store, which — arriving from the hero —
   was the hero's flat, and `createProjectMeta` writes `defaults` as the document
   for every new project. Fixed at the source (`getInitialState()`), plus the
   hero now restores the store on unmount, plus `APP_HREF` is `/design?home=1` so
   the CTA lands on the project library every time. Verified from a wiped
   IndexedDB: first project and a later "New plan" both come out pristine.
3. The **render contract asserted something three no longer permits**. three
   0.185 hard-codes the context to `alpha: true`, so `gl.context.alpha: false`
   was unsatisfiable and fired on every load — and because it throws in dev from
   inside R3F's frame loop, it broke Canvas startup: canvas stuck at 300×150, no
   children mounted, black viewport. Production only logs, which is why
   done.design was never affected.

---

## The phantom oven — FIXED 2026-09-04

It was the Electric Stove (`f7`), drawn at the **world origin** instead of at the
wall. The stove is the only skinned model in the catalog — 1 of 465 GLBs (75
BlenderKit + 390 IKEA, all scanned for `skins`) — and `normalize()` cloned it
with `Object3D.clone(true)`, which copies a `SkinnedMesh` but **not** its
`Skeleton`. Every copy therefore stayed bound to the original bones, which live
in drei's `useGLTF` cache, are never added to any scene, and so sit at (0,0,0)
for the life of the tab. The GPU skins by those bones.

Fixed by cloning with `SkeletonUtils.clone` in `FurnitureLayer.tsx` (protected —
Dan approved before the edit, logged in `docs/PROTECTED_PATHS.md`) and in
`PerfFurnishRig.tsx`'s deliberate copy of that function. Verified: the phantom
is gone, the stove stands against the right wall, and the skeleton diagnostics
flip from `boneRootIsAppScene: false` / `boneWorld [0,0,0]` / one shared skeleton
to `true` / `[3.5, 0, -1.9]` / 20 own skeletons.

### The two false negatives that cost the previous session hours

Both are worth remembering, because both look like solid evidence:

1. **A bounding box or a raycast says nothing about where a skinned mesh is
   drawn.** `Box3.setFromObject` and `Mesh.raycast` read `matrixWorld`; skinning
   happens after that, on the GPU. So every measurement correctly reported the
   stove at the wall while it was visibly drawn in the middle of the room. That
   contradiction *was* the diagnosis, and it read as "there is no geometry here".
2. **A raycast from the orbit camera hits the near cutaway wall first.** Cutaway
   fades walls in the shader; it does not remove the geometry. So the nearest hit
   is always a wall, and anything past it looks like "only what is genuinely
   behind it".

### How to get a probe into the scene without editing a protected file

three dispatches every `Scene` and `WebGLRenderer` it constructs to
`window.__THREE_DEVTOOLS__` if that exists. Install an `EventTarget` there before
the page loads (Playwright `addInitScript`) and you get the renderer with no code
change at all. Note `three` assigns `this.render` as an **own** property
(`three.module.js:17603`), so patch the instance, not the prototype:

```js
const hook = new EventTarget();
hook.addEventListener("observe", (e) => {
  const o = e.detail;
  if (!o?.isWebGLRenderer || window.__patched) return;
  window.__patched = true;
  const orig = o.render.bind(o);
  o.render = (scene, camera) => {
    if (scene.children.length > 3) { window.__appScene = scene; window.__appCamera = camera; }
    return orig(scene, camera);
  };
});
window.__THREE_DEVTOOLS__ = hook;
```

Two more things that made this tractable, both reusable:

- **Pin the camera.** `cam.position.set(...); cam.lookAt(...)`, then override
  `cam.updateMatrixWorld` to re-copy that pose each frame. Auto-orbit otherwise
  moves the shot between runs and a pixel stops meaning the same thing twice.
- **Identify by elimination, not by picking.** Toggling `visible` on every mesh
  matching a material name and re-shooting settles in one frame what a raycast
  argued about for hours.

`Mesh.raycast` only reads `raycaster.ray.origin`, `.direction`, `.near` and
`.far`, so a duck-typed raycaster object is enough — no need to reach the `THREE`
namespace from outside the bundle.

---

## Open decisions

- **`/design?hero=1` furnishing.** Dan furnished the room and copied the
  furniture array to his clipboard; it still needs pasting into
  `src/landing/demoScene.ts`. That session is not saved anywhere else.
- **The contract's failure mode.** When the contract legitimately fires it takes
  the whole viewer down into a stale canvas, because the throw is inside
  `useFrame`. Throwing during render instead would make a real violation loud
  rather than mysterious. Flagged, not done — the dev-throw/prod-log split is
  deliberate.
- **The patio window is 2.55 m** and the storage cabinet moved to y 1.55 to clear
  it. Widening it further means moving the cabinet again.

---

## Gotchas that cost real time

- **An occluded or background tab gets ZERO `requestAnimationFrame` callbacks.**
  The trace sits at t=0 and looks broken while being perfectly correct. A
  screenshot forces a paint but not a frame. `TraceOverlay` exposes a dev-only
  `__doneTraceSeek(seconds)` for exactly this — `draw()` is a pure function of
  time, so seeking renders any instant as the loop would.
- **A module singleton cannot cross a dynamic import.** See fix 1 above.
  `viewport3d/autoOrbitPlayback.ts` gets away with it only because both its ends
  live inside the lazy chunk. Do not generalise from it.
- **`gl.info.render` has `autoReset = true`** — it resets on every `render()`
  call, so under a composer it only ever shows the LAST pass. `calls: 1,
  triangles: 1` is normal, not a dead scene pass. This misled me for a while.

## Verify before shipping

`npx tsc --noEmit` · `npm run build` · `npx tsx src/render/contract.test.ts`
(8/8) · load `/` and watch the sequence end to end · check wheel and touch still
scroll the page over the hero · `/design?home=1` opens the library.
