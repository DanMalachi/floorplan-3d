# Phase 0 Gate Report — Repo hygiene, corpus, spec, harness

**Branch:** `phase-0-harness` · **Session:** Terminal A · Initial report 2026-07-19; **amended 2026-07-19** with a pre-freeze schema amendment and full gate re-verification, both requested by Dan before merge review.

Status against every exit bar in `docs/extraction-plan.md`'s Phase 0 section. Per CLAUDE.md rule 7, every number below is either measured (with the command that produced it) or explicitly marked NOT MEASURED — nothing is estimated or assumed.

## 0. Pre-freeze amendment (this pass)

Two amendments escalated from the phase-3a branch, applied to all four places a schema change touches (`extraction_v1.schema.json`, `models.py`, `validate.py`, `docs/labeling-spec.md`) before freeze:

**(a) `wall.role: "rail"`.** Already present from the initial Phase 0 pass (added at Terminal B's mid-session request) — confirmed still correct in all four places, no changes needed. Rails participate in `junctions` and `wall_cycle` exactly like any other wall role; covered by `test_rail_role_closes_cycle_like_any_wall`.

**(b) Rooms as wall-bounded faces with optional `zones`.** **New this pass.** Rooms were already wall-bounded faces (`wall_cycle`); what was missing was the optional `zones: [{label, polygon}]` field for functional sub-areas within one already-closed room (open-plan living/kitchen/dining with no dividing wall) — the "Open-plan zones idea" memory entry, previously deferred, now implemented:

- **Schema** (`extraction_v1.schema.json`): new `$defs/zone` (`label`, `polygon` with `minItems: 3`); `room.zones` added as an optional array property (not in `required`).
- **Models** (`models.py`): new `Zone` pydantic model; `Room.zones: list[Zone] = Field(default_factory=list)`.
- **Validator** (`validate.py`): new `_room_polygon()` (walks a `wall_cycle` into an ordered polygon via the same shared-endpoint logic `cycles_closed` uses, so it doesn't double-derive or disagree with it), `_point_in_polygon()` (ray casting), and `zones_within_room()`, wired into `validity()`. A zone polygon vertex outside its room's wall-cycle face is now a validator error. If the cycle itself doesn't close, `_room_polygon()` returns `None` and the zone check is skipped for that room — `cycles_closed` already reports the real problem, so this avoids a confusing double error.
- **Labeling spec** (`docs/labeling-spec.md` new §4): documents the convention and — explicitly — that zones do **not** resolve the still-open portal/absent-boundary gap (§3 below). They tag sub-areas inside a room that already closes; the portal gap is about rooms that can't close at all. Section numbering was fixed throughout (old §4/§5 shifted to §5/§6).
- **Tests extended**: the shared fixture (`tests/schema/test_validate.py::valid_plan`) now carries two zones (`living`, `dining`) inside its room face, exercised by both the existing `test_valid_fixture_passes` and a new `test_zones_within_room_face_pass`. A sixth mutation class, `zone_outside_room` (pushes a zone vertex to `[99999, 99999]`), was added to the hypothesis-fuzzed `MUTATIONS` table in `test_each_mutation_class_is_caught` — hypothesis picks which of the fixture's 2 zones to corrupt, same pattern as the other five classes.

The portal/absent-boundary gap itself (§3) is **unchanged and still open** — zones were never a candidate fix for it, and this pass didn't touch it.

## 1. Harness correctness (the core exit bar)

`python -m eval.cli selftest`, re-run 2026-07-19 after the amendment:

```
[selftest] GT-vs-GT perfect: PASS
[selftest] corrupted-GT correct penalties: PASS
  validity_errors: ['wall w1 opening o1: span [999550.0, 1000450.0] not strictly within wall span
    [0, 4527.6925690687085]', 'junction j2: wall w1 does not terminate at junction point within 0.001',
    'room r1: walls w1 and w2 do not share an endpoint within 0.001 — cycle does not close']
  wall f1@1%: 0.750
  opening f1: 0.000
EXIT: 0
```

**MEASURED, PASS — unchanged by the amendment.** GT scored against itself (now including its two zones) is still perfect on every metric. The corrupted copy — same corruption as before (`_corrupt()` in `eval/cli.py` detaches a wall and floats an opening; it does not touch zones) — still fails with the same three reasons, confirming the new `zones_within_room` check doesn't introduce false positives on an unrelated corruption.

Also re-verified via `tests/metrics/test_engine.py` (5 targeted cases: missing wall → recall only, hallucinated wall → precision only, wrong-host-wall opening → miss + false positive, broken cycle → named reason) — all still pass with `zones` present in the fixture.

## 2. Validator mutation-class coverage

```
$ .venv\Scripts\python.exe -m pytest tests/schema/test_validate.py -v --hypothesis-show-statistics

tests/schema/test_validate.py::test_valid_fixture_passes PASSED          [ 25%]
tests/schema/test_validate.py::test_rail_role_closes_cycle_like_any_wall PASSED [ 50%]
tests/schema/test_validate.py::test_zones_within_room_face_pass PASSED   [ 75%]
tests/schema/test_validate.py::test_each_mutation_class_is_caught PASSED [100%]

Hypothesis Statistics — test_each_mutation_class_is_caught:
  - during generate phase (0.02 seconds): 19 passing examples, 0 failing examples, 0 invalid examples
  - Stopped because nothing left to do

4 passed in 0.16s
```

**MEASURED, PASS.** Now **six** mutation classes (was five): broken cycle, floating opening, dangling junction, negative thickness, unresolved ID, **and zone-outside-its-room-face**. Hypothesis fuzzes which element (wall/junction/room/zone) the mutation targets — 19 generated examples this run, all caught, zero failing/invalid.

## 3. App build + legacy pipeline still runs

```
$ npm run build
▲ Next.js 16.2.9 (Turbopack)
✓ Compiled successfully in 5.8s
  Running TypeScript ...
  Finished TypeScript in 8.5s ...
✓ Generating static pages using 11 workers (12/12) in 464ms
  Finalizing page optimization ...
Route (app): / (static), /_not-found (static), /api/classify, /api/classify-rooms, /api/dev-gt,
  /api/dwg2dxf, /api/extract, /api/liveblocks-auth, /api/propose-raster, /api/share,
  /v/[id], /v/-/opengraph-image (all dynamic)
EXIT: 0
```

**MEASURED, PASS.** This pass touched only `extraction/`, `eval/`, `docs/`, and `tests/` (Python + docs) — no TypeScript/app files — so this re-run is a regression check, not expected to change, and didn't.

```
$ npm run dev  (background)
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
HTTP 200
$ curl -s -w "HTTP %{http_code}\n" "http://localhost:3000/api/dev-gt?name=test_1"
HTTP 200
{"metadata":{"coordinate_system":{"origin":"bottom_left","units":"ft","building_size":{"width":40.0, ...
```

**MEASURED, PASS.** Home page (statically renders the gated `TracePanel`) returns HTTP 200 with no error state (`"error":"$undefined"` in the RSC payload, confirmed — not a stringified error); `/api/dev-gt` correctly serves from `legacy/data/floorplan-gt/`. Dev server process was cleaned up after the check (a leftover instance from an earlier verification pass in this same session was found still bound to port 3000 and killed — noted here since "did you actually clean up after yourself" is exactly the kind of thing this checklist exists to catch).

**Still not exercised:** an actual browser click-through of the Trace mode UI (draw a wall, import a PDF, run classify). Same caveat as the original report — the import-graph/route-path fixes are verified structurally and via HTTP, not by driving the UI.

## 4. Corpus report

Unchanged by this amendment (no registry/GT-conversion files were touched). `eval/registry/registry.csv`, 16 plans — **MEASURED**:

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

Canaries (2): the Israeli gray-poché plan with a MAMAD safe room and a sun balcony (rail convention), and the Matterport two-floor sheet (only `multi_floor` sample). Split: dev=9, val=3, test=4.

Labeling method: 4 of 16 plans individually visually spot-checked (one per convention family found); remaining 12 labeled by filename/CDN-pattern inference with lower `router_confidence` (0.4 vs. 0.6–0.75) and an explicit note.

## 5. 30–50 audited GT plans, inter-annotator agreement (†)

**Still NOT MEASURED. Still blocked on human annotation.** Unchanged by this amendment — no annotation happened this pass, nor was any attempted (same reasoning as the original report: this is real human labor, not something to fake through). `extraction/synth/svg_gt.py` remains v1-scoped to walls/openings/junctions only; it does not yet author `zones`, since no annotator has needed to yet. If/when zone authoring is needed, `docs/labeling-spec.md` §4 already specifies the natural extension (a `zone:<label>` SVG layer per zone).

**Next step for Dan:** unchanged — annotate via `svg_gt.py` against the labeling spec, or provide fresh samples.

## 6. Schema + eval interfaces

**Still conditionally frozen — one open question remains, now more precisely scoped.**

`extraction/schema/`, `models.py`, `validate.py`, and `eval/metrics/` + `eval/cli.py` are implemented and tested (**24/24 pytest**, was 23/23). Three additions have now been made to Appendix A's schema across the two passes, all flagged for Dan rather than silently shipped:

1. **`role: "rail"`** (prior pass) — mirrors the shipping product's `Wall.kind`. Confirmed intact this pass.
2. **`evidence_source: "ground_truth"`** (prior pass) — GT plans need to self-describe provenance.
3. **`room.zones` (this pass)** — optional functional sub-areas within one already-closed room, fully validated (polygon-in-face containment). This is an additive, non-breaking change: existing plans without `zones` remain valid (the field defaults to empty).

**Open question requiring Dan's decision before true freeze (unchanged, not resolved by this pass):** `extraction_v1` still has no equivalent of the product schema's `Wall.kind === "portal"` (a true absent boundary — zero built structure). `rooms[].wall_cycle` still requires every edge to reference a real wall with `thickness > 0`. **This pass explicitly did not attempt to resolve it** — zones are a different mechanism (sub-areas inside a closed room) and were never going to fix a room that can't close at all; conflating the two was the specific mistake `docs/labeling-spec.md` §3's amended text now warns against. Recommendation stands: resolve before Phase 2 (Track V) or Phase 4 (solver) starts, via `docs/schema-change-proposal.md` per CLAUDE.md rule 5.

Given this, **the schema is still not marked FROZEN.** The `zones` addition does not change that determination — it closes out one escalated amendment cleanly, but the portal gap is the actual freeze blocker and remains exactly where it was.

## Summary

| Exit bar | Status |
|---|---|
| GT-vs-GT perfect / corrupted-GT correct penalties | ✅ MEASURED, PASS (re-verified post-amendment) |
| Validator catches all mutation classes | ✅ MEASURED, PASS — now 6 classes (was 5) |
| App builds; legacy pipeline runs from `legacy/` | ✅ MEASURED, PASS (re-verified; no manual browser click-through) |
| Corpus report: strata, inter-annotator agreement, ratified bars | ⚠️ Strata MEASURED (16 plans, unchanged); inter-annotator agreement NOT MEASURED |
| Schema + eval interfaces FROZEN | ⚠️ Implemented + tested (24/24); **not frozen** — portal/open-boundary gap unresolved, unchanged by this pass's zones amendment |

24/24 automated tests pass (was 23/23 — +1 for the zones amendment: `test_zones_within_room_face_pass`, plus the sixth mutation class folded into the existing hypothesis test). `npm run build` passes. Legacy pipeline verified running from `legacy/`.

**Stopping here for review, as requested — not merging, not starting Phase 1.** Three things need Dan's call: (1) the portal/open-boundary schema decision, (2) whether the `zones` addition as scoped (containment-only, no confidence/evidence, not yet SVG-authorable) is sufficient or needs more before Phase 1, (3) real annotation progress toward the 30–50 plan bar, or an explicit call that Phase 1 baselines can run against the 15 provisional plans in the meantime with results caveated accordingly.
