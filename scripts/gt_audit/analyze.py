"""Phase-0 GT audit: aggregate measurements.json into M1 (convention) and
M2 (thickness distribution) statistics."""
import json
import statistics as stats
from pathlib import Path

OUT = Path(__file__).resolve().parent / "_out"
data = json.loads((OUT / "measurements.json").read_text(encoding="utf-8"))


def classify(d_neg, d_pos, near_thresh=30.0, ratio_thresh=3.0):
    """Classify a wall's (d_neg, d_pos) pair.
    near_thresh: below this (mm) counts as "at an edge" for the smaller side.
    ratio_thresh: far/near ratio above this counts as clearly asymmetric.
    """
    if d_neg is None or d_pos is None:
        return "incomplete"
    near, far = min(d_neg, d_pos), max(d_neg, d_pos)
    if near <= near_thresh and far > near_thresh:
        return "edge"
    if near > near_thresh and far / near < ratio_thresh:
        return "centerline"
    if near > near_thresh and far / near >= ratio_thresh:
        return "asymmetric_other"  # both offset from 0, but not clearly centered
    return "both_near_zero"  # both < near_thresh: GT essentially on a corner/thin feature


rows = []
per_plan = {}
for pid, entry in data.items():
    if not entry.get("calibration_reliable"):
        continue
    plan_rows = []
    for w in entry["walls"]:
        d_neg, d_pos = w["d_neg"], w["d_pos"]
        cls = classify(d_neg, d_pos)
        # M2 thickness: prefer sum of both sides; fallback to far-edge span
        # when one side found nothing within window (whole wall on one side).
        thickness = None
        thickness_method = None
        if d_neg is not None and d_pos is not None:
            thickness = d_neg + d_pos
            thickness_method = "sum"
        elif d_neg is not None and w["d_neg_far"] is not None and w["d_neg_on_ink"] is False:
            thickness = w["d_neg_far"] - d_neg
            thickness_method = "neg_span"
        elif d_pos is not None and w["d_pos_far"] is not None and w["d_pos_on_ink"] is False:
            thickness = w["d_pos_far"] - d_pos
            thickness_method = "pos_span"
        row = {
            "plan": pid, "wall": w["id"], "length": w["length_mm"],
            "d_neg": d_neg, "d_pos": d_pos, "class": cls,
            "thickness": thickness, "thickness_method": thickness_method,
            "cover0": w["cover_at_zero"],
        }
        rows.append(row)
        plan_rows.append(row)
    per_plan[pid] = plan_rows

print("=" * 70)
print("MEASUREMENT 1: convention classification (population: %d walls, %d plans)" % (
    len(rows), len(per_plan)))
print("=" * 70)
from collections import Counter
counts = Counter(r["class"] for r in rows)
total = len(rows)
for k in ["centerline", "edge", "asymmetric_other", "both_near_zero", "incomplete"]:
    print(f"  {k:20s} {counts.get(k,0):4d}  ({100*counts.get(k,0)/total:5.1f}%)")

print()
print("Per-plan breakdown (near_thresh=30mm, ratio_thresh=3.0):")
print(f"{'plan':55s} {'n':>4s} {'center':>7s} {'edge':>6s} {'asym':>6s} {'~0/0':>6s} {'incpl':>6s}")
for pid, plan_rows in per_plan.items():
    c = Counter(r["class"] for r in plan_rows)
    n = len(plan_rows)
    print(f"{pid[:55]:55s} {n:4d} {c.get('centerline',0):7d} {c.get('edge',0):6d} "
          f"{c.get('asymmetric_other',0):6d} {c.get('both_near_zero',0):6d} {c.get('incomplete',0):6d}")

print()
print("=" * 70)
print("MEASUREMENT 2: thickness distribution (mm)")
print("=" * 70)
thick_vals = [r["thickness"] for r in rows if r["thickness"] is not None and 0 < r["thickness"] < 600]
excluded = [r["thickness"] for r in rows if r["thickness"] is not None and (r["thickness"] <= 0 or r["thickness"] >= 600)]
print(f"n with a thickness estimate: {len(thick_vals) + len(excluded)} / {total}")
print(f"n excluded as implausible (<=0 or >=600mm, likely contamination): {len(excluded)}")
print(f"n used: {len(thick_vals)}")
if thick_vals:
    print(f"median: {stats.median(thick_vals):.1f}")
    qs = stats.quantiles(thick_vals, n=4)
    print(f"Q1: {qs[0]:.1f}  Q3: {qs[2]:.1f}  IQR: {qs[2]-qs[0]:.1f}")
    print(f"mean: {stats.mean(thick_vals):.1f}  stdev: {stats.pstdev(thick_vals):.1f}")
    print(f"min: {min(thick_vals):.1f}  max: {max(thick_vals):.1f}")
    # histogram
    buckets = [0, 50, 100, 150, 200, 250, 300, 400, 600]
    hist = Counter()
    for v in thick_vals:
        for i in range(len(buckets) - 1):
            if buckets[i] <= v < buckets[i + 1]:
                hist[f"{buckets[i]}-{buckets[i+1]}"] += 1
                break
    for k in sorted(hist, key=lambda s: int(s.split('-')[0])):
        print(f"  {k:10s} {hist[k]:4d}  {'#'*(hist[k]//2)}")
    # fraction mis-located by constant 150 beyond tau
    for tau in (50.2, 73.2):
        n_bad = sum(1 for v in thick_vals if abs(v - 150.0) / 2 > tau)
        print(f"  fraction where |true_thickness-150|/2 > tau({tau}mm): "
              f"{n_bad}/{len(thick_vals)} = {100*n_bad/len(thick_vals):.1f}%")

print()
print("Per-plan thickness median:")
for pid, plan_rows in per_plan.items():
    vals = [r["thickness"] for r in plan_rows if r["thickness"] is not None and 0 < r["thickness"] < 600]
    if vals:
        print(f"  {pid[:55]:55s} n={len(vals):3d} median={stats.median(vals):6.1f} "
              f"IQR=[{stats.quantiles(vals,n=4)[0]:.0f},{stats.quantiles(vals,n=4)[2]:.0f}]")
    else:
        print(f"  {pid[:55]:55s} n=0")

(OUT / "rows.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
