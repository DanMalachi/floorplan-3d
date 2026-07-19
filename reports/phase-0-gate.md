# Phase 0 Gate Report — Repo hygiene, corpus, spec, harness

**Branch:** `phase-0-harness` · **Date:** 2026-07-19 · **Session:** Terminal A

Status against every exit bar in `docs/extraction-plan.md`'s Phase 0 section. Per CLAUDE.md rule 7, every number below is either measured (with the command that produced it) or explicitly marked NOT MEASURED — nothing is estimated or assumed.

## 1. Harness correctness (the core exit bar)

`python -m eval.cli selftest`, run 2026-07-19:

```
[selftest] GT-vs-GT perfect: PASS
[selftest] corrupted-GT correct penalties: PASS
  validity_errors: ['wall w1 opening o1: span [999550.0, 1000450.0] not strictly within wall span
    [0, 4527.69...] ', 'junction j2: wall w1 does not terminate at junction point within 0.001',
    'room r1: walls w1 and w2 do not share an endpoint within 0.001 — cycle does not close']
  wall f1@1%: 0.750
  opening f1: 0.000
EXIT: 0
```

**MEASURED, PASS.** GT scored against itself is perfect on every metric (wall P/R/F1 at all three τ, wall-mask IoU, opening P/R/F1, validity, room count/label/adjacency). A copy with one wall detached and one opening moved to an absurd offset fails validity with three specific, correctly-attributed reasons and both wall F1 (0.75) and opening F1 (0.0) drop — not silently, not to zero across the board, proportionate to what was actually broken.

Backed by 5 additional targeted `tests/metrics/test_engine.py` cases (missing wall penalizes recall only, hallucinated wall penalizes precision only, wrong-host-wall opening is both a miss and a false positive, broken cycle fails with a named reason) — these were written to independently confirm the exit bar's premise ("correct penalties," not just "some penalty").

## 2. Validator mutation-class coverage

`pytest tests/schema/test_validate.py::test_each_mutation_class_is_caught` — **MEASURED, PASS.** Hypothesis-fuzzed over which wall/opening/junction/room the mutation targets (not five fixed cases), for all five classes: broken cycle, floating opening, dangling junction, negative thickness, unresolved ID. Every generated mutation is caught.

## 3. App build + legacy pipeline still runs

- `npm run build` — **MEASURED, PASS.** Compiles, typechecks, prerenders all 12 routes cleanly (last run: 2026-07-19, after all Phase 0 work).
- Legacy pipeline smoke test — **MEASURED, PASS.** Dev server started; home page (which statically renders the gated `TracePanel`) returns HTTP 200 with no error boundary triggered; `/api/dev-gt?name=test_1` correctly reads from the new `legacy/data/floorplan-gt/` path and returns valid JSON.
- Not exercised: an actual browser click-through of the Trace mode UI (draw a wall, import a PDF, run classify). The import-graph and API-route-path fixes are verified; end-to-end UI interaction was not manually driven in a browser this session.

## 4. Corpus report

`eval/registry/registry.csv`, 16 plans — **MEASURED**:

| GT status | count |
|---|---|
| provisional_unaudited | 15 |
| none (source only, no legacy GT existed) | 1 |
| **audited** | **0** |

Strata (encoding × convention × scope):

| encoding | convention | scope | count |
|---|---|---|---|
| R | poche | single | 10 |
| R | hatched | single | 3 |
| V | single_stroke | single | 2 |
| V | poche | multi_floor | 1 |

Canaries (2): the Israeli gray-poché plan with a MAMAD safe room and a sun balcony (rail convention), and the Matterport two-floor sheet (only `multi_floor` sample — exercises sheet segmentation once the router exists).

Split: dev=9, val=3, test=4.

Labeling method: 4 of 16 plans were individually visually spot-checked (one per convention family found); the remaining 12 were labeled by filename/CDN-pattern inference from the checked plan in the same batch, with `router_confidence` set lower (0.4 vs. 0.6–0.75) and a note recording that they weren't individually verified. This is an honest proxy for "Router labels assigned manually this phase," not a substitute for it — a real per-plan check would raise confidence and could reclassify some.

## 5. 30–50 audited GT plans, inter-annotator agreement (†)

**NOT MEASURED. Blocked on human annotation.** This is the one bar this session could not move, by design — hand-annotating 30–50 plans in Inkscape against the labeling spec is real human labor (5–120 min/plan per docs/paper.md), not something a single agent session does credibly. What *is* done:

- The tooling is ready: `extraction/synth/svg_gt.py` (Inkscape-layer → schema-v1 converter, round-trip tested) and `docs/labeling-spec.md` v1 (the spec an annotator would follow).
- 15 real plans were seeded provisionally via `extraction/synth/convert_legacy_gt.py`, converting Dan's pre-existing hand-traced GT from the old trace tool's format. All 15 pass schema + topology validation. They are explicitly `gt_status: provisional_unaudited` and do **not** count toward this bar — they predate the labeling spec (every wall converts to `role: "unconfirmed"` since the old format had no role taxonomy; no thickness in the old format, defaulted to 150mm; no rooms at all).
- Inter-annotator agreement requires ≥2 independent annotations of the same 10 plans — zero plans have even one spec-conformant annotation yet, so this number does not exist.

**Next step for Dan:** annotate (or re-annotate) plans via `svg_gt.py` against `docs/labeling-spec.md`, or provide fresh samples per the DAN PROVIDES checklist. 30–50 audited plans, 10 double-annotated, is the concrete unblock.

## 6. Schema + eval interfaces

**Conditionally frozen — one open question, not silently resolved either way.**

`extraction/schema/extraction_v1.schema.json`, `models.py`, `validate.py`, and the `eval/metrics/` + `eval/cli.py` interfaces are implemented, tested (23/23 pytest), and match `docs/paper.md` Appendix A/C. Two additions were made to Appendix A's schema during this phase, both flagged for Dan rather than silently shipped:

1. **`role: "rail"`** — added at Terminal B's explicit request (mid-session message), mirroring the shipping product's `Wall.kind`. Rails participate in junctions/`wall_cycle` identically to any other wall role. Covered by a dedicated test (`test_rail_role_closes_cycle_like_any_wall`) so it can't silently regress into being special-cased out of topology checks later.
2. **`evidence_source: "ground_truth"`** — added because the original enum was closed to extractor-channel values only, and GT plans (which are full schema-v1 objects, scored the same way as predictions) need to self-describe their own provenance.

**Open question requiring Dan's decision before true freeze:** `extraction_v1` has no equivalent of the product schema's `Wall.kind === "portal"` (a true absent boundary — an open-plan transition with zero built structure). `rooms[].wall_cycle` currently requires every edge to reference a real wall with `thickness > 0`, so an open kitchen/living/dining plan is unrepresentable as a closed room right now. This was discovered while writing `docs/labeling-spec.md` §3, not invented speculatively — the product already solved this exact problem, and `docs/labeling-spec.md` documents the gap in detail with the concrete options (portal-as-zero-thickness-wall vs. a separate room boundary representation). **Recommendation: resolve this before Phase 2 (Track V) or Phase 4 (solver) starts**, since both will hit real plans with open-plan layouts (the Israeli poché corpus almost certainly includes some). Neither Phase 0 deliverable (legacy GT conversion, SVG authoring converter) needed it, since both currently skip room `wall_cycle` authoring entirely (a separate, also-flagged limitation — see their module docstrings).

Given this, **the schema is not marked FROZEN.** `extraction/schema/` and `eval/` should not need further *breaking* changes for Phase 1–3 (baselines, Track V, Track R evidence — none of which produce rooms yet either), but the portal question should be settled, via `docs/schema-change-proposal.md` per CLAUDE.md rule 5, before Phase 4.

## Summary

| Exit bar | Status |
|---|---|
| GT-vs-GT perfect / corrupted-GT correct penalties | ✅ MEASURED, PASS |
| Validator catches all mutation classes | ✅ MEASURED, PASS |
| App builds; legacy pipeline runs from `legacy/` | ✅ MEASURED, PASS (no manual browser click-through) |
| Corpus report: strata, inter-annotator agreement, ratified bars | ⚠️ Strata MEASURED (16 plans); inter-annotator agreement NOT MEASURED |
| Schema + eval interfaces FROZEN | ⚠️ Implemented + tested; **not frozen** pending Dan's decision on the portal/open-boundary gap |

23/23 automated tests pass. `npm run build` passes. Repo hygiene (`legacy/` quarantine, `PROTECTED_PATHS.md`/`LEGACY_PATHS.md`, feature flag) is complete and verified.

**Do not begin Phase 1 in this session** (CLAUDE.md rule 3). Two things need Dan before Phase 1 starts in earnest: (1) the portal/open-boundary schema decision above, (2) real annotation progress toward the 30–50 plan bar, or an explicit call that Phase 1 baselines can run against the 15 provisional plans in the meantime with results caveated accordingly.
