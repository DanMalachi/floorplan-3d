"""Per-room-cycle area-error histogram — reproduces the handoff doc's
original n=650/150-plan methodology (all ROOM_LABEL_MAP room types, not
just the required subset) so post-fix numbers are directly comparable to
the pre-fix table in docs/session-notes/p3a-handoff.md. Also splits errors
into near_miss vs degenerate (implied_area<=0) so a shift in the
degenerate share is visible, not just the aggregate stats."""
from __future__ import annotations

import pickle
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.diagnose_area_gap import assemble_one_room_cycle
from extraction.synth.rooms import ROOM_LABEL_MAP, _build_adjacency, _mitered_face_polygon, _repair_connectivity
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"


def measure(n_plans: int) -> list[float]:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    errors = []
    n_degenerate = 0
    for p in plans[:n_plans]:
        p = normalize_keys(dict(p))
        wall_depth = float(p.get("wall_depth") or 4.0)
        wall_geom = p.get("wall")
        if wall_geom is None or wall_geom.is_empty:
            continue
        filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
        skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=wall_geom)
        segments = skel.segments
        if not segments:
            continue
        adjacency = _build_adjacency(segments, 0.1)

        for rt in ROOM_LABEL_MAP:
            g = p.get(rt)
            if g is None:
                continue
            for poly in get_geometries(g):
                if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                    continue
                wall_seq = assemble_one_room_cycle(segments, poly)
                if wall_seq is None:
                    continue
                repaired = _repair_connectivity(wall_seq, adjacency, 3)
                if repaired is None:
                    continue
                face = _mitered_face_polygon(repaired, segments, (poly.centroid.x, poly.centroid.y))
                implied_area = face.area if face is not None else 0.0
                if implied_area <= 0:
                    n_degenerate += 1
                    errors.append(100.0)  # matches diagnose_cycle_unrepairable's 100% convention
                    continue
                err_pct = abs(implied_area - poly.area) / max(poly.area, 1e-9) * 100
                errors.append(err_pct)

    print(f"n room-cycles measured: {len(errors)}  (of which degenerate/implied_area<=0: {n_degenerate})")
    if not errors:
        return errors

    s = sorted(errors)

    def pct(p):
        return s[min(int(len(s) * p), len(s) - 1)]

    within5 = sum(1 for e in errors if e <= 5.0) / len(errors) * 100
    within10 = sum(1 for e in errors if e <= 10.0) / len(errors) * 100
    print(f"median={statistics.median(errors):.2f}%  p90={pct(0.90):.2f}%")
    print(f"% within 5%: {within5:.1f}%   % within 10%: {within10:.1f}%")
    print(f"% degenerate (implied_area<=0): {100 * n_degenerate / len(errors):.1f}%")
    return errors


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    measure(n)
