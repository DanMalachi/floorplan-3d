"""Corpus-wide Track V coverage sweep.

Reads eval/registry/registry.py read-only (frozen interface, not modified --
any encoding_class corrections found here are reported as a flag list, not
applied to registry.csv, which is P0-frozen). Writes
extraction/trackv/out/coverage_results.json.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.coverage import measure_coverage  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402

OUT_PATH = Path(__file__).parent / "out" / "coverage_results.json"


def main() -> None:
    entries = load_registry()
    per_plan = []
    for entry in entries:
        pdf_path = REPO_ROOT / entry.source_file
        dissection = dissect(pdf_path)
        coverage = measure_coverage(pdf_path, dissection)
        page0 = coverage[0]
        n_primitives = sum(len(p.primitives) for p in dissection)
        n_images = sum(p.n_images for p in dissection)
        registry_says_vector = entry.encoding_class == "V"
        test_says_vector = page0.routes_to == "track_v"
        per_plan.append(
            {
                "plan_id": entry.plan_id,
                "registry_encoding_class": entry.encoding_class,
                "convention_class": entry.convention_class,
                "gt_status": entry.gt_status,
                "coverage": round(page0.coverage, 4),
                "text_ink_fraction": round(page0.text_ink_fraction, 4),
                "n_primitives": n_primitives,
                "n_images": n_images,
                "routes_to": page0.routes_to,
                "flags": page0.flags,
                "registry_disagreement": registry_says_vector != test_says_vector,
            }
        )

    split = Counter(p["routes_to"] for p in per_plan)
    by_encoding: dict[str, Counter] = defaultdict(Counter)
    by_convention: dict[str, Counter] = defaultdict(Counter)
    for p in per_plan:
        by_encoding[p["registry_encoding_class"]][p["routes_to"]] += 1
        by_convention[p["convention_class"]][p["routes_to"]] += 1

    report = {
        "n_plans": len(per_plan),
        "overall_split": dict(split),
        "by_registry_encoding_class": {k: dict(v) for k, v in by_encoding.items()},
        "by_convention_class": {k: dict(v) for k, v in by_convention.items()},
        "registry_disagreements": [p["plan_id"] for p in per_plan if p["registry_disagreement"]],
        "plans": per_plan,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
