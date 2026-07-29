"""Held-out re-measurement of the conditional converter clean rate after
the lever #1 build (2026-07-29), per Dan's explicit requirement before
trusting the 52.5%->70-80% prediction: the doorway-notch discriminator's
four constants (OPENING_COVERAGE_THRESHOLD=0.65, PERPENDICULARITY_COS_
THRESHOLD=0.15, NOTCH_LENGTH_MULTIPLE=1.2, and the 4.0 wall_depth default)
were tuned by inspecting specific plans across the 2026-07-21/22/26
diagnostic sessions. If those same plans are inside the eval sample, the
rate grades its own homework -- this measures both the ordinary sample AND
a held-out sample that excludes every plan known to have influenced the
thresholds, and reports both, per this phase's standing discipline (a
hypothesis is tested on the population, not on the examples that suggested
it).

Excluded plan ids (305 total, extraction/synth/qa/tuning_plan_ids.json):
  - The 300-plan discriminator false-positive sweep
    (measure_notch_discriminator_fp.py's find_sample(plans, 300, 3000)) --
    this is the population the 0.65 threshold's empty-band [0.3, 0.5)
    justification and FP-rate comparison were measured against directly.
    (This set's first 27 plans are also exactly the 27-plan sample used to
    validate/widen the perpendicularity and length-multiple conditions --
    see docs/session-notes/p3a-handoff.md's "Doorway-notch discriminator"
    section -- so it's a strict superset, not a separate exclusion.)
  - 5 individually-named exemplar plans cited in the handoff as directly
    shaping the discriminator or its scope, NOT already inside the 300-plan
    sample: 64 (MAX_NOTCH_SPAN_EDGES=4 clustering cap), 12017 (the zigzag
    adversarial case that shaped per-edge, not per-door, suppression),
    5683 (the original notch-suppression build/diagnosis case),
    11942 (window-type generalization confirmation), 11587 (cited
    repeatedly in reports/p3a-notch-resolution.md's build session).

Held-out sample is built by walking the FULL 17K in dataset order (same
order compute_conditional_clean_rate's plans[:n] uses), skipping any
excluded id, until n held-out plans are collected -- not just filtering
the first 300, since with 305 exclusions scattered through the low
indices a naive filter of plans[:300] would return fewer than 300.
"""
from __future__ import annotations

import json
import pickle
from pathlib import Path

from extraction.synth.qa.classify_room_boundary_no_wall_match import PKL_PATH
from extraction.synth.qa.measure_clean_at_source import check_plan
from extraction.synth.resplan_convert import convert_plan

TUNING_IDS_PATH = Path(__file__).resolve().parent / "tuning_plan_ids.json"


def _measure(plans: list[dict], n: int, label: str) -> dict:
    n_clean_at_source = 0
    n_converter_clean = 0
    n_both = 0
    for p in plans[:n]:
        src_clean = check_plan(p)["clean_at_source"]
        _, stats = convert_plan(p)
        conv_clean = bool(stats.get("clean"))
        assert not conv_clean or src_clean, (
            f"containment invariant violated: plan {p.get('id')} is converter_clean but not clean_at_source"
        )
        n_clean_at_source += src_clean
        n_converter_clean += conv_clean
        n_both += src_clean and conv_clean

    conditional = (100 * n_both / n_clean_at_source) if n_clean_at_source else float("nan")
    print(f"\n{'=' * 70}\n{label} (n={len(plans[:n])}):")
    print(f"  clean_at_source: {n_clean_at_source}/{len(plans[:n])} ({100 * n_clean_at_source / len(plans[:n]):.1f}%)")
    print(f"  converter_clean (all-plans rate): {n_converter_clean}/{len(plans[:n])} "
          f"({100 * n_converter_clean / len(plans[:n]):.1f}%)")
    print(f"  converter_clean AND clean_at_source: {n_both}/{len(plans[:n])}")
    print(f"  converter_clean | clean_at_source: {n_both}/{n_clean_at_source} ({conditional:.1f}%)")
    return dict(n=len(plans[:n]), clean_at_source=n_clean_at_source, converter_clean=n_converter_clean,
                both=n_both, conditional_pct=conditional)


def main(n: int = 300) -> None:
    with open(PKL_PATH, "rb") as f:
        all_plans = pickle.load(f)
    tuning = json.loads(TUNING_IDS_PATH.read_text())
    exclude_ids = set(tuning["exclude_union"])
    print(f"Excluding {len(exclude_ids)} tuning-influenced plan ids")

    full_sample = all_plans[:n]
    held_out_sample = [p for p in all_plans if p.get("id") not in exclude_ids][:n]

    full_result = _measure(full_sample, n, "FULL sample (plans[:n], matches existing baseline)")
    held_out_result = _measure(held_out_sample, n, "HELD-OUT sample (tuning-influenced plans excluded)")

    print(f"\n{'=' * 70}\nComparison:")
    print(f"  full sample conditional rate:      {full_result['conditional_pct']:.1f}%")
    print(f"  held-out sample conditional rate:  {held_out_result['conditional_pct']:.1f}%")
    gap = full_result["conditional_pct"] - held_out_result["conditional_pct"]
    print(f"  gap (full - held_out): {gap:+.1f} points")
    if held_out_result["conditional_pct"] < full_result["conditional_pct"] - 5:
        print("  FINDING: held-out rate materially below full-sample rate -- report as a finding, not a failure.")
    else:
        print("  Held-out rate is not materially below the full-sample rate.")


if __name__ == "__main__":
    main()
