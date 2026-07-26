# P3a — audit of the 57 previously-unaudited notch-risk-band edges

Priority-1 task from `reports/p3a-notch-resolution.md`'s next-session spec:
the 2026-07-22 `classify()` notch-branch fix surfaced 57 new
`a_genuine_gt_defect_between_rooms` edges (with `opening_coverage>=0.65`,
the doorway-notch suppression risk band) that had never been individually
audited — freshly relabeled by the correction itself, not by manual review.
Per Dan's explicit scoping this session: audit these 57 only; defer the
priority-2 spot-check of `classify()`'s other branches
(`b`/`c`/`d`/`f`) to its own session.

**No pipeline changes.** `check_plan`/`measure_clean_at_source.py`,
`rooms.py`, `skeleton.py` untouched. Only new QA scripts
(`audit_unaudited_57.py`, `merge_57_audit.py`) and the extended
`audited_notch_ground_truth.json`.

**Population-scale follow-up, read before trusting the "~46/57" rate
below as a general statement about the `a` bucket**:
`reports/p3a-diagonal-mismatch-sizing.md` measured `not_notch_diagonal_wall_mismatch`'s
share of the FULL 1853-edge `a_genuine_gt_defect_between_rooms` population
directly (not extrapolated from this sample) and found **~5.5% of edges /
5.0% of plans**, not anywhere near the 81% (46/57) rate below. The
mechanism is real (confirmed here by visual audit) but this specific
57-edge sample is a **non-random subpopulation** (drawn from the
opening-coverage>=0.65 risk band, i.e. edges with a door/window nearby —
exactly the condition under which this diagonal-chamfer-near-an-opening
pattern turned out to be common) and does not represent the bucket at
large. Read the mechanism description below as "real and confirmed," not
as "explains most of the ceiling."

## Method

Same as the original 8-edge audit (`audit_notch_blind_spot.py`): for each
edge, computed door/window/front_door witness, perpendicularity to the
nearest wall-backed ring neighbor (`cos_to_neighbor`), jamb-length ratio,
residual-gap profile, and rendered a source-level overlay
(`extraction/synth/reports/notch57_audit_*.png`, gitignored, regenerate via
`audit_unaudited_57.py`). Each of the 57 was visually reviewed against its
overlay before assigning a verdict.

## Result: 0/57 wrongly excluded from the notch category

Every one of the 57 edges is confirmed **not** a genuine doorway notch —
`classify()`'s exclusion of each from `e_opening_doorway_notch` is correct.
No additional recall gaps were found beyond the already-known one (plan
11587, from the original 8-edge audit). Re-running
`gate_flip_check_audited.py` against the now-65-edge audited ground truth:

```
correctly suppressed (audited notch, rule suppressed):     0
correctly NOT suppressed (audited non-notch, rule didn't): 61
recall gaps (safe miss):                                    0
WRONGLY suppressed (ACCEPTANCE FAILURE):                     0
UNAUDITED:                                                   0
GATE: PASS -- suppression rule is clean against the full audited risk surface.
```

("correctly suppressed" reads 0, not 3+1, because the 4 edges that verdict
as real notches — 5683×2, 11576, 11587 — reclassified out of the `a`
category into `e_opening_doorway_notch` by the same 2026-07-22 fix, so
they're no longer enumerated in this "a-category" risk band at all; this
matches the resolution report's own explanation of that transition.)

## The finding that matters more than the pass/fail: mechanism, not verdict

The 57 verdicts alone don't change any gate number (`check_plan` untouched,
`clean_at_source` unaffected). What's new is *why* these are not notches —
and within THIS 57-edge sample it's a single, dominant, previously-unnamed
mechanism, not a diverse bag of edge cases (see the population-scale
denominator caveat below the mechanism's name — this dominance is a sample
property, not a population property):

**`not_notch_diagonal_wall_mismatch` — ~46/57 edges of THIS SAMPLE (81%;
new verdict, extends the taxonomy). Population-scale, measured directly
in `reports/p3a-diagonal-mismatch-sizing.md`, not extrapolated: ~102/1853
edges of the FULL `a_genuine_gt_defect_between_rooms` bucket (5.5%).**
Both numbers are correct — they describe different denominators. This
57-edge sample was drawn specifically from `opening_coverage>=0.65` (a
door/window nearby), a condition under which this mechanism happens to be
common; the full `a` bucket has no such restriction and is mostly
axis-aligned edges the mechanism can't apply to at all (83% of it isn't
even geometrically diagonal). State both numbers together if you cite
either one elsewhere. A smooth diagonal room-boundary edge crosses a wall that
the source represents as an axis-aligned staircase of small orthogonal
segments (visibly rendered as a "staircase" in most overlays — e.g. plans
4296, 3313, 13746), or that is simply absent from the wall polygon's own
edge set at that angle. **Real wall ink is visibly present in essentially
every overlay** — this is a coverage-matching **technique** limitation
(`_edge_covered`'s parallel-candidate search requires `cos_a>=0.9` against
a *single* wall-polygon edge, which a smooth diagonal can structurally
never satisfy against a staircase of orthogonal jags, no matter how much
real ink exists along it), **not evidence the source omits a partition.**
This differs materially from `classify()`'s label
(`a_genuine_gt_defect_between_rooms`, which implies a real missing
partition) — the wall is there, the check just can't see it. Confirmed on
the clearest cases (plan 3313 bedroom_2 edge 4, plan 13746 edge 57): the
staircase steps are directly visible in the render, with the room's smooth
diagonal boundary crossing them.

**`not_notch_jagged_boundary_artifact` — 4/57 edges, plan 1437 (reused
verbatim from the original audit's already-documented category).** Same
plan as the original audit's exemplar (bathroom_2 edge 11) — an unusually
irregular, many-faceted room polygon. Not new, just more instances of an
already-known mechanism.

**`not_notch_axis_aligned_gap` — 1/57 edges (plan 16342, bedroom_1, edge
19, new verdict).** The one edge in this batch that is **not** diagonal
(`cos_to_neighbor≈1.0`, collinear with its neighbor, not perpendicular).
Sits parallel to a door reveal's threshold/header line rather than a jamb
— a genuinely different, real small gap, distinct from the dominant
mechanism. (Also surfaced a minor numerical-robustness note: `cos_to_neighbor`
came out as `1.001`, slightly over the mathematical ceiling of 1.0 —
floating-point noise in the dot-product normalization. Doesn't change any
classification here since 1.001 still clears the `<=0.2` notch ceiling by
a wide margin, but worth a clamp if this signal is reused for a future fix.)

### Why this matters for the P0-gate ceiling conversation

`classify()`'s `a_genuine_gt_defect_between_rooms` label was built to mean
"a real partition the source omits" (see its docstring). This session found
that **within this 57-edge cohort**, the majority of the edges are not
that — they're a wall the source draws, that a specific measurement
technique can't match because of *how* it's drawn (staircase-quantized vs.
smooth diagonal), not *whether* it's drawn. **Population-scale, this
mechanism is a minor contributor (~5.5% of the full bucket, measured in
`reports/p3a-diagonal-mismatch-sizing.md`), not the majority** — the label
still mostly means what its docstring says, at population scale; this
session's finding narrows roughly 5-6% of it, not "most of it." That
distinction still matters because it changes which of *that* 5-6% is
fixable and where: `not_notch_diagonal_wall_mismatch` is a
**measurement-technique** gap (potentially fixable in
`measure_clean_at_source.py`'s or `rooms.py`'s coverage check — e.g. by
testing coverage against a *polyline* of nearby wall-boundary segments
rather than requiring a single near-parallel candidate), not a permanent,
un-fixable GT ceiling the way class (a) is currently framed as being.
**This is a lead for a future session, not a fix proposed or built here**
— no pipeline code changed.

## Secondary finding: over-counting from duplicate edges and a near-duplicate plan

Independent of the notch question, the visual audit surfaced a **counting
artifact** worth flagging before any edge-level population count (like the
1853-edge `a`-bucket figure) is treated as "1853 distinct defects":

- **4 exact-duplicate ring-edge pairs** (same coordinates, same signals,
  same overlay, two different `edge_index` values in the same room):
  plan 3791 (`bedroom_2`, edges 53/54), plan 5359 (`storage_0`, edges 2/3),
  plan 15640 (`bathroom_0`, edges 0/1), plan 9852 (`bedroom_3`, edges 4/5).
  Each pair is one real geometric feature counted twice at the edge level —
  likely a duplicate/near-duplicate vertex in the source room polygon
  producing two zero-length-separated ring edges.
- **1 near-duplicate cluster within a single room**: plan 8157
  (`bedroom_0`, edges 0/2/3) — three short, near-identical facets of what
  is visually one diagonal wall run, not three independent defects (plus a
  4th, correlated entry on the shared wall's other side, `bathroom_0` edge
  18).
- **1 partial-geometry-sharing plan pair, corrected on closer check**: plan
  2098 and plan 2099. Direct verification (all 7 traced room instances in
  each, not just the two spot-checked initially) found 5 of 7 rooms
  byte-identical (`balcony`, both `bathroom`s, both `bedroom`s — same area
  and centroid to full float precision), but `kitchen` and especially
  `living` differ materially (`living` area 17583 vs. 15702, a 10.7%
  difference, centroids ~6 units apart) — well outside what any reasonable
  near-duplicate tolerance should accept. **This is not the same base plan
  perturbed by noise** (the original characterization was too strong,
  corrected here); it looks more like two distinct plans that happen to
  reuse an identical bedroom/bathroom/balcony wing (a modular/templated
  sub-unit) with a different living/kitchen layout. The flagged edge
  (`bathroom_0`, edge 5) still has identical signals in both, because it
  sits in the identical shared wing — that specific defect edge really is
  double-counted at the population level — but this pair is a narrower,
  different phenomenon (partial template reuse) than "near-duplicate plan,"
  and should not be used to estimate the rate of full near-duplicate plans.
  See `reports/p3a-duplicate-plan-scan.md` for the population-scale scan
  this finding motivated, which found the real systematic pattern directly
  rather than extrapolating from this one pair.

Net: of the 57 edges, at least 8 (4 pairs) are exact duplicates and 3 are a
near-duplicate cluster, collapsing to roughly **50 distinct real-world
edges** behind the 57 entries — and those 50 are dominated (~46/50) by the
diagonal-wall-mismatch mechanism *within this sample*. Population-scale,
that mechanism is ~5.5% of the full 1853-edge bucket (see
`p3a-diagonal-mismatch-sizing.md`) — the duplicate-counting rate found
here has not been sized at population scale and should not be assumed to
generalize at the same ~14% (8/57) rate either.

## What this changes and doesn't change

- **`clean_at_source` (87.2%, population) is unaffected.** `check_plan`
  was not touched this session.
- **The corrected `classify()` defect count (1853 edges / 1109 plans,
  from the notch-resolution session) should not be read as 1853/1109
  independent, permanent GT defects — but only for the reasons actually
  measured, not the sample rate.** This session's 57-edge sample found the
  diagonal-wall-mismatch mechanism on ~81% of ITSELF, but population-scale
  sizing (`p3a-diagonal-mismatch-sizing.md`) found it explains only ~5.5%
  of the full 1853-edge bucket — the sample was drawn from a subpopulation
  where the mechanism happens to concentrate, and does not generalize.
  What DOES still discount the 1853 figure: the duplicate-counting rate
  found in this sample (4 exact pairs + 1 cluster among 57 edges) is a
  real, if not yet population-sized, reason to expect some inflation, and
  `classify()` remains a heuristic candidate generator, not audited ground
  truth, for the ~94.5% of the bucket this session did not explain. Do not
  carry forward the earlier (now-corrected) claim that "~90%" of the
  bucket is measurement-technique noise — that was this session's own
  premature extrapolation, caught by the population-scale sizing before
  it was allowed to stand.
- **The suppression rule (`check_plan`'s doorway-notch handling) remains
  ACCEPTED and is now PASS, not just INCOMPLETE**, against the full
  65-edge audited ground truth (was 8, INCOMPLETE pending this session).
- **Priority 2 (spot-check of `classify()`'s `b`/`c`/`d`/`f` branches) is
  DROPPED, not deferred**, per Dan's explicit ruling (2026-07-26):
  `classify()` is validated across 65 audited edges, the gate PASSes, and
  the actual bar (52.5% conditional clean rate vs. the 90% target) is
  converter work, not further auditing — diminishing returns on more
  taxonomy spot-checks. Not picked back up unless something specific
  re-motivates it.

## Recommended next steps

1. ~~Population-scale sizing of the diagonal-wall-mismatch mechanism~~ —
   **done**, same session: `reports/p3a-diagonal-mismatch-sizing.md`
   (~5.5% of the full bucket, not the sample's ~81%).
2. **A converter/measurement-side fix idea worth evaluating** (not
   designed here): match coverage against a short polyline of consecutive
   wall-boundary segments near the edge's direction, rather than requiring
   one single near-parallel candidate — would directly address the
   structural limitation named above, for the ~5.5% it actually explains.
3. **De-duplication as a standing rule, not a one-off pass**: split
   assignment for any future ResPlan-derived training set must use a
   geometry-hash signature, never `plan_id` alone — sized at population
   scale in `reports/p3a-duplicate-plan-scan.md` (1.66% exact-duplicate
   rate, not itself alarming, but the rule is correct regardless).
