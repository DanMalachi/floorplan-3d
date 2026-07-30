"""Measurement 3: GT-internal numeric noise vs tau. Pure JSON analysis --
no source ink, no calibration needed, so it covers all 15 files.

(1) Coordinate precision: decimal places actually present; evidence of
    quantization/snapping.
(2) Junction endpoint mismatch: for each junction, how far is each
    connected wall's nearest endpoint from the junction's declared point?
    Should be ~0 if the legacy tool snapped shared endpoints.
(3) Collinear-continuation flush check: for wall pairs meeting at a
    junction that run nearly straight through (angle ~180 deg between
    their outgoing directions), how far is one wall's far endpoint from
    the OTHER wall's infinite line? Should be ~0 for a straight run.
"""
import glob
import json
import math
import os
import statistics as stats
from collections import Counter
from pathlib import Path

CORPUS_GT = Path("data/corpus/gt_provisional")


def decimal_places(x: float) -> int:
    s = repr(float(x))
    if "e" in s or "E" in s:
        return 17  # scientific notation -> essentially full float precision
    if "." not in s:
        return 0
    return len(s.split(".")[1])


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def point_to_line_dist(p, a, b):
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    if L == 0:
        return math.hypot(px - ax, py - ay)
    # perpendicular distance to the INFINITE line through a,b
    return abs((px - ax) * dy - (py - ay) * dx) / L


def main():
    ids = [os.path.basename(f)[:-5] for f in sorted(glob.glob(str(CORPUS_GT / "*.json")))]

    all_decimals = []
    junction_mismatches = []  # (plan, junction_id, wall_id, dist)
    collinear_flush = []  # (plan, junction_id, wallA, wallB, dist)

    for pid in ids:
        gt = json.loads((CORPUS_GT / f"{pid}.json").read_text(encoding="utf-8"))
        walls = {w["id"]: w for w in gt["walls"]}

        for w in gt["walls"]:
            for pt in (w["start"], w["end"]):
                for c in pt:
                    all_decimals.append(decimal_places(c))

        for j in gt.get("junctions", []):
            jp = j["point"]
            wids = j["walls"]
            for wid in wids:
                w = walls.get(wid)
                if w is None:
                    continue
                d_start = dist(jp, w["start"])
                d_end = dist(jp, w["end"])
                d = min(d_start, d_end)
                junction_mismatches.append((pid, j["id"], wid, d))

            # collinear-flush check: for every pair of walls at this
            # junction whose outgoing directions are ~opposite (a straight
            # run through the junction), check far-endpoint-to-line dist.
            for i in range(len(wids)):
                for k in range(i + 1, len(wids)):
                    wa, wb = walls.get(wids[i]), walls.get(wids[k])
                    if wa is None or wb is None:
                        continue

                    def far_and_near(w):
                        d_s = dist(jp, w["start"])
                        d_e = dist(jp, w["end"])
                        return (w["start"], w["end"]) if d_e < d_s else (w["end"], w["start"])

                    far_a, near_a = far_and_near(wa)
                    far_b, near_b = far_and_near(wb)

                    def ang(p_from, p_to):
                        return math.degrees(math.atan2(p_to[1] - p_from[1], p_to[0] - p_from[0]))

                    ang_a = ang(jp, far_a)
                    ang_b = ang(jp, far_b)
                    diff = abs((ang_a - ang_b + 180) % 360 - 180)
                    if diff > 172:  # nearly opposite -> straight run through junction
                        d = point_to_line_dist(far_a, near_b, far_b)
                        collinear_flush.append((pid, j["id"], wids[i], wids[k], d))

    print("=" * 70)
    print("M3.1: coordinate decimal-place distribution (n=%d coordinate values)" % len(all_decimals))
    print("=" * 70)
    c = Counter(all_decimals)
    for k in sorted(c):
        print(f"  {k:3d} decimal places: {c[k]:5d}")
    n_round = sum(v for k, v in c.items() if k <= 1)
    print(f"  n with <=1 decimal place (suspiciously round): {n_round} / {len(all_decimals)} "
          f"({100*n_round/len(all_decimals):.1f}%)")

    print()
    print("=" * 70)
    print(f"M3.2: junction endpoint mismatch (n={len(junction_mismatches)} wall-junction pairs)")
    print("=" * 70)
    vals = [d for _, _, _, d in junction_mismatches]
    if vals:
        print(f"  median={stats.median(vals):.4f}mm  max={max(vals):.4f}mm  "
              f"mean={stats.mean(vals):.4f}mm")
        n_nonzero = sum(1 for v in vals if v > 0.01)
        print(f"  n with mismatch > 0.01mm: {n_nonzero} / {len(vals)}")
        for tau in (50.2, 73.2):
            n_bad = sum(1 for v in vals if v > tau)
            print(f"  n exceeding tau({tau}mm): {n_bad} / {len(vals)}")
        worst = sorted(junction_mismatches, key=lambda t: -t[3])[:10]
        print("  worst 10:")
        for pid, jid, wid, d in worst:
            print(f"    {pid[:40]:40s} {jid:8s} {wid:8s} {d:8.2f}mm")

    print()
    print("=" * 70)
    print(f"M3.3: collinear-continuation flush check (n={len(collinear_flush)} through-junction pairs)")
    print("=" * 70)
    vals2 = [d for _, _, _, _, d in collinear_flush]
    if vals2:
        print(f"  median={stats.median(vals2):.2f}mm  max={max(vals2):.2f}mm  mean={stats.mean(vals2):.2f}mm")
        for tau in (50.2, 73.2):
            n_bad = sum(1 for v in vals2 if v > tau)
            print(f"  n exceeding tau({tau}mm): {n_bad} / {len(vals2)}")
        worst = sorted(collinear_flush, key=lambda t: -t[4])[:10]
        print("  worst 10:")
        for pid, jid, wa, wb, d in worst:
            print(f"    {pid[:40]:40s} {jid:8s} {wa:8s}-{wb:8s} {d:8.2f}mm")


if __name__ == "__main__":
    main()
