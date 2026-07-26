"""Unit tests for extraction/trackv/assemble.py's endpoint-snap + junction
assembly and open-cycle localization.

Builds PairResult fixtures directly (assemble.py's actual input type).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from extraction.trackv.assemble import assemble
from extraction.trackv.dissect import dissect
from extraction.trackv.pair import OpeningCandidate, PairFunnel, PairResult, WallCandidate
from extraction.trackv.select import select_axis_aligned

REPO_ROOT = Path(__file__).resolve().parents[3]
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
CORPUS_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]


def _wall(start, end, thickness=10.0, bucket="A", src=(0, 1)):
    return WallCandidate(start=start, end=end, thickness=thickness, axis_bucket=bucket, source_segment_indices=src)


def _pair_result(walls, openings=None):
    return PairResult(walls=walls, opening_candidates=openings or [], funnel=PairFunnel())


def test_closed_rectangle_snaps_into_four_junctions_and_one_cycle():
    walls = [
        _wall((0, 0), (100, 0.2)),  # slightly off, must snap to a shared corner
        _wall((100, 0), (100, 80)),
        _wall((100.1, 80), (0, 80)),
        _wall((0, 80.1), (0, 0)),
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    assert len(result.walls) == 4
    assert len(result.junctions) == 4
    assert all(j.junction_type == "L" for j in result.junctions)
    assert result.open_cycle_diagnostics == []
    assert result.n_cycle_basis_found == 1
    assert result.n_connected_components == 1


def test_dangling_wall_end_is_localized_as_open_cycle():
    walls = [
        _wall((0, 0), (100, 0)),
        _wall((100, 0), (100, 80)),
        _wall((100, 80), (0, 80)),
        # missing 4th wall closing back to (0, 0) -- (0, 80) dangles
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    assert len(result.open_cycle_diagnostics) == 2  # both (0,0) and (0,80) dangle
    dangling_points = {d.dangling_point for d in result.open_cycle_diagnostics}
    assert (0.0, 0.0) in dangling_points
    assert (0.0, 80.0) in dangling_points
    assert result.n_cycle_basis_found == 0


def test_scale_to_gt_frame_is_applied_to_geometry():
    walls = [_wall((0, 0), (10, 0), thickness=2.0)]
    result = assemble(_pair_result(walls), scale_to_gt_frame=2.0)
    w = result.walls[0]
    assert w.start == (0.0, 0.0)
    assert w.end == (20.0, 0.0)
    assert abs(w.thickness - 4.0) < 1e-9


def test_junction_requires_at_least_one_wall_no_degenerate_entries():
    # a zero-length wall after snap (start == end) must not produce a
    # junction with an empty walls list (schema requires min_length=1)
    walls = [_wall((5.0, 5.0), (5.0, 5.0 + 1e-4))]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)
    assert all(len(j.wall_ids) >= 1 for j in result.junctions)
    assert result.n_degenerate_zero_length_walls == 1


# --- Junction closure (extend-to-intersection) -----------------------------


def test_l_corner_both_walls_extend_to_meet():
    # both walls stop 10 units short of the true corner (100, 0); each
    # gap is within the generous axial bound (1.5 * thickness=10 -> 15)
    walls = [
        _wall((0, 0), (90, 0)),  # W0: horizontal, short at its own "end"
        _wall((100, 10), (100, 100)),  # W1: vertical, short at its own "start"
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    by_id = {w.id: w for w in result.walls}
    assert set(by_id) == {"W0", "W1"}
    assert by_id["W0"].end == (100.0, 0.0)
    assert by_id["W1"].start == (100.0, 0.0)
    assert by_id["W0"].parent_wall_id is None
    assert by_id["W1"].parent_wall_id is None
    corner = [j for j in result.junctions if j.point == (100.0, 0.0)]
    assert len(corner) == 1
    assert corner[0].junction_type == "L"
    assert result.closure.n_accepted_l == 1
    assert result.closure.n_accepted_t == 0
    assert result.closure.n_walls_split == 0


def test_t_junction_splits_stationary_wall_and_tracks_parent():
    walls = [
        _wall((0, 50), (200, 50)),  # W0: long stationary wall
        _wall((100, 0), (100, 45)),  # W1: dangling, taps into W0's interior at (100,50)
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    pieces = {w.id: w for w in result.walls}
    assert "W0_0" in pieces and "W0_1" in pieces
    assert pieces["W0_0"].parent_wall_id == "W0"
    assert pieces["W0_1"].parent_wall_id == "W0"
    assert {pieces["W0_0"].start, pieces["W0_0"].end} == {(0.0, 50.0), (100.0, 50.0)}
    assert {pieces["W0_1"].start, pieces["W0_1"].end} == {(100.0, 50.0), (200.0, 50.0)}
    assert pieces["W1"].end == (100.0, 50.0)
    assert pieces["W1"].parent_wall_id is None

    tjunc = [j for j in result.junctions if j.point == (100.0, 50.0)]
    assert len(tjunc) == 1
    assert tjunc[0].junction_type == "T"
    assert set(tjunc[0].wall_ids) == {"W0_0", "W0_1", "W1"}
    assert result.closure.n_accepted_t == 1
    assert result.closure.n_walls_split == 1


def test_x_junction_splits_both_walls():
    walls = [
        _wall((0, 50), (100, 50)),  # W0: crosses W1 at its own interior (50,50)
        _wall((50, 0), (50, 100)),  # W1: crosses W0 at its own interior (50,50)
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    ids = {w.id for w in result.walls}
    assert {"W0_0", "W0_1", "W1_0", "W1_1"} <= ids
    xjunc = [j for j in result.junctions if j.point == (50.0, 50.0)]
    assert len(xjunc) == 1
    assert xjunc[0].junction_type == "X"
    assert result.closure.n_accepted_x == 1
    assert result.closure.n_walls_split == 2


def test_junction_candidate_exceeding_axial_bound_is_rejected_and_logged():
    # true gap is 20 units; generous bound is 1.5 * thickness(10) = 15 --
    # must be refused, not silently bridged, and the refusal must be
    # auditable from the closure log alone.
    walls = [
        _wall((0, 0), (50, 0)),  # W0: dangling end at (50, 0)
        _wall((70, -100), (70, 100)),  # W1: line x=70, far from W0's reach
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    assert result.closure.n_rejected >= 1
    assert any(r.reason.startswith("axial_bound_exceeded") for r in result.closure.rejected)
    by_id = {w.id: w for w in result.walls}
    assert by_id["W0"].end == (50.0, 0.0)  # unchanged -- not bridged
    dangling_points = {d.dangling_point for d in result.open_cycle_diagnostics}
    assert (50.0, 0.0) in dangling_points


def test_multiple_taps_on_one_wall_are_batched_into_a_single_split():
    # two independent T-candidates land on the same stationary wall; must
    # produce ONE three-piece cut, not two sequential splits.
    walls = [
        _wall((0, 50), (300, 50)),  # W0: stationary
        _wall((100, 0), (100, 45)),  # W1: taps at (100, 50)
        _wall((200, 55), (200, 100)),  # W2: taps at (200, 50)
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    split_pieces = [w for w in result.walls if w.parent_wall_id == "W0"]
    assert len(split_pieces) == 3
    assert result.closure.n_walls_split == 1  # one ORIGINAL wall split, not two
    assert result.closure.n_accepted_t == 2
    spans = sorted((min(w.start[0], w.end[0]), max(w.start[0], w.end[0])) for w in split_pieces)
    assert spans == [(0.0, 100.0), (100.0, 200.0), (200.0, 300.0)]


def test_enable_splitting_false_refuses_splits_but_keeps_l_corners():
    walls = [
        _wall((0, 0), (90, 0)),  # W0, W1: ordinary L-corner, no split involved
        _wall((100, 10), (100, 45)),  # (kept short of y=50 -- isolated from W2/W3 below)
        _wall((300, 50), (500, 50)),  # W2: stationary, would be split by W3
        _wall((400, 0), (400, 45)),  # W3: taps into W2's interior at (400, 50)
    ]
    pr = _pair_result(walls)
    with_split = assemble(pr, scale_to_gt_frame=1.0)
    without_split = assemble(pr, scale_to_gt_frame=1.0, enable_splitting=False)

    assert with_split.closure.n_walls_split == 1
    assert without_split.closure.n_walls_split == 0
    assert len(without_split.walls) == len(walls)  # count unchanged -- pre-split candidate set
    assert without_split.closure.n_accepted_l == 1  # the ordinary corner still closes
    assert any(r.reason == "splitting_disabled" for r in without_split.closure.rejected)
    by_id = {w.id: w for w in without_split.walls}
    assert by_id["W0"].end == (100.0, 0.0)  # L-corner still applied


@pytest.mark.xfail(strict=True, reason=(
    "NOT expected-zero as originally predicted: 15x30 finds 31 X-junctions, "
    "30x50 finds 46, with n_walls_split landing close to total wall count on "
    "both plans (33/43 and 47/54). Concrete inspection (scratchpad "
    "diag_x_junctions.py) shows repeating triads of near-identical-length "
    "parallel segments crossing a shared perpendicular wall -- consistent "
    "with pre-existing spurious wall candidates (window mullions/frame "
    "elements passing pair.py's thickness-plausibility guard) rather than a "
    "closure-logic bug, but NOT confirmed against GT. Left xfail(strict=True) "
    "rather than silently deleted or loosened to !=0, matching this "
    "codebase's convention for a known, tracked, open question (see "
    "test_select.py's Manhattan-bias xfail) -- open question for the next "
    "STOP, not resolved here."
))
@pytest.mark.parametrize("plan_id", CORPUS_PLAN_IDS)
def test_x_junctions_are_zero_on_real_corpus(plan_id):
    # Dan's prediction (reports/phase-2-m2c-handoff.md follow-up): true
    # perpendicular-wall crossings (both sides landing in each other's
    # interior) should be effectively absent on real floorplans -- verify
    # rather than assume, so a future regression here is caught, not
    # silently normalized away.
    from eval.registry.registry import load_registry

    entries = {e.plan_id: e for e in load_registry()}
    entry = entries[plan_id]
    pdf_path = REPO_ROOT / entry.source_file
    dissection = dissect(pdf_path)[0]
    selection = select_axis_aligned(dissection)
    from extraction.trackv.pair import pair_walls

    pair_result = pair_walls(selection, dissection.page_size_px)
    result = assemble(pair_result, scale_to_gt_frame=1.0)
    assert result.closure.n_accepted_x == 0, (
        f"{plan_id}: expected zero X-junctions on this corpus, found "
        f"{result.closure.n_accepted_x} -- inspect before assuming this is fine"
    )
