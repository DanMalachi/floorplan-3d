"""Categorized per-plan diagnosis of why plans aren't "clean" — run on a
sample, prints plan-level failure category counts (not raw flag counts)."""
from __future__ import annotations

import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES, convert_plan

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"

# Both prefixes count against resplan_convert.py's actual clean bar (see
# its `broken_required` computation) — a room can fail assembly two ways:
# broken_room_cycle (per-edge spatial coverage found no usable wall match
# at all) or cycle_unrepairable (matches were found, but the sequence
# failed connectivity/area-match). This function used to check only the
# second prefix, which silently misclassified every broken_room_cycle-only
# plan as "uncategorized" (or "other_validator_problem", if it also had a
# validator problem) instead of a room-assembly failure. Verified on a
# 15-plan sample of the old "uncategorized" bucket: 15/15 had a
# broken_room_cycle flag on a required room type and nothing else
# uncaught — a single, uniform signature, not a mix of causes. Reconciled
# against the full n=300 sample after fixing this: the bucket renamed
# below (was cycle_unrepairable_required/open_plan_only) grows from 93 to
# 156 (52.0% of all plans), "uncategorized" drops from 46 to 0, and
# "other_validator_problem" drops from 24 to 1 (23 were masked room-
# assembly failures: 15 required, 8 open-plan-only).
_ROOM_ASSEMBLY_FAILURE_PREFIXES = ("room:cycle_unrepairable:", "room:broken_room_cycle:")


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
    if any(f.startswith(_ROOM_ASSEMBLY_FAILURE_PREFIXES) for f in flags):
        # split further: which required room types failed assembly
        required_hit = {
            f.rsplit(":", 1)[1].rsplit("_", 1)[0]
            for f in flags
            if f.startswith(_ROOM_ASSEMBLY_FAILURE_PREFIXES)
            and f.rsplit(":", 1)[1].rsplit("_", 1)[0] in CLEAN_REQUIRED_ROOM_TYPES
        }
        if required_hit:
            cats.append("room_assembly_failed_required")
        else:
            cats.append("room_assembly_failed_open_plan_only")
    if stats.get("opening_attach_rate", 1.0) < 0.95:
        cats.append("opening_projection_failed")
    if any("sibling_overlap" in f for f in flags):
        cats.append("opening_sibling_overlap")
    ratio = stats.get("ink_coverage_ratio", 1.0)
    if not (0.85 <= ratio <= 1.15):
        cats.append("ink_coverage_out_of_range")
    vp = stats.get("validator_problems") or []
    if vp and not any(c.startswith("room_assembly_failed") for c in cats):
        # validator problems not already explained by a room-assembly failure
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
