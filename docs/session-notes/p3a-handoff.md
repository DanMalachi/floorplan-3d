# Phase 3a session handoff — updated 2026-07-20

Branch: `phase-3a-renderer` (worktree `fp-phase3a`, terminal B per
`docs/extraction-plan.md`'s two-terminal table). The 2026-07-19 session
built the ResPlan→schema-v1 converter (`extraction/synth/resplan_convert.py`)
up through room assembly and found the offset-convention fix (below). The
2026-07-20 session fixed the face-polygon construction bug that fix's own
diagnostic (`diagnose_cycle_unrepairable.py`) surfaced, then fixed a QA
script bug in `diagnose_clean_rate.py` that had been hiding a second,
same-sized failure mode (`broken_room_cycle` on required rooms) behind
"uncategorized". The renderer (deliverable 2) has still not been started.

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
  boundary edge can span multiple short wall segments) — if no candidate
  survives, or the survivors don't cover enough of the edge, the room is
  flagged `broken_room_cycle` and dropped **before stage 2 ever runs**;
  (2) the sequence is verified/repaired for actual topological
  connectivity (bounded BFS bridge, max depth 3) since per-edge coverage
  alone doesn't guarantee consecutive picks share an endpoint — failing
  this is flagged `cycle_unrepairable`. A repaired cycle is only accepted
  if its **mitered face polygon** area-matches the source room polygon
  within `area_match_tolerance` (held at **5%**, per Dan's instruction not
  to loosen the gate — confirmed correct this session, see below).
  **Face-polygon construction (2026-07-20 fix):** each wall is still offset
  inward by its own half-thickness × `EMPIRICAL_FACE_OFFSET_MULTIPLIER`,
  but corners are no longer built by unconditionally intersecting
  consecutive offset lines as infinite lines (undefined for
  collinear/parallel neighbors — e.g. a straight run split into two wall
  ids of different thickness — and silently wrong, self-intersecting the
  ring, at reflex/concave corners like any L-shaped room). `_corner_vertices`
  now tries the true miter intersection and only accepts it within
  `_MITER_LIMIT` (8.0) half-thicknesses of the real centerline junction,
  otherwise falls back to a bevel (two vertices) — the standard CAD/stroke
  fallback. A residual hairline self-intersection from a short chamfer
  wall between much-thicker neighbors is healed via `buffer(0)`, only when
  healing stays a single Polygon. Verified against all 7 originally-
  classified degenerate cases: 5 now resolve directly, 2 remain a
  *different* bug (wall_cycle revisits the same wall id — issue #3,
  filed, not fixed). Wall `role` heuristic: `external` (on/near `inner`
  boundary) / `rail` (only adjacent room type is `balcony`) / `internal`.
- **`resplan_convert.py`** — wires it all together; CLI with
  `--limit`/`--workers` (ProcessPoolExecutor); writes per-plan schema-v1
  JSON + `converter_stats.json`. "Clean" definition: no exception,
  validator-clean, zero broken `CLEAN_REQUIRED_ROOM_TYPES` (bedroom/
  bathroom/storage/stair — open-plan `living`/`kitchen`/`balcony` excluded
  per Dan's 2026-07-19 scope decision, matching the already-deferred
  open-plan-zones limitation) — "broken" here means either
  `broken_room_cycle` or `cycle_unrepairable`, both count against the
  bar — opening-attach ≥95%, ink-coverage ratio in [0.85, 1.15]. 30 tests
  passing in `extraction/synth/` (59 across the whole repo).
- **`extraction/synth/qa/diagnose_clean_rate.py`** — its `categorize()`
  function only checked `room:cycle_unrepairable:` flags, silently missing
  `room:broken_room_cycle:` even though both count against the real clean
  bar above. Fixed 2026-07-20 (see "Corrected failure categories" below);
  the bucket is renamed `room_assembly_failed_required`/
  `_open_plan_only` since it now covers both failure points.

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

### Result: area-error histogram (per-room-cycle, 150-plan sample)

| | Before calibration (k=1.0) | After calibration, pre corner-fix | After corner-fix (2026-07-20) |
|---|---|---|---|
| n room-cycles | 650 | 650 | **763** |
| Median error | 4.50% | 2.43% | **2.09%** |
| p90 | 8.36% | 4.86% | **4.79%** |
| % within 5% | 51.2% | 91.5% | **91.9%** |
| % within 10% | 97.7% | 99.8% | **99.1%** |
| % degenerate (implied_area≤0) | — | ~32% of the *failure* bucket | **0.3% of all room-cycles** |

(`extraction/synth/qa/measure_area_error.py`, added 2026-07-20, reproduces
this on demand.) The remaining 0.3% degenerate is entirely issue #3
(repeated wall id), not an offset/construction problem.

### Result: plan-level clean rate (n=300)

**45.0% clean (135/300)** — up from 36.7% pre corner-fix, still well short
of the ≥90% target.

**Corrected failure categories** (`categorize()`'s bug fixed 2026-07-20 —
see below; a plan can count in more than one):

| Category | % of plans | (old, buggy label/count) |
|---|---|---|
| `room_assembly_failed_required` | **52.0%** (156/300) | was split across `cycle_unrepairable_required` (44.3%/93 — undercounted) + most of `uncategorized` (13.0%/46) + part of `other_validator_problem` |
| `opening_sibling_overlap` | 6.0% (18/300) | unchanged |
| `room_assembly_failed_open_plan_only` | 2.7% (8/300) | was folded into `other_validator_problem`/`cycle_unrepairable_open_plan_only` |
| `other_validator_problem` | 0.3% (1/300) | was 8.0%/24 — 23 were masked room-assembly failures |
| `opening_projection_failed` | 0.3% (1/300) | unchanged |
| `uncategorized` | **0%** | was 15.3%/46 — fully explained, not a distinct failure mode |

## Key open finding — read this first next session

Two rounds of investigation this session (2026-07-20), each correcting the
previous one's diagnosis:

**Round 1 — `cycle_unrepairable_required` was never a connectivity
problem.** The 2026-07-19 handoff assumed the BFS bridge depth-3 cap was
the blocker. A 15-plan diagnostic (`diagnose_cycle_unrepairable.py`) found
0/22 failing required-room instances were actually `_repair_connectivity`
returning `None` — all 22 were area-match failures, split 68% near-miss
(5–9% error) / 32% degenerate (`implied_area=0.0`, a real construction
bug in the pairwise infinite-line mitre). **Fixed**: `_corner_vertices`
mitre/bevel solver (see `rooms.py` bullet above). Population-wide result:
degenerate rate 32%→0.3%, plan clean rate 36.7%→45.0%. **The residual
near-miss noise (median 2.09%, p90 4.79%) is the offset multiplier's own
previously-measured irreducible variability — the area gate was correctly
left at 5% (per Dan's standing instruction), and this bucket has no
obvious further lever.**

**Round 2 — `uncategorized` (13.0%→15.3% after round 1's reclassification
shuffling) was a QA-script bug, not a new pipeline failure mode.**
`diagnose_clean_rate.py`'s `categorize()` checked only
`room:cycle_unrepairable:` flags, never `room:broken_room_cycle:` — even
though `resplan_convert.py`'s real clean-bar computation counts both. A
15-plan sample of the uncategorized bucket was 15/15 (100%) explained by
this single gap. **Fixed** (see `diagnose_clean_rate.py` bullet above) and
reconciled exactly against n=300 (69 plans expected to reclassify by a
naive count; 8 landed in the open-plan-only variant instead of required,
and 2 previously-hidden open-plan-only plans turned out to also have a
required-room `broken_room_cycle` flag — net 69−8+2=63, matching the
measured 93→156 jump exactly).

**Net effect: `broken_room_cycle` on a required room is now known to be a
THIRD, same-sized, still-unexplored failure mode** — 21.0% of all plans
exclusively (63/300), vs. 20.7% exclusively for the (already-understood)
`cycle_unrepairable` near-miss noise, with 10.3% hitting both. **Filed as
issue #4** with three hypotheses (no candidate wall band found / coverage
ratio below the 0.5 threshold / angle-filter rejecting a real match) —
not started, next session's target.

### Issue #4 progress (2026-07-21 diagnostic session)

`extraction/synth/qa/diagnose_broken_room_cycle.py` (committed) instruments
`rooms.py::assemble_rooms`'s stage-1 per-edge coverage loop. Sampled the
15-plan "exclusively" population (`room_assembly_failed_required`, zero
`cycle_unrepairable:` flags anywhere in the plan). 20 required-room
instances, 47 broken edges. A first pass over-attributed 80% of instances
to the angle filter (`angle_filter_rejected_real_match`), but most
rejected candidates had `cos_angle` near 0.0 — near-perpendicular walls
butting into a corner, exactly the case the filter's own comment says the
0.9 cutoff exists to reject. Rescoping to only count moderate-tilt
rejections (`cos_angle` in [0.5, 0.9) — plausible diagonal/chamfered
walls) as genuine near-misses collapsed that category to 20%/10.6% (edges)
and surfaced a **fourth, dominant category the three named hypotheses
didn't cover**:

| Category | Instances | Edges |
|---|---|---|
| **no_angle_valid_candidate** (new) | 55.0% (11/20) | 57.4% (27/47) |
| coverage_below_threshold (hyp. 2) | 20.0% (4/20) | 27.7% (13/47) |
| angle_filter_rejected_real_match (hyp. 3) | 20.0% (4/20) | 10.6% (5/47) |
| no_candidate_band (hyp. 1) | 5.0% (1/20) | 4.3% (2/47) |

`no_angle_valid_candidate`: a broad-phase STRtree candidate exists near
the edge, but every one is near-perpendicular and none survives even
hypothetically — no genuinely-angled wall is ever near the edge. Read
from absence in the STRtree query, so treated as a lead, not a
conclusion, pending direct confirmation.

**Positive confirmation** (`extraction/synth/qa/verify_no_angle_valid_candidate.py`,
committed): checked 3 of the 11 `no_angle_valid_candidate` instances
directly against raw GT wall ink (pre-skeleton) and the extracted
skeleton, using a wall-thickness-scaled proximity (not edge-length-scaled
— an early version scaled by edge length and "found" unrelated parallel
walls 11-22 units away in an axis-aligned building, misclassifying all
three) and an ink **coverage ratio** projected onto the edge's own
parametric range (not a boolean "is there any qualifying ink nearby" —
that conflated a genuine full-length wall match with a short unrelated
ledge that happened to be parallel and close: a 3.49-unit ledge "matched"
a 17.47-unit edge at first pass). Result: the lead splits into three
distinct, confirmed mechanisms, none of which is a uniform "skeleton
pruned a spur":

- **plan 3807, bathroom_0, edge 0** (`extraction/synth/reports/no_angle_candidate_3807_bathroom0_e0.png`,
  gitignored, regenerate via the script) — **missing_from_skeleton**. GT
  wall ink exactly matches the edge (identical endpoints, `ink_coverage_ratio`
  well over 1.0 from overlapping ink features), but the skeleton runs one
  continuous straight vertical wall through that point with no trace of
  the small lateral jog the raw polygon actually has. Looks like
  skeleton *simplification* smoothing away a small real offset, not spur
  pruning — revises the original hypothesis in `diagnose_broken_room_cycle.py`'s
  docstring.
- **plan 634, storage_0, edge 2** (`extraction/synth/reports/no_angle_candidate_634_storage0_e2.png`)
  — **partial_ink_partial_gap** (new sub-category). `ink_coverage_ratio`
  0.033: only a sliver near one end of a 17.47-unit edge is backed by
  real wall ink (a short ledge); the other ~17 units run through genuinely
  open space. The room polygon's edge is not "a wall extraction missed" —
  most of it isn't a wall at all.
  Not yet clear whether this is a valid record of a wall-less room
  boundary or a fixture/other feature; needs the domain check noted below
  before deciding.
- **plan 881, bathroom_0, edge 0** (`extraction/synth/reports/no_angle_candidate_881_bathroom0_e0.png`)
  — **no_ink_at_all**. The room polygon has a small (4.8-unit) notch with
  zero qualifying wall ink anywhere within a generous, thickness-scaled
  proximity — a room-polygon tracing artifact, not a skeleton or
  room-assembly bug at all.

**Open**: n=3 is a confirmation spot-check, not a population estimate —
the 55%/57.4% no_angle_valid_candidate split above should NOT be assumed
to break down 1/3-1/3-1/3 into these three mechanisms without running the
verification script over a larger sample of the 11 (or all ~63 plans).
That's the immediate next step before deciding any fix, since the three
mechanisms imply different fixes (skeleton simplification tuning vs.
room-polygon/GT convention question vs. no action needed).

Also open: **issue #3** — 2 known cases (ResPlan plans 2642/`bathroom_1`,
3973/`bathroom_0`) where the assembled `wall_cycle` revisits the same
wall id (a per-edge-coverage bug, not a face-polygon construction one).
Small (0.3% of all room-cycles), not urgent, but tracked.

## Next-session plan, in order

1. **Root-cause `broken_room_cycle` on required rooms (issue #4).** Same
   pattern as this session's `diagnose_cycle_unrepairable.py`: sample
   ~15 plans, instrument `assemble_rooms`'s per-edge coverage loop
   (`rooms.py` lines ~330–396) to record, per broken edge, whether any
   STRtree candidate was found at all, what `covered/edge_len` was, and
   which candidates the angle filter (`cos_angle < 0.9`) rejected and why.
   Categorize into the three hypotheses in issue #4 (or a new one if the
   data doesn't fit) before deciding a fix.
2. Lower priority: issue #3 (repeated wall id) — small (2 known cases,
   0.3% of room-cycles), worth a quick sample-and-categorize pass but not
   urgent given its size relative to issue #4.
3. **Only then decide fixes.** Continue the established discipline: each
   fix this session (and the two before it) was a real, specific,
   measured bug — not a threshold/tuning change. Keep re-measuring
   (`measure_area_error.py`, `diagnose_clean_rate.py`) after each fix
   rather than assuming.

## For Phase 0

`extraction/synth/rooms.py`'s `EMPIRICAL_FACE_OFFSET_MULTIPLIER = 0.838`
is a stopgap measured against ResPlan specifically. **Phase 0's labeling
spec (`docs/labeling-spec.md`, §0.3 of `extraction-plan.md`) needs to
explicitly define the room-polygon-to-wall-centerline convention** —
otherwise this same offset resurfaces as phantom room-IoU error when
Phase 1's baselines are scored against corpus GT, and nobody will know why
without rediscovering this session's calibration trail.
