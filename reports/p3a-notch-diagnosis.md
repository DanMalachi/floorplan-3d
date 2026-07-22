# P3a — notch-suppression false-positive diagnosis (plan 5683 flip)

**READ-ONLY diagnostic. No change made to `check_plan`, `classify()`, any
threshold/constant, or any other pipeline file.** New script:
`extraction/synth/qa/diagnose_notch_false_suppression.py` (committed
alongside this report). Run against the full 17,000-plan population.

## Why this exists

The re-measurement session's acceptance gate (full 17K, suppression live)
found **1 plan** (of 1100 plans classify()-labeled with
`a_genuine_gt_defect_between_rooms`) flipped to `clean_at_source` post-
suppression: **plan 5683**. Per the standing rule, any non-zero flip means
the suppression rule is provisionally rejected pending diagnosis. This
report is that diagnosis — it proposes a fix but applies nothing.

---

## STEP 0 — the real interfaces

### 0a. Suppression predicate in `check_plan` (`measure_clean_at_source.py`), verbatim

```python
opening_cov = _opening_coverage(a, b, edge_len, dx, dy, p, wall_depth)
cos_to_neighbor = _nearest_wall_backed_cos(i, ring_edges, backed_ratio, ux, uy)
is_doorway_notch = (
    opening_cov >= OPENING_COVERAGE_THRESHOLD
    and cos_to_neighbor is not None
    and cos_to_neighbor <= PERPENDICULARITY_COS_THRESHOLD
    and edge_len <= NOTCH_LENGTH_MULTIPLE * wall_depth
)
if is_doorway_notch:
    ...  # logged to notch_suppressions, edge is NOT flagged
    continue
room_broken = True
```

Constants: `OPENING_COVERAGE_THRESHOLD=0.65`, `PERPENDICULARITY_COS_THRESHOLD=0.15`,
`NOTCH_LENGTH_MULTIPLE=1.2`, `COVERAGE_THRESHOLD=0.5` (wall-ink coverage bar
an edge must fail to even reach this check).

**One-line geometric condition:** an edge that fails the wall-ink coverage
check (coverage < 0.5) is suppressed — not flagged — iff it is short
(`edge_len <= 1.2× wall_depth`), nearly perpendicular to the nearest
wall-backed ring neighbor (`|cos| <= 0.15`), **and** ≥65% of its own [0,1]
parametric span is spanned by a door/window/front_door footprint.

Note structurally: **condition 1 (`opening_cov >= 0.65`) is itself computed
by intersecting the edge with door/window/front_door polygons** —
`_opening_coverage` reads no other geometry. The predicate cannot fire
without an opening-polygon witness; a witness requirement is not an
addable feature, it is already one of the three conjuncts.

### 0b. `a_genuine_gt_defect_between_rooms` assignment (`classify_room_boundary_no_wall_match.py`), verbatim

```python
def classify(e):
    if e["outward_probe_degenerate"]:
        return "unresolved_degenerate_probe"
    if e["opening_coverage"] >= OPENING_COVERAGE_THRESHOLD:   # 0.8, NOT 0.65
        return "e_opening_doorway_notch"
    if not e["outward_inside_inner"]:
        return "c_exterior_boundary_or_void"
    if e["neighbor_room"] is not None:
        if e["ink_ratio_wide"] >= COVERAGE_THRESHOLD:
            return "b_shared_wall_wide_recoverable"
        return "a_genuine_gt_defect_between_rooms"
    if e["edge_len"] <= SMALL_EDGE_WALL_DEPTH_MULTIPLE * e["wall_depth"]:
        return "d_tracing_artifact_small_notch"
    return "f_unexplained_interior_gap"
```

`classify()`'s own doorway-notch bucket (`e_opening_doorway_notch`) checks
**one condition only** — `opening_coverage >= 0.8` — with no
perpendicularity or edge-length check at all. The suppression rule's 0.65
threshold was later validated by a population-scale gap analysis (empty
band at opening_coverage [0.3, 0.5) separating noise from the confirmed-
notch cluster at 0.55–0.78+, see `p3a-handoff.md`); `classify()`'s 0.8
predates that analysis and was never revisited.

**Provenance:** purely heuristic/code-derived. No human-audit or annotation
file is read anywhere in `classify_room_boundary_no_wall_match.py` — the
only input is `ResPlan.pkl`'s own geometry. **The 1100
`a_genuine_gt_defect_between_rooms` plan-level labels are 100% classifier
output, not audited ground truth.**

**Granularity:** `classify()` runs **per edge** (`analyze_plan` returns one
dict per genuinely-broken ring edge). The population script rolls this up
to **per plan**: a plan counts as `a`-classed if *any* of its edges lands
in that bucket. `clean_at_source` is **per plan**: `clean_at_source = not
flags` — literally zero flags across every required room's every edge, not
just zero `a`-classed ones. **A plan can flip to `clean_at_source` on the
strength of a single suppressed edge even if it originally had several
broken edges, as long as none of the others remain flagged** — this is why
Step 2 measures at edge level, not by re-deriving the plan-level flip
count.

### 0c. One raw ResPlan record's structure

```
Top-level keys: area, balcony, bathroom, bedroom, door, front_door, garden,
id, inner, kitchen, land, living, neighbor, net_area, parking, pool, wall,
wall_depth, window

door: MultiPolygon, n_parts=8 (sample plan 14433), first_part_type=Polygon
window: MultiPolygon, n_parts=7
front_door: Polygon, n_parts=1
wall: MultiPolygon, n_parts=10
wall_depth: float (single global scalar per plan — no per-wall-segment
  thickness field anywhere on the raw record)
```

Confirmed: `p["door"]` is directly a `MultiPolygon` of individual door
`Polygon`s, each with its own `.bounds` — a real, directly-usable witness
geometry, not something inferred.

---

## STEP 1 — probe plan 5683

`classify()` puts **2 edges** in `a_genuine_gt_defect_between_rooms` for
this plan, both on `bedroom_0`, both bordering `living_0`. `check_plan`
suppresses **both**, and no other required-room edge in the plan is
flagged — hence the flip.

```
check_plan: clean_at_source=True  flags=[]
notch_suppressions=[
  'room_boundary_notch_suppressed:bedroom_0:edge3:opening_cov=0.749:cos_to_neighbor=0.004:len=4.11:wall_depth=4.36',
  'room_boundary_notch_suppressed:bedroom_0:edge5:opening_cov=0.749:cos_to_neighbor=0.000:len=4.11:wall_depth=4.36',
]
```

Both edges are the two jambs of the same door opening (edge 3 and edge 5
of the bedroom's ring, a short crossbar between them). Facts for edge 3
(edge 5 is materially identical, see script output):

1. **Door witness:** YES. A door polygon (`bounds=(87.7, 109.9, 92.1,
   140.4)`, `area=133.1`) intersects the edge's band directly.
2. **Edge_len vs. door-width band:** `edge_len=4.11`, door bbox minor
   dimension (jamb depth) `=4.36`, `wall_depth=4.36`. Ratio
   `edge_len / door_minor_dim = 0.943` — the edge is essentially exactly
   one wall-thickness pass, i.e. a jamb, not an arbitrary gap.
3. **Coincidence vs. residual wedge:** door span on this edge is
   `t=[0.000, 0.749]` (3.08 of 4.11 units). Sampling `gap_width(t)` at 41
   points (distance from each point to the union of `{bedroom_0, living_0,
   filled_wall}` along the outward normal): **41/41 samples touching or
   claimed**, **0/41 residual samples beyond the door span with gap > 2.0
   units**. There is no unassigned wedge anywhere along this edge, door
   span or not — the two rooms plus the (door-filled) wall account for the
   entire edge.
4. **Notch depth vs. wall thickness:** `edge_len/wall_depth = 0.943`,
   comfortably inside the `<=1.2×` bound a true notch jamb should satisfy.
5. **Feature values `classify()` used, and whether the same signature
   triggered the suppression rule:** `classify()`'s own recorded
   `opening_coverage=0.749` for this edge — **below its 0.8 cutoff for
   `e_opening_doorway_notch`, so it fell through to `a_genuine_gt_defect_between_rooms`
   by elimination.** The suppression rule's own (near-identical, slightly
   different band) computation gives `opening_cov=0.749`, `cos_to_neighbor≈0.004`,
   `edge_len=4.11 <= 5.23` — **all three conditions hold, predicate fires.**
   Both functions measured essentially the same underlying signal
   (`~0.749`); they disagree only because `classify()`'s single-condition
   cutoff (0.8) is stricter and less validated than the suppression rule's
   population-justified 0.65.

**Conclusion for 5683: this is a real doorway notch, not a real defect.**
Every fact (door witness spanning ¾ of the edge, perpendicular jamb, jamb
length ≈ wall thickness, zero residual gap anywhere on the edge) is
consistent with the mechanism the suppression rule was built to catch.
`classify()`'s label was the wrong one, not `check_plan`'s suppression.

---

## STEP 2 — population-scale generalization

Edge-level count, not the plan-level flip count (which the task correctly
flagged as an undercount — confirmed below):

```
Total edges classify() put in 'a_genuine_gt_defect_between_rooms': 1800
Of those, touched by a notch suppression:                          3  (0.17%)

Fact-1 (door witness present) among the 3 suppressed a-edges:  3/3 present, 0 absent
Fact-3 (residual gap beyond door span) among the 3:             0 found, 3 fully explained by door span, 0 no-neighbor

  (5683,  'bedroom_0', edge 3, witness=True, max_residual_gap=0.0)
  (5683,  'bedroom_0', edge 5, witness=True, max_residual_gap=0.0)
  (11576, 'bedroom_0', edge 30, witness=True, max_residual_gap=0.0)
```

**The undercount the task warned about is real and directly demonstrated
here:** plan 11576 has an `a`-classed edge that the suppression rule *also*
suppresses — same mechanism, same clean facts — but the plan itself did
**not** flip to `clean_at_source`, because it has at least one other,
unrelated broken edge elsewhere that's still flagged. The plan-level flip
gate (1 plan) is blind to this; the true rate of "the suppression rule
suppressed something `classify()` called a genuine defect" is **3 edges
across 2 plans**, not 1.

**classify()'s blind-spot exposure, independent of whether the fuller
suppression conjunction also fires** — distribution of `opening_coverage`
across all 1800 `a`-classed edges:

```
[0, 0.3)   clearly no opening:                1761  (97.83%)
[0.3, 0.65) below suppression threshold:         31  (1.72%)
[0.65, 0.8) classify() blind spot:                8  (0.44%)
```

Only **8 of 1800** `a`-classed edges (0.44%) sit in the band where
`classify()`'s cruder single-condition 0.8 cutoff could plausibly be
wrong about a real notch — of those 8, only 3 also clear the suppression
rule's other two conditions (perpendicularity, edge length) and actually
get suppressed. The other 5 fail perpendicularity or edge-length, meaning
either they are genuinely something else despite a high door-adjacency
score, or they're notches the current rule under-catches (a safe-miss
direction, not a false-suppression risk) — worth a small follow-up audit
but out of scope for this diagnosis (read-only, no tuning).

---

## Case assignment

- **Case A (no door witness / single-channel predicate) — does not
  apply, structurally and empirically.** `_opening_coverage` cannot
  return a nonzero value without an intersecting door/window/front_door
  polygon; the predicate is inherently two-channel (geometry AND opening
  witness) already. All 3 population-scale suppressed `a`-edges have a
  witness. There is nothing to add here — a "require a witness" fix would
  be a no-op on top of the existing condition 1.
- **Case B (witness present but residual gap beyond door span) — does
  not apply.** 0/3 suppressed `a`-edges show any residual gap beyond the
  door span at any sampled point (41-sample profile on 5683, 21-sample on
  the population pass). The suppressed edges are fully accounted for by
  `{room, neighbor room, filled wall}` end to end.
- **Case C (heuristic oracle fired on the doorway signature itself) —
  DOMINANT, 3/3 at population scale.** `classify()`'s
  `e_opening_doorway_notch` bucket is a single, unvalidated
  `opening_coverage >= 0.8` check — strictly cruder than the suppression
  rule's later, population-justified 3-condition conjunction at 0.65. All
  3 flip-relevant edges (5683 ×2, 11576 ×1) measure `opening_coverage
  ≈0.749–0.750` — real notches by every corroborating signal available
  (perpendicularity, jamb-length ratio, zero residual gap) — that
  `classify()`'s stricter, older cutoff simply missed, routing them to
  `a_genuine_gt_defect_between_rooms` by elimination rather than to
  `e_opening_doorway_notch`.

**Verdict: the flip is very likely a true positive for the suppression
rule and a false negative in the flip-gate's own oracle, not evidence
that the suppression rule over-suppresses a real defect.** `check_plan`'s
rule is doing what it was built to do; `classify()` is the less-trustworthy
of the two heuristics at this specific boundary.

## Proposed fix (NOT applied — Dan's call)

Re-derive the flip gate against a corrected oracle before treating any
future flip count as decisive, by either:

1. **Preferred:** re-run `classify()`'s `e_opening_doorway_notch` branch
   using the *same* validated 3-condition conjunction `check_plan` now
   uses (opening_coverage ≥0.65 AND perpendicular AND short), instead of
   its current single-condition 0.8 cutoff — making the flip gate's oracle
   consistent with the rule it's meant to police, rather than comparing
   against a stale, less-rigorous heuristic. This would very likely
   reclassify all 3 (or all 8 blind-spot) edges out of `a`, driving the
   flip count to 0 on unchanged suppression-rule code.
2. **Minimum:** manually audit the 8 blind-spot edges (population-scale,
   fully enumerable, cheap) via source overlay before trusting either
   label, and record the audited outcome as the new oracle for future
   flip-gate runs — since `classify()`'s own docstring already admits its
   thresholds were chosen without the population-scale justification the
   suppression rule later got.

Do **not** re-tune `check_plan`'s own thresholds (0.65/0.15/1.2) on the
strength of this diagnosis — nothing here indicates they're wrong; the
mismatch is entirely in the older, cruder, unaudited classifier used as
the acceptance-gate's yardstick.

## Bottom line for the P0 gate decision

At population scale, the flip mechanism is overwhelmingly (3/3, plus the
0.44% blind-spot bound) a stale-oracle artifact (Case C), not a rule
defect (Case A/B both ruled out on direct measurement). Recommend treating
the suppression rule as very likely sound, contingent on Dan re-deriving
the flip gate per the proposed fix above and confirming 0 flips against
the corrected oracle — rather than reworking the suppression rule itself.

**No code changed. Stopping here for review.**
