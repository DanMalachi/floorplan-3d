# CLAUDE.md — Floorplan Extraction Rebuild

This repo contains (1) a working Next.js floorplan-to-3D app and (2) a ground-up rebuild of its extraction pipeline, executed phase by phase per `docs/extraction-plan.md`. Read that file's section for the CURRENT PHASE at the start of every session. Deep technical rationale lives in `docs/paper.md` — read only the sections the plan points you to.

## Hard rules (never violate)

1. **The 3D layer is protected.** The existing 3D viewer/renderer (React Three Fiber scene code and everything listed in `docs/PROTECTED_PATHS.md`) works well and must not be modified, refactored, "improved," or have its imports/types changed. Integration with the new pipeline happens ONLY through a new adapter module (new files) behind a feature flag. If a task appears to require editing a protected file, STOP and ask Dan.
2. **The legacy pipeline is quarantined.** The old extraction pipeline lives in `legacy/` (moved there in Phase 0). It is read-only reference material. Never import from it, never extend it, never "fix" it, and never let its patterns leak into the new code. If you find old-pipeline files outside `legacy/`, flag them — don't assume they're current.
3. **STOP gates are real.** Every phase ends with a gate report written to `reports/phase-N-gate.md` containing measured results vs. the phase's exit bars. Do not begin the next phase's work in the same session, even if asked implicitly. Dan approves gates.
4. **The eval harness is the loop.** From Phase 1 onward: run `python -m eval.cli run` before starting work (baseline) and after meaningful changes. Metric deltas, not vibes, justify decisions. A change that improves one stratum and regresses another must be reported, not silently kept.
5. **Frozen contracts.** After the Phase 0 gate, `extraction/schema/extraction_v1.schema.json` and the `eval/` public interfaces are frozen. Parallel branches must not modify them. A needed change = write `docs/schema-change-proposal.md` and stop for Dan's approval.
6. **New pipeline code is Python** (`extraction/`, `eval/`), a standalone service with a JSON contract. The Next.js app consumes its output via the adapter only. Don't mix app code and pipeline code.
7. **No placeholder metrics.** Never report estimated/assumed numbers in a gate report. If something wasn't measured, say NOT MEASURED.

## Session ritual

1. `git status` + confirm you're on the correct phase branch/worktree.
2. Read the current phase section in `docs/extraction-plan.md` + its listed paper sections.
3. Enter plan mode; present the plan; wait for approval; execute.
4. Run tests + eval harness; commit in small units with phase-prefixed messages (`P4: junction snapping`).
5. End of phase: write the gate report. Stop.

## Repo map (post-Phase-0)

- `app/` (or existing Next.js root) — the product. 3D layer protected.
- `extraction/` — new pipeline: `router/ trackv/ trackr/ solver/ openings/ verify/ scale/ schema/ adapter/`
- `eval/` — harness: `gt/ metrics/ reports/ registry/ cli.py`
- `data/` — `corpus/ gt/ resplan/ synthetic/` (gitignored except registry manifests)
- `legacy/` — quarantined old pipeline (read-only)
- `docs/` — `extraction-plan.md`, `paper.md`, `PROTECTED_PATHS.md`, `LEGACY_PATHS.md`
- `reports/` — gate reports, eval HTML reports

## Environment

- Python 3.11+, deps in `extraction/requirements.txt` (shapely, networkx, opencv-python-headless, scikit-image, pymupdf, ortools, numpy, onnxruntime; training extras separate).
- `ANTHROPIC_API_KEY` env var for pipeline VLM calls (this is API billing, separate from Claude Code usage). Prompts live in `extraction/prompts/` — versioned files, never inline strings.
- GPU work (Phase 3 training) runs on Modal; scripts in `extraction/training/`, launched by Dan.
