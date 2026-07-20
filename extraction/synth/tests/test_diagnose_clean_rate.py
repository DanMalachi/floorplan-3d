from extraction.synth.qa.diagnose_clean_rate import categorize


def _stats(flags, **overrides):
    base = dict(ok=True, clean=False, flags=flags, opening_attach_rate=1.0, ink_coverage_ratio=1.0, validator_problems=[])
    base.update(overrides)
    return base


def test_broken_room_cycle_on_required_room_is_categorized():
    # Regression test: categorize() used to check only room:cycle_unrepairable:
    # flags, silently missing room:broken_room_cycle: — even though both
    # count against resplan_convert.py's actual clean bar. A plan whose ONLY
    # problem is a broken_room_cycle on a required room type used to fall
    # through to "uncategorized" instead.
    stats = _stats(["room:broken_room_cycle:bathroom_0"])
    assert categorize(stats) == ["room_assembly_failed_required"]


def test_broken_room_cycle_on_open_plan_only_room():
    stats = _stats(["room:broken_room_cycle:kitchen_0"])
    assert categorize(stats) == ["room_assembly_failed_open_plan_only"]


def test_cycle_unrepairable_on_required_room_still_categorized():
    stats = _stats(["room:cycle_unrepairable:bedroom_0"])
    assert categorize(stats) == ["room_assembly_failed_required"]


def test_mixed_broken_and_unrepairable_both_required_dont_double_count():
    stats = _stats(["room:broken_room_cycle:bedroom_0", "room:cycle_unrepairable:bathroom_1"])
    assert categorize(stats) == ["room_assembly_failed_required"]


def test_validator_problem_suppressed_by_room_assembly_failure():
    stats = _stats(["room:broken_room_cycle:storage_0"], validator_problems=["some validator error"])
    cats = categorize(stats)
    assert "room_assembly_failed_required" in cats
    assert "other_validator_problem" not in cats


def test_validator_problem_alone_still_categorized():
    stats = _stats([], validator_problems=["some validator error"])
    assert categorize(stats) == ["other_validator_problem"]


def test_no_flags_and_not_clean_is_uncategorized():
    stats = _stats([])
    assert categorize(stats) == ["uncategorized"]
