# Phase 5 — Trace, at the level of the rest

Phase 4 set the bar; Trace is still a dev tool wearing new paint. Phase 5 has
two acts, agreed 2026-07-04:

- **Act 1 (now): the Trace experience.** Pain points named by the user:
  overwhelming toolbar, tracing feel, clunky suggestion review.
- **Act 2 (next): the auto-trace itself.** "The main selling point of this
  app" — an out-of-the-box accuracy push. Starts once the ground truth for
  the user's failed plan exists; gets its own design doc.

## Act 1 — the guided rail

The trace pipeline is inherently sequential, so the UI finally says so.
The toolbar wall (10 sections × 30+ controls, all visible, all the time) is
replaced by a **left rail stepper** over a **full-bleed canvas**:

```
① Plan      import image/PDF (one input, routed by type; drag & drop)
② Scale     two clicks + a distance — gates everything after it
③ Walls     ✨ auto-detect → review/accept · AI assist · manual draw tools
④ Openings  ✨ detect → review/accept · manual door/window tools
⑤ Build     rooms summary → Generate 3D → jumps to Build mode
```

Principles:

- **One step visible at a time.** The active step's card shows only its
  controls; other steps collapse to a line with a ✓/number. Steps unlock in
  order (everything after ② needs a scale) but completed steps are always
  revisitable.
- **Auto-advance on progress.** Importing a plan lands you on Scale;
  applying the scale lands you on Walls; accepting walls suggests Openings.
- **Empty state that teaches.** No plan loaded → a centered drop-zone card
  ("Drop a floor plan — image or PDF"), not a toolbar of tiny buttons.
- **Status where you look.** Hints and results render inside the step card,
  not as full-width banner rows. AI options (model, plan description) fold
  into a disclosure — visible when wanted, invisible when not.
- **Generate 3D is a handoff,** not a button: it builds the scene AND
  switches the app to Build mode.

Mechanics: import logic (image/PDF routing, resolution gate) moves into the
store (`importPlanFile`) so the rail, the drop zone, and drag-&-drop share
one path. `traceStep` lives in the store. `Toolbar.tsx` is deleted.
TraceCanvas mechanics (wheel zoom, pan, snapping, rubber-band) stay.

### Act 1 milestones

- **T1** — rail + steps + drop-zone import + auto-advance + Build handoff.
- **T2** — feel: suggestion review polish (hover emphasis, keep/reject
  counts by kind, reject-all), canvas affordances (bigger handles, live
  segment length label while drawing), calibrate overlay polish.

## Act 2 — auto-trace, out of the box (placeholder)

Directions to explore once GT for the failed plan exists (each gets scoped
properly in its own M0): agentic multi-pass VLM (crop-and-zoom tours of the
plan instead of one overview call), classical-CV + VLM fusion with
disagreement-driven zoom, interactive one-click correction loops ("fix this
wall" retrains thickness bands live), segmentation-model spike (licensing
permitting), and synthetic-plan self-training. Success metric stays the
Phase 3 one: correction effort to reach a clean model.

### Act 2 Step 0 — failure taxonomy: the user's plan (2026-07-06)

Diagnosed the in-app failure on `floorplan_for_training/732845872_*.jpg`
(Israeli apartment plan, JPEG, 1319×1213). Verdict: **systemic generator
failure — the raster proposer took the wrong branch.** Classification was
never reached in any meaningful sense. Artifacts: `eval-out/user-plan-732/`
(current pipeline: 2,880 centerlines of noise, overlay.png) and
`eval-out/user-plan-732-gray/` (what-if fix: overlay.png, room-test.ts).

**Chain of failure (current pipeline):**

1. **Branch misroute.** Stroke-width mode voting estimated walls at 4px and
   fell into the thin-strokes branch (mask = all ink). Real walls are 12px
   (interior) / 26px (exterior) gray fills. The ~4px stroke population
   (window symbols, door leaves, JPEG-blurred lines, adaptive-threshold
   halos) dwarfs the wall modes by total skeleton length — mode-by-count
   structurally loses on densely annotated plans.
2. **Everything downstream drowned.** 2,880 centerlines → 600 capped
   candidates (340 "walls", 239 "doors") drawn over text, dimension lines,
   fixtures and the balcony tile grid.
3. **Quality verdict lied.** Report said `good` while producing garbage —
   verdict never checks whether the thin-strokes branch exploded.

**The plan class has a stronger signal than any of our estimators:** walls
are solid **mid-gray fills (~152)**; all annotation is near-black. This is
standard Israeli "gray poché" CAD output — likely the app's core target
domain. A mid-band intensity mask (100–175 + open k5 + close k7) yields a
near-perfect wall mask: 81 centerlines, wall_est 14px, zero
text/dim/fixture/hatch false positives (validated end-to-end via
`rasterToCandidates`: 100 candidates — 54 wall, 17 door — vs 600 noise).

**Remaining failures even with the perfect wall mask** (room-closure test,
mirroring accept-all → `buildPlanarGraph` → `analyzeLoops`): only 5 loops
close, 17 loose ends. Causes, in order of impact:

- **Window gaps don't bridge.** Windows are breaks in the gray fill; only
  door-sized gaps get bridge candidates, so every window opens the loop.
- **Wide sliders exceed the bridge cap.** Living-room balcony slider is
  3.87m > `doorMaxMeters` 3.5 → no gap candidate, no bridge.
- **Fill fragmentation at annotation crossings.** Black lines crossing the
  gray fill erode it; close k7 heals some, leaving thin (6–8px) fragments
  and sub-weld-tolerance gaps (weld 14px vs 20–80px breaks).
- Corner-stamp noise (top-left logo) produces 1–2 junk candidates.

**Fix shape implied (not yet built, pending direction choice):** (a) a
gray-poché branch in `propose_raster.py` — detect a distinct mid-band ink
population with bar-like morphology, use it as the wall mask; (b) harden
the thickness estimator (thickness/area-weighted voting) so annotation
can't outvote walls; (c) bridge *any* fill gap between collinear wall runs
(windows and sliders included — classification decides door vs window
later, which is exactly the iron rule); (d) honest quality verdict when
thin-strokes explodes; (e) close-kernel sized from wall_est, not fixed.

**Status 2026-07-06:** (a) built as the style router + gray-poché extractor
(Steps 1–4, committed). (c) built: universal gap-bridging in
`rasterCandidates.ts` — any collinear break ≤ `openingMaxMeters` (5.0m,
new param) gets a bridge wall; opening-scale breaks (≥ doorMin) also emit
an opening candidate ("wide" flag past doorMax); sub-door breaks weld only
kept-grade runs (floating-bridge/text-dash guard); a new occupancy check
skips pairs whose gap contains a third collinear run. Pair perp tolerance
0.5→0.8×th (eroded fill shifts fragment centerlines); flank rule is now
sum-based (Σ ≥ 0.8×cap, each ≥ 0.25×cap). 732 vs GT: walls 31→33/42,
windows 3→4/5, doors hold 7/7, loose ends 15→12. Baselines hold (Matterport
+1 wall; 1350 windows 9→8 — a 12px noise reject that luckily overlapped a
16px GT window fell to cap crowding; that top wall's windows are paneled
ink, structurally VLM work). Remaining 732 loose ends are PROPOSER-level:
whole fill runs never emitted (bottom-middle bath region) → next milestone
is mask healing in `propose_raster.py` ((b)/(e) above), not candidate work.
