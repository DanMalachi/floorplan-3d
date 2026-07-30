"""Characterize the M1 'incomplete' bucket (315/529 walls, 59.5%) against
the classified set, to answer: is the 14% unachievable-by-construction
figure a good estimate or an underestimate, given it was computed only on
the ~40% of walls that got a clean reading?

Diagnostic-only widened search (explicitly NOT used for M1/M2's official
numbers): re-measures every wall at v_max=2000mm just to characterize how
far the nearest ink actually is for currently-incomplete walls.
"""
import json
import statistics as stats
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.gt_audit.calibrate import calibrate, load_gt
from scripts.gt_audit.measure_wall import measure_wall

OUT = Path(__file__).resolve().parent / "_out"
rows = json.loads((OUT / "rows.json").read_text(encoding="utf-8"))
meas = json.loads((OUT / "measurements.json").read_text(encoding="utf-8"))

# rebuild wall dicts (start/end/openings) keyed by (plan, wall_id) since
# rows.json doesn't carry geometry -- need it for boundary/opening tests.
gt_cache = {}
wall_geom = {}
for r in rows:
    pid = r["plan"]
    if pid not in gt_cache:
        gt_cache[pid] = load_gt(pid)
    gt = gt_cache[pid]
    for w in gt["walls"]:
        wall_geom[(pid, w["id"])] = w

# plan bbox per plan (for boundary-touching test)
plan_bbox = {}
for pid, gt in gt_cache.items():
    xs = [pt[0] for w in gt["walls"] for pt in (w["start"], w["end"])]
    ys = [pt[1] for w in gt["walls"] for pt in (w["start"], w["end"])]
    plan_bbox[pid] = (min(xs), min(ys), max(xs), max(ys))


def touches_boundary(pid, w, tol=50.0):
    x0, y0, x1, y1 = plan_bbox[pid]
    for pt in (w["start"], w["end"]):
        if abs(pt[0] - x0) < tol or abs(pt[0] - x1) < tol or abs(pt[1] - y0) < tol or abs(pt[1] - y1) < tol:
            return True
    return False


print("=" * 70)
print("CENSORING CHARACTERIZATION: incomplete (n=%d) vs classified (n=%d)" % (
    sum(1 for r in rows if r["class"] == "incomplete"),
    sum(1 for r in rows if r["class"] != "incomplete"),
))
print("=" * 70)

incomplete = [r for r in rows if r["class"] == "incomplete"]
classified = [r for r in rows if r["class"] != "incomplete"]

# 1. length
print("\n[1] Wall length (mm)")
print(f"  incomplete: median={stats.median(r['length'] for r in incomplete):.0f}")
print(f"  classified: median={stats.median(r['length'] for r in classified):.0f}")

# 2. per-plan incomplete rate
print("\n[2] Per-plan incomplete rate")
by_plan = {}
for r in rows:
    by_plan.setdefault(r["plan"], []).append(r)
for pid, rs in by_plan.items():
    n_inc = sum(1 for r in rs if r["class"] == "incomplete")
    print(f"  {pid[:50]:50s} {n_inc:3d}/{len(rs):3d} = {100*n_inc/len(rs):5.1f}%")

# 3. per-convention_class incomplete rate
import csv
reg = {}
with open("eval/registry/registry.csv", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        reg[row["plan_id"]] = row
print("\n[3] Per-convention_class incomplete rate")
by_conv = {}
for r in rows:
    c = reg[r["plan"]]["convention_class"]
    by_conv.setdefault(c, []).append(r)
for c, rs in by_conv.items():
    n_inc = sum(1 for r in rs if r["class"] == "incomplete")
    print(f"  {c:15s} {n_inc:3d}/{len(rs):3d} = {100*n_inc/len(rs):5.1f}%")

# 4. openings proximity: does a wall having openings correlate with incomplete?
print("\n[4] Walls WITH openings vs WITHOUT: incomplete rate")
has_op, no_op = [], []
for r in rows:
    w = wall_geom[(r["plan"], r["wall"])]
    (has_op if w.get("openings") else no_op).append(r)
for label, rs in [("has openings", has_op), ("no openings", no_op)]:
    n_inc = sum(1 for r in rs if r["class"] == "incomplete")
    print(f"  {label:15s} {n_inc:3d}/{len(rs):3d} = {100*n_inc/len(rs):5.1f}%")

# 5. boundary-touching (proxy for exterior wall) vs interior: incomplete rate
print("\n[5] Boundary-touching (likely exterior) vs interior: incomplete rate")
boundary, interior = [], []
for r in rows:
    w = wall_geom[(r["plan"], r["wall"])]
    (boundary if touches_boundary(r["plan"], w) else interior).append(r)
for label, rs in [("boundary-touching", boundary), ("interior", interior)]:
    n_inc = sum(1 for r in rs if r["class"] == "incomplete")
    print(f"  {label:20s} {n_inc:3d}/{len(rs):3d} = {100*n_inc/len(rs):5.1f}%")

# 6. widened search (diagnostic only) for currently-incomplete walls:
#    how far away is the nearest ink actually, at v_max=2000mm?
print("\n[6] Diagnostic-only widened search (v_max=2000mm) for incomplete walls")
print("    (NOT used for M1/M2 -- characterizing censoring only)")
calibs = {}
resolved_near, resolved_far, still_none = [], [], 0
by_plan_incomplete = {}
for r in incomplete:
    by_plan_incomplete.setdefault(r["plan"], []).append(r)

for pid, rs in by_plan_incomplete.items():
    if pid not in calibs:
        calibs[pid] = calibrate(pid)
    calib, mask, gray = calibs[pid]
    for r in rs:
        w = wall_geom[(pid, r["wall"])]
        m = measure_wall(calib, mask, w, v_max=2000.0)
        vals = [v for v in (m.d_neg, m.d_pos) if v is not None]
        if not vals:
            still_none += 1
        else:
            resolved_near.append(min(vals))
            if len(vals) == 2:
                resolved_far.append(max(vals))

n_total_incomplete = len(incomplete)
print(f"  still both-None even at 2000mm: {still_none}/{n_total_incomplete} "
      f"({100*still_none/n_total_incomplete:.1f}%)")
print(f"  resolved at least one side within 2000mm: {n_total_incomplete-still_none}/{n_total_incomplete}")
if resolved_near:
    print(f"  distance to nearest resolved side: median={stats.median(resolved_near):.0f}mm, "
          f"90th pct={sorted(resolved_near)[int(0.9*len(resolved_near))]:.0f}mm, "
          f"max={max(resolved_near):.0f}mm")
    n_beyond_400 = sum(1 for v in resolved_near if v > 400)
    print(f"  of these, n where nearest ink was beyond the original 400mm window: "
          f"{n_beyond_400}/{len(resolved_near)}")

with open(OUT / "censoring_boundary_flags.json", "w", encoding="utf-8") as f:
    json.dump({
        "boundary_wall_keys": [f"{r['plan']}::{r['wall']}" for r in boundary],
    }, f, indent=1)
