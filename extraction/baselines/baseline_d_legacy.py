"""Baseline (d) — the legacy pipeline, run as-is (docs/extraction-plan.md
Phase 1: "the number the rebuild must beat"). Two variants:

  d1 — free heuristics only (legacy's `keptByHeuristic`/`guess` verdict,
       no API spend). Runs unconditionally.
  d2 — the full pipeline including the paid VLM classification step, which
       is what legacy actually ships in production. Cost-gated per Dan's
       explicit constraint: print the estimated call count and rough cost
       before spending anything; stop for review if the estimate exceeds $15.

Dan's constraint: legacy stays COMPLETELY unmodified — no new files inside
`legacy/`. This script only shells out to legacy's own existing, unmodified
CLIs (`scripts/eval/gen-candidates.ts`, `scripts/eval/classify.ts`, run with
cwd=legacy/ so their internal relative paths resolve) and does the
candidate-class -> schema-v1-wall conversion itself, entirely outside
legacy/. That conversion mirrors the one-line selection rule
`heuristicPredictions`/`vlmPredictions` already use in
legacy/scripts/eval/score-core.ts (keptByHeuristic ? guess : reject) — not
an import of legacy code, just the same trivial, already-public rule
re-expressed on this side of the boundary.

Scope note: like baselines (a) and (c), this converts WALL candidates only.
Door/window candidates are legacy's own well-documented weak point and
attaching them correctly to a host wall (center_offset, width) is Phase-5
solver territory that doesn't exist yet — scoring them here would require
inventing attachment logic inconsistent with every other Phase-1 baseline.
Openings are deferred, honestly, same as (a) and (c).

Usage: python -m extraction.baselines.baseline_d_legacy [--run-d2]
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

from eval.registry.registry import load_registry
from extraction.baselines.common import build_envelope, utc_now_iso, write_prediction

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY_DIR = REPO_ROOT / "legacy"
CORPUS_MANIFEST = LEGACY_DIR / "eval" / "corpus.jsonl"
RAW_OUT_ROOT = REPO_ROOT / "data" / "baselines_out" / "legacy_raw"
D1_OUT_DIR = REPO_ROOT / "data" / "baselines_out" / "d1_legacy_free"
D2_OUT_DIR = REPO_ROOT / "data" / "baselines_out" / "d2_legacy_vlm"

DEFAULT_WALL_THICKNESS_PX = 8.0  # legacy candidates carry no thickness; flagged default
COST_GATE_USD = 15.0
# Legacy's own classify.ts defaults to Opus 4.8 (DEFAULT_VLM_MODEL in
# vlmClassify.ts) — d2 measures the pipeline AS SHIPPED, so its model choice
# is not overridden here.
OPUS_4_8_INPUT_PER_MTOK = 5.0
OPUS_4_8_OUTPUT_PER_MTOK = 25.0


def _load_legacy_manifest() -> dict[str, dict]:
    entries = {}
    for line in CORPUS_MANIFEST.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        entries[Path(row["source"]).name] = row
    return entries


def _match_plans() -> list[tuple[str, Path, Path]]:
    """Returns (our_plan_id, absolute_source_path, absolute_out_dir) for
    every registry plan (with GT) that has a matching legacy corpus entry by
    source filename."""
    legacy_by_filename = _load_legacy_manifest()
    matched = []
    for entry in load_registry():
        if entry.gt_status == "none":
            continue
        filename = Path(entry.source_file).name
        legacy_row = legacy_by_filename.get(filename)
        if legacy_row is None:
            print(f"[baseline-d] no legacy corpus match for {entry.plan_id} ({filename}) — skipped", file=sys.stderr)
            continue
        source_abs = (LEGACY_DIR / "data" / legacy_row["source"]).resolve()
        out_dir = (RAW_OUT_ROOT / entry.plan_id).resolve()
        matched.append((entry.plan_id, source_abs, out_dir, entry))
    return matched


def _run_gen_candidates(source_abs: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    candidates_json = out_dir / "candidates.json"
    if candidates_json.exists():
        return  # reuse — gen-candidates is deterministic-ish and not free of latency
    subprocess.run(
        ["npx", "tsx", "scripts/eval/gen-candidates.ts", str(source_abs), "--out", str(out_dir)],
        cwd=LEGACY_DIR,
        check=True,
        shell=True,  # Windows: npx resolves through the shell
    )


def _run_classify(out_dir: Path, api_key: str) -> dict:
    labels_json = out_dir / "vlm-labels.json"
    if not labels_json.exists():
        env = {**os.environ, "ANTHROPIC_API_KEY": api_key}
        subprocess.run(
            ["npx", "tsx", "scripts/eval/classify.ts", str(out_dir)],
            cwd=LEGACY_DIR,
            check=True,
            shell=True,
            env=env,
        )
    return json.loads(labels_json.read_text(encoding="utf-8"))


def _candidates_to_walls(candidates: list[dict], class_by_id: dict[int, str], evidence: str) -> list[dict]:
    walls = []
    for c in candidates:
        if c["kind"] != "wall":
            continue
        cls = class_by_id.get(c["id"], "reject")
        if cls != "wall":
            continue
        x0, y0, x1, y1 = c["px"]
        walls.append({
            "id": f"w{c['id']}",
            "start": [float(x0), float(y0)],
            "end": [float(x1), float(y1)],
            "thickness": DEFAULT_WALL_THICKNESS_PX,
            "curvature": 0.0,
            "role": "unconfirmed",
            "openings": [],
            "confidence": 0.5,
            "evidence": [evidence],
            "flags": ["legacy_default_thickness"],
        })
    return walls


def _heuristic_class_by_id(candidates: list[dict]) -> dict[int, str]:
    """Mirrors score-core.ts's heuristicPredictions: kept-by-heuristic candidates
    are classed as their own guess, everything else is rejected."""
    return {c["id"]: (c["guess"] if c["keptByHeuristic"] else "reject") for c in candidates}


def _vlm_class_by_id(vlm_result: dict) -> dict[int, str]:
    """Mirrors score-core.ts's vlmPredictions."""
    return {label["id"]: label["label"] for label in vlm_result["labels"]}


def run_d1(matched: list) -> None:
    D1_OUT_DIR.mkdir(parents=True, exist_ok=True)
    for plan_id, source_abs, out_dir, entry in matched:
        _run_gen_candidates(source_abs, out_dir)
        candidates = json.loads((out_dir / "candidates.json").read_text(encoding="utf-8"))["candidates"]
        walls = _candidates_to_walls(candidates, _heuristic_class_by_id(candidates), "classical")
        plan = build_envelope(
            source_path=source_abs,
            encoding_class=entry.encoding_class,
            convention_class=entry.convention_class,
            scope_class=entry.scope_class,
            router_confidence=entry.router_confidence,
            pipeline_version="baseline-d1-legacy-heuristic-v1",
            walls=walls,
            source_px=(1, 1),  # legacy candidates are already in render px; real size not tracked here
        )
        errors = write_prediction(plan, D1_OUT_DIR / f"{plan_id}.json")
        print(f"[baseline-d1] {plan_id}: {'valid' if not errors else f'{len(errors)} errors'} — {len(walls)} walls")


def estimate_d2_cost(matched: list) -> float:
    """Rough pre-flight: one classify.ts call per plan (confirmed one-call-per-plan
    in vlmClassify.ts), image ~1568px overlay (~1600 img tokens) + candidate-list
    JSON text scaled by candidate count, output assumed modest (a label per
    candidate, not the 64k ceiling)."""
    total = 0.0
    for plan_id, source_abs, out_dir, _entry in matched:
        candidates_json = out_dir / "candidates.json"
        n_candidates = 50
        if candidates_json.exists():
            n_candidates = len(json.loads(candidates_json.read_text(encoding="utf-8"))["candidates"])
        input_tokens = 1600 + n_candidates * 15 + 800  # image + candidate list + system prompt
        output_tokens = 300 + n_candidates * 8
        cost = (input_tokens / 1e6) * OPUS_4_8_INPUT_PER_MTOK + (output_tokens / 1e6) * OPUS_4_8_OUTPUT_PER_MTOK
        total += cost
    return total


def run_d2(matched: list) -> None:
    api_key = dotenv_values(REPO_ROOT / ".env.local").get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not found in .env.local")

    estimate = estimate_d2_cost(matched)
    print(f"[baseline-d2] pre-flight estimate: {len(matched)} calls (one per plan, legacy classify.ts is one-call-per-plan), "
          f"~${estimate:.2f} at Opus 4.8 rates (legacy's own default model — not overridden, this measures the pipeline as shipped)")
    if estimate > COST_GATE_USD:
        print(f"[baseline-d2] STOPPING: estimate ${estimate:.2f} exceeds the ${COST_GATE_USD:.0f} gate — awaiting Dan's review.")
        return

    D2_OUT_DIR.mkdir(parents=True, exist_ok=True)
    run_date = utc_now_iso()
    for plan_id, source_abs, out_dir, entry in matched:
        _run_gen_candidates(source_abs, out_dir)
        candidates = json.loads((out_dir / "candidates.json").read_text(encoding="utf-8"))["candidates"]
        vlm_result = _run_classify(out_dir, api_key)
        walls = _candidates_to_walls(candidates, _vlm_class_by_id(vlm_result), "vlm")
        plan = build_envelope(
            source_path=source_abs,
            encoding_class=entry.encoding_class,
            convention_class=entry.convention_class,
            scope_class=entry.scope_class,
            router_confidence=entry.router_confidence,
            pipeline_version="baseline-d2-legacy-vlm-v1",
            walls=walls,
            source_px=(1, 1),
            diagnostics_extra={
                "model_id": vlm_result.get("model"),
                "run_date_utc": run_date,
                "single_nondeterministic_run": True,
            },
        )
        errors = write_prediction(plan, D2_OUT_DIR / f"{plan_id}.json")
        print(f"[baseline-d2] {plan_id}: {'valid' if not errors else f'{len(errors)} errors'} — {len(walls)} walls "
              f"(model={vlm_result.get('model')})")


def main() -> int:
    matched = _match_plans()
    print(f"[baseline-d] matched {len(matched)}/{len(load_registry())} registry plans to legacy corpus entries")
    run_d1(matched)
    if "--run-d2" in sys.argv:
        run_d2(matched)
    else:
        print("[baseline-d] d2 skipped (pass --run-d2 to run the paid legacy VLM path)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
