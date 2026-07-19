"""One-off converter: legacy/data/floorplan-gt/*.gt.json (the old
trace-export format, docs from legacy/src/trace2d/exportGroundTruth.ts) ->
schema-v1 JSON (extraction/schema/extraction_v1.schema.json).

Seeds the new corpus from Dan's 15 already-hand-traced plans so the harness
has something real to run against before fresh samples arrive. Output is
registered as gt_status="provisional_unaudited" (see eval/registry) — it
does NOT satisfy the Phase 0 "30-50 fully audited plans" bar. Known,
honestly-flagged limitations of this conversion, not fixed here because a
one-off migration script isn't the place to build new extraction logic:

- No wall thickness in the old format: every converted wall gets a
  default 150mm thickness and a "legacy_default_thickness" flag.
- No exterior/interior distinction in the old format: converted walls get
  role="unconfirmed" (rail-type segments still map to role="rail", since
  that WAS tagged in the old trace).
- No rooms in the old format at all (the old pipeline never derived
  planar faces into a room list): rooms=[] for every converted plan.
- Portals (old format's absence-of-a-wall marker) are dropped entirely,
  matching the new schema's model — a portal isn't a wall element.
- Junction types are inferred from point degree (1->end, 2->L, 3->T,
  4->X) rather than true geometric angle classification, so a degree-2
  point on a straight run is called "L" even when it's really "I".
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path

DEFAULT_THICKNESS_MM = 150.0
JUNCTION_TYPE_BY_DEGREE = {1: "end", 2: "L", 3: "T"}


def _junction_type(degree: int) -> str:
    return JUNCTION_TYPE_BY_DEGREE.get(degree, "X")


def convert_one(gt: dict, source_pdf_sha256: str) -> dict:
    points_by_id = {p["id"]: p for p in gt["points"]}
    mpp = gt.get("metersPerPixel")
    scale = (mpp * 1000.0) if mpp else 1.0  # px -> mm, or leave in px as plan_units if no scale

    def to_plan(p: dict) -> list[float]:
        return [p["x"] * scale, p["y"] * scale]

    walls: list[dict] = []
    wall_ids_by_segment: dict[str, str] = {}
    point_degree: dict[str, int] = defaultdict(int)
    point_walls: dict[str, list[str]] = defaultdict(list)

    for seg in gt["segments"]:
        seg_type = seg.get("type") or "wall"
        if seg_type == "portal":
            continue  # absence of a wall, not a wall element (see module docstring)
        a, b = points_by_id.get(seg["a"]), points_by_id.get(seg["b"])
        if a is None or b is None:
            continue
        wall_id = f"w_{seg['id']}"
        wall_ids_by_segment[seg["id"]] = wall_id
        walls.append({
            "id": wall_id,
            "start": to_plan(a),
            "end": to_plan(b),
            "thickness": DEFAULT_THICKNESS_MM,
            "curvature": 0.0,
            "role": "rail" if seg_type == "rail" else "unconfirmed",
            "openings": [],
            "confidence": 1.0,
            "evidence": ["ground_truth"],
            "flags": ["legacy_default_thickness", "legacy_unconfirmed_role"] if seg_type != "rail" else ["legacy_default_thickness"],
        })
        point_degree[seg["a"]] += 1
        point_degree[seg["b"]] += 1
        point_walls[seg["a"]].append(wall_id)
        point_walls[seg["b"]].append(wall_id)

    segments_by_id = {seg["id"]: seg for seg in gt["segments"]}
    walls_by_id = {w["id"]: w for w in walls}
    for opening in gt.get("openings", []):
        wall_id = wall_ids_by_segment.get(opening["segmentId"])
        wall = walls_by_id.get(wall_id) if wall_id else None
        seg = segments_by_id.get(opening["segmentId"])
        if wall is None or seg is None:
            continue
        a, b = points_by_id[seg["a"]], points_by_id[seg["b"]]
        length_px = ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5
        length_mm = length_px * scale
        t0, t1 = opening["t0"], opening["t1"]
        center_offset = (t0 + t1) / 2 * length_mm
        width = abs(t1 - t0) * length_mm
        wall["openings"].append({
            "id": f"o_{opening['id']}",
            "class": opening["type"],
            "center_offset": center_offset,
            "width": width,
            "sill_height": opening.get("sill"),
            "head_height": opening.get("height"),
            "swing": None,
            "confidence": 1.0,
            "evidence": ["ground_truth"],
            "flags": [],
        })

    junctions = []
    for point_id, degree in point_degree.items():
        pt = points_by_id[point_id]
        junctions.append({
            "id": f"j_{point_id}",
            "point": to_plan(pt),
            "type": _junction_type(degree),
            "walls": point_walls[point_id],
        })

    return {
        "schema_version": "1.0",
        "source": {
            "file_sha256": source_pdf_sha256,
            "filename": gt.get("sourcePdf") or "unknown",
            "encoding_class": "R",
            "convention_class": "single_stroke",
            "scope_class": "single",
            "router_confidence": 0.0,
        },
        "units": {
            "system": "mm" if mpp else "plan_units",
            **({"mm_per_unit": 1.0} if mpp else {}),
            "scale_confidence": 1.0 if mpp else 0.0,
            "scale_source": None,
            "scale_inliers": 0,
            "scale_outliers": 0,
        },
        "image_transform": {
            "type": "similarity",
            "matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            "source_px": [gt["imageSize"]["width"], gt["imageSize"]["height"]] if gt.get("imageSize") else [1, 1],
        },
        "walls": walls,
        "junctions": junctions,
        "rooms": [],
        "diagnostics": {
            "tier": 4,
            "unresolved": [],
            "render_agreement": {"wall_iou": 1.0, "unexplained_ink_ratio": 0.0, "hallucinated_ink_ratio": 0.0},
            "kill_log_ref": "legacy_gt_conversion",
            "pipeline_version": "convert_legacy_gt.py",
            "timings_ms": {},
            "cost_usd": 0.0,
        },
    }


def convert_all(gt_dir: Path, out_dir: Path) -> list[str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    converted = []
    for path in sorted(gt_dir.glob("*.gt.json")):
        gt = json.loads(path.read_text(encoding="utf-8"))
        if "points" not in gt or "segments" not in gt:
            continue  # skip AUTHORED-format fixtures (e.g. test_1.json) — different shape, not this corpus
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        plan = convert_one(gt, sha)
        out_name = path.stem.removesuffix(".gt") + ".json"
        (out_dir / out_name).write_text(json.dumps(plan, indent=2), encoding="utf-8")
        converted.append(out_name)
    return converted


if __name__ == "__main__":
    result = convert_all(Path("legacy/data/floorplan-gt"), Path("data/corpus/gt_provisional"))
    print(f"converted {len(result)} plans: {result}")
