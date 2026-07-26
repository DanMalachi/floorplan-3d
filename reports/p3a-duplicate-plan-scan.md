# P3a — duplicate/near-duplicate plan scan (training-set contamination risk)

Filed as its own issue rather than a notch-audit counting footnote, per
Dan's 2026-07-26 note: P3a's deliverable is a training set for E1/E2
(paper.md, extraction-plan.md's P3a section), and paper §6.2 requires
plan-**source**-level split separation so near-duplicate plans never
straddle train/val.

**Priority correction, recorded 2026-07-26 (same day, after the measurement
landed):** the original framing rated this "higher priority than a counting
artifact" on the assumption the rate could be large. **The measured rate
(1.66% exact duplicates) is not, on its own, a metric-inflating hazard** —
Dan's own read, and correct. What survives at full priority is the **rule**,
not the alarm: **assign splits by geometry hash, never by `plan_id`.** That
rule costs nothing to follow and is correct regardless of how large the
duplicate rate turns out to be — it doesn't need the 1.66% to be big to be
worth doing. See "Not a settled number" below for the one part of this
scan that is still open.

**Trigger**: plan 2098/2099 surfaced incidentally during the 57-edge notch
audit (`reports/p3a-audit-57-unaudited.md`) sharing what looked like
identical room geometry. On closer, full verification (all 7 room
instances, not the 2 originally spot-checked) this specific pair turned out
to be a narrower phenomenon — 5 of 7 rooms byte-identical
(`balcony`/`bathroom`×2/`bedroom`×2), but `living`/`kitchen` differing by
double digits — not a clean near-duplicate. That correction is exactly why
this needed a real population scan rather than generalizing from one pair.

## Method

`extraction/synth/qa/scan_duplicate_plans.py`, full 17,000-plan population,
read-only. Two independent passes:

1. **Exact clusters**: canonical per-plan signature = sorted tuple of
   `(room_type, area, centroid_x, centroid_y)` rounded to 0.1, across every
   traced room instance (`CLEAN_REQUIRED_ROOM_TYPES | OPEN_PLAN_ROOM_TYPES`).
   Plans sharing a signature are grouped by a single dict pass — O(n), no
   pairwise comparison. Verified against direct shapely `.equals()` on a
   sample cluster (plan 6033/6028/6029/6030): bedroom polygon **and** the
   full wall polygon are byte-identical across all 4 — a genuine 4-way
   full-plan duplicate, not a signature collision.
2. **Near-duplicate pairs**: within coarser buckets (room-type-count
   multiset + total room area rounded to the nearest unit, to keep buckets
   small), pairwise room-for-room matching requiring **every** room
   instance to match within 1% relative area and 1.0-unit centroid
   distance, excluding pairs already resolved as exact matches. Deliberately
   tight — the goal is genuine near-clone twins, not merely similar floor
   plans.

## Result

```
EXACT-duplicate clusters:        139  (282 plans, 1.66% of 17,000)
  cluster size histogram (top):  [4, 3, 3, 2, 2, 2, 2, 2, 2, 2, ...]
  e.g. cluster of 4: plan_ids=[6033, 6028, 6030, 6029]  (verified: wall AND
       room polygons byte-identical across all 4)
  e.g. cluster of 3: plan_ids=[5400, 5401, 5374]
  e.g. cluster of 3: plan_ids=[1336, 326130, 1338]

NEAR-duplicate pairs (strict, room-for-room, excl. exact): 12  (24 plans)
  e.g. 14416<->5595, 6869<->6870, 12130<->4981, 9856<->9855, ...

Total plans touched by duplication: 306 (1.80% of 17,000)
Effective corpus size estimate: 16,845 (vs. raw 17,000, -155)
```

**Confirmed real, not a scan artifact.** Spot-checked the largest exact
cluster (6033/6028/6029/6030) directly with shapely `.equals()` on both the
`bedroom` room layer and the raw `wall` polygon — both are exactly
identical across all 4 plan_ids, not just close. This is a genuine
full-plan duplication in the source dataset, not four independently-authored
plans that happen to coincide.

**The plan 2098/2099 pair that motivated this scan is correctly NOT in
either list** — confirmed directly: `living` room area differs by 10.7%
and its centroid by ~6 units between the two, well outside both the exact
and the strict near-duplicate criteria. It's a real but different pattern
(partial sub-unit template reuse across otherwise-distinct plans), not
counted here as a duplicate plan. This is the correction described above,
and it's a point in favor of the scan's specificity — it isn't
over-flagging based on partial similarity.

## What this means for Phase 3a / Phase 3b

- **1.80% of the raw 17K population is touched by some form of plan-level
  duplication** — small, and (per the correction above) not itself an
  alarm. Still systematic (139 independent clusters, not one or two
  flukes) — confirms Dan's prediction that 2098/2099-style duplication
  would not be an isolated pair, even though 2098/2099 itself didn't
  qualify.
- **Split assignment must NOT be done by `plan_id` alone — this is the
  part to actually act on.** Any train/val/test split for the eventual
  20K-image starter set (or the corpus registry referenced in
  `eval/registry/registry.csv` for the P0 gate) must either (a) assign
  every plan in an exact-duplicate cluster to the SAME split, or
  (b) deduplicate to one representative per cluster before splitting. This
  is correct practice independent of the measured rate — worth doing at
  zero measured urgency, not because 1.66% is alarming.
- **Recommend**: wire the exact-duplicate-cluster signature (this script's
  first pass; it's cheap, O(n), no pairwise cost) into the corpus registry
  pipeline (`eval/registry/registry.csv`'s generation path or an adjacent
  pre-processing step) so it runs once against the full ResPlan population
  and the cluster assignments are available before any split is cut — not
  just for P3a's synthetic set, but for the P0 corpus registry too, per
  Dan's note. Not built this session (scoped as a diagnostic, not a
  pipeline change).
- Effective-corpus-size impact (~155 plans, ~0.9%) is small enough that it
  does not change the P0-gate reachability arithmetic materially by itself
  — the risk here is train/val leakage inflating a validation metric
  silently, not a capacity problem.

## Not a settled number: the near-duplicate count is a lower bound, not a measurement

**The 12 strict near-duplicate pairs are a lower bound on the leakage
surface, not a measurement of it** — near-duplicate counts move with the
matching criterion by construction, and the criterion here (1% area / 1.0
unit centroid, on *every* room instance) was chosen tight, to catch
genuine near-clone twins without over-flagging merely-similar floor plans.
A looser criterion would find more pairs; a model does not need
byte-identical geometry to memorize a near-duplicate, so "12" should not be
read as "the" near-duplicate count, only as "at least 12 under a strict
rule." **Re-examine the threshold when splits are actually assigned, not
before** — that's the point at which the criterion's looseness/tightness
trade-off actually matters, and doing it now would be tuning a number this
session has no consumer for yet.

## Not done this session

- Wiring deduplication into the actual split-assignment code or the corpus
  registry (recommendation only, no pipeline file touched).
- Extending near-duplicate detection to the `RESID-plan-2098-2099`-style
  partial-sub-unit-reuse pattern (5-of-7 rooms identical, rest different) —
  the scan as built only flags near-duplicates where essentially the whole
  room set matches; partial-template reuse is a distinct, narrower question
  not addressed by this pass and not clearly a leakage risk in the same way
  (the differing rooms mean the two plans are not interchangeable at the
  image level).
