# Phase 2 Track V — Milestone 2 Step 3a Handoff

Branch `phase-2-trackv-m2c` (worktree `fp-phase2`). Not merged to main — held on this branch by explicit decision. This document exists so a cold session can resume with zero re-derivation. Full evidence, tables, and residuals live in `reports/phase-2-gate.md`'s step-3a sections; this is the compressed pointer, not a replacement for it.

## STATUS

3a is built: `select.py` (axis-alignment), `pair.py` (parallel-pair recovery + thickness-plausibility guard + re-keyed collinear-merge), `assemble.py` (junction snap + junction closure via extend-to-intersection + wall-only schema output), `score_align.py` (scoring-only coordinate adapter, outside `eval/`).

- Schema validity: **1.0 on both plans** (15x30, 30x50) — zero validator errors.
- Cycle closure: **24/50 cycles found** (15x30/30x50), connected components down from 43/54 (every wall isolated) to **7/6**. Closure (extend-to-intersection in `assemble.py`) works as designed and is committed.
- **Wall F1 is not a reportable number right now, on either plan — two independent blockers, not tuning:**
  1. **Candidate over-production** (this session's headline finding): `pair.py` emits ~3x as many wall candidates as GT has walls (54 vs 19 on 30x50). Precision therefore caps at ≈0.35 even at perfect recall — nowhere near the 0.99 exit bar — **regardless of anything in `assemble.py` or downstream**. Frame-independent, measured directly: GT has 2 T-junctions across 19 walls; predictions show 84 accepted T + 46 accepted X across 54 candidates once closure actually connects them (a ~65x topology-density error). This was invisible before closure because every candidate sat in its own isolated component.
  2. **Coordinate-frame unmeasurability** (issue #8, unresolved): 15x30's pinned-transform anchor-fit residuals are 3–6τ — several times the exit metric's own tolerance — so **15x30's wall F1 is UNMEASURABLE, not 0.000**. A zero implies a measured failure; this is an absent measurement. 30x50's clean 4-anchor fit is sub-τ (~0.8τ) and stays trustworthy, but its F1 is still capped by blocker 1.
- **Not merged as a phase-exit candidate** — not because closure failed (it didn't), but because both blockers above are still open.

## WHAT'S DONE AND PROVEN — do not re-litigate, do not re-run to re-confirm

- **`_collinear_merge` re-key** (prior session) — grouping by tight absolute perpendicular tolerance, not each fragment's own noisy thickness. Two required guardrail tests green, unchanged this session.
- **Junction closure** (`_resolve_junction_closure` in `assemble.py`, this session): for every wall-end still dangling after the cheap tolerance-only snap, finds cross-orientation partners, computes the *exact* infinite-line intersection (exact because every wall is analytically axis-aligned within one global theta frame — `pair.py`'s `_bucket_wall`), and either **SPLITS** the stationary partner (crossing strictly interior to its span — T/X) or **MOVES** a dangling endpoint to meet it (L-corner). Two independently-scaled bounds (generous axial-extension for genuinely dangling ends, tight overhang for near-misses on non-dangling ends), both keyed to each wall's own thickness. Candidates are enumerated and gated in one batch, never pairwise-in-sequence; splits on one wall are batched into a single N+1 cut, never iterative. Rejected candidates are logged with the bound they failed. Split pieces carry `parent_wall_id`. 10 new tests + both pre-existing collinear-merge guardrails green; full suite 51 passed, 3 xfailed.
- **`enable_splitting` diagnostic flag**: `assemble(..., enable_splitting=False)` / `run_step3a.py --no-splitting` runs the exact pre-split candidate set through the same funnel/eval path (verified: wall count bit-identical to pre-closure, 43/54). Use this, not code reverts, for any further over-production diagnostics.
- **`wall_parent_ids` funnel sidecar** (non-schema — the frozen schema has no parent field): lets a future script recover which split pieces came from which original wall, e.g. to re-merge 30x50's pinned-transform anchor walls (`W0`, `W22`, `W23` — all three got split by closure) without re-fitting the transform.
- **Pinned-transform scales** (prior session, unchanged in substance, but anchor wall IDs are now stale post-closure — see below): 15x30's anchor-fit residuals are 3–6τ (untrustworthy — this is *why* 15x30 is UNMEASURABLE). 30x50's clean 4-anchor fit has residuals ~0.8τ (trustworthy). Don't re-derive from scratch; if re-running, resolve the anchor walls via `wall_parent_ids` first (they're pre-split IDs that no longer exist standalone).

## WHY THIS ISN'T A MERGE-READINESS SESSION — two blockers, prioritized

**BLOCKER 1 — candidate over-production. Start here.** Per Dan's own arithmetic: 19 GT walls vs. 54 candidates on 30x50 caps precision at 0.35 pre-split (0.15 post-split, 19/230) — no downstream fix reaches 0.99 while this holds. Already in Phase 2's own scope per `extraction-plan.md` ("layer/color metadata harvesting; residue classification hooks... use geometric priors only"), not scope creep into P4/P6. Concrete leads already identified from this session's inspection: `W2` (15x30... actually 30x50) crosses three ~275-unit verticals `W26/27/28` at three different points; a second triad `W46/47/48` mirrors the pattern against a neighboring wall — repeating triads of near-identical-length parallel segments, consistent with window mullions/frame elements passing the thickness-plausibility guard.

Do these **in this order**:

1. **Layer/color/stroke metadata check first** — may be free (paper 5.2 step 1). **Decision rule, fixed before you start (so this doesn't stall on the fork):**
   - **Measure the separation over the full population, don't inspect a handful.** `W0`/`W22`/`W23` vs. `W2`/`W26-28`/`W46-48` is how the over-production hypothesis was *formed*, not how it should be *tested*. 30x50's pinned transform is trustworthy at ~0.8τ — good enough for the coarse real/spurious question. Label **all 54 pre-split candidates** real/spurious against GT's 19 walls, and report layer/color/stroke as a **confusion matrix over the full set**, not a few examples.
   - **Run this on the pre-split candidate set** (`--no-splitting`) — classification is upstream of splitting; the 230-wall post-split view only adds noise.
   - **By outcome:**
     - *Clean separation* (metadata partitions real from spurious, zero real walls lost against all 19 GT walls): use it as a filter. Free, no thresholds, exactly paper 5.2's "high-precision evidence."
     - *Partial separation*: do **not** half-filter. A partially-predictive channel used as a hard filter is the fastest way to lose a real wall and poison recall, and the 0.99 bar has zero room for that. Record it as an evidence field on the candidate instead, and move to periodicity.
     - *No separation* (single layer, shared colors, or PyMuPDF exposes no optional-content groups at all — common in marketing/CAD-export PDFs): report as a one-paragraph negative result and go straight to periodicity. A negative here is cheap and informative, not a failed session.
   - The deliverable is the confusion matrix, not a verdict — bring it to a STOP before building any filter.
2. **Periodicity/repetition signature second**, only if metadata doesn't cleanly separate them — the observed pattern is exactly paper 5.6 Layer 2's named signature (1-D FFT along the candidate population to catch periodic hatching/mullions/stair-treads), and is what milestone-2-step-2 already predicted would eventually be needed. Deterministic geometry only, no cross-evidence voting (that's P6's).

**Explicitly ruled out, do not re-attempt**: a length- or connectivity-based bound on the SPLIT side of closure. Considered and rejected this session — it would suppress the over-production symptom, restore a plausible-looking wall count, and destroy the clearest quality signal Phase 2 has produced. It is exactly the "threshold-tuned-around-a-symptom instead of a measured, specific fix" pattern this project's discipline forbids.

**Framing to carry forward**: this is paper §5.2's own predicted failure mode coming true almost verbatim ("Track V's geometric error is essentially zero; its risk is purely semantic") — a good sign about the blueprint, independent of it being bad news for the exit bar. Don't read the over-production finding as something having gone wrong this session.

**BLOCKER 2 — issue #8, coordinate-frame unmeasurability.** Direction from the prior STOP, not re-scoped here: the goal is to **eliminate the fitted transform, not fit a better one** (fitting on the same predictions you score is circular). Factual question to answer first: does a page-unit form of this corpus's GT exist upstream of its mm conversion (the Phase-0.4 SVG-authoring path implies SVG user-space was the original frame)? If yes, issue #8 collapses to "score Track V in page units." If no, the mm↔page relationship is Phase 5's scale-recovery job, not Phase 2's to hand-fit. One bounded falsification test worth running: refit the similarity by global least-squares over *all* confidently-matched wall pairs rather than 3–6 hand-picked anchors — if 15x30 drops under ~1τ, it was anchor selection; if it stays 3τ+ with anisotropic structure, the similarity model itself is wrong and 15x30 is out for this milestone on that evidence.

## DEBT / WATCH — carried forward, not regressions, do not silently drop

- **Manhattan-bias `xfail` test** (`tests/test_select.py`) — unchanged, still `xfail(strict=True)`, still out of scope until Phase 7.
- **X-junction count is NOT zero** (`tests/test_assemble.py::test_x_junctions_are_zero_on_real_corpus`, `xfail(strict=True)`) — 31 (15x30) / 46 (30x50), far from the "probably zero" prediction. This is itself evidence for Blocker 1, not a closure bug — do not "fix" by loosening or deleting the test; it should start passing (or be replaced by a real threshold) only once over-production is actually addressed upstream.
- **Both collinear-merge guardrails must stay green** through any further work here — unchanged this session, still the anti-over-merge tripwire.
- **30x50's GT runs meaningfully off-nominal** — known, already-diagnosed, not new.

## RESUME POINTER

Start the next session with the **layer/color/stroke metadata check**, run as the full-population confusion matrix described above (all 54 pre-split candidates on 30x50 vs. GT's 19 walls via `--no-splitting`) — not a re-inspection of the six examples (`W2`/`W26-28`/`W46-48` vs. `W0`/`W22`/`W23`) that formed the hypothesis in the first place. Do not touch closure's SPLIT-side bound. Do not re-run or re-derive the pinned transform without first resolving anchor IDs via `wall_parent_ids`. Bring the confusion matrix to the first STOP, not a filter — same discipline as every prior round this milestone.
