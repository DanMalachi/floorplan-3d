# P3a — notch-suppression flip resolution (audit + classify() fix)

Follow-on to `reports/p3a-notch-diagnosis.md` (commit `b713c34`). That
report diagnosed the plan-5683 flip as a probable `classify()` mislabel,
not a `check_plan` defect, but stopped short of an exhaustive audit. This
session audits the full risk surface, accepts the suppression rule, and
makes the one authorized write: correcting `classify()`'s notch branch.
**`check_plan` / `measure_clean_at_source.py` was NOT touched, at any
point, this session.**

New files: `extraction/synth/qa/audit_notch_blind_spot.py`,
`audited_notch_ground_truth.json`, `gate_flip_check_audited.py`,
`recount_classify_post_fix.py`, `diff_classify_pre_post_fix.py`.
One modified file: `extraction/synth/qa/classify_room_boundary_no_wall_match.py`
(the notch branch of `classify()`, plus the supporting perpendicularity
signal it now needs).

---

## STEP 1 — exhaustive audit of the risk surface

Enumerated every `a_genuine_gt_defect_between_rooms` edge with
`opening_coverage >= 0.65` across the full 17,000-plan population (the
only band `check_plan`'s suppression predicate can ever touch, since
`opening_cov >= 0.65` is one of its three conjuncts). **Count: 8 — matches
the prior diagnosis exactly, no discrepancy.**

Each edge was rendered from source (`extraction/synth/reports/notch_audit_*.png`)
and visually verified. Signals: door/window/front_door witness,
perpendicularity to the nearest wall-backed ring neighbor
(`cos_to_neighbor`), jamb-length ratio (`edge_len/wall_depth`), and the
sampled residual-gap profile beyond the door span.

| # | plan | room:edge | opening_cov | cos_to_neighbor | jamb_ratio | residual gap | check_plan suppresses? | **human verdict** |
|---|------|-----------|:---:|:---:|:---:|:---:|:---:|---|
| 1 | 5683 | bedroom_0:3 | 0.749 | 0.004 | 0.943 | 0.0 | YES | **notch** (clean jamb, door fills rest of edge) |
| 2 | 5683 | bedroom_0:5 | 0.749 | 0.000 | 0.943 | 0.0 | YES | **notch** (same door, opposite jamb) |
| 3 | 11576 | bedroom_0:30 | 0.681 | 0.000 | 1.001 | 0.0 | YES | **notch** (zigzag multi-step door pattern) |
| 4 | 1935 | bathroom_0:6 | 0.724 | 0.644 | 1.658 | 0.0 | no | **not a notch** — diagonal chamfer, non-perpendicular |
| 5 | 2405 | bedroom_1:2 | 0.702 | 0.793 | 5.749 | 0.0 | no | **not a notch** — long diagonal edge, far outside jamb scale |
| 6 | 9869 | bedroom_1:6 | 0.794 | 0.891 | 1.911 | 0.0 | no | **not a notch** — diagonal chamfer near a door |
| 7 | 1437 | bathroom_2:11 | 0.758 | 0.769 | 3.668 | 0.0 | no | **not a notch** — jagged/irregular room-boundary artifact |
| 8 | 11587 | bedroom_1:8 | 0.739 | 0.000 | 1.354 | 0.0 | **no** | **IS a notch** — perpendicular jamb in a door polygon, but `check_plan`'s 1.2× jamb-length bound excludes it |

All 5 non-suppressing edges with `opening_coverage` inside the same
0.65–0.8 range span `cos_to_neighbor` 0.64–0.89 — a wide, clean gap from
the 3 suppressed edges' 0.000–0.004. Perpendicularity, not coverage,
is what actually separates notch from non-notch in this band.

## STEP 2 — verdict on the suppression rule

**All 3 edges `check_plan` suppresses audit as genuine doorway notches.
Suppression rule ACCEPTED — clean across the entire current risk
surface (0/3 wrong).**

Of the 5 non-suppressing edges, **1 (plan 11587) is also a real notch**
that the rule conservatively misses (fails only the 1.2× jamb-length
bound, at ratio 1.354). This is a **recall gap**, not a correctness
problem — the edge stays flagged (safe direction) rather than being
wrongly cleared. Noted, not fixed, per instruction: `check_plan` is
untouched this session.

## STEP 3 — re-anchoring the gate

Re-derived the flip gate to assert against **audited human ground
truth**, not `classify()`'s output: `audited_notch_ground_truth.json`
(8 entries, one per audited edge, each with its verdict and signals) is
now the oracle; `classify()` remains only the **candidate generator**
(what to audit next), never the pass/fail authority.
`gate_flip_check_audited.py` implements this and explicitly flags any
`a`-classed, `opening_coverage>=0.65` edge **not yet present** in the
audited JSON as `UNAUDITED` rather than silently trusting it — this is
the GT-growth re-trigger the task asked for.

Run against the population **after** Step 4's fix landed:

```
correctly suppressed (audited notch, rule suppressed):     0
correctly NOT suppressed (audited non-notch, rule didn't): 4
recall gaps (safe miss):                                    0
WRONGLY suppressed (ACCEPTANCE FAILURE):                     0
UNAUDITED (new risk-band edges, need manual review):        57
GATE: INCOMPLETE — new unaudited risk-band edges found
```

Zero wrong suppressions confirms Step 2's verdict. The "correctly
suppressed" count reading 0 (not 3) and 57 new `UNAUDITED` entries are
both **direct, expected consequences of Step 4's fix** — explained below,
not a new problem with `check_plan`.

## STEP 4 — `classify()`'s notch branch, corrected (the one write)

**Old rule** (single condition): `opening_coverage >= 0.8` → notch.
**New rule** (own implementation, own thresholds, independently derived
from this audit's own gaps — not imported/aliased from `check_plan`):

```python
if (e["opening_coverage"] >= 0.65               # floor only, not sufficient alone
        and cos_n is not None
        and cos_n <= 0.2                         # audited notches: <=0.004; non-notches: >=0.644
        and e["edge_len"] <= 1.5 * e["wall_depth"]):  # audited notches: <=1.354; non-notches: >=1.658
    return "e_opening_doorway_notch"
```

`cos_n` (`cos_to_nearest_backed_neighbor`) is computed by a **new, locally
defined** function in `classify_room_boundary_no_wall_match.py` — same
underlying geometry idea as `check_plan`'s `_nearest_wall_backed_cos`
(inevitable, since it's the correct way to measure this), but a separate
implementation, not a shared import. `analyze_plan` was restructured to
build the full ring's wall-backed-status array up front (previously it
only touched already-broken edges), which this signal requires.

**All 8 audited edges reclassify correctly**, including 11587 (the
recall-gap edge) — `classify()` is intentionally *more* permissive than
the operational rule (1.5× vs. 1.2× jamb bound), since a labeling oracle
should recognize more notches than a conservative suppression rule needs
to act on.

### Corrected defect count, full population re-run

```
a_genuine_gt_defect_between_rooms (edge-level): pre-fix=1800  post-fix=1853  delta=+53
a_genuine_gt_defect_between_rooms (plan-level, >=1 edge): pre-fix=1100  post-fix=1109  delta=+9
```

**This delta is a net increase, not a decrease — expected once the
mechanism is understood, not a sign the fix is wrong.** The old
single-condition rule was not just under-permissive on the notch side; it
was **also over-permissive**, auto-labeling *any* edge with
`opening_coverage >= 0.8` as a notch regardless of shape. Full transition
table (edges only, category changes):

```
d_tracing_artifact_small_notch -> e_opening_doorway_notch: 161   (recovered — real notches previously dumped in 'd')
e_opening_doorway_notch -> a_genuine_gt_defect_between_rooms: 57  (previously mislabeled 'notch', not perpendicular/short enough)
e_opening_doorway_notch -> d_tracing_artifact_small_notch: 37
c_exterior_boundary_or_void -> e_opening_doorway_notch: 14
e_opening_doorway_notch -> c_exterior_boundary_or_void: 9
a_genuine_gt_defect_between_rooms -> e_opening_doorway_notch: 4   (the 4 real notches from Step 1's audit)
b_shared_wall_wide_recoverable -> e_opening_doorway_notch: 3
e_opening_doorway_notch -> b_shared_wall_wide_recoverable: 2
```

Net `e_opening_doorway_notch` (notch) pool: **+77** (182 gained, mostly
the 161 recovered from `d`; 105 lost). Net `a` pool: **+53** (57 gained
from the old over-generous `e` bucket, 4 lost to the real-notch fix).
One gained-into-`a` example is **plan 5186 `stair_0` edge 0** — the exact
front_door-divergence case already flagged in `docs/session-notes/p3a-handoff.md`
as a diagonal chamfer (`cos=0.874`), independently confirming the old
`0.8`-only rule was mislabeling it as a confirmed notch when the original
diagnostic session had already identified it as geometrically different.

**Net effect: the notch bucket got substantially bigger (more true
notches correctly recognized, mostly recovered from `d`), while the
defect bucket also grew somewhat (previously-hidden non-notch edges that
the old rule silently absorbed into `e` are now correctly excluded from
it).** Both movements are corrections in the same direction: away from
the old rule's single, unvalidated cliff.

---

## P0-gate flag

`classify()` is a heuristic taxonomy script, not audited ground truth, and
it had a proven systematic error at its `opening_coverage>=0.8` cliff —
both under-recognizing real notches (this session's original trigger) and
over-recognizing non-notches as notches (the newly-found 57-edge
mechanism). It is the categorization layer behind every "recoverable vs.
genuine-defect" percentage in `p3a-handoff.md`, including the **~96.4%
revised-ceiling estimate** and the `room_boundary_no_wall_match`
decomposition table — none of which should be treated as current until
re-run against the corrected `classify()`. **Separately, and importantly:
the actual, measured `clean_at_source` gate (87.2% population, `check_plan`)
is completely unaffected by this session** — `check_plan` was never
touched, so that number and the (now-expected-zero) flip-gate status
stand as already reported. This correction is favorable for **trust in
the diagnostic denominator**, not a claim that any headline percentage
moved up; the `a`-bucket edge count in fact grew (+53) as the more
important, more accurate signal.

**Immediate, higher-priority follow-up than a general branch spot-check:**
this fix itself surfaced **57 new, unaudited `opening_coverage>=0.65`
edges** now in `a_genuine_gt_defect_between_rooms` (`gate_flip_check_audited.py`
lists all 57 by plan/room/edge). None have been visually verified yet —
the corrected count (1853/1109) should be treated as provisional until
they are. **Recommend, as a separate next session: (1) audit those 57
edges the same way as this session's 8, since some may turn out to be a
third category neither notch nor genuine defect (the jagged-boundary
pattern seen on plan 1437 is a candidate); (2) a bounded spot-check of
`classify()`'s other branches** (`c_exterior_boundary_or_void`,
`b_shared_wall_wide_recoverable`, `d_tracing_artifact_small_notch`,
`f_unexplained_interior_gap`) **before the P0 ceiling estimate is treated
as fixed** — this session only touched and validated the notch branch.

**No further code changes made. Stopping here for review.**

---

## Dan's review (2026-07-22) — status recorded, next session specified

**Reviewed and ACCEPTED**, with explicit constraints on what this
session's numbers may and may not be used for going forward:

- **Suppression rule: ACCEPTED as "sound, not complete."** Clean on
  everything it currently suppresses (3/3 audit as real notches). Plan
  11587 remains a **known, unfixed recall gap** — a real notch missed on
  the 1.2× jamb-length bound — left as-is by explicit decision, not an
  oversight. "Sound" describes correctness of what it does suppress;
  it does not claim completeness.
- **Corrected defect count logged, not trusted as ground truth.**
  1800→1853 edges (+53), 1100→1109 plans (+9). Direction reversed from
  the assumed decrease — recorded explicitly because it disproves the
  natural assumption that fixing a mislabeling bug only recovers cases,
  never adds them. Root cause, logged for the record: **the raw pre-fix
  `classify()` was miscalibrated in BOTH directions** — it missed real
  notches (this session's original trigger, plan 5683) **and** it
  auto-labeled 57 non-notch edges as notches on `opening_coverage >= 0.8`
  alone, with no shape check at all (includes the plan 5186 diagonal
  chamfer already flagged in `p3a-handoff.md` as a known divergence).
- **`clean_at_source` (87.2%) is UNAFFECTED and remains the only real
  gate number.** `check_plan`/`measure_clean_at_source.py` was never
  touched this session (confirmed zero-diff). The corrected 1853/1109
  counts are **diagnostic-ceiling inputs only** — they describe
  `classify()`'s own taxonomy, not what feeds `clean_at_source`, and must
  not be merged into any P0-gate "is 90% reachable" input yet.
- **Explicit non-trust boundary:** the +77 net notch-pool movement and
  the +53/+9 corrected defect count are themselves now suspect for the
  same reason the original 0.8 cliff was — 57 of the edges behind those
  numbers were just relabeled by a branch of `classify()` that has not
  itself been audited. They are **candidates for audit, not audited
  truth.** No P0-gate decision should consume them as-is.

### Next session (specified now, NOT started here — its own STOP-gated session)

**Audit-sweep of `classify()`'s remaining defect-emitting branches**,
using the same corroborating-signal render method as this session's
8-edge audit (door witness, perpendicularity, jamb length, residual-gap
profile, human visual verdict per edge):

1. **Priority 1 — the 57 newly-labeled edges from this session's fix**
   (`gate_flip_check_audited.py`'s `UNAUDITED` list). Highest priority:
   these were generated by the correction itself and are entirely
   unaudited.
2. **Priority 2 — the other `classify()` branches not yet stress-tested**
   (`c_exterior_boundary_or_void`, `b_shared_wall_wide_recoverable`,
   `d_tracing_artifact_small_notch`, `f_unexplained_interior_gap`).

**Output required:** an **AUDITED defect count** — not another raw
`classify()` re-run. Only that audited number is a valid input to the
"is 90% reachable" P0-gate decision. Until it exists, that decision
consumes `clean_at_source` (measured, gate-real) only, never the raw
`classify()` diagnostic count (heuristic, still in motion).
