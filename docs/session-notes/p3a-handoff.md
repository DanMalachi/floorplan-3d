# Phase 3a session handoff — 2026-07-19

Branch: `phase-3a-renderer` (worktree `fp-phase3a`, terminal B per
`docs/extraction-plan.md`'s two-terminal table). This session built the
ResPlan→schema-v1 converter (`extraction/synth/resplan_convert.py`) up
through room assembly; the renderer (deliverable 2) has not been started.

## Current state — done and tested

- **Environment**: `.venv` (Python 3.11), `extraction/requirements.txt`
  pinned-unpinned (shapely, networkx, opencv-python-headless, scikit-image,
  numpy, pydantic, Pillow, python-bidi, geopandas, matplotlib, pytest).
- **Data**: ResPlan (17,000 plans, MIT) fetched via `data/resplan/fetch.py`
  from `github.com/m-agour/ResPlan`; vendored `resplan_utils.py` with MIT
  attribution under `extraction/synth/vendor/`.
- **`schema_v1_local.py`** — temp pydantic models + `validate_plan_v1()`,
  mirrors paper.md Appendix A **plus one deliberate addition**: `wall.role`
  includes `"rail"` (not in Appendix A's enum), confirmed with Dan
  2026-07-19 to match `docs/DATA_RIGHTS.md`'s established balcony-boundary
  tracing convention. 11 tests passing. Banner comment marks the whole file
  temporary — reconcile against `extraction/schema/` after the Phase 0 gate.
- **`skeleton.py`** — ResPlan's unified wall polygon → centerline
  `WallSegment`s + `SkeletonJunction`s (rasterize → skeletonize → pixel
  graph → prune spurs → cluster junctions → simplify → map to plan space).
  Verified against synthetic L/T/X fixtures and real-plan overlay QA (zero
  exceptions across 300 real plans). `fill_openings_into_wall()` restores
  wall continuity through door/window cutouts — ResPlan cuts openings out
  of the wall polygon entirely (verified: zero overlap), so this must run
  before skeletonizing or opening-projection fails almost completely.
  Thickness is measured directly against source vector geometry
  (`_measure_thickness_vector`: perpendicular chord sampling,
  junction-excluded, median of samples), falling back to a
  distance-transform raster estimate only for segments too short to have
  an interior sampling zone.
- **`openings.py`** — door/window/front_door polygon → host-wall
  projection (`center_offset`, `width`, sibling-overlap resolution).
  Unattached-opening rate ~0.03% after the gap-fill fix (was ~85% broken
  before it).
- **`rooms.py`** — room polygon → `wall_cycle` assembly in two stages:
  (1) per-edge spatial coverage picks candidate walls (one straight
  boundary edge can span multiple short wall segments); (2) the sequence
  is verified/repaired for actual topological connectivity (bounded BFS
  bridge, max depth 3) since per-edge coverage alone doesn't guarantee
  consecutive picks share an endpoint. A repaired cycle is only accepted
  if its **mitered face polygon** (each wall offset inward by its own
  half-thickness × `EMPIRICAL_FACE_OFFSET_MULTIPLIER`, consecutive offset
  lines intersected — not a uniform whole-cycle shrink, which is biased
  whenever the cycle mixes wall thicknesses) area-matches the source room
  polygon within `area_match_tolerance` (held at **5%**, per Dan's
  instruction not to loosen the gate — see below). Wall `role` heuristic:
  `external` (on/near `inner` boundary) / `rail` (only adjacent room type
  is `balcony`) / `internal`.
- **`resplan_convert.py`** — wires it all together; CLI with
  `--limit`/`--workers` (ProcessPoolExecutor); writes per-plan schema-v1
  JSON + `converter_stats.json`. "Clean" definition: no exception,
  validator-clean, zero broken `CLEAN_REQUIRED_ROOM_TYPES` (bedroom/
  bathroom/storage/stair — open-plan `living`/`kitchen`/`balcony` excluded
  per Dan's 2026-07-19 scope decision, matching the already-deferred
  open-plan-zones limitation), opening-attach ≥95%, ink-coverage ratio in
  [0.85, 1.15]. 29 tests passing across the whole `extraction/synth/`
  package.

Not started: `render.py` / `render/` engine (deliverable 2), contact
sheet, full 17K batch run, gate report.

## The offset-convention finding and fix

Room `wall_cycle`s were assembling and passing connectivity, but failing
the area-match gate at a high rate. Root-caused through several rounds
(see git history on this branch for the full trail — thickness estimation
was checked and confirmed accurate before the real cause was found):
ResPlan's room polygons sit **closer to the wall centerline than a full
half-thickness offset predicts**. Calibrated directly: 107,608 per-wall
perpendicular measurements (wall centerline → source room polygon
boundary) across 800 plans, wall_depth 2.76–6.59. Two models fit and
compared by residual spread:

- Model A (fixed constant, ignores thickness): median 1.72, stdev 0.87, residual σ = 0.429
- **Model B (multiplier k on half-thickness): median k = 0.838, stdev 0.94, residual σ = 0.417** ← applied

Neither model is a tight fit (both carry substantial per-wall noise —
looks like real variability in how ResPlan was authored, not a single
clean named convention). No round/nameable value was identified for `k`.
**This is a measured empirical correction, not a discovered exact
convention** — flagged clearly at its definition site
(`rooms.py::EMPIRICAL_FACE_OFFSET_MULTIPLIER`, with full provenance
comment). `area_match_tolerance` was kept at 5% per instruction (correct
the comparison, don't widen the guard).

### Result: area-error histogram (per-room-cycle, n=650, 150-plan sample)

| | Before calibration (k=1.0) | After calibration (k=0.838) |
|---|---|---|
| Median error | 4.50% | **2.43%** |
| p90 | 8.36% | **4.86%** |
| % within 5% | 51.2% | **91.5%** |
| % within 10% | 97.7% | 99.8% |

This is the "collapse toward 1-2%" signature of a real fix, not
noise-fitting — median landed at 2.43%, well inside the 5% gate.

### Result: plan-level clean rate (n=300)

**36.7% clean (110/300)** — up sharply from 0.3% pre-fix, but still well
short of the ≥90% target. Failure categories (a plan can count in more
than one):

| Category | % of plans |
|---|---|
| `cycle_unrepairable_required` | 44.3% |
| `uncategorized` | 13.0% |
| `opening_sibling_overlap` | 6.0% |
| `other_validator_problem` | 5.0% |
| `cycle_unrepairable_open_plan_only` | 1.0% |

## Key open finding — read this first next session

**The per-room-cycle area-match fix worked (91.5% pass rate) but plan-level
clean is still only 36.7%.** The dominant blocker, `cycle_unrepairable_required`
at 44.3% of plans, is a **pre-area-check reject** — `_repair_connectivity`
returning `None` (the bounded BFS bridge, max depth 3, couldn't connect two
per-edge-matched walls at all) — not an area-match failure. This means the
offset-calibration work this session, while real and worth keeping, was not
attacking the biggest remaining blocker. **Next session's target is cycle
assembly/connectivity, not area matching.**

The 13% `uncategorized` bucket is also unexplained — `diagnose_clean_rate.py`'s
`categorize()` function didn't have a bucket that matched these plans'
actual failure signature; needs investigation, not just a new label.

## Next-session plan, in order

1. **Sample 15 plans from the `cycle_unrepairable_required` bucket.** For
   each, print the per-room rejection detail: the per-edge wall_seq before
   repair, why `_repair_connectivity` failed (which consecutive pair had no
   bridge within depth 3 — dump the adjacency-graph distance actually
   needed, not just pass/fail), and categorize root causes (e.g.:
   genuinely disconnected wall network from a skeleton gap; bridge exists
   but exceeds depth 3; wrong wall picked by per-edge coverage so no real
   bridge exists at all). There is no structured kill-log file yet — this
   session's diagnostic scripts (`extraction/synth/qa/diagnose_clean_rate.py`,
   `diagnose_area_gap.py`) print to stdout only. Building a persistent
   structured kill log (one row per rejected room, with the specific
   rejection reason and enough geometry to re-render it) would make this
   and future debugging much faster — worth doing as the first concrete
   step, not just ad hoc printing again.
2. **Same treatment for the 13% `uncategorized` bucket** — figure out why
   `categorize()` misses them (likely a stats field or flag pattern the
   function doesn't check) and get real root causes, not just a rename.
3. **Only then decide fixes** — likely candidates based on this session's
   pattern (each fix so far has been a real, specific bug, not a tuning
   knob): the BFS bridge depth-3 cap may be too shallow for some real
   junction clusters; the per-edge coverage matching may occasionally pick
   a wrong wall that has no real path to its neighbor; or there may be a
   genuine skeleton-extraction gap (a real disconnection introduced by
   `fill_openings_into_wall` + skeletonization) that connectivity repair
   can't paper over because the underlying wall network really is broken
   there.

## For Phase 0

`extraction/synth/rooms.py`'s `EMPIRICAL_FACE_OFFSET_MULTIPLIER = 0.838`
is a stopgap measured against ResPlan specifically. **Phase 0's labeling
spec (`docs/labeling-spec.md`, §0.3 of `extraction-plan.md`) needs to
explicitly define the room-polygon-to-wall-centerline convention** —
otherwise this same offset resurfaces as phantom room-IoU error when
Phase 1's baselines are scored against corpus GT, and nobody will know why
without rediscovering this session's calibration trail.
