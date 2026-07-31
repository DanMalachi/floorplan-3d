# Legacy Paths

Everything listed here belongs to the old floorplan-to-JSON extraction
pipeline (2D trace/detection/OCR/VLM-classification, and its benchmark
harness). Per `CLAUDE.md` rule 2, once moved into `legacy/` this code is
read-only reference material: never imported by new pipeline code, never
extended, never "fixed." It stays wired into the running app — gated by
`legacyExtractionEnabled` (`src/lib/featureFlags.ts`) — as the production
extraction path until the Phase 6 gate passes.

**Exception:** `trace2d/` itself is now split into two tiers (2026-07-31) —
see the `trace2d/` entry below. Its manual-tracing UI tier is active,
editable product surface, not quarantined; only its auto-extraction tier
still carries the blanket rule above.

Compiled from a full-repo Explore pass on 2026-07-19, cross-checked against
`docs/PROTECTED_PATHS.md` for overlap (none found).

## Moved into `legacy/`, preserving subpaths

| Original path | New path |
|---|---|
| `src/trace2d/**` (incl. `dxf/`, `vector/`) | `legacy/src/trace2d/**` |
| `src/eyes/observations.ts` | `legacy/src/eyes/observations.ts` |
| `src/lib/rooms/vlmClassify.ts` | `legacy/src/lib/rooms/vlmClassify.ts` |
| `src/lib/loops.ts` | `legacy/src/lib/loops.ts` |
| `scripts/ocr_raster.py` | `legacy/scripts/ocr_raster.py` |
| `scripts/propose_raster.py` | `legacy/scripts/propose_raster.py` |
| `scripts/extract_pdf.py` | `legacy/scripts/extract_pdf.py` |
| `scripts/eval/*.ts` (`ab.ts`, `bench.ts`, `classify.ts`, `coverage.ts`, `gen-candidates.ts`, `register-plan.ts`, `score-core.ts`, `score-vector.ts`, `score.ts`) | `legacy/scripts/eval/*.ts` |
| `scripts/eval/ocr_recovery.py`, `overlay.py`, `signal-table.py` | `legacy/scripts/eval/*.py` |
| `eval/corpus.jsonl`, `eval/bench-history.jsonl` | `legacy/eval/corpus.jsonl`, `legacy/eval/bench-history.jsonl` |
| `floorplan-gt/**` | `legacy/data/floorplan-gt/**` |
| `floorplan_for_training/**` | `legacy/data/floorplan_for_training/**` |

Why each is legacy, briefly:
- `trace2d/` — split into two tiers, no longer one undifferentiated block:
  - **Quarantined, read-only, unreachable** (the auto-extraction pipeline —
    status unchanged): `extractWalls.ts`, `detectOpenings.ts`,
    `candidates.ts`, `rasterCandidates.ts`, `proposeRaster.ts`,
    `buildOverlay.ts`.
  - **Active, editable, primary UI surface** (manual tracing — this is now
    the actual product, not legacy-pending-replacement): `TracePanel.tsx`,
    `TraceRail.tsx`, `TraceCanvas.tsx`.
  - Unclassified by this split (present in `trace2d/` but not named in
    either tier above — flagged here rather than guessed): `types.ts`,
    `snapWall.ts`, `traceToScene.ts`, `exportGroundTruth.ts`,
    `importDxf.ts`, `importPdf.ts`, `planImport.ts`, `roomCrops.ts`,
    `dxf/layerClass.ts`, `dxf/parseDxf.ts`, `vector/faces.ts`,
    `vector/interpret.ts`. Several of these are runtime dependencies of the
    now-active tier (e.g. `TraceCanvas.tsx` imports `types.ts` and
    `snapWall.ts`; `TraceRail.tsx` imports those plus `traceToScene.ts` and
    `exportGroundTruth.ts`), so treating all of `trace2d/` as quarantined
    no longer holds even for files outside the two named lists. Needs a
    follow-up pass to place each of these in one of the two tiers (or a
    third "shared by both" tier) rather than leaving them implicitly
    quarantined by omission.
- `eyes/observations.ts` — the OCR observation-channel contract consumed by `ocr_raster.py`.
- `lib/rooms/vlmClassify.ts` — candidate wall/door/window VLM classification; misplaced under `lib/rooms/` (which otherwise holds the ongoing, shared Building Knowledge Layer) but is drawing-convention classification, not room semantics.
- `lib/loops.ts` — planar-loop finding typed against trace-draft types; sole consumer is `trace2d/traceToScene.ts`.
- `scripts/ocr_raster.py`, `propose_raster.py`, `extract_pdf.py` — the Python halves of OCR, classical-CV raster proposal, and PDF vector extraction, invoked by the legacy API routes below.
- `scripts/eval/*` + `eval/corpus.jsonl` + `eval/bench-history.jsonl` — the old ad hoc benchmark harness (no `package.json` script entries, no CI — confirmed nothing else depends on its location).
- `floorplan-gt/`, `floorplan_for_training/` — old-format hand-traced GT and their source plans. The 10 source plans were also copied (not moved) into `data/corpus/incoming/` and their GT programmatically converted to schema-v1 as a provisional corpus seed — see `docs/labeling-spec.md` and the Phase 0 gate report.

## Left in place, but now legacy-flagged or legacy-adjacent

- `src/app/api/extract/route.ts`, `src/app/api/propose-raster/route.ts` — Next.js file-based routing requires these to stay under `src/app/api`; they now spawn `legacy/scripts/extract_pdf.py` / `legacy/scripts/propose_raster.py` by updated path.
- `src/app/api/classify/route.ts` — calls into `legacy/src/lib/rooms/vlmClassify.ts`.
- `src/app/api/dwg2dxf/route.ts` — feeds `legacy/src/trace2d/importDxf.ts`; DWG→DXF conversion itself is just a shellout to the external ODA converter, not pipeline logic.
- `src/app/api/dev-gt/route.ts` — dev-only, serves `legacy/data/floorplan-gt/*.json` for the `?gt=` escape hatch.
- `src/app/page.tsx` — statically imports `TracePanel` from `legacy/src/trace2d/TracePanel` (via the new `@legacy/*` alias) and renders it when `appMode === "trace"`; the render path is gated behind `legacyExtractionEnabled`.
- `src/store/useSceneStore.ts` — imports 7 extraction functions from `legacy/src/trace2d/*` (`buildPlanarGraph`, `extractWalls`, `detectOpenings`, `generateCandidates`, `rasterToCandidates`, `proposeRaster`, `buildOverlayImage`). The trace-draft type definitions that used to live here (`TracePoint`, `TraceSegment`, `ImportSegment`, `ImportArc`, `TraceOpening`) were relocated to `legacy/src/trace2d/types.ts` to make the dependency one-directional (store → legacy, no longer circular).
- `src/dev/gtFileToScene.ts` — the "EXPORT format" branch (raw trace-state `.gt.json`) calls `traceToScene` from `legacy/src/trace2d/traceToScene.ts`. The "AUTHORED format" branch and `src/dev/GtLab.tsx` itself have no legacy dependency and are **not** legacy — they're the shared dev/annotation tooling this phase builds on for the new SVG→schema-v1 converter.

## Explicitly not legacy (checked and kept as shared/app)

- `src/dev/GtLab.tsx`, `src/dev/gtToScene.ts` — decoupled GT-authoring tool (AUTHORED format only imports `@/schema/scene` + `@/schema/constants`).
- `src/lib/rooms/roomArea.ts`, `roomTaxonomy.ts`, `semanticGraph.ts`, `roomClassifier.ts`, `roomReason.ts` — the Building Knowledge Layer; operates on finished `Scene` objects, imported by protected `viewport3d/walkthrough/*`. `roomReason.ts`'s one-constant dependency on `vlmClassify.ts` (`DEFAULT_VLM_MODEL`) was cut by moving that constant into `src/lib/rooms/vlmConfig.ts`.
- `src/collab/**`, `src/furniture/**`, `src/ui/**`, `src/store/projectPersistence.ts` — no legacy imports found.
