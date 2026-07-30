"""Bathroom lever #2, path 1 -- sharpened and capped mixture test
(2026-07-30, 3rd session). One measurement, pre-committed branches (see
reports/p3a-offset-bimodality.md), then P3a leaves bathroom's
area_match_near_miss mechanism alone for good either way, per Dan's
explicit instruction -- four days on this defect class is enough.

Background: EMPIRICAL_FACE_OFFSET_MULTIPLIER (rooms.py:166, k=0.838,
stdev=0.94, residual sigma=0.417) was fit 2026-07-20 as a SINGLE
population from 107,608 per-wall offset measurements / 800 plans and
called "real variability in ResPlan's authoring process." A spread larger
than the central value, with two candidate models (fixed constant vs
multiplier-on-half-thickness) scoring within 3% residual of each other, is
ALSO the signature of a MIXTURE of two authoring conventions fit as one
population. Nobody tested which, because k=0.838 was fit as a single
population from the start. `reports/p3a-bathroom-lever2-census.md`
(2026-07-30, 2nd) found this same residual noise is the dominant mechanism
behind 88.2% of bathroom's isolated-broken population (3,467/3,932 plans,
`area_match_near_miss`) -- if it's a mixture, it's separable and a real
lever; if it's noise, it's the permanent limitation the 2026-07-20 session
already concluded it was.

DISMISSED before running anything further (per instruction): the lead's
suspicion that EMPIRICAL_FACE_OFFSET_MULTIPLIER shares a root with Phase
2's fabricated GT wall thickness (all 650 provisional GT walls exactly
150.0mm). Checked: rooms.py:150-166 documents calibration against REAL
ResPlan source polygons, 107,608 direct per-wall perpendicular casts --
a completely different dataset from Phase 2's placeholder GT. Not related,
not pursued further here.

HARD PROHIBITIONS: this script never edits EMPIRICAL_FACE_OFFSET_MULTIPLIER
on disk, never widens area_match_tolerance, never touches
assemble_rooms/check_plan/resplan_convert.py, and never builds a per-mode
lever even if the measurement comes back positive. The "recompute
face-polygon area under a candidate mode multiplier" step (multimodal
branch only) is an IN-PROCESS SIMULATION: it monkeypatches
`rooms.EMPIRICAL_FACE_OFFSET_MULTIPLIER` for the duration of one
`_mitered_face_polygon` call inside this process, then restores it -- the
committed file is never touched, matching this phase's own
diagnose-before-build precedent (e.g. `diagnose_notch_area_fraction.py`
sizing option C before it was built).

Method, whole population, never the plans that suggested a mode:
  1. Re-measure the SAME 800-plan calibration population
     `calibrate_offset.py` used (`measure_wall_offsets`, REUSED UNCHANGED),
     tagging each row with plan_id/room_key (the predecessor script
     discarded both, it only needed pooled summary statistics). Fine
     histogram + a formal bimodality read (Sarle's bimodality coefficient,
     BC > 5/9 flags non-unimodal; KDE peak count, prominence-filtered) on
     both the pooled per-wall distribution AND the per-PLAN median-ratio
     distribution (>=5 measurements/plan) -- the per-plan one is what
     actually tests the per-authoring-batch mixture hypothesis, not the
     pooled one.
  2. Separately (full 17K scan, unavoidable -- this is the population
     definition), re-derive the exact 3,467 `area_match_near_miss` bathroom
     rooms (`size_bathroom_lever2_census._is_isolated_bathroom` +
     `diagnose_cycle_unrepairable.analyze_plan`, BOTH REUSED UNCHANGED),
     and measure each one's own per-wall offset ratios against its own
     already-repaired wall_cycle (same `measure_wall_offsets`, same
     function, unchanged) -- these rooms passed stage-1 and
     stage-2-connectivity, only failed the area gate, so they have a real
     repaired cycle to measure against. Also keep the `area_err_pct` each
     one already carries (`diagnose_cycle_unrepairable`'s own output,
     reused, not re-derived).
  3. Branch, decided by step 1's read alone (the calibration population,
     not the near-miss one, is what determines whether a mixture exists):
     MULTIMODAL with a material split (each mode >=10% of pooled mass):
       cluster mode centers at the KDE valley between the two largest
       peaks, assign each near-miss room to the nearer mode using ITS OWN
       measured ratio (diagnostic assignment -- flagged as a caveat, since
       a real lever would need an assignment signal that doesn't depend on
       the room's own failing measurement), simulate that room's
       face-polygon area under the MODE CENTER multiplier (never the
       room's own exact fit -- avoids circularity), check against the
       EXISTING, UNCHANGED 5% tolerance. Ceiling = fraction that would
       newly pass.
     UNIMODAL (or a trivial split): report the residual sigma and bucket
       the 3,467 rooms' own ACTUAL `area_err_pct` (already known, not
       re-derived) by how many multiples of that same population's own
       area-error spread they sit beyond the 5% gate -- the honest upper
       bound on any tolerance-side work.

CLI: python -m extraction.synth.qa.measure_offset_bimodality [stage] [workers]
  stage: "calibration" (step 1 only, fast), "nearmiss" (step 2 only, full
  17K scan, slow), or "both" (default).
"""
from __future__ import annotations

import pickle
import statistics
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import numpy as np
from scipy import stats as spstats
from scipy.signal import argrelextrema

from extraction.synth import rooms as rooms_module
from extraction.synth.qa.calibrate_offset import measure_wall_offsets
from extraction.synth.qa.diagnose_area_gap import assemble_one_room_cycle
from extraction.synth.qa.diagnose_cycle_unrepairable import AREA_MATCH_TOLERANCE
from extraction.synth.qa.diagnose_cycle_unrepairable import analyze_plan as stage2_analyze_plan
from extraction.synth.qa.size_bathroom_lever2_census import _is_isolated_bathroom
from extraction.synth.rooms import (
    ROOM_LABEL_MAP,
    _build_adjacency,
    _mitered_face_polygon,
    _repair_connectivity,
)
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
CAL_RESULTS_PATH = Path(__file__).resolve().parent / "_offset_bimodality_calibration.pkl"
NM_RESULTS_PATH = Path(__file__).resolve().parent / "_offset_bimodality_nearmiss.pkl"
CALIBRATION_FACTOR = 0.468  # calibrate_lever1_prediction.py, 2026-07-29 -- reported separately, never folded in


def bimodality_coefficient(x: np.ndarray) -> float:
    """Sarle's bimodality coefficient. BC > 5/9 (~0.555) is the standard
    flag for a non-unimodal (bimodal/multimodal) distribution."""
    n = len(x)
    if n < 4:
        return float("nan")
    g = spstats.skew(x)
    k = spstats.kurtosis(x, fisher=True)  # excess kurtosis
    return (g ** 2 + 1) / (k + 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)))


def kde_peaks(x: np.ndarray, grid_n: int = 512, prominence_frac: float = 0.05):
    """KDE-based mode count. Returns (n_peaks, grid, density, peak_indices).
    A peak must be at least prominence_frac of the max density to count --
    filters noise-driven micro-bumps, not a claim about true peak height."""
    kde = spstats.gaussian_kde(x)
    lo, hi = x.min(), x.max()
    pad = 0.05 * (hi - lo) if hi > lo else 1.0
    grid = np.linspace(lo - pad, hi + pad, grid_n)
    density = kde(grid)
    (idx,) = argrelextrema(density, np.greater)
    threshold = prominence_frac * density.max()
    peak_idx = [i for i in idx if density[i] >= threshold]
    return len(peak_idx), grid, density, peak_idx


def print_histogram(x: np.ndarray, label: str, n_bins: int = 40) -> None:
    counts, edges = np.histogram(x, bins=n_bins)
    max_c = counts.max() if len(counts) else 1
    print(f"\n{label} -- fine histogram ({n_bins} bins, n={len(x)}):")
    for c, lo, hi in zip(counts, edges[:-1], edges[1:]):
        bar = "#" * int(40 * c / max_c) if max_c else ""
        print(f"  [{lo:6.3f},{hi:6.3f}) {c:6d} {bar}")


def run_calibration_stage(n_plans: int = 800) -> list[tuple]:
    """Reuses measure_wall_offsets (calibrate_offset.py, UNCHANGED). Adds
    plan_id/room_key tagging the predecessor script discarded. Same 800-plan
    population, same method, matching the original 2026-07-20 calibration
    exactly so this is a like-for-like re-derivation, not a new dataset."""
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    rows = []  # (plan_id, room_key, wall_id, offset, thickness)
    t0 = time.time()
    for pi, p in enumerate(plans[:n_plans]):
        raw_id = p.get("id")
        p = normalize_keys(p)
        wall_depth = float(p.get("wall_depth") or 4.0)
        filled = fill_openings_into_wall(p["wall"], p.get("door"), p.get("window"), p.get("front_door"))
        skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=p["wall"])
        segments = skel.segments
        if not segments:
            continue
        adjacency = _build_adjacency(segments, 0.1)

        for rt in ROOM_LABEL_MAP:
            g = p.get(rt)
            if g is None:
                continue
            for inst_idx, poly in enumerate(get_geometries(g)):
                if poly.geom_type != "Polygon" or poly.is_empty:
                    continue
                wall_seq = assemble_one_room_cycle(segments, poly)
                if wall_seq is None:
                    continue
                repaired = _repair_connectivity(wall_seq, adjacency, 3)
                if repaired is None:
                    continue
                cast_len = max(wall_depth * 4, 15.0)
                exclude_radius = wall_depth
                room_key = f"{rt}_{inst_idx}"
                for wid in set(repaired):
                    seg = segments[wid]
                    offs = measure_wall_offsets(
                        seg, poly, (poly.centroid.x, poly.centroid.y), exclude_radius, cast_len
                    )
                    for d in offs:
                        rows.append((raw_id, room_key, wid, d, seg.thickness))
        if (pi + 1) % 200 == 0:
            print(f"  ...calibration scan {pi + 1}/{n_plans} ({time.time() - t0:.0f}s)", file=sys.stderr)

    print(f"Calibration stage: {len(rows)} measurements across {n_plans} plans ({time.time() - t0:.0f}s)")
    return rows


def _nearmiss_one(raw_plan: dict) -> list[dict]:
    """Returns one dict per area_match_near_miss bathroom room in this plan
    (empty if the plan isn't in the isolated-bathroom-broken population, or
    has no such room)."""
    if not _is_isolated_bathroom(raw_plan):
        return []
    stage2_rooms = [
        r for r in stage2_analyze_plan(raw_plan)
        if r["room"].startswith("bathroom_")
        and r["failure_type"] == "area_match"
        and r["primary_category"] == "area_match_near_miss"
    ]
    if not stage2_rooms:
        return []

    p = normalize_keys(dict(raw_plan))
    wall_depth = float(p.get("wall_depth") or 4.0)
    wall_geom = p.get("wall")
    if wall_geom is None or wall_geom.is_empty:
        return []
    filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=wall_geom)
    segments = skel.segments
    if not segments:
        return []

    out = []
    for r in stage2_rooms:
        inst_idx = int(r["room"].rsplit("_", 1)[1])
        g = p.get("bathroom")
        polys = get_geometries(g) if g is not None else []
        if inst_idx >= len(polys):
            continue
        poly = polys[inst_idx]
        wall_ids = [int(w[1:]) for w in r["wall_cycle"]]
        cast_len = max(wall_depth * 4, 15.0)
        exclude_radius = wall_depth
        own_ratios = []
        for wid in set(wall_ids):
            if wid >= len(segments):
                continue
            seg = segments[wid]
            offs = measure_wall_offsets(seg, poly, (poly.centroid.x, poly.centroid.y), exclude_radius, cast_len)
            for d in offs:
                if seg.thickness > 0:
                    own_ratios.append(d / (seg.thickness / 2))
        out.append(
            dict(
                resplan_id=raw_plan.get("id"),
                room=r["room"],
                wall_ids=wall_ids,
                own_ratios=own_ratios,
                area_err_pct=r["area_err_pct"],
                source_area=r["source_area"],
                implied_area=r["implied_area"],
                centroid=(poly.centroid.x, poly.centroid.y),
            )
        )
    return out


def run_nearmiss_stage(workers: int = 8) -> list[dict]:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    n_total = len(plans)
    t0 = time.time()
    results = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, out in enumerate(ex.map(_nearmiss_one, plans, chunksize=32)):
            results.extend(out)
            if (i + 1) % 2000 == 0:
                print(f"  ...nearmiss scan {i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    print(f"Near-miss stage: {len(results)} area_match_near_miss bathroom rooms found ({time.time() - t0:.0f}s)")
    return results


def _simulate_mode_area(raw_plan: dict, room: dict, mode_k: float) -> float | None:
    """IN-PROCESS SIMULATION ONLY -- monkeypatches
    rooms.EMPIRICAL_FACE_OFFSET_MULTIPLIER for one _mitered_face_polygon
    call, then restores it. The committed constant on disk is never
    touched. Returns the simulated area error pct, or None if the face
    polygon degenerates."""
    original = rooms_module.EMPIRICAL_FACE_OFFSET_MULTIPLIER
    try:
        rooms_module.EMPIRICAL_FACE_OFFSET_MULTIPLIER = mode_k
        p = normalize_keys(dict(raw_plan))
        wall_depth = float(p.get("wall_depth") or 4.0)
        wall_geom = p.get("wall")
        filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
        skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=wall_geom)
        segments = skel.segments
        face_poly = _mitered_face_polygon(room["wall_ids"], segments, room["centroid"])
        implied_area = face_poly.area if face_poly is not None else 0.0
        if implied_area <= 0:
            return None
        return 100 * abs(implied_area - room["source_area"]) / max(room["source_area"], 1e-9)
    finally:
        rooms_module.EMPIRICAL_FACE_OFFSET_MULTIPLIER = original


def main(stage: str = "both", workers: int = 8) -> None:
    if stage in ("calibration", "both"):
        rows = run_calibration_stage()
        with open(CAL_RESULTS_PATH, "wb") as f:
            pickle.dump(rows, f)
    else:
        with open(CAL_RESULTS_PATH, "rb") as f:
            rows = pickle.load(f)

    ratios_raw = np.array([d / (t / 2) for _, _, _, d, t in rows if t > 0])
    print(f"\n{'=' * 70}\n1a. POOLED per-wall offset-ratio distribution (n={len(ratios_raw)})")
    print(f"  mean={ratios_raw.mean():.4f} median={np.median(ratios_raw):.4f} stdev={ratios_raw.std():.4f}")
    print_histogram(ratios_raw, "Pooled per-wall ratio, UNFILTERED (40 bins across the full range -- "
                                "note this crushes 99%+ of the mass into bin 1 if long-tail outliers exist)")

    # BC and KDE are both outlier-sensitive (kurtosis especially). A long
    # right tail from a handful of degenerate ray-casts (a ray hitting a
    # distant, unrelated wall) can manufacture or mask apparent modes.
    # Filter to a physically-plausible bulk range (ratio <= 3, i.e. within
    # 3 half-thicknesses -- anything beyond is not a plausible authored
    # offset) before the FORMAL read, and report how much was dropped so
    # the read stays honest about what it excluded.
    ratios = ratios_raw[ratios_raw <= 3.0]
    n_dropped = len(ratios_raw) - len(ratios)
    print(f"\n  Outlier filter for the FORMAL bimodality read: keeping ratio<=3.0 "
          f"({len(ratios)}/{len(ratios_raw)}, dropped {n_dropped} = {100*n_dropped/len(ratios_raw):.2f}% "
          f"as implausible ray-cast artifacts, not real signal)")
    bc_pooled = bimodality_coefficient(ratios)
    n_peaks_pooled, grid_p, dens_p, pk_p = kde_peaks(ratios)
    print(f"  Bimodality coefficient (bulk-filtered): {bc_pooled:.4f} (>0.5556 flags non-unimodal -- "
          f"treat as a soft signal, not a hard cutoff, see the histogram below for the decisive read)")
    print(f"  KDE peak count (>=5% max density): {n_peaks_pooled} at ratio={[round(grid_p[i],3) for i in pk_p]}")
    print_histogram(ratios, "Pooled per-wall ratio, BULK-FILTERED (ratio<=3.0, fine bins)", n_bins=60)

    plan_medians = {}
    for pid, room_key, wid, d, t in rows:
        if t > 0:
            plan_medians.setdefault(pid, []).append(d / (t / 2))
    per_plan_median = np.array([statistics.median(v) for v in plan_medians.values() if len(v) >= 5])
    print(f"\n{'=' * 70}\n1b. PER-PLAN median offset-ratio distribution "
          f"(n={len(per_plan_median)} plans with >=5 measurements)")
    if len(per_plan_median) >= 4:
        print(f"  mean={per_plan_median.mean():.4f} median={np.median(per_plan_median):.4f} "
              f"stdev={per_plan_median.std():.4f}")
        bc_plan = bimodality_coefficient(per_plan_median)
        n_peaks_plan, grid_pp, dens_pp, pk_pp = kde_peaks(per_plan_median)
        print(f"  Bimodality coefficient: {bc_plan:.4f} (>0.5556 flags non-unimodal)")
        print(f"  KDE peak count (>=5% max density): {n_peaks_plan} at ratio={[round(grid_pp[i],3) for i in pk_pp]}")
        print_histogram(per_plan_median, "Per-plan median ratio")
    else:
        bc_plan, n_peaks_plan = float("nan"), 0
        print("  too few plans with >=5 measurements -- skipped")

    multimodal = (bc_pooled > 5 / 9 and n_peaks_pooled >= 2) or (bc_plan > 5 / 9 and n_peaks_plan >= 2)
    print(f"\n{'=' * 70}\nBRANCH DECISION (from calibration population alone, per pre-registration): "
          f"{'MULTIMODAL' if multimodal else 'UNIMODAL'}")

    if stage in ("nearmiss", "both"):
        nm = run_nearmiss_stage(workers)
        with open(NM_RESULTS_PATH, "wb") as f:
            pickle.dump(nm, f)
    else:
        with open(NM_RESULTS_PATH, "rb") as f:
            nm = pickle.load(f)

    print(f"\n{'=' * 70}\n2. Near-miss population: {len(nm)} area_match_near_miss bathroom rooms")
    area_errs = np.array([r["area_err_pct"] for r in nm])
    print(f"  area_err_pct: mean={area_errs.mean():.2f} median={np.median(area_errs):.2f} "
          f"stdev={area_errs.std():.2f} min={area_errs.min():.2f} max={area_errs.max():.2f}")

    if multimodal:
        # Valley between the two largest pooled peaks -> mode centers.
        peak_vals = sorted(grid_p[i] for i in pk_p)
        if len(peak_vals) < 2:
            print("  WARNING: multimodal flagged but <2 KDE peaks found on pooled data -- treating as trivial split")
            multimodal = False
        else:
            k_low, k_high = peak_vals[0], peak_vals[-1]
            print(f"\n{'=' * 70}\n3. MULTIMODAL branch: mode centers k_low={k_low:.3f} k_high={k_high:.3f}")
            n_low = sum(1 for r in ratios if abs(r - k_low) < abs(r - k_high))
            n_total_pooled = len(ratios)
            print(f"  pooled-mass split: low-mode {n_low}/{n_total_pooled} "
                  f"({100*n_low/n_total_pooled:.1f}%), high-mode {n_total_pooled - n_low}/{n_total_pooled} "
                  f"({100*(n_total_pooled-n_low)/n_total_pooled:.1f}%)")
            if min(n_low, n_total_pooled - n_low) / n_total_pooled < 0.10:
                print("  split is TRIVIAL (<10% in minority mode) -- treating as effectively unimodal per pre-registration")
                multimodal = False

    if multimodal:
        needed_ids = {r["resplan_id"] for r in nm}
        with open(PKL_PATH, "rb") as f:
            plans_by_id = {p.get("id"): p for p in pickle.load(f) if p.get("id") in needed_ids}
        n_clear = 0
        n_simulated = 0
        room_cleared_by_plan: dict = {}
        for r in nm:
            pid = r["resplan_id"]
            room_cleared_by_plan.setdefault(pid, [])
            if not r["own_ratios"]:
                room_cleared_by_plan[pid].append(False)
                continue
            own_median = statistics.median(r["own_ratios"])
            mode_k = k_low if abs(own_median - k_low) < abs(own_median - k_high) else k_high
            raw_plan = plans_by_id.get(pid)
            if raw_plan is None:
                room_cleared_by_plan[pid].append(False)
                continue
            simulated_err = _simulate_mode_area(raw_plan, r, mode_k)
            n_simulated += 1
            cleared = simulated_err is not None and simulated_err <= AREA_MATCH_TOLERANCE * 100
            room_cleared_by_plan[pid].append(cleared)
            if cleared:
                n_clear += 1
        n_plan_clear = sum(1 for cs in room_cleared_by_plan.values() if all(cs))
        n_unique_plans = len(room_cleared_by_plan)
        print(f"\n{'=' * 70}\nMULTIMODAL CEILING (room-level, informational only -- a plan needs EVERY "
              f"bathroom room in it to clear, see plan-level below): "
              f"{n_clear}/{len(nm)} area_match_near_miss bathroom rooms "
              f"({100*n_clear/len(nm):.1f}% of {len(nm)}, {n_simulated} successfully simulated)")
        print(f"MULTIMODAL CEILING (PLAN-level, the number that matters -- ALL bathroom near-miss "
              f"rooms in the plan must clear): {n_plan_clear}/{n_unique_plans} unique plans "
              f"({100*n_plan_clear/n_unique_plans:.2f}%), or {n_plan_clear}/3932 "
              f"({100*n_plan_clear/3932:.2f}%) of the full bathroom-ONLY-broken population")
        print(f"CALIBRATED (0.468 factor, reported SEPARATELY per instruction, never folded into "
              f"the raw ceiling above): {n_plan_clear} x {CALIBRATION_FACTOR} = "
              f"{n_plan_clear * CALIBRATION_FACTOR:.1f} plans "
              f"({100 * n_plan_clear * CALIBRATION_FACTOR / 3932:.2f}% of the 3,932-plan population)")
    else:
        print(f"\n{'=' * 70}\n3. UNIMODAL (or trivial-split) branch: bucketing near-miss population's "
              f"own area_err_pct by multiples of ITS OWN spread beyond the 5% gate")
        excess = area_errs - 5.0
        sigma = excess.std()
        mean_excess = excess.mean()
        print(f"  excess-over-5%-gate: mean={mean_excess:.2f}pp stdev={sigma:.2f}pp")
        for k in (1, 2, 3):
            frac = np.mean(excess <= k * sigma)
            print(f"  within {k} sigma of the gate boundary (excess <= {k*sigma:.2f}pp): "
                  f"{int(frac*len(nm))}/{len(nm)} ({100*frac:.1f}%)")
        print(f"  (context, from the ORIGINAL 2026-07-20 wall-level calibration, not this population's own "
              f"room-level spread: residual sigma=0.417 in half-thickness-ratio units -- not directly "
              f"convertible to area-percent without a per-room perimeter-specific mapping, so this "
              f"branch reports the room-level area_err_pct spread directly rather than force a cross-level "
              f"unit conversion)")


if __name__ == "__main__":
    st = sys.argv[1] if len(sys.argv) > 1 else "both"
    wk = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else 8
    main(st, wk)
