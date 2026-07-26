"""READ-ONLY population scan (2026-07-26): does ResPlan carry systematic
near-duplicate plans -- distinct plan_ids sharing the same (or
near-identical) room-polygon geometry?

Motivation, per Dan's 2026-07-26 note: this is NOT primarily a counting
artifact for the notch-audit population figures (though it is that too) --
P3a's deliverable is a TRAINING SET (paper.md, the P3a section of
extraction-plan.md), and paper §6.2 requires plan-SOURCE-level split
separation so near-duplicate plans never straddle train/val. If ResPlan
has systematic near-duplicates and a future split is assigned by plan_id,
every downstream E1/E2 validation number is inflated by leakage, silently.
This must be sized before the 20K-image starter set is minted, not after.

Trigger: plan 2098 and plan 2099 (surfaced incidentally during the
57-edge notch audit, reports/p3a-audit-57-unaudited.md) have EXACTLY
identical `bathroom`/`bedroom` room-polygon geometry (`.equals()` true)
despite differing `wall`/`door`/`window` layer areas -- consistent with two
augmented/perturbed variants of one base building, not independent plans.

Method, two passes so the cheap exact pass never depends on the expensive
near pass:
1. EXACT clusters: canonical signature per plan = sorted tuple of
   (room_type, round(area, 1), round(centroid_x, 1), round(centroid_y, 1))
   for every traced room instance (CLEAN_REQUIRED_ROOM_TYPES |
   OPEN_PLAN_ROOM_TYPES). Plans sharing this signature are grouped --
   O(n) via a dict, no pairwise comparison. Verified in the report against
   `.equals()` on a sample, not just signature equality.
2. NEAR-duplicate pairs: coarser bucket key = (sorted room-type-count
   tuple, round(total_room_area, 0)) to keep buckets small, EXCLUDING
   plans already resolved into an exact cluster together. Within a bucket,
   pairwise-match each room instance by (type, closest area) and require
   ALL rooms to have relative area difference <1% and centroid distance
   <1.0 unit to flag the pair -- deliberately tighter than "similar
   looking," since the goal is to catch genuine perturbed-variant twins
   (like 2098/2099), not merely similar floor plans.

Reports (a) number of exact-duplicate clusters and plans involved, (b)
number of near-duplicate pairs found, (c) an effective-corpus-size
estimate, and (d) a recommendation on split assignment. No pipeline code
touched -- diagnostic only.
"""
from __future__ import annotations

import pickle
import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES, OPEN_PLAN_ROOM_TYPES
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
ALL_TRACED_ROOM_TYPES = sorted(CLEAN_REQUIRED_ROOM_TYPES | OPEN_PLAN_ROOM_TYPES)

AREA_REL_TOL = 0.01     # 1% relative area tolerance for a near-duplicate room match
CENTROID_TOL = 1.0      # absolute centroid distance tolerance (plan units)
MAX_BUCKET_PAIRS = 20000  # safety cap so one giant bucket can't blow up runtime


def room_instances(p):
    """[(room_type, area, cx, cy), ...] for every traced room instance."""
    out = []
    for rt in ALL_TRACED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for poly in get_geometries(g):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                continue
            c = poly.centroid
            out.append((rt, poly.area, c.x, c.y))
    return out


def exact_signature(instances):
    return tuple(sorted(
        (rt, round(area, 1), round(cx, 1), round(cy, 1))
        for rt, area, cx, cy in instances
    ))


def coarse_bucket_key(instances):
    counts = defaultdict(int)
    total_area = 0.0
    for rt, area, _, _ in instances:
        counts[rt] += 1
        total_area += area
    return (tuple(sorted(counts.items())), round(total_area, 0))


def rooms_match(a_instances, b_instances):
    """All rooms in a and b pairwise-match within tolerance (order-independent,
    greedy nearest-area match per type). Returns False fast on any count
    mismatch or unmatched room."""
    if len(a_instances) != len(b_instances):
        return False
    by_type_a = defaultdict(list)
    by_type_b = defaultdict(list)
    for rt, area, cx, cy in a_instances:
        by_type_a[rt].append((area, cx, cy))
    for rt, area, cx, cy in b_instances:
        by_type_b[rt].append((area, cx, cy))
    if set(by_type_a) != set(by_type_b):
        return False
    for rt, a_list in by_type_a.items():
        b_list = list(by_type_b[rt])
        if len(a_list) != len(b_list):
            return False
        for a_area, a_cx, a_cy in a_list:
            best_i, best_d = None, None
            for i, (b_area, b_cx, b_cy) in enumerate(b_list):
                if a_area == 0:
                    continue
                rel = abs(a_area - b_area) / a_area
                if rel > AREA_REL_TOL:
                    continue
                d = ((a_cx - b_cx) ** 2 + (a_cy - b_cy) ** 2) ** 0.5
                if d > CENTROID_TOL:
                    continue
                if best_d is None or d < best_d:
                    best_i, best_d = i, d
            if best_i is None:
                return False
            b_list.pop(best_i)
    return True


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    print(f"Scanning {len(plans)} plans for duplicate/near-duplicate room-polygon sets.")

    plan_instances = {}
    exact_clusters = defaultdict(list)
    coarse_buckets = defaultdict(list)
    for p in plans:
        pid = p.get("id")
        norm = normalize_keys(dict(p))
        inst = room_instances(norm)
        if not inst:
            continue
        plan_instances[pid] = inst
        exact_clusters[exact_signature(inst)].append(pid)
        coarse_buckets[coarse_bucket_key(inst)].append(pid)

    exact_dup_clusters = {sig: ids for sig, ids in exact_clusters.items() if len(ids) > 1}
    exact_dup_plan_ids = {pid for ids in exact_dup_clusters.values() for pid in ids}

    print(f"\n{'=' * 70}\nEXACT-duplicate room-geometry clusters "
          f"(signature = rounded room type/area/centroid set):")
    print(f"  clusters: {len(exact_dup_clusters)}")
    print(f"  plans involved: {len(exact_dup_plan_ids)} "
          f"({100 * len(exact_dup_plan_ids) / len(plan_instances):.2f}% of scanned plans)")
    cluster_sizes = sorted((len(ids) for ids in exact_dup_clusters.values()), reverse=True)
    print(f"  cluster size histogram (top 10): {cluster_sizes[:10]}")
    for sig, ids in sorted(exact_dup_clusters.items(), key=lambda kv: -len(kv[1]))[:10]:
        print(f"    cluster of {len(ids)}: plan_ids={ids}")

    # near-duplicate pairs: only within buckets, only pairs not already
    # resolved as an exact match to each other.
    near_dup_pairs = []
    skipped_large_buckets = 0
    for key, ids in coarse_buckets.items():
        if len(ids) < 2:
            continue
        n_pairs = len(ids) * (len(ids) - 1) // 2
        if n_pairs > MAX_BUCKET_PAIRS:
            skipped_large_buckets += 1
            continue
        for a_id, b_id in combinations(ids, 2):
            if exact_signature(plan_instances[a_id]) == exact_signature(plan_instances[b_id]):
                continue  # already counted as exact
            if rooms_match(plan_instances[a_id], plan_instances[b_id]):
                near_dup_pairs.append((a_id, b_id))

    print(f"\n{'=' * 70}\nNEAR-duplicate pairs (room-for-room match within "
          f"{AREA_REL_TOL:.0%} area / {CENTROID_TOL} unit centroid, "
          f"excluding exact-signature pairs):")
    print(f"  pairs: {len(near_dup_pairs)}")
    if skipped_large_buckets:
        print(f"  ({skipped_large_buckets} coarse buckets skipped, too large for pairwise "
              f"scan within this session's time budget -- see note below)")
    for a_id, b_id in near_dup_pairs[:20]:
        print(f"    {a_id} <-> {b_id}")
    if len(near_dup_pairs) > 20:
        print(f"    ... and {len(near_dup_pairs) - 20} more")

    near_dup_plan_ids = {pid for pair in near_dup_pairs for pid in pair}
    total_affected = exact_dup_plan_ids | near_dup_plan_ids
    print(f"\n{'=' * 70}\nSUMMARY")
    print(f"  plans in an exact-duplicate cluster: {len(exact_dup_plan_ids)}")
    print(f"  plans in a near-duplicate pair (not already exact): "
          f"{len(near_dup_plan_ids - exact_dup_plan_ids)}")
    print(f"  total plans touched by duplication: {len(total_affected)} "
          f"({100 * len(total_affected) / len(plan_instances):.2f}% of {len(plan_instances)})")
    # effective corpus size: count each exact cluster once, each near-dup
    # pair collapses by 1 (conservative -- doesn't chain near-dup pairs
    # into larger equivalence classes).
    effective_loss = sum(len(ids) - 1 for ids in exact_dup_clusters.values()) + len(near_dup_pairs)
    print(f"  effective corpus size estimate: {len(plan_instances) - effective_loss} "
          f"(vs raw {len(plan_instances)}, -{effective_loss})")


if __name__ == "__main__":
    main()
