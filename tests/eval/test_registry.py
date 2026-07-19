from eval.registry.registry import gt_status_counts, load_registry, stratum_counts


def test_registry_loads_all_16_plans():
    entries = load_registry()
    assert len(entries) == 16


def test_gt_status_breakdown():
    counts = gt_status_counts(load_registry())
    assert counts["provisional_unaudited"] == 15
    assert counts["none"] == 1
    assert counts.get("audited", 0) == 0  # honest: nothing has been human-audited yet


def test_two_canaries_present():
    entries = load_registry()
    canaries = [e for e in entries if e.canary]
    assert len(canaries) == 2


def test_strata_cover_multiple_conventions_and_scopes():
    counts = stratum_counts(load_registry())
    conventions = {k[1] for k in counts}
    scopes = {k[2] for k in counts}
    assert {"poche", "hatched", "single_stroke"} <= conventions
    assert "multi_floor" in scopes
