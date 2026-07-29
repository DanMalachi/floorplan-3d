"""Population-scale defect co-occurrence measurement (2026-07-29), per
Dan's instruction after lever #1's conditional-rate gain was over-predicted
by ~5x (52.5%->70-80% predicted, 55.6% population actual): the diagnose
step's own "34.4% of broken plans would clear" estimate almost certainly
counted plans where the notch was A defect among several, not the ONLY
defect on that plan — fixing one of three still leaves the plan broken.
This has to be quantified, at full population scale, before any future
lever's payoff is pre-registered again, or every future estimate will
over-promise the same way.

Scope: the population this gate is actually judged on — plans that ARE
clean_at_source (so they're reachable in principle) but are NOT
converter_clean (so something in the converter's own required-room
assembly still breaks them). This is the exact same numerator/denominator
population the conditional clean rate itself uses
(population_conditional_clean_rate.py), so every number here ties directly
back to that metric, not a differently-scoped population.

Defect classes are the same taxonomy resplan_convert.py's own clean-bar
computation already uses (categorize()-equivalent, un-collapsed so each
broken required room TYPE is its own class, since bedroom/bathroom/storage
have already been separately characterized as mostly notch-driven and
stair as 0% notch-driven — collapsing them into one "room_assembly_failed"
bucket like diagnose_clean_rate.py does would erase exactly the signal
this measurement needs):

  room_broken:<type>       -- required room type (bedroom/bathroom/storage/
                               stair) has >=1 broken_room_cycle or
                               cycle_unrepairable flag
  opening_sibling_overlap   -- an opening flag containing "sibling_overlap"
  opening_projection_failed -- opening_attach_rate < 0.95
  ink_coverage_out_of_range -- ink_coverage_ratio outside [0.85, 1.15]
  other_validator_problem   -- validator_problems present, not already
                               explained by a room_broken class
  hard_failure              -- convert_plan raised / stats["ok"] is False

No new classification machinery beyond what resplan_convert.py's own stats
dict already reports — reused, not re-derived, per this phase's standing
discipline.

CLI: python -m extraction.synth.qa.measure_defect_cooccurrence [limit] [workers]
"""
from __future__ import annotations

import itertools
import pickle
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.measure_clean_at_source import check_plan
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES, convert_plan

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"

_ROOM_FAILURE_PREFIXES = ("room:cycle_unrepairable:", "room:broken_room_cycle:")


def _defect_classes(stats: dict) -> set[str]:
    if not stats.get("ok"):
        return {"hard_failure"}

    classes = set()
    flags = stats.get("flags", [])
    room_types_hit = {
        f.rsplit(":", 1)[1].rsplit("_", 1)[0]
        for f in flags
        if f.startswith(_ROOM_FAILURE_PREFIXES)
        and f.rsplit(":", 1)[1].rsplit("_", 1)[0] in CLEAN_REQUIRED_ROOM_TYPES
    }
    for rt in room_types_hit:
        classes.add(f"room_broken:{rt}")

    if any("sibling_overlap" in f for f in flags):
        classes.add("opening_sibling_overlap")
    if stats.get("opening_attach_rate", 1.0) < 0.95:
        classes.add("opening_projection_failed")
    ratio = stats.get("ink_coverage_ratio", 1.0)
    if not (0.85 <= ratio <= 1.15):
        classes.add("ink_coverage_out_of_range")
    vp = stats.get("validator_problems") or []
    if vp and not room_types_hit:
        classes.add("other_validator_problem")
    return classes


def _score_one(raw_plan: dict):
    src_clean = check_plan(raw_plan)["clean_at_source"]
    _, stats = convert_plan(raw_plan)
    conv_clean = bool(stats.get("clean"))
    if not src_clean or conv_clean:
        return None  # out of scope: either unreachable at source, or already clean
    classes = _defect_classes(stats)
    return raw_plan.get("id"), frozenset(classes)


def main(limit: int | None = None, workers: int = 8) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    if limit:
        plans = plans[:limit]
    n_total = len(plans)

    t0 = time.time()
    broken = []  # (id, frozenset(classes))
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, result in enumerate(ex.map(_score_one, plans, chunksize=32)):
            if result is not None:
                broken.append(result)
            if (i + 1) % 2000 == 0:
                print(f"  ...{i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    elapsed = time.time() - t0

    n_broken = len(broken)
    print(f"\n{'=' * 70}")
    print(f"N={n_total} plans scanned ({elapsed:.0f}s, {workers} workers)")
    print(f"Scope: clean_at_source AND NOT converter_clean -- {n_broken}/{n_total} "
          f"({100 * n_broken / n_total:.1f}% of ALL plans; this is the same population "
          f"the conditional clean rate's numerator gap describes)")

    if n_broken == 0:
        print("No broken-in-scope plans found.")
        return

    # 1. distribution of distinct-class COUNT per broken plan
    print(f"\n{'=' * 70}\n1. Distinct defect-class count per broken plan")
    count_hist = Counter(len(classes) for _, classes in broken)
    for k in sorted(count_hist):
        print(f"  {k} class{'es' if k != 1 else ''}: {count_hist[k]} ({100 * count_hist[k] / n_broken:.1f}%)")
    multi_defect = sum(v for k, v in count_hist.items() if k >= 2)
    print(f"  >=2 classes (a fix to only ONE class cannot clear these): "
          f"{multi_defect}/{n_broken} ({100 * multi_defect / n_broken:.1f}%)")

    # 2. per-class: total appearances, and "isolated" count (this class AND
    #    no other) -- the number that actually matters for sizing a lever
    #    targeting that one class.
    all_classes = sorted({c for _, classes in broken for c in classes})
    print(f"\n{'=' * 70}\n2. Per-class appearance vs. ISOLATED (ONLY this class) counts")
    print(f"{'class':30s} {'appears_in':>12s} {'isolated':>10s} {'isolated_%_of_appears':>24s}")
    isolated_counts = {}
    appearance_counts = {}
    for c in all_classes:
        appears = [classes for _, classes in broken if c in classes]
        isolated = [classes for classes in appears if classes == {c}]
        appearance_counts[c] = len(appears)
        isolated_counts[c] = len(isolated)
        pct_isolated = 100 * len(isolated) / len(appears) if appears else 0.0
        print(f"{c:30s} {len(appears):12d} {len(isolated):10d} {pct_isolated:23.1f}%")

    # 3. pairwise co-occurrence matrix (counts of broken plans containing
    #    BOTH class A and class B, A != B)
    print(f"\n{'=' * 70}\n3. Pairwise co-occurrence matrix (count of broken plans with BOTH)")
    pair_counts = Counter()
    for _, classes in broken:
        for a, b in itertools.combinations(sorted(classes), 2):
            pair_counts[(a, b)] += 1
    header = "".join(f"{c[:12]:>14s}" for c in all_classes)
    print(f"{'':30s}{header}")
    for a in all_classes:
        row = []
        for b in all_classes:
            if a == b:
                row.append(f"{appearance_counts[a]:>14d}")
            else:
                key = (a, b) if (a, b) in pair_counts else (b, a)
                row.append(f"{pair_counts.get(key, 0):>14d}")
        print(f"{a:30s}{''.join(row)}")

    # 4. explicit stair sizing, per Dan's instruction: size the lever as
    #    "plans whose ONLY defect is stair-related", never "plans containing
    #    a stair defect".
    stair_key = "room_broken:stair"
    if stair_key in appearance_counts:
        print(f"\n{'=' * 70}\n4. Stair lever sizing (pre-registration for a future session, NOT built this session)")
        print(f"  plans containing a stair defect (any co-occurrence): "
              f"{appearance_counts[stair_key]}/{n_broken} ({100 * appearance_counts[stair_key] / n_broken:.1f}%)")
        print(f"  plans whose ONLY defect is stair-related (the correct sizing): "
              f"{isolated_counts[stair_key]}/{n_broken} ({100 * isolated_counts[stair_key] / n_broken:.1f}%)")
        print(f"  -- a stair-only fix can AT MOST clear the isolated count above, "
              f"not the 'containing' count, per this session's root-cause finding.")

    print(f"\n{'=' * 70}\nAll broken plan ids + their class sets (for spot-checking):")
    for pid, classes in broken[:30]:
        print(f"  {pid}: {sorted(classes)}")
    if len(broken) > 30:
        print(f"  ... ({len(broken) - 30} more)")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else None
    wk = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else 8
    main(lim, wk)
