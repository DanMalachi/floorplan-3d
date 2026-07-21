# Phase 3a session handoff — updated 2026-07-21

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

**Open — this is the actual next-session target, read before touching a
fix**: n=3 bought heterogeneity, not proportions. It disproves "the whole
bucket is a skeleton bug" (only 3807 is) but doesn't tell you the mix,
and the mix is the entire decision: if the missing_from_skeleton
mechanism dominates the 11, a skeleton-simplification fix is worth
building; if partial_ink_partial_gap / no_ink_at_all dominate, this is
mostly a labeling-spec/GT-convention question and a skeleton fix would
barely move the clean rate. **Next session: classify all 11
no_angle_valid_candidate instances (from the 15-plan sample; extend the
scan if fewer than 11 turn up) through `verify_no_angle_valid_candidate.py`
and report the real proportions.** Do not assume the three-way taxonomy
above is complete — `partial_ink_partial_gap` only emerged mid-pass on
n=3, so a 4th or 5th mechanism showing up in the full 11 should be named,
not forced into these three. Diagnostic only, still no fix, until the
proportions are in.

Also open: **issue #3** — 2 known cases (ResPlan plans 2642/`bathroom_1`,
3973/`bathroom_0`) where the assembled `wall_cycle` revisits the same
wall id (a per-edge-coverage bug, not a face-polygon construction one).
Small (0.3% of all room-cycles), not urgent, but tracked.

### Population-scale results (2026-07-21 diagnostic session, part 2)

Two measurements, both READ-ONLY, no fix attempted, run in this order
because the first changes whether the second even matters:

**1. Clean-at-source ceiling — `extraction/synth/qa/measure_clean_at_source.py`,
full 17,000-plan population, not a sample.** Runs three checks directly
against the raw source polygons before any conversion step touches them
(no skeletonization, no wall_cycle assembly, no offset calibration, no
mitre solving — the one deliberate exception is `fill_openings_into_wall`,
a lossless deterministic union documented in the script, without which
the "ceiling" came out BELOW the real converter's measured clean rate,
which is incoherent for a true ceiling): wall polygon validity, required-room
polygon validity, and whether each required room's boundary edges are
actually backed by real wall ink (same coverage-ratio technique as the
no_angle_valid_candidate verification below, applied to the raw wall
polygon instead of the skeleton).

**Result: 67.5% clean_at_source (11,472/17,000).** `wall_invalid` 0.0%,
`room_geometry_invalid` 0.0% — ResPlan's raw polygons are topologically
sound at the shapely-validity level, essentially without exception.
**`room_boundary_no_wall_match` 32.5%** — a third of all plans have at
least one required-room edge that doesn't correspond to any real wall ink
at all, even before any of our pipeline's lossy steps run.

**This is the ceiling on the whole phase, and it's below the 90% bar.**
90% clean conversion is arithmetically impossible against this GT as-is —
the most any converter could ever achieve is ~67.5%, no matter how good
`rooms.py`/`skeleton.py` get. Two implications, not yet acted on (Dan's
call, not made here): (a) conversion progress should be re-measured
against the clean-at-source subset specifically, not the full 17K, to see
how close the converter actually is to ITS reachable ceiling; (b) the 90%
bar itself likely needs revising at the P0 gate, with this number as the
evidence, rather than continuing to chase converter fixes toward a target
the data can't reach.

**2. Full-11 classification of `no_angle_valid_candidate` — reusing
`diagnose_broken_room_cycle.py`'s sampler and
`verify_no_angle_valid_candidate.py`'s confirmation logic unchanged** (new
script: `extraction/synth/qa/classify_no_angle_valid_candidate_population.py`).
The prior session's n=3 spot-check proved the bucket is at least three
unrelated mechanisms but said nothing about their mix. Classified all 11
of the 15-plan sample's `no_angle_valid_candidate`-primary rooms (26
edges; a 12th room, plan 1448 `stair_0`, has one such edge too but a
higher-priority category wins its room-level label, so it's reported as a
footnote, not counted in the 11) into attribution buckets:

| Attribution | Room-level (of 11) | Edge-level (of 26) |
|---|---|---|
| **converter_bug** (`missing_from_skeleton` / `present_outside_band` / `present_within_band_UNEXPECTED`) | **81.8% (9/11)** | 80.8% (21/26) |
| gt_error (`no_ink_at_all`) | 9.1% (1/11) | 15.4% (4/26) |
| convention_mismatch (`partial_ink_partial_gap`) | 9.1% (1/11) | 3.8% (1/26) |

`missing_from_skeleton` alone is 57.7% of edges (15/26) — the dominant
single mechanism, and a second independently-verified overlay (plan
13342 `bathroom_1`, beyond the original 3-instance spot-check) shows the
identical pattern already seen on plan 3807: a real small lateral jog
present in the raw wall ink, with the skeleton drawing one straight wall
through the point and no trace of the offset. **Per the decision rule
from last session's framing: converter_bug dominates, so a
skeleton-simplification fix for issue #4 is justified — not yet built.**
The `convention_mismatch` bucket (`partial_ink_partial_gap`) is still
genuinely ambiguous and small (1/11); doesn't change the decision either
way.

**Both numbers matter together, not separately**: issue #4 is worth
fixing (population 2 says so), but fixing it converts converter_bug-typed
failures toward clean — it can NEVER close the `room_boundary_no_wall_match`
gap that sets the 67.5% ceiling (population 1), because that gap is
measured against raw wall ink with no skeleton involved at all. A
skeleton-simplification fix moves the converter closer to 67.5%, not
closer to 90%.

### room_boundary_no_wall_match decomposition (2026-07-21 diagnostic
session, part 3) — READ-ONLY, no fix applied, per Dan's explicit request
before trusting the 67.5% ceiling enough to revise the bar on it

Motivation: the 67.5% ceiling has already been shown to over-count once
(omitting `fill_openings_into_wall` cost 33 points, 34.5%→67.5%). Before
taking 67.5% to the P0 gate, Dan asked for the 32.5% `room_boundary_no_wall_match`
bucket itself decomposed — sampled 27 plans hit by the flag (deterministic
scan, first 1500 plans, `extraction/synth/qa/classify_room_boundary_no_wall_match.py`,
committed) and classified every flagged required-room edge.

**Finding 0 (the big one): a second measurement bug, this time in the
coverage-ratio arithmetic itself, not a missing fill step.**
`measure_clean_at_source.py`'s `_edge_covered` (and
`verify_no_angle_valid_candidate.py`'s copy) sums each candidate wall-ink
edge's projected overlap with the room edge's own `[0,1]` parametric range
via `min(t1,1.0) - max(t0,0.0)` — but never floors that at 0. When a
candidate's projected range falls entirely outside `[0,1]` (genuinely zero
overlap — common for short required-room edges, e.g. bathroom/storage
edges are frequently 2-5 units, sitting near OTHER unrelated wall ink in a
dense cluster of small rooms), this still contributes a large negative
number to the sum, which can swamp a real candidate's positive
contribution. Confirmed directly on plan 3733 (bedroom_1, edge 30): a
candidate with t-range `[-5.12,-3.12]` — no overlap with `[0,1]`
whatsoever — contributes -3.12 to the sum via the unclamped formula.
Visually confirmed on plan 704238 (bedroom_0, edge 16, overlay committed
at `extraction/synth/reports/no_wall_match_measurement_bug_704238_bedroom0_e16.png`):
the edge sits in the middle of solid, unambiguous wall ink on both sides —
obviously fully covered — yet the buggy formula scored it -6.35 (nonsense;
flagged as broken) while a properly-clamped recomputation scores it 1.0
(fully covered, correctly not broken). **Population impact on the 27-plan
sample: 40.4% of flagged EDGES (44/109) and 29.6% of flagged PLANS (8/27)
were false positives explained ENTIRELY by this bug** — real coverage was
fine, the plan should never have been flagged. This bug lives in a QA
script, not the converter (`rooms.py`/`skeleton.py` use a different,
correctly-clamped face-offset/mitre code path) — but `measure_clean_at_source.py`
IS the script that produced the 67.5% ceiling number, so this directly
inflates it. **Not fixed this session** (read-only instruction) —
`_edge_covered_clamped` in the new qa script is a local, diagnosis-only
reimplementation used only to get a trustworthy classification signal.

**Taxonomy of the remaining 65 genuinely-still-broken edges** (i.e. after
correcting finding 0), against the task's (a)-(f) categories, each
confirmed with a source-level overlay (`extraction/synth/reports/no_wall_match_*.png`,
gitignored, regenerate via `generate_overlays()` in the same script):

| Category | Edges (of 65) | Rooms (of 25) | Mechanism, confirmed |
|---|---|---|---|
| (e) opening/doorway | 63.1% (41) | 48.0% (12) | **Dominant.** The room polygon itself steps into a small rectangular notch tracing the door's own footprint (confirmed on plans 9206/7607/3807/10171 — notch edge coordinates land exactly on the door polygon's bounding box). Not a missing wall-ink or missing-union problem — the notch edges are near-perpendicular to the real wall line by construction, so no proximity-band widening or extra fill step can ever match them; fixing this needs the room-edge check itself to skip edges captured by a door polygon (fix work, correctly out of scope here). |
| (d) tracing artifact | 15.4% (10) | 12.0% (3) | Small (≤1.5× wall_depth) interior notch/jog with zero qualifying ink anywhere nearby even at a widened band, no door involved, no traced neighbor found — same mechanism as the already-documented plan-881 `no_ink_at_all` case (re-confirmed with a fresh overlay this session). |
| (c) exterior/boundary/void | 12.3% (8) | 20.0% (5) | Outward probe from the edge lands genuinely outside the `inner` building envelope — confirmed on plan 1448 (stair_0): the edge sits at the traced footprint's own edge with literal blank space beyond, no site feature, no room. |
| (a) genuine GT defect | 4.6% (3) | 12.0% (3) | Confirmed real: e.g. plan 3467 storage_0 edge 0 — a storage closet whose room polygon sits entirely embedded inside a solid, uncut mass of wall ink (overlay confirms no gap/doorway was ever cut into the wall layer for this room at all). More precisely a wall/room-layer overlap inconsistency than a literally "absent" wall, but equally unfixable by the converter — a genuine source-data defect. All 3 instances are on `storage` rooms specifically (edges bordering `living`, in all 3 cases) — worth watching as a pattern if more data turns up. |
| (b) shared/party wall | 4.6% (3) | 8.0% (2) | Outward probe lands inside another traced room, and widening the search band (half- to full-thickness scaled) recovers full coverage — real wall ink exists, just authored asymmetrically toward the neighbor's side beyond the narrow band's reach. Confirmed on plan 9796 (stair_0, edge 0). |
| (f) new category | 0% | 0% | None needed — the four confirmed mechanisms above (plus the doorway-notch reframing of what was expected to be a simple "(e) doorway" bucket) fully covered the sample. |

**Two requested numbers:**

1. **Revised true ceiling estimate: 67.5% + 32.5% × 0.889 ≈ 96.4%**
   (recovered fraction = 24/27 sampled plans had every genuinely-broken
   edge land in class b/c/d/e or the arithmetic-bug bucket; only 3/27 kept
   a real class-(a) defect). **This is a diagnostic-scale estimate from
   n=27, not a population-scale measurement** — unlike the 67.5% itself
   (measured on the full 17,000), this recovered-fraction needs to be
   re-measured at population scale (after fixing finding 0) before it's
   trustworthy enough to set a bar. Treat 96.4% as "the ceiling is
   probably much closer to arithmetically-100%-reachable than 67.5%
   suggested, once measurement artifacts are corrected" — not as a number
   to gate on directly.
2. **Converter clean rate, conditioned on clean_at_source (direct
   intersection, not the ~45/67.5≈67% approximation): n=300,
   clean_at_source=65.0% (195/300), converter_clean=45.0% (135/300, matches
   the existing figure), converter_clean AND clean_at_source=39.7%
   (119/300) → converter_clean | clean_at_source = 119/195 = 61.0%.**
   Slightly below the ~67% approximation — the converter is doing somewhat
   worse against its own reachable ceiling than the two-independent-
   percentages estimate suggested.

**What this changes about the 67.5% number itself**: it is very likely
inflated by finding 0 (the arithmetic bug) at a population scale similar
to what the 27-plan sample shows (~30-40% of the flagged bucket) — the
true clean-at-source ceiling, once `_edge_covered` is fixed and
`measure_clean_at_source.py` is re-run on the full 17K, is almost
certainly well above 67.5%, plausibly in the 85-95%+ range given how
thoroughly the sample's `room_boundary_no_wall_match` instances turned out
to be explainable. **Not re-measured at population scale this session**
(would require editing the QA script, out of scope for a read-only pass).

### Measurement-tooling fix + corrected population re-measurement (2026-07-21
diagnostic session, part 4) — Dan-authorized clamp fix, explicitly still no
converter changes

Per Dan's explicit authorization: this is a fix to a QA/measurement script
(`measure_clean_at_source.py`), not the converter (`rooms.py`/`skeleton.py`
untouched). Three steps, in order:

**1. Fixed the clamp bug.** `_edge_covered`'s overlap sum now floors each
candidate's contribution at its actual overlap with `[0,1]` before
summing (`max(t0,0.0)`/`min(t1,1.0)`, then only kept if `clipped_t1 >
clipped_t0`) — see the function's own updated docstring for the full
before/after trace on plan 704238. `verify_no_angle_valid_candidate.py`'s
own duplicated copy of this bug was **not** touched (out of the
authorized scope — flagged here so it isn't forgotten; it feeds issue #4's
diagnosis, not the clean-at-source ceiling, so it's lower urgency).

**2. Added `extraction/synth/tests/test_measure_clean_at_source.py`** (4
live + 1 xfail, all passing as intended; full suite now 39 tests, up from
34):
- `test_fully_clean_plan_scores_clean` — a fully-enclosed room, no
  openings, must score clean.
- `test_genuinely_missing_wall_must_flag` — a real gap in the wall ring
  (no door/window involved) must flag. **Fixture note**: had to widen the
  room to 30×10 (wall_depth=4) — at 10×10 the opposite wall's parallel
  inner face falls inside `ink_proximity` (12 units) and spuriously
  "covers" the missing edge from across the room. This is a pre-existing
  characteristic of the coverage check for small rooms relative to
  wall_depth, not something this session's fix touches — just something
  the test fixtures had to be sized around. Worth knowing if a future
  session's ceiling ever looks suspiciously high on plans with tiny
  required rooms and thick walls.
- `test_simple_doorway_cut_into_wall_does_not_flag` — a straight door cut
  into an otherwise-continuous wall (the already-working
  `fill_openings_into_wall` case) must not flag.
- `test_edge_covered_never_negative_for_candidate_entirely_outside_span` —
  direct regression test for the clamp bug itself.
- `test_doorway_notch_does_not_flag` (**xfail, strict**) — the real
  room-polygon-notch pattern. Confirmed to still flag post-clamp-fix, as
  expected: the clamp fix and notch-suppression are different bugs (the
  notch jamb edges are genuinely zero-coverage — perpendicular to the
  wall, not just victims of the negative-sum bug). This is the pinned
  tripwire for the deferred doorway-notch converter work below — it
  should flip from xfail to passing once that lands, and CI-equivalent
  discipline (`strict=True`) means it errors loudly if it starts passing
  by accident before that work is done, or stays failing after.

**3. Re-ran `measure_clean_at_source.py` on the full 17K.** Result:

| | Pre-fix (buggy) | Post-clamp-fix |
|---|---|---|
| clean_at_source | 67.5% (11,472/17,000) | **80.2% (13,638/17,000)** |
| room_boundary_no_wall_match | 32.5% | **19.8% (3,362/17,000)** |
| wall_invalid | 0.0% | 0.0% (unchanged) |
| room_geometry_invalid | 0.0% | 0.0% (unchanged) |

A **+12.7 point** recovery from the clamp fix alone — the bucket
explained-by-arithmetic-bug was 39.1% of the original 32.5% at population
scale (12.7/32.5), close to the 27-plan sample's bug-only estimate
(29.6%), same ballpark. **This is now a population-scale, trustworthy
number** (full 17K, not a diagnostic sample) — the 90% bar question can be
gated on 80.2%, not the earlier 96.4% diagnostic-scale estimate (which
optimistically assumed b/c/d/e were ALL already fixed — they aren't;
80.2% reflects only the clamp fix landing).

**Doorway-notch population sizing** (`extraction/synth/qa/size_doorway_notch_population.py`,
committed — reused `opening_coverage`'s projection technique verbatim
from `classify_room_boundary_no_wall_match.py`, no new classification
machinery; ran only against the 3,362 still-flagged plans, not a second
full-17K pass, so this stayed cheap: 164s):

| | Sample (n=27, 2026-07-21 part 3) | Population (n=3,362 flagged plans) |
|---|---|---|
| Edge-level notch-signature | 63.1% | 46.1% (4,951/10,732 broken edges) |
| Room-level all-notch | 48.0% | 39.0% (1,687/4,329 broken rooms) |
| Plan-level all-notch (would fully clear) | — | **34.4% (1,158/3,362)** |

If doorway-notch suppression alone landed (no other change): 80.2% +
19.8% × 0.344 ≈ **86.9%** — a rough population-scale projection of that
fix's payoff, for sizing/prioritization only, not a commitment (the
sample-vs-population gap above, 63.1%→46.1%, shows these sample-based
projections run a bit optimistic).

## Next-session plan, in order

1. **P0-gate bar decision — Dan's call, using the 80.2% population number
   above, not the earlier 96.4% diagnostic estimate.** Current expectation
   (Dan, 2026-07-21) is the 90% bar stands rather than getting revised
   down, since 80.2% is itself pre-doorway-notch-fix and the projected
   payoff of that fix alone (~86.9%) is close to the bar, with issue #4's
   skeleton fix (below) still to come on top. Nothing else in this list
   proceeds until this ruling is made.
2. **Doorway-notch handling** (dominant recoverable class — 46.1% of
   currently-broken edges at population scale). Converter-detection work:
   teach the relevant edge check to recognize a required-room edge
   captured by a door/window/front_door polygon's own footprint as an
   opening, not a required wall match. `test_doorway_notch_does_not_flag`
   in `test_measure_clean_at_source.py` is the tripwire — it should flip
   from xfail to passing when this lands (remove the `xfail` marker at
   that point, don't just leave it decorating a passing test).
3. **Skeleton-simplification fix for issue #4's `missing_from_skeleton`
   mechanism** (81.8% of that bucket) — the `no_angle_valid_candidate`
   root cause is confirmed on 5 overlays, not just inferred. Re-measure
   `diagnose_clean_rate.py` and `measure_clean_at_source.py` after.
4. Lower priority: issue #3 (repeated wall id) — small (2 known cases,
   0.3% of room-cycles).
5. Also lower priority, flagged not scheduled: `verify_no_angle_valid_candidate.py`
   carries the same unclamped-overlap bug `measure_clean_at_source.py` had
   — not fixed this session (out of the authorized scope), feeds issue
   #4's diagnosis rather than the clean-at-source ceiling, so it's fine to
   pick up whenever issue #4 work resumes rather than urgently.
6. Continue the established discipline: each fix should be a real,
   specific, measured bug — not a threshold/tuning change. Re-measure
   after each fix rather than assuming.

## For Phase 0

`extraction/synth/rooms.py`'s `EMPIRICAL_FACE_OFFSET_MULTIPLIER = 0.838`
is a stopgap measured against ResPlan specifically. **Phase 0's labeling
spec (`docs/labeling-spec.md`, §0.3 of `extraction-plan.md`) needs to
explicitly define the room-polygon-to-wall-centerline convention** —
otherwise this same offset resurfaces as phantom room-IoU error when
Phase 1's baselines are scored against corpus GT, and nobody will know why
without rediscovering this session's calibration trail.
