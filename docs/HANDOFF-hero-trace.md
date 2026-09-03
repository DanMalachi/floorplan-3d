# Handoff — `feat/hero-trace`

Written 2026-09-04. Delete this file when the branch merges.

**Branch:** `feat/hero-trace`, 5 commits, **nothing pushed**. Working tree clean.
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

## The one open bug: the phantom oven

An oven renders in the middle of the hero scene. **Not fixed.**

What is established, all measured:

- It is **not in `scene.furniture`** — nearest item 2.74 m away.
- **No geometry exists at its location** — confirmed by raycasting through its
  exact pixel with the app's own camera, and by a world-bounding-box sweep.
  Both find only whatever is genuinely behind it.
- It is **unselectable**. With the object behind it deleted, clicking it selects
  nothing at all.
- **Not a placement ghost** — Escape does not clear it, and ghosts render at 0.55
  opacity while this is opaque.
- It appears on a **fresh load with zero interaction**, and on a clean dev server
  with no HMR history.
- It survived the render-contract fix, so it is **not** stale-buffer residue.
- **Absent on done.design** (Dan confirmed), so it is not hurting users.

**Strongest lead, not yet chased:** when the scene was measured, only **7 of 11**
BlenderKit GLBs had mounted, and the Electric Stove (`f7`,
`blenderkit:76e31f48-…`) was one of the four missing. An oven appearing where no
oven is listed, while the stove that *is* listed has not mounted, points at the
**asset-loading path** (`FurnitureLayer`'s `AssetModel` / drei's `useGLTF` cache)
rather than the scene graph. Start there.

Note those measurements were taken while the contract bug was breaking Canvas
startup, so the "7 of 11" figure needs re-taking now that rendering works.

### How to look at it

`CounterItemGhost.tsx` is one of the few non-protected components mounted INSIDE
the Canvas, which makes it the only practical injection point for a probe:

```tsx
import { useStore } from "@react-three/fiber";
function DevSceneProbe() {
  const store = useStore();
  useEffect(() => { (window as any).__done3D = store; }, [store]);
  return null;
}
```

Then `window.__done3D.getState()` gives `scene`, `camera`, `gl`, `raycaster`.
Turbopack did not always pick this up on edit — restart the dev server if
`__done3D` stays undefined.

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
