# Phase 2 Track V — Milestone 2 Step 3a Handoff

Branch `phase-2-trackv-m2c` (worktree `fp-phase2`), HEAD `dfe12e9`. Not merged to main — held on this branch by explicit decision. This document exists so a cold session can resume with zero re-derivation. Full evidence, tables, and residuals live in `reports/phase-2-gate.md`'s step-3a sections; this is the compressed pointer, not a replacement for it.

## STATUS

3a is built: `select.py` (axis-alignment), `pair.py` (parallel-pair recovery + thickness-plausibility guard + re-keyed collinear-merge), `assemble.py` (junction snap, wall-only schema output), `score_align.py` (scoring-only coordinate adapter, outside `eval/`).

- Schema validity: **1.0 on both plans** (15x30, 30x50) — zero validator errors.
- Wall F1 @ τ=0.5% (Phase 2's exit metric): **15x30 = 0.000, 30x50 = 0.027**, against a required ≥ 0.99. Not close.
- Cycle closure: **0/0 on both plans** — expected, not a regression (see Gap A).
- **Not merged.** Validity clears the bar; wall F1 does not, by orders of magnitude.

## WHAT'S DONE AND PROVEN — do not re-litigate, do not re-run to re-confirm

- **`_collinear_merge` re-keyed** off a tight, absolute perpendicular tolerance (`COLLINEAR_GROUPING_TOLERANCE_FRAC = 0.005` of plan diagonal, ~7 native units on this corpus) instead of `round(perp / thickness * 4)` — grouping on each fragment's own noisy recovered thickness was the confirmed root cause of fragmentation. Thickness is now a length-weighted-median **output** of each merged group, not a grouping input. Two required guardrail tests are green (`tests/test_pair.py`): close parallel walls must not merge; fragments with different noisy thickness must still merge, to the correct weighted median (verified exactly: 10.2). Wall count dropped 72→43 (15x30) and 118→54 (30x50) — direct mechanical confirmation the fix works as diagnosed.
- **Diagnostic chain conclusions** (each hand-verified against real data across four prior STOPs this milestone — the reasoning and evidence are in `phase-2-gate.md`, not repeated here):
  - The suppression/notch question (why some walls are entirely absent from GT in places) is a **Phase 3a matter, not this branch's concern**.
  - **FILTERING (over-production/precision) was ruled out as the dominant recall mechanism.** The confirmed mechanism was **FRAGMENTED-dominant** (15x30: 5 of 8 problem walls were fragments, not misplaced or absent) — this is what the merge fix above addresses, and it's fixed.
  - **Coordinate-frame gap**: predictions (uncalibrated native units) and this corpus's GT (real-world mm) are not in the same frame, and frozen `eval/metrics/matching.py` performs no alignment. `score_align.py` is the scoring-only workaround, deliberately outside `eval/`. τ is confirmed **fractional-of-diagonal**, matching paper Appendix C exactly — no spec deviation. The harness-level fix this really needs is filed as **GitHub issue #8** (Phase-0 amendment proposal, not yet ratified or built).
  - **Pinned-transform scales**: 15x30's is trusted (~8% agreement with nominal 15×30ft footprint). 30x50's was re-fit from 4 clean anchor points after the original 6-point fit was found confounded by a real shape-step in GT's building outline — the clean fit's residuals are 45–59mm and its rotation agrees with `select.py`'s own independently-measured theta. Both transforms are what `analyze_step3a_pinned.py` currently ships; don't re-derive them from scratch, extend from there if needed.

## WHY WALL F1 IS STILL ~0 — the three remaining gaps, prioritized, none started

This is tomorrow's actual work. Each gap below is diagnosed only to the one-line depth shown — none has had its own STOP-gated diagnostic session yet. Follow this milestone's own discipline: **diagnose before fixing, bring evidence to a STOP before writing code.**

**GAP A — cycle closure is 0/0 on both plans. Likely the highest-leverage next target.** `_collinear_merge` only stitches fragments along *one wall's own axis* — it has no mechanism to connect two *perpendicular* walls at a shared corner. That's `assemble.py`'s separate endpoint-snap job (`SNAP_TOLERANCE_NATIVE`), and it's currently underperforming: zero rooms close on either plan, meaning there is no room-cycle validity signal at all right now, and unclosed topology is itself a large, structural drag on any F1-adjacent metric. Not diagnosed beyond that one line — the actual question (is the snap tolerance too tight relative to real corner-position noise, or is something else preventing junction sharing entirely?) has not been investigated.

**GAP B — endpoint/centerline precision. Smaller, do last.** Even well-matched, fully-covered walls show 0.3–1.5τ residual, not 0τ. Concrete example: `w_s7` (15x30's single most-trusted anchor wall) is single-piece, 97.6% overlap coverage, zero fragmentation gaps — and still scores MISPLACED, with a 133mm perpendicular offset. This is a precision problem on walls that are otherwise completely recovered, pushing them just over the τ=0.5% line rather than under it. Not structural — a smaller, more contained fix once diagnosed.

**GAP C — genuine coverage holes, root cause not yet diagnosed.** Some GT walls have **zero** predicted candidate anywhere nearby — not fragmentation (there's nothing to stitch), a true pairing miss. Needs a fresh select/pair-level look, not an assemble-level one. Untested hypotheses, none investigated this milestone: one-sided wall conventions, thin partitions falling under some existing threshold, or spans so hatch-swamped that no axis-aligned candidate ever survives selection there.

## DEBT / WATCH — carried forward, not regressions, do not silently drop

- **Manhattan-bias `xfail` test** (`tests/test_select.py::test_rotated_wall_grid_with_dominant_hatch_is_not_reliably_recovered`) — from the axis-selector fix in the first 3a session. Must stay `xfail(strict=True)`. Principled fix is explicitly out of scope until **Phase 7 hardening** (weight the axis vote by parallel-pair support, not proximity-to-zero). If it starts passing unexpectedly, that's a signal to investigate why, not to just remove the marker.
- **The two collinear-merge guardrail tests must stay green** through any Gap A/B/C work — they're the anti-over-merge tripwire; any future change to grouping/tolerance/merge logic should be checked against them first.
- **30x50's GT runs meaningfully off-nominal** (its bounding box doesn't match its nominal 30×50ft name the way 15x30/20x45 do their own nominal sizes). This is a known, already-diagnosed property of this specific provisional GT file, not a pinning error introduced by this milestone's work — don't re-investigate it as if it were new.

## RESUME POINTER

Start the next session by picking **Gap A or Gap C** as the first diagnostic (Gap B is smaller and explicitly ordered last). **Do not rebuild or re-touch the collinear-merge — it's done, tested, and confirmed working.** Bring a diagnosis to the first STOP of the next session, not a fix, matching this milestone's own discipline throughout: hand-verify against real data, confirm the mechanism, only then build.
