"""Categorized per-plan diagnosis of why plans aren't "clean" — run on a
sample, prints plan-level failure category counts (not raw flag counts)."""
from __future__ import annotations

import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.resplan_convert import convert_plan

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"


def categorize(stats: dict) -> list[str]:
    """A plan can land in multiple categories (e.g. both an opening problem
    and a room problem) — each contributes independently so the counts
    show every contributing cause, not just the first one hit."""
    if not stats.get("ok"):
        reason = stats.get("reason", "unknown")
        if reason in ("empty_wall_geometry", "no_wall_segments"):
            return ["wall_conversion_failed"]
        if reason.startswith("exception"):
            return ["source_geometry_invalid"]
        return [f"other_hard_failure:{reason}"]

    cats = []
    flags = stats.get("flags", [])
    if any(f.startswith("room:cycle_unrepairable:") for f in flags):
        # split further: which required room types were unrepairable
        required_hit = {
            f.rsplit(":", 1)[1].rsplit("_", 1)[0]
            for f in flags
            if f.startswith("room:cycle_unrepairable:")
            and f.rsplit(":", 1)[1].rsplit("_", 1)[0] in {"bathroom", "bedroom", "storage", "stair"}
        }
        if required_hit:
            cats.append("cycle_unrepairable_required")
        else:
            cats.append("cycle_unrepairable_open_plan_only")
    if stats.get("opening_attach_rate", 1.0) < 0.95:
        cats.append("opening_projection_failed")
    if any("sibling_overlap" in f for f in flags):
        cats.append("opening_sibling_overlap")
    ratio = stats.get("ink_coverage_ratio", 1.0)
    if not (0.85 <= ratio <= 1.15):
        cats.append("ink_coverage_out_of_range")
    vp = stats.get("validator_problems") or []
    if vp and not any(c.startswith("cycle_unrepairable") for c in cats):
        # validator problems not already explained by an unrepairable cycle
        cats.append("other_validator_problem")
    if not cats and not stats.get("clean"):
        cats.append("uncategorized")
    return cats


def main(n: int = 300):
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    plan_level = Counter()
    n_clean = 0
    n_total = 0
    for p in plans[:n]:
        _, stats = convert_plan(p)
        n_total += 1
        if stats.get("clean"):
            n_clean += 1
            continue
        for cat in categorize(stats):
            plan_level[cat] += 1

    print(f"N={n_total}  clean={n_clean} ({100*n_clean/n_total:.1f}%)  not_clean={n_total-n_clean}")
    print("\nPlan-level failure categories (a plan may count in >1 category):")
    for cat, count in plan_level.most_common():
        print(f"  {cat}: {count} ({100*count/n_total:.1f}% of all plans)")


if __name__ == "__main__":
    import sys as _sys

    n = int(_sys.argv[1]) if len(_sys.argv) > 1 else 300
    main(n)
