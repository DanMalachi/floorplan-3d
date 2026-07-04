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
