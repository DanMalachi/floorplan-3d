"""GT-authoring converter: Inkscape SVG layers -> schema-v1 JSON
(docs/paper.md Section 6.2 item 1, docs/labeling-spec.md).

Authoring convention:
- Each Inkscape layer (<g inkscape:groupmode="layer" inkscape:label="...">)
  is one element class. Layer names matching a wall role
  (external|internal|partition_low|glazing|demising|rail|unconfirmed)
  contain wall centerlines; layer names matching an opening class
  (door|window|passage) contain opening markers drawn as a line segment
  along their host wall.
- Each element is a straight <line> or a two-point <path d="M x,y L x,y">
  — curved walls are out of scope for v1 hand-authoring.
- Wall thickness comes from the element's stroke-width (SVG units), scaled
  by the document's mm-per-unit; missing stroke-width falls back to a
  150mm default (flagged).
- Scale: the SVG root's data-mm-per-unit attribute, default 1.0 (author
  draws directly in mm-equivalent units).
- Openings are matched to the nearest wall by point-to-segment distance
  from the opening's midpoint — no explicit host reference needed, since
  Inkscape has no concept of "this line belongs to that line."

Known v1 limitation, same as convert_legacy_gt.py: rooms (wall_cycle) are
NOT authored here — output always has rooms=[]. Room-cycle authoring
needs either a dedicated "room" layer convention (polygon per room,
snapped to wall IDs) or reuse of the Phase 4 planar-face solver once it
exists; out of scope for a Phase 0 authoring tool. Portals (true absent
boundaries, see docs/labeling-spec.md Section 3) also have no
representation yet — that's a schema gap, not a converter gap.

Junctions ARE derived (unlike rooms): wall endpoints within
JUNCTION_SNAP_MM of each other are clustered into one junction, typed by
degree. This is deliberate even without room cycles — it's what catches a
hand-drawer's wall that looks connected but is actually 3mm short, which
is exactly the kind of GT error docs/paper.md §4.3.2 warns about.
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

SVG_NS = "http://www.w3.org/2000/svg"
INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"

WALL_ROLES = {"external", "internal", "partition_low", "glazing", "demising", "rail", "unconfirmed"}
OPENING_CLASSES = {"door", "window", "passage"}
DEFAULT_THICKNESS_MM = 150.0
JUNCTION_SNAP_MM = 5.0


def _svg_tag(name: str) -> str:
    return f"{{{SVG_NS}}}{name}"


def _is_layer(g: ET.Element) -> bool:
    return g.attrib.get(f"{{{INKSCAPE_NS}}}groupmode") == "layer"


def _layer_label(g: ET.Element) -> str | None:
    return g.attrib.get(f"{{{INKSCAPE_NS}}}label")


def _line_endpoints(el: ET.Element) -> tuple[tuple[float, float], tuple[float, float]] | None:
    tag = el.tag.split("}")[-1]
    if tag == "line":
        return (float(el.attrib["x1"]), float(el.attrib["y1"])), (float(el.attrib["x2"]), float(el.attrib["y2"]))
    if tag == "path":
        nums = re.findall(r"-?\d+\.?\d*", el.attrib.get("d", ""))
        if len(nums) >= 4:
            return (float(nums[0]), float(nums[1])), (float(nums[2]), float(nums[3]))
    return None

def _stroke_width_svg_units(el: ET.Element) -> float | None:
    sw = el.attrib.get("stroke-width")
    if sw is not None:
        return float(sw)
    style = el.attrib.get("style", "")
    m = re.search(r"stroke-width:\s*([\d.]+)", style)
    return float(m.group(1)) if m else None


def _point_to_segment_dist(pt: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    ax, ay = a
    bx, by = b
    px, py = pt
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _snap_endpoints_and_derive_junctions(walls: list[dict], snap_mm: float = JUNCTION_SNAP_MM) -> list[dict]:
    """Clusters wall endpoints within snap_mm of each other, then MUTATES
    each member wall's start/end to the cluster's centroid before building
    the junction list. Without the mutation, a junction would just be a
    loose label over endpoints that remain up to snap_mm apart — which
    then fails the topology validator's strict coincidence check
    (extraction/schema/validate.py EPSILON=1e-3mm) for any realistic
    hand-drawing imprecision. Snapping is what "within tolerance, treat as
    connected" has to mean."""
    endpoints = [(w, "start") for w in walls] + [(w, "end") for w in walls]
    clusters: list[list[tuple[dict, str]]] = []
    for wall, which in endpoints:
        pt = tuple(wall[which])
        for cluster in clusters:
            cx, cy = cluster[0][0][cluster[0][1]]
            if math.hypot(pt[0] - cx, pt[1] - cy) <= snap_mm:
                cluster.append((wall, which))
                break
        else:
            clusters.append([(wall, which)])

    type_by_degree = {1: "end", 2: "L", 3: "T"}
    junctions = []
    for i, cluster in enumerate(clusters):
        cx = sum(wall[which][0] for wall, which in cluster) / len(cluster)
        cy = sum(wall[which][1] for wall, which in cluster) / len(cluster)
        for wall, which in cluster:
            wall[which] = [cx, cy]
        wall_ids = sorted({wall["id"] for wall, _ in cluster})
        junctions.append({
            "id": f"j{i + 1}",
            "point": [cx, cy],
            "type": type_by_degree.get(len(cluster), "X"),
            "walls": wall_ids,
        })
    return junctions


def svg_to_schema_v1(
    svg_path: Path,
    filename: str,
    encoding_class: str = "S",
    convention_class: str = "single_stroke",
    scope_class: str = "single",
) -> dict:
    root = ET.parse(svg_path).getroot()
    mm_per_unit = float(root.attrib.get("data-mm-per-unit", "1.0"))

    walls: list[dict] = []
    wall_id_seq = 0
    opening_markers: list[tuple[str, tuple[float, float], tuple[float, float]]] = []  # (class, a, b)

    for g in root.iter(_svg_tag("g")):
        if not _is_layer(g):
            continue
        label = _layer_label(g)
        if label in WALL_ROLES:
            for el in list(g):
                pts = _line_endpoints(el)
                if pts is None:
                    continue
                a, b = pts
                sw = _stroke_width_svg_units(el)
                thickness = sw * mm_per_unit if sw is not None else DEFAULT_THICKNESS_MM
                wall_id_seq += 1
                walls.append({
                    "id": f"w{wall_id_seq}",
                    "start": [a[0] * mm_per_unit, a[1] * mm_per_unit],
                    "end": [b[0] * mm_per_unit, b[1] * mm_per_unit],
                    "thickness": thickness,
                    "curvature": 0.0,
                    "role": label,
                    "openings": [],
                    "confidence": 1.0,
                    "evidence": ["ground_truth"],
                    "flags": [] if sw is not None else ["default_thickness"],
                })
        elif label in OPENING_CLASSES:
            for el in list(g):
                pts = _line_endpoints(el)
                if pts is None:
                    continue
                a, b = pts
                opening_markers.append((label, (a[0] * mm_per_unit, a[1] * mm_per_unit), (b[0] * mm_per_unit, b[1] * mm_per_unit)))

    # Snap wall endpoints to shared junctions BEFORE projecting openings,
    # so center_offset/width are computed against final (post-snap) wall
    # geometry, not the original hand-drawn endpoints.
    junctions = _snap_endpoints_and_derive_junctions(walls)

    opening_seq = 0
    for cls, a, b in opening_markers:
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        best_wall, best_dist = None, math.inf
        for w in walls:
            d = _point_to_segment_dist(mid, tuple(w["start"]), tuple(w["end"]))
            if d < best_dist:
                best_wall, best_dist = w, d
        if best_wall is None:
            continue
        wx0, wy0 = best_wall["start"]
        wx1, wy1 = best_wall["end"]
        wall_len = math.hypot(wx1 - wx0, wy1 - wy0)
        if wall_len == 0:
            continue
        axis = ((wx1 - wx0) / wall_len, (wy1 - wy0) / wall_len)
        t_a = (a[0] - wx0) * axis[0] + (a[1] - wy0) * axis[1]
        t_b = (b[0] - wx0) * axis[0] + (b[1] - wy0) * axis[1]
        lo, hi = min(t_a, t_b), max(t_a, t_b)
        opening_seq += 1
        best_wall["openings"].append({
            "id": f"o{opening_seq}",
            "class": cls,
            "center_offset": (lo + hi) / 2,
            "width": hi - lo,
            "sill_height": None,
            "head_height": None,
            "swing": None,
            "confidence": 1.0,
            "evidence": ["ground_truth"],
            "flags": [],
        })

    xs = [c for w in walls for c in (w["start"][0], w["end"][0])]
    ys = [c for w in walls for c in (w["start"][1], w["end"][1])]

    return {
        "schema_version": "1.0",
        "source": {
            "file_sha256": "0" * 64,
            "filename": filename,
            "encoding_class": encoding_class,
            "convention_class": convention_class,
            "scope_class": scope_class,
            "router_confidence": 1.0,
        },
        "units": {
            "system": "mm",
            "mm_per_unit": 1.0,
            "scale_confidence": 1.0,
            "scale_source": None,
            "scale_inliers": 0,
            "scale_outliers": 0,
        },
        "image_transform": {
            "type": "similarity",
            "matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            "source_px": [int(max(xs, default=1)), int(max(ys, default=1))],
        },
        "walls": walls,
        "junctions": junctions,
        "rooms": [],  # not authored in v1 — see module docstring
        "diagnostics": {
            "tier": 4,
            "unresolved": [],
            "render_agreement": {"wall_iou": 1.0, "unexplained_ink_ratio": 0.0, "hallucinated_ink_ratio": 0.0},
            "kill_log_ref": "svg_gt_authoring",
            "pipeline_version": "svg_gt.py",
            "timings_ms": {},
            "cost_usd": 0.0,
        },
    }
