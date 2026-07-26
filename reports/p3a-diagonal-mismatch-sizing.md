# P3a — population-scale sizing of the diagonal-wall-mismatch mechanism

Per Dan's explicit instruction: "measure its population-scale share as its
own number before it influences any reachability claim" — this phase was
already burned once extrapolating a small sample's recovery fraction into a
headline ceiling (the 96.4% revised-ceiling estimate, later corrected).
`reports/p3a-audit-57-unaudited.md` named `not_notch_diagonal_wall_mismatch`
as the dominant mechanism on ~46/57 (81%) of a specific, non-random sample
(edges freshly relabeled by the classify() notch-branch fix, all with
`opening_coverage>=0.65`). This measures its share of the full
`a_genuine_gt_defect_between_rooms` population, not the 57-edge sample.

## Method

`extraction/synth/qa/size_diagonal_wall_mismatch.py`, full 17,000-plan
population, read-only. A geometric **candidate signature**, not a
per-edge re-run of the visual audit at scale:

1. `is_diagonal`: the edge's own unit direction has neither component near
   ±1 — purely geometric, independent of any wall data.
2. `ink_band_overlap >= 0.5`: fraction of a **physical-half-thickness**
   band around the edge (radius = `wall_depth/2`, not a search-radius
   constant) covered by the filled wall polygon (`fill_openings_into_wall`'s
   output, the same ink reference the audit's overlays render).

**Self-caught calibration bug, fixed before reporting**: the first version
reused `measure_clean_at_source.PROXIMITY_MULTIPLIER` (3.0×) for this band.
That constant is calibrated for a candidate-*search* radius ("look this far
for a matching wall edge"), not an area-overlap "is this specific band
actually wall material" question — at 3×, the band balloons to 2-3× the
physical wall thickness, diluting the ratio with open room space even when
the wall core is fully covered. On a visually-confirmed case (plan 3313,
`bedroom_2`, edge 4), the inflated band scored 0.10–0.35 despite the wall
being clearly, fully present in the render — a false negative that would
have suppressed the whole result. Recalibrated to `wall_depth/2` (physical
half-thickness): the same edge scores 0.65–0.71, matching the visual read.

## Result

```
a_genuine_gt_defect_between_rooms edges (all):              1853
  geometrically diagonal (not axis-aligned):                 310  (16.7%)
    of those, ink-band-overlap >= 50% (mismatch CANDIDATE):  102  (32.9% of diagonal, 5.5% of all)

rooms with >=1 'a' edge:                                    1278
  rooms with >=1 mismatch-candidate edge:                     79  (6.2%)

plans with >=1 'a' edge:                                    1109
  plans with >=1 mismatch-candidate edge:                     55  (5.0%)

ink-band-overlap distribution among the 310 diagonal edges:
  median=0.307  p10=0.000  p90=0.766
```

## Reading this correctly: the sample was not representative, as expected

**The mechanism is real (confirmed by visual audit) but explains only
~5-6% of the full `a_genuine_gt_defect_between_rooms` population — not
the dominant mechanism the 57-edge sample suggested.** The gap between
81% (sample) and 5.5% (population) is explained by sample selection, not
by the population sizing being wrong:

- The 57-edge sample was drawn specifically from edges with
  `opening_coverage>=0.65` (the doorway-notch suppression risk band) —
  i.e., edges with a door/window nearby. In this dataset, a diagonal
  wall-chamfer corner sitting near a door/window turned out to be common
  (most of the 57's overlays showed exactly that pairing).
- The full `a`-bucket has no such restriction: 83.3% of it (1543/1853
  edges) isn't even geometrically diagonal in the first place, and most
  of the population's edges have no nearby opening at all. The mechanism
  this session named is real, but it is concentrated in the
  opening-adjacent subpopulation the sample happened to be drawn from —
  it does not generalize to "most of the `a` bucket."

**This is the caution Dan raised, now confirmed rather than assumed**:
extrapolating the 57-edge sample's 81% rate onto the full 1853-edge/1109-
plan population would have overstated this mechanism's importance by
roughly 15×. The population-scale number (5.5% of edges, 5.0% of plans) is
what should inform any future reachability or prioritization claim — not
the sample rate.

## What this changes

- `not_notch_diagonal_wall_mismatch` is confirmed real and population-
  measurable, but it is a **minor**, not dominant, contributor to the
  `a_genuine_gt_defect_between_rooms` bucket at population scale. A future
  measurement-technique fix for it (matching coverage against a polyline
  of wall-boundary segments instead of one parallel candidate, as floated
  in the audit report) would move `clean_at_source` by roughly this
  amount, not by anywhere near the 46/57 sample rate.
- This is a **candidate signature** (geometric proxy over the full
  population), not a human-verified count the way the 57-edge sample was.
  It should be read as "this many edges are worth a closer look for this
  mechanism," not as a final defect classification.
- The remaining ~83% of the `a` bucket (axis-aligned or low-overlap
  diagonal edges) is not explained by this mechanism and remains an open
  question — most likely a mix of genuine GT defects and the other
  mechanisms the (dropped) priority-2 branch spot-check would have
  covered, plus whatever the un-audited majority of the bucket turns out
  to be. Not sized further this session.
