"""Diagnosis-only (2026-07-22, doorway-notch follow-up #1): the 27-plan
sample's 26 confirmed e_opening_doorway_notch edges were ALL triggered by
`door`. The proposed suppression discriminator is meant to cover door,
window, and front_door alike (analyze_edge's opening_coverage already
checks all three) but has only ever been visually/numerically confirmed
on doors. This scans a wider slice of the 17K population (not just the
first 1500 plans the original sample came from) looking for at least one
window-triggered and one front_door-triggered notch instance, to check
whether the same signature (perpendicularity, len<=1.2x wall_depth,
endpoint-to-opening-bbox proximity) holds for those opening types too, or
whether window sills / front-door thresholds behave differently.

Reuses analyze_plan/classify/analyze_edge from
classify_room_boundary_no_wall_match.py and discriminator_signals/
plot_room_notch_overlay from diagnose_doorway_notch.py UNCHANGED. No new
classification logic — this is purely a wider scan for exemplars plus
confirmation, same discipline as the original 3-instance spot-check before
the full-11 population classification. Read-only, no changes to rooms.py/
skeleton.py/check_plan/any measurement script.
"""
from __future__ import annotations

import pickle
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.classify_room_boundary_no_wall_match import (
    PKL_PATH,
    analyze_plan,
    classify,
)
from extraction.synth.qa.diagnose_doorway_notch import (
    REPORTS_DIR,
    discriminator_signals,
    plot_room_notch_overlay,
)
from extraction.synth.qa.measure_clean_at_source import check_plan

SCAN_LIMIT = 17000
TARGET_PER_TYPE = 2


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    found = {"window": [], "front_door": []}
    n_scanned = 0
    n_flagged = 0
    t0 = time.time()

    for raw_plan in plans[:SCAN_LIMIT]:
        n_scanned += 1
        result = check_plan(raw_plan)
        if not any(f.startswith("room_boundary_no_wall_match:") for f in result["flags"]):
            continue
        n_flagged += 1

        edges = analyze_plan(raw_plan)
        for e in edges:
            if e["ink_ratio_narrow"] >= 0.5:
                continue
            cat = classify(e)
            if cat != "e_opening_doorway_notch":
                continue
            ot = e["opening_hit"]
            if ot in found and len(found[ot]) < TARGET_PER_TYPE:
                e["category"] = cat
                found[ot].append((raw_plan, e))

        if n_scanned % 1000 == 0:
            elapsed = time.time() - t0
            print(f"  ...{n_scanned}/{SCAN_LIMIT} scanned ({n_flagged} flagged), "
                  f"window={len(found['window'])} front_door={len(found['front_door'])} ({elapsed:.0f}s)",
                  file=sys.stderr)

        if len(found["window"]) >= TARGET_PER_TYPE and len(found["front_door"]) >= TARGET_PER_TYPE:
            print(f"Target met early at plan {n_scanned}/{SCAN_LIMIT}", file=sys.stderr)
            break

    elapsed = time.time() - t0
    print(f"\nScanned {n_scanned}/{len(plans)} plans ({n_flagged} flagged), {elapsed:.0f}s")
    for ot, instances in found.items():
        print(f"\n{'=' * 70}\n{ot}-triggered e_opening_doorway_notch instances found: {len(instances)}")
        if not instances:
            print(f"  NONE FOUND in {n_scanned} plans scanned — {ot} may simply not "
                  f"co-occur with a CLEAN_REQUIRED_ROOM_TYPES edge at this coverage, "
                  f"or is rare enough to need a wider scan than done here.")
        for raw_plan, e in instances:
            room_type, inst_idx = e["room"].rsplit("_", 1)
            sig = discriminator_signals(raw_plan, room_type, int(inst_idx), e["edge_index"])
            print(f"  plan={e['resplan_id']} room={e['room']} edge={e['edge_index']} "
                  f"len={e['edge_len']} opening_cov={e['opening_coverage']} "
                  f"cos_to_neighbor={sig['cos_to_nearest_wall_backed_neighbor']} "
                  f"len/wall_depth={sig['len_over_wall_depth']} "
                  f"endpoint_to_opening_bbox_dist={sig['endpoint_to_opening_bbox_dist']}")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    for ot, instances in found.items():
        for raw_plan, e in instances[:1]:  # one overlay per type is enough
            room_type, inst_idx = e["room"].rsplit("_", 1)
            all_room_edges = [x for x in analyze_plan(raw_plan) if x["room"] == e["room"]]
            for x in all_room_edges:
                if x["ink_ratio_narrow"] < 0.5:
                    x["category"] = classify(x)
            out_path = REPORTS_DIR / f"notch_diag_{ot}_{e['resplan_id']}_{e['room']}.png"
            plot_room_notch_overlay(raw_plan, room_type, int(inst_idx),
                                     [x for x in all_room_edges if x["ink_ratio_narrow"] < 0.5],
                                     out_path)
            print(f"\nwrote {out_path}")


if __name__ == "__main__":
    main()
