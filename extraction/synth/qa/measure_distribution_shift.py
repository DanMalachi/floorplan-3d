"""Bias check for lever #1 (2026-07-29), per Dan's explicit reframe: the
success metric for doorway-notch handling is NOT the conditional clean
rate in isolation -- this phase already clears its 20K-image volume target
at 52.5%. The real risk is that failures are DOOR-CORRELATED by
construction (a doorway-notch is literally the door threshold), so the
converter-clean subset used to mint the training set could systematically
under-represent doors relative to the full 17K source, quietly poisoning
Phase 3b's door detector.

Measures, for both the FULL population and the converter-CLEAN subset:
  - doors-per-plan (raw source door polygon count, plan.get("door"))
  - rooms-per-plan (raw source room instance count, across ROOM_LABEL_MAP)
  - room-type mix (share of each room type among all room instances)

Run this script UNCHANGED in two different checkouts (before/after this
build's rooms.py/resplan_convert.py changes) to see whether the doors-per-
plan gap between clean-subset and full-population narrows. Pre-registered
prediction (stated before running): the gap narrows. If the conditional
rate rises but this gap does NOT narrow, that is the headline finding for
the gate report, not the rate.

CLI: python -m extraction.synth.qa.measure_distribution_shift [limit] [workers]
"""
from __future__ import annotations

import pickle
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.resplan_convert import ROOM_LABEL_MAP, convert_plan
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"


def _score_one(raw_plan: dict) -> dict:
    p = normalize_keys(dict(raw_plan))
    n_doors = len(get_geometries(p.get("door")))
    room_types = []
    for rt in ROOM_LABEL_MAP:
        room_types.extend([rt] * len(get_geometries(p.get(rt))))
    _, stats = convert_plan(raw_plan)
    return dict(
        id=raw_plan.get("id"),
        n_doors=n_doors,
        n_rooms=len(room_types),
        room_types=room_types,
        converter_clean=bool(stats.get("clean")),
    )


def _summarize(records: list[dict], label: str) -> None:
    n = len(records)
    total_doors = sum(r["n_doors"] for r in records)
    total_rooms = sum(r["n_rooms"] for r in records)
    mix = Counter()
    for r in records:
        mix.update(r["room_types"])
    print(f"  {label}: n={n}")
    print(f"    doors-per-plan:  mean={total_doors / n:.3f}" if n else "    doors-per-plan: n/a")
    print(f"    rooms-per-plan:  mean={total_rooms / n:.3f}" if n else "    rooms-per-plan: n/a")
    if total_rooms:
        print("    room-type mix (share of room instances):")
        for rt in sorted(ROOM_LABEL_MAP):
            share = 100 * mix.get(rt, 0) / total_rooms
            print(f"      {rt:10s} {mix.get(rt, 0):6d}  ({share:5.1f}%)")


def main(limit: int | None = None, workers: int = 8) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    if limit:
        plans = plans[:limit]
    n_total = len(plans)

    t0 = time.time()
    records = []
    if workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            for i, rec in enumerate(ex.map(_score_one, plans, chunksize=32)):
                records.append(rec)
                if (i + 1) % 2000 == 0:
                    print(f"  ...{i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    else:
        for i, p in enumerate(plans):
            records.append(_score_one(p))
            if (i + 1) % 2000 == 0:
                print(f"  ...{i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)

    elapsed = time.time() - t0
    clean_records = [r for r in records if r["converter_clean"]]
    n_clean = len(clean_records)

    print(f"\n{'=' * 70}")
    print(f"N={n_total} plans scanned ({elapsed:.0f}s, {workers} workers)")
    print(f"converter_clean: {n_clean}/{n_total} ({100 * n_clean / n_total:.1f}%)")
    print()
    _summarize(records, "FULL population")
    print()
    _summarize(clean_records, "CONVERTER-CLEAN subset")

    full_doors_mean = sum(r["n_doors"] for r in records) / n_total if n_total else 0.0
    clean_doors_mean = sum(r["n_doors"] for r in clean_records) / n_clean if n_clean else 0.0
    gap = full_doors_mean - clean_doors_mean
    gap_pct = 100 * gap / full_doors_mean if full_doors_mean else 0.0
    print(f"\n{'=' * 70}")
    print(f"doors-per-plan gap (full - clean): {gap:+.3f} ({gap_pct:+.1f}% relative to full-population mean)")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    wk = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    main(lim, wk)
