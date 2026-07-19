# Phase 0 Gate Report — Repo hygiene, corpus, spec, harness

**Branch:** `phase-0-harness` · **Session:** Terminal A · Initial report 2026-07-19; amended 2026-07-19 (zones); **amended again 2026-07-20 (portal role — resolves the open gap)**, all requested by Dan before merge review.

Status against every exit bar in `docs/extraction-plan.md`'s Phase 0 section. Per CLAUDE.md rule 7, every number below is either measured (with the command that produced it) or explicitly marked NOT MEASURED — nothing is estimated or assumed.

## 0. Pre-freeze amendment #1 (2026-07-19)

Two amendments escalated from the phase-3a branch, applied to all four places a schema change touches (`extraction_v1.schema.json`, `models.py`, `validate.py`, `docs/labeling-spec.md`):

**(a) `wall.role: "rail"`.** Added at Terminal B's mid-session request. Rails participate in `junctions` and `wall_cycle` exactly like any other wall role; covered by `test_rail_role_closes_cycle_like_any_wall`.

**(b) Rooms as wall-bounded faces with optional `zones`.** The optional `zones: [{label, polygon}]` field for functional sub-areas within one already-closed room (open-plan living/kitchen/dining with no dividing wall) — the "Open-plan zones idea" memory entry, previously deferred, now implemented. New `$defs/zone` in the schema; `Zone` pydantic model; `zones_within_room()` validator (polygon-in-face containment via `_room_polygon()` + `_point_in_polygon()`); documented in `docs/labeling-spec.md` §4 with an explicit warning that zones do **not** resolve the portal gap (§3) — different mechanism, different problem. Sixth mutation class `zone_outside_room` added.

At the time, **the portal/absent-boundary gap (§3) was flagged, not resolved.** That is what amendment #2 below closes out.

## 0b. Pre-freeze amendment #2 (2026-07-20) — portal role, RESOLVES the open gap

`wall.role: "portal"` added — the extraction schema's equivalent of the product schema's `Wall.kind === "portal"`: a virtual boundary segment (thickness always exactly `0`) that closes a room face where no physical wall exists. Applied to all four places, plus new tests:

- **Schema** (`extraction_v1.schema.json`): `"portal"` added to the `role` enum; `wall.thickness` relaxed from `exclusiveMinimum: 0` to `minimum: 0` at the base level, with a new `if`/`then`/`else` conditional on the wall object — `role == "portal"` ⇒ `thickness` must be `const: 0`; every other role ⇒ `thickness` must be `exclusiveMinimum: 0` (i.e. the old rule, now conditional rather than unconditional). Role enum description extended with the portal semantics, the "no floating portals" rule, and the documentation-only image-evidence note (see below).
- **Models** (`models.py`): `"portal"` added to `WallRole`. `Wall.thickness` relaxed from `Field(gt=0)` to `Field(ge=0)`, with the portal-vs-real distinction now enforced by a new `@model_validator(mode="after")` — `Wall._portal_thickness_rule` — that raises unless (`role == "portal"` and `thickness == 0`) or (`role != "portal"` and `thickness > 0`). This is independent of the JSON Schema's `if`/`then`/`else`; both are tested to actually reject the same bad input (see §2 below), not just assumed to agree.
- **Validator** (`validate.py`): `thickness_positive()` amended with the same portal-vs-real branch. New `portals_terminate_on_real_geometry()`, wired into `validity()`: for every portal wall, its `start` and `end` must each independently coincide (within the existing `EPSILON`) with a **non-portal** wall's endpoint. A portal cannot float free, and — deliberately, per the spec's explicit design note — a run of two portals in sequence needs its interior joint to *also* touch a real wall, not just the other portal; one portal is defined as one bridge between two real points, not a chainable primitive. `cycles_closed()` needed **no changes** — it was already role-agnostic, so portals close cycles for free, same as rails did.
- **Labeling spec** (`docs/labeling-spec.md` §3, renamed from "the open portal question" to "RESOLVED: the portal role"): documents the role, the termination rule, and — as **documentation-only, enforcement is a later-phase concern**, exactly as requested — that portals carry no image evidence (render-and-compare / evidence-voting in Phase 6 must exempt them from ink-based scoring) and that extractors may only emit a portal from an explicit room-closure rule, never as a fallback for weak wall evidence. §1's wall definition updated to carve out the zero-thickness exception explicitly rather than leave it implicit.

**Tests extended** (`tests/schema/test_validate.py`):
- New `triangle_plan_with_portal()` — a minimal, independent 3-wall fixture (2 real walls + 1 portal) so portal-cycle testing doesn't require restructuring the shared rectangle fixture. `test_portal_role_closes_cycle_like_any_wall` confirms it validates clean, same pattern as the rail test.
- `test_standalone_portal_touching_real_geometry_passes` — a portal appended to the base fixture with endpoints exactly matching an existing real wall's endpoints, not referenced by any junction or room, still passes (confirms the termination check is about the portal's own geometry, not its graph membership).
- Two new mutation classes in the hypothesis-fuzzed `MUTATIONS` table: `zero_thickness_non_portal` (sets thickness to 0 on one of the base fixture's 4 real walls — must fail) and `float_portal` (appends a correctly-terminated portal, then detaches one end — must fail).
- `tests/schema/test_schema_consistency.py` extended with 3 new tests confirming the JSON Schema `if`/`then`/`else` and the pydantic `model_validator` **independently** reject a portal with nonzero thickness and a non-portal with zero thickness — not just `validate.py`'s runtime check. This matters because the three layers are maintained by hand and could silently drift.

**Result: the previously-flagged gap is RESOLVED**, not merely mitigated. A room whose boundary is partly a true open-plan transition (no wall drawn at all) can now close via a portal, exactly as the product schema already allowed for the 3D viewer.

## 1. Harness correctness (the core exit bar)

```
$ .venv\Scripts\python.exe -m eval.cli selftest
[selftest] GT-vs-GT perfect: PASS
[selftest] corrupted-GT correct penalties: PASS
  validity_errors: ['wall w1 opening o1: span [999550.0, 1000450.0] not strictly within wall span
    [0, 4527.6925690687085]', 'junction j2: wall w1 does not terminate at junction point within 0.001',
    'room r1: walls w1 and w2 do not share an endpoint within 0.001 — cycle does not close']
  wall f1@1%: 0.750
  opening f1: 0.000
EXIT: 0
```

**MEASURED, PASS — unchanged by either amendment.** GT scored against itself (now including zones, still no portal in this particular fixture) is perfect on every metric; the corrupted copy fails with the same three reasons as every prior run.

## 2. Validator mutation-class coverage

```
$ .venv\Scripts\python.exe -m pytest tests/schema/test_validate.py -v --hypothesis-show-statistics

tests/schema/test_validate.py::test_valid_fixture_passes PASSED                       [ 16%]
tests/schema/test_validate.py::test_rail_role_closes_cycle_like_any_wall PASSED       [ 33%]
tests/schema/test_validate.py::test_zones_within_room_face_pass PASSED                [ 50%]
tests/schema/test_validate.py::test_portal_role_closes_cycle_like_any_wall PASSED     [ 66%]
tests/schema/test_validate.py::test_standalone_portal_touching_real_geometry_passes PASSED [ 83%]
tests/schema/test_validate.py::test_each_mutation_class_is_caught PASSED              [100%]

Hypothesis Statistics — test_each_mutation_class_is_caught:
  - during generate phase (0.02 seconds): 24 passing examples, 0 failing examples, 0 invalid examples
  - Stopped because nothing left to do

6 passed in 0.16s
```

**MEASURED, PASS.** Now **eight** mutation classes (was six, was five originally): broken cycle, floating opening, dangling junction, negative thickness, unresolved ID, zone-outside-room, **zero-thickness-non-portal, floating-portal**. 24 hypothesis-generated examples this run (up from 19), all caught, zero failing/invalid.

Also re-run: `pytest tests/schema/test_schema_consistency.py -v` — **6/6 pass**, including the 3 new tests confirming the JSON Schema conditional and pydantic model validator each independently reject bad portal/thickness combinations (not shown again here in full; see amendment #2 above for what they check).

## 3. App build + legacy pipeline still runs

```
$ npm run build
▲ Next.js 16.2.9 (Turbopack)
✓ Compiled successfully in 5.3s
  Running TypeScript ...
  Finished TypeScript in 7.2s ...
✓ Generating static pages using 11 workers (12/12) in 467ms
  Finalizing page optimization ...
Route (app): / (static), /_not-found (static), /api/classify, /api/classify-rooms, /api/dev-gt,
  /api/dwg2dxf, /api/extract, /api/liveblocks-auth, /api/propose-raster, /api/share,
  /v/[id], /v/-/opengraph-image (all dynamic)
BUILD EXIT: 0
```

**MEASURED, PASS.** This amendment touched only `extraction/schema/`, `docs/labeling-spec.md`, and `tests/schema/` — no TypeScript/app files — regression check only, as expected unchanged.

```
$ npm run dev  (background)
$ curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
HTTP 200
$ curl -s -w "HTTP %{http_code}\n" "http://localhost:3000/api/dev-gt?name=test_1"
HTTP 200
{"metadata":{"coordinate_system":{"origin":"bottom_left","units":"ft","building_size":{"width":40.0, ...
```

**MEASURED, PASS.** Home page 200, no error state in the RSC payload; `/api/dev-gt` serves correctly from `legacy/data/floorplan-gt/`. Dev server process confirmed killed afterward this time (checked `netstat` before *and* after; the amendment-#1 pass had left one running on port 3000, caught and killed at the start of this session before re-verifying).

**Still not exercised:** an actual browser click-through of the Trace mode UI. Unchanged caveat from both prior versions of this report.

## 4. Corpus report

Unchanged by either amendment (no registry/GT-conversion files touched by amendment #1 or #2). `eval/registry/registry.csv`, 16 plans — **MEASURED**, same numbers as the original report:

| GT status | count |
|---|---|
| provisional_unaudited | 15 |
| none (source only) | 1 |
| **audited** | **0** |

Strata: R/poche/single=10, R/hatched/single=3, V/single_stroke/single=2, V/poche/multi_floor=1. Canaries=2. Split: dev=9, val=3, test=4.

## 5. 30–50 audited GT plans, inter-annotator agreement (†)

**Still NOT MEASURED. Still blocked on human annotation.** Unchanged by either amendment — no annotation happened, none attempted. `extraction/synth/svg_gt.py` remains v1-scoped to walls/openings/junctions; it authors neither `zones` nor `portal` walls yet (no annotator has needed either). Natural extensions for both are already specified in `docs/labeling-spec.md` (§3 for portal, §4 for zones) if/when needed.

**Next step for Dan:** unchanged.

## 6. Schema + eval interfaces

**The portal gap is RESOLVED. No other known blocker to freeze remains from this session's work.**

`extraction/schema/`, `models.py`, `validate.py`, and `eval/metrics/` + `eval/cli.py` are implemented and tested. Test count progression: 23/23 (original) → 24/24 (amendment #1, zones) → **29/29 (amendment #2, portal)**. Four additions have now been made to Appendix A's schema across three passes, every one flagged for Dan rather than silently shipped:

1. `role: "rail"` — mirrors the product's `Wall.kind`.
2. `evidence_source: "ground_truth"` — GT plans self-describing provenance.
3. `room.zones` — optional functional sub-areas within an already-closed room.
4. `role: "portal"` — a zero-thickness virtual boundary, terminating on real geometry, that closes a room face with no physical wall. **This one specifically resolves the item this session's request called out as the freeze blocker.**

All four are additive/non-breaking for existing plans (a plan with no rail/portal walls and no zones is still valid) — nothing already emitted by `extraction/synth/convert_legacy_gt.py` or `svg_gt.py` needed migration, and neither converter emits portals, so the 16-plan corpus is unaffected.

**What this session is NOT doing on Dan's behalf:** declaring the schema formally FROZEN. Per CLAUDE.md rule 3, gates are Dan's to approve. What this report states is narrower and factual: the specific open question named in the original gate report (the portal/absent-boundary gap) is resolved and tested at all three enforcement layers (JSON Schema, pydantic, runtime validator), and no other schema gap is currently known or flagged. Freeze itself is Dan's call at merge.

## Summary

| Exit bar | Status |
|---|---|
| GT-vs-GT perfect / corrupted-GT correct penalties | ✅ MEASURED, PASS (re-verified after both amendments) |
| Validator catches all mutation classes | ✅ MEASURED, PASS — now 8 classes (was 6, was 5) |
| App builds; legacy pipeline runs from `legacy/` | ✅ MEASURED, PASS (re-verified; no manual browser click-through) |
| Corpus report: strata, inter-annotator agreement, ratified bars | ⚠️ Strata MEASURED (16 plans, unchanged); inter-annotator agreement NOT MEASURED |
| Schema + eval interfaces — known blockers resolved | ✅ Portal gap RESOLVED and tested at all 3 layers; no other known blocker; **freeze itself remains Dan's call** |

**29/29 automated tests pass** (was 24/24 after amendment #1, 23/23 originally). `npm run build` passes. Legacy pipeline verified running from `legacy/`.

**Stopping here for review, as requested — not merging, not starting Phase 1.** What needs Dan's call now: (1) ratify the freeze (the named blocker is resolved; nothing else is currently flagged), (2) whether the `zones` and `portal` additions as scoped are sufficient for Phase 1 to start, or whether SVG-authoring support for either should land first, (3) real annotation progress toward the 30–50 plan bar, or an explicit call that Phase 1 baselines can run against the 15 provisional plans in the meantime with results caveated accordingly.
