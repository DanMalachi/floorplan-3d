"""Converter-path defect-flip check (lever #1 build, 2026-07-29) --
committed as a real pytest test, not a one-off script run, so it can't rot
silently between sessions.

qa/gate_flip_check_audited.py already checks whether
measure_clean_at_source.py::check_plan's doorway-notch suppression ever
wrongly suppresses a human-audited GENUINE defect edge (source-cleanliness
path only). This test asks the same question one layer deeper, against the
CONVERTER path this build actually changed: for every audited edge in
audited_notch_ground_truth.json whose verdict is NOT a notch (i.e. a real,
human-confirmed defect -- predominantly not_notch_diagonal_wall_mismatch),
does that room still fail to assemble through
resplan_convert.py::convert_plan (rooms.py::assemble_rooms, with the new
stage-1 notch exemption + area-gate normalization live)? If any such room
now assembles cleanly, the discriminator is wrongly excusing a real defect
at the converter level -- exactly the risk this phase's standing
discipline exists to catch before trusting any rate built on top of it.

Requires the real 17K-plan ResPlan.pkl (gitignored, fetched via
data/resplan/fetch.py per docs/extraction-plan.md) -- unlike every other
test in this directory, this one is NOT self-contained synthetic fixtures,
because the whole point is checking real, human-audited plans against the
real pipeline. Skips (not fails) if the data isn't present locally, same
as qa/gate_flip_check_audited.py assumes it as a precondition to run.
"""
from __future__ import annotations

import json
import pickle
from pathlib import Path

import pytest

from extraction.synth.resplan_convert import convert_plan

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
GT_PATH = Path(__file__).resolve().parents[1] / "qa" / "audited_notch_ground_truth.json"

pytestmark = pytest.mark.skipif(
    not PKL_PATH.exists() or not GT_PATH.exists(),
    reason="requires local ResPlan.pkl (gitignored, see data/resplan/fetch.py) and audited_notch_ground_truth.json",
)


def _room_key_parts(room: str) -> tuple[str, int]:
    room_type, _, inst_str = room.rpartition("_")
    return room_type, int(inst_str)


def test_no_audited_genuine_defect_flips_to_converter_clean():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    plans_by_id = {p.get("id"): p for p in plans}

    gt = json.loads(GT_PATH.read_text())
    # Same convention as qa/gate_flip_check_audited.py:76 -- "notch" and
    # "notch_but_check_plan_recall_miss" both count as a true notch (safe
    # to excuse or already known-missed); everything else is a real,
    # human-confirmed defect that must never flip to assembled.
    genuine_defect_edges = [e for e in gt["audited_edges"] if not e["verdict"].startswith("notch")]
    assert genuine_defect_edges, "ground truth should contain at least one non-notch verdict to test against"

    checked = 0
    flipped: list[tuple] = []
    for e in genuine_defect_edges:
        raw_plan = plans_by_id.get(e["plan_id"])
        if raw_plan is None:
            continue  # plan_id not in this snapshot of ResPlan.pkl; nothing to check
        room_type, inst_idx = _room_key_parts(e["room"])

        result, stats = convert_plan(raw_plan)
        checked += 1
        if result is None:
            continue  # plan failed before room assembly ever ran -- trivially did not flip

        room_flags = set(stats.get("flags", []))
        still_broken = (
            f"room:broken_room_cycle:{room_type}_{inst_idx}" in room_flags
            or f"room:cycle_unrepairable:{room_type}_{inst_idx}" in room_flags
        )
        if not still_broken:
            flipped.append((e["plan_id"], e["room"], e["edge_index"], e["verdict"]))

    assert checked > 0, "no audited genuine-defect edges matched a plan in the local ResPlan.pkl"
    assert flipped == [], (
        f"{len(flipped)} audited genuine-defect edge(s) flipped to converter-assembled after the lever #1 "
        f"stage-1 exemption / area-gate normalization -- the discriminator is wrongly excusing a real defect: "
        f"{flipped}"
    )
