"""Deliverable 1 of Phase 3a: ResPlan plan -> schema-v1-shaped GT JSON.

CLI:
    .venv/Scripts/python.exe -m extraction.synth.resplan_convert \\
        --pkl data/resplan/raw/ResPlan.pkl --out data/resplan/converted \\
        [--limit N] [--workers N]

Scope decision (confirmed with Dan, 2026-07-19): open-plan room types
(living, kitchen, balcony) in ResPlan frequently have complex/concave
polygon boundaries that are not fully wall-enclosed — this matches the
already-deferred open-plan-zones problem (see memory). A plan is still
counted "clean" even if those room types fail wall_cycle closure; only
CLEAN_REQUIRED_ROOM_TYPES (bedroom/bathroom/storage/stair — normally
fully wall-enclosed) count against the clean bar. Open-plan rooms that
fail assembly are simply dropped from rooms[] (never emitted broken),
same as any other broken_room_cycle — they just don't fail the plan.
"""
from __future__ import annotations

import argparse
import json
import pickle
import re
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

from extraction.schema.models import (
    Diagnostics,
    ExtractionResult,
    ImageTransform,
    Junction,
    Opening,
    RenderAgreement,
    Room,
    Source,
    Units,
    Wall,
)
from extraction.schema.validate import validity
from extraction.synth.openings import project_openings
from extraction.synth.rooms import ROOM_LABEL_MAP, assemble_rooms, wall_roles
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import normalize_keys

PIPELINE_VERSION = "p3a-resplan-convert-v0.1"

CLEAN_REQUIRED_ROOM_TYPES = {"bedroom", "bathroom", "storage", "stair"}
OPEN_PLAN_ROOM_TYPES = {"living", "kitchen", "balcony"}

_JUNCTION_TYPE_BY_DEGREE = {1: "end", 2: "L", 3: "T"}


def _junction_type(n_walls: int) -> str:
    return _JUNCTION_TYPE_BY_DEGREE.get(n_walls, "X")


def convert_plan(plan: dict) -> tuple[Optional[ExtractionResult], dict]:
    """Converts one ResPlan plan dict to an ExtractionResult. Returns (plan_v1_or_None,
    stats_dict). Never raises — exceptions are caught and reported in
    stats["exception"] so a batch run never dies on one bad plan."""
    t0 = time.time()
    stats: dict = {"resplan_id": plan.get("id"), "flags": []}
    try:
        plan = normalize_keys(dict(plan))
        wall_depth = float(plan.get("wall_depth") or 4.0)
        wall_geom = plan.get("wall")

        if wall_geom is None or wall_geom.is_empty:
            stats.update(ok=False, clean=False, reason="empty_wall_geometry")
            return None, stats

        filled = fill_openings_into_wall(wall_geom, plan.get("door"), plan.get("window"), plan.get("front_door"))
        skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=wall_geom)
        stats["flags"].extend(f"skeleton:{f}" for f in skel.flags)

        if not skel.segments:
            stats.update(ok=False, clean=False, reason="no_wall_segments")
            return None, stats

        projections, open_flags = project_openings(
            skel.segments, plan.get("door"), plan.get("window"), front_door_geom=plan.get("front_door")
        )
        stats["flags"].extend(f"opening:{f}" for f in open_flags)

        room_polys = {rt: plan.get(rt) for rt in ROOM_LABEL_MAP if plan.get(rt) is not None}
        rooms_raw, wall_to_types, room_flags = assemble_rooms(skel.segments, room_polys)
        stats["flags"].extend(f"room:{f}" for f in room_flags)

        roles, role_flags_per_seg = wall_roles(skel.segments, plan.get("inner"), wall_to_types)

        openings_by_wall: dict[int, list[Opening]] = {}
        n_attached = 0
        for i, proj in enumerate(projections):
            o = Opening(
                id=f"o_{i:03d}",
                **{"class": proj.opening_class},
                center_offset=proj.center_offset,
                width=proj.width,
                confidence=1.0,
                evidence=["ground_truth"],
                flags=proj.flags,
            )
            openings_by_wall.setdefault(proj.wall_index, []).append(o)
            n_attached += 1

        walls_out: list[Wall] = []
        for i, seg in enumerate(skel.segments):
            wall_openings = sorted(openings_by_wall.get(i, []), key=lambda o: o.center_offset)
            walls_out.append(
                Wall(
                    id=f"w_{i:03d}",
                    start=seg.start,
                    end=seg.end,
                    thickness=seg.thickness,
                    curvature=0.0,
                    role=roles[i],
                    confidence=1.0,
                    evidence=["ground_truth"],
                    flags=role_flags_per_seg[i],
                    openings=wall_openings,
                )
            )

        junctions_out = [
            Junction(
                id=f"j_{i:03d}",
                point=j.point,
                type=_junction_type(len(j.segment_indices)),
                walls=[f"w_{idx:03d}" for idx in j.segment_indices],
            )
            for i, j in enumerate(skel.junctions)
        ]

        rooms_out = [
            Room(
                id=f"r_{i:03d}",
                label=r.room_type,
                label_confidence=1.0,
                wall_cycle=[f"w_{idx:03d}" for idx in r.wall_cycle],
                area=r.area,
                confidence=1.0,
            )
            for i, r in enumerate(rooms_raw)
        ]

        plan_v1 = ExtractionResult(
            source=Source(
                file_sha256="0" * 64,  # ResPlan plans have no source file hash; recorded as unavailable
                filename=f"resplan_{plan.get('id')}",
                encoding_class="V",
                convention_class="single_stroke",
                scope_class="single",
                router_confidence=1.0,
            ),
            units=Units(system="plan_units", scale_confidence=0.0),  # ResPlan coords are unrecoverable-scale
            image_transform=ImageTransform(
                type="similarity", matrix=[[1, 0, 0], [0, 1, 0], [0, 0, 1]], source_px=(256, 256)
            ),
            walls=walls_out,
            junctions=junctions_out,
            rooms=rooms_out,
            diagnostics=Diagnostics(
                tier=1,
                unresolved=[],
                render_agreement=RenderAgreement(wall_iou=1.0, unexplained_ink_ratio=0.0, hallucinated_ink_ratio=0.0),
                kill_log_ref="resplan_conversion",
                pipeline_version=PIPELINE_VERSION,
                timings_ms={"total": (time.time() - t0) * 1000},
                cost_usd=0.0,
            ),
        )

        validator_problems = validity(plan_v1.model_dump(by_alias=True)).errors

        # A room can fail assembly two ways: broken_room_cycle (no per-edge
        # spatial coverage match at all) or cycle_unrepairable (per-edge
        # matches found, but the sequence wasn't a connected/area-matching
        # cycle — see rooms.py). Both must count against the clean bar for
        # CLEAN_REQUIRED_ROOM_TYPES.
        _ROOM_FAILURE_PREFIXES = ("broken_room_cycle:", "cycle_unrepairable:")
        broken_required = [
            f for f in room_flags
            if f.startswith(_ROOM_FAILURE_PREFIXES) and f.split(":", 1)[1].rsplit("_", 1)[0] in CLEAN_REQUIRED_ROOM_TYPES
        ]
        broken_open_plan = [
            f for f in room_flags
            if f.startswith(_ROOM_FAILURE_PREFIXES) and f.split(":", 1)[1].rsplit("_", 1)[0] in OPEN_PLAN_ROOM_TYPES
        ]

        n_openings_attempted = n_attached + sum(1 for f in open_flags if f.startswith("unattached_opening"))
        opening_attach_rate = (n_attached / n_openings_attempted) if n_openings_attempted else 1.0

        seg_area_estimate = sum(
            (((s.end[0] - s.start[0]) ** 2 + (s.end[1] - s.start[1]) ** 2) ** 0.5) * s.thickness
            for s in skel.segments
        )
        ink_coverage_ratio = (seg_area_estimate / filled.area) if filled.area > 0 else 0.0

        clean = (
            len(validator_problems) == 0
            and len(broken_required) == 0
            and opening_attach_rate >= 0.95
            and 0.85 <= ink_coverage_ratio <= 1.15
        )

        stats.update(
            ok=True,
            clean=clean,
            n_walls=len(walls_out),
            n_openings=len(projections),
            n_rooms=len(rooms_out),
            n_broken_required_rooms=len(broken_required),
            n_broken_open_plan_rooms=len(broken_open_plan),
            opening_attach_rate=opening_attach_rate,
            ink_coverage_ratio=ink_coverage_ratio,
            validator_problems=validator_problems,
            elapsed_ms=(time.time() - t0) * 1000,
        )
        return plan_v1, stats

    except Exception as e:  # noqa: BLE001 — batch conversion must never die on one bad plan
        stats.update(
            ok=False,
            clean=False,
            reason=f"exception:{type(e).__name__}",
            exception_message=str(e)[:300],
            elapsed_ms=(time.time() - t0) * 1000,
        )
        return None, stats


def _convert_one(args: tuple[int, dict]) -> tuple[int, Optional[dict], dict]:
    idx, plan = args
    plan_v1, stats = convert_plan(plan)
    return idx, (plan_v1.model_dump(by_alias=True) if plan_v1 is not None else None), stats


def run_batch(pkl_path: Path, out_dir: Path, *, limit: Optional[int] = None, workers: int = 1) -> dict:
    with open(pkl_path, "rb") as f:
        plans = pickle.load(f)
    if limit is not None:
        plans = plans[:limit]

    out_dir.mkdir(parents=True, exist_ok=True)
    all_stats: list[dict] = []
    t0 = time.time()

    tasks = list(enumerate(plans))
    if workers <= 1:
        results = (_convert_one(t) for t in tasks)
        for idx, plan_dict, stats in results:
            if plan_dict is not None:
                (out_dir / f"{idx:06d}_{stats['resplan_id']}.json").write_text(json.dumps(plan_dict, indent=None))
            all_stats.append(stats)
    else:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futures = {ex.submit(_convert_one, t): t[0] for t in tasks}
            for fut in as_completed(futures):
                idx, plan_dict, stats = fut.result()
                if plan_dict is not None:
                    (out_dir / f"{idx:06d}_{stats['resplan_id']}.json").write_text(json.dumps(plan_dict, indent=None))
                all_stats.append(stats)

    elapsed = time.time() - t0
    report = summarize(all_stats, elapsed)
    (out_dir.parent / "converter_stats.json").write_text(json.dumps(report, indent=2))
    return report


def _normalize_flag_key(f: str) -> str:
    """Collapses a per-instance flag (e.g. "opening:sibling_overlap:wall_12"
    or "room:broken_room_cycle:living_0") down to its semantic category
    (strips any "(...)" count suffix and any trailing "_<digits>" instance
    index) so the histogram stays bounded across a 17K-plan run instead of
    growing one key per wall/room instance."""
    f = f.split("(")[0]
    return re.sub(r"_\d+$", "", f)


def summarize(all_stats: list[dict], elapsed_s: float) -> dict:
    n = len(all_stats)
    n_ok = sum(1 for s in all_stats if s.get("ok"))
    n_clean = sum(1 for s in all_stats if s.get("clean"))

    flag_hist: dict[str, int] = {}
    for s in all_stats:
        for f in s.get("flags", []):
            key = _normalize_flag_key(f)
            flag_hist[key] = flag_hist.get(key, 0) + 1
        if not s.get("ok"):
            reason = s.get("reason", "unknown")
            flag_hist[reason] = flag_hist.get(reason, 0) + 1

    def _pctile(vals: list[float], p: float) -> float:
        if not vals:
            return 0.0
        vals = sorted(vals)
        idx = min(int(len(vals) * p), len(vals) - 1)
        return vals[idx]

    elapsed_per_plan = [s["elapsed_ms"] for s in all_stats if "elapsed_ms" in s]
    walls_per_plan = [s["n_walls"] for s in all_stats if s.get("ok")]
    openings_per_plan = [s["n_openings"] for s in all_stats if s.get("ok")]
    rooms_per_plan = [s["n_rooms"] for s in all_stats if s.get("ok")]

    return {
        "pipeline_version": PIPELINE_VERSION,
        "n_plans": n,
        "n_parsed_ok": n_ok,
        "pct_parsed_ok": (100.0 * n_ok / n) if n else 0.0,
        "n_clean": n_clean,
        "pct_clean": (100.0 * n_clean / n) if n else 0.0,
        "clean_definition": (
            "ok (no exception) AND validator_problems==[] AND zero broken "
            f"CLEAN_REQUIRED_ROOM_TYPES={sorted(CLEAN_REQUIRED_ROOM_TYPES)} "
            "AND opening_attach_rate>=0.95 AND 0.85<=ink_coverage_ratio<=1.15. "
            f"Open-plan room types {sorted(OPEN_PLAN_ROOM_TYPES)} are excluded "
            "from this bar (confirmed with Dan 2026-07-19: matches the "
            "already-deferred open-plan-zones limitation) — they're dropped "
            "from rooms[] when broken, never counted as a plan failure."
        ),
        "flag_histogram": dict(sorted(flag_hist.items(), key=lambda kv: -kv[1])),
        "walls_per_plan": {"min": min(walls_per_plan, default=0), "max": max(walls_per_plan, default=0), "mean": (sum(walls_per_plan) / len(walls_per_plan)) if walls_per_plan else 0},
        "openings_per_plan": {"min": min(openings_per_plan, default=0), "max": max(openings_per_plan, default=0), "mean": (sum(openings_per_plan) / len(openings_per_plan)) if openings_per_plan else 0},
        "rooms_per_plan": {"min": min(rooms_per_plan, default=0), "max": max(rooms_per_plan, default=0), "mean": (sum(rooms_per_plan) / len(rooms_per_plan)) if rooms_per_plan else 0},
        "runtime_ms_per_plan": {
            "p50": _pctile(elapsed_per_plan, 0.5),
            "p95": _pctile(elapsed_per_plan, 0.95),
            "max": max(elapsed_per_plan, default=0),
        },
        "total_wall_clock_s": elapsed_s,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert ResPlan plans to schema-v1 GT JSON.")
    parser.add_argument("--pkl", type=Path, default=Path("data/resplan/raw/ResPlan.pkl"))
    parser.add_argument("--out", type=Path, default=Path("data/resplan/converted/plans"))
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()

    report = run_batch(args.pkl, args.out, limit=args.limit, workers=args.workers)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
