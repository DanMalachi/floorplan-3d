"""Track V milestone 2 step 3a -- Blocker 1: DISPLACEMENT measurement for
the 8 walls previously (mis)labelled bucket (b) "select saw it, pair
dropped it".

TAXONOMY CORRECTION (Dan's, from the w_s111 trace): nothing was dropped for
these 8. A candidate EXISTS with the right orientation and a near-correct
recovered thickness; it simply sits far from where the ink is. The bucket is
renamed **b_displaced_candidate** -- the old label sends a reader hunting
for a rejection that never happened. (The other 2 of the original 10 are a
genuinely distinct, clean lever and keep their own name:
`below_length_floor`, queued and unstarted.)

Question this script answers, with NO mechanism assumed in advance: what
put the candidate away from the ink, and at WHICH STAGE does the
displacement first appear? The pipeline offers exactly three observable
levels, so the answer is a decomposition, not a guess:

  L1  select segment (a raw wall FACE stroke)                 -- select.py
  L2  pre-merge WallCandidate (a face-PAIR's centerline)      -- pair.py
  L3  final merged WallCandidate (collinear runs merged)      -- pair.py

Every level's signed perpendicular offset is measured against the same
reference: the intended GT wall's own centerline, along that wall's normal.
Whichever level first shows the displacement is the stage that caused it.
This is deliberately the same "find the form of the question that doesn't
depend on a shaky assumption" method that closed the frame question.

Also renders one overlay per wall (GT centerline + final candidate + every
source segment that fed it, one frame each, true scale, equal aspect) --
direct observation has been the cheapest high-information tool in this
phase and has never been pointed at these 8.

Diagnostic only. eval/ untouched; pair.py and assemble.py unmodified --
their pure helpers are imported read-only.
"""

from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.metrics.matching import plan_diagonal  # noqa: E402
from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import pair_walls  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
ATTRIBUTION_PATH = OUT_DIR / "step3a_bucket_b_attribution.json"

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]

LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}

TAU_PRIMARY = 0.01


def _angle_mod180(a, b) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180.0


def _circ_dist_mod180(x: float, y: float) -> float:
    d = abs(x - y) % 180.0
    return min(d, 180.0 - d)


def _signed_perp(pt, origin, unit_perp) -> float:
    return (pt[0] - origin[0]) * unit_perp[0] + (pt[1] - origin[1]) * unit_perp[1]


def _mid(a, b):
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)


def _walls_containing(walls, seg_idx: int):
    return [(i, w) for i, w in enumerate(walls) if seg_idx in w.member_source_indices]


def main() -> None:
    attribution = json.loads(ATTRIBUTION_PATH.read_text(encoding="utf-8"))
    targets = [r for r in attribution["per_wall"] if r["primary_reason"] == "survived_unexplained"]
    entries = {e.plan_id: e for e in load_registry()}

    results = []
    overlay_payloads = []

    for plan_id in TARGET_PLAN_IDS:
        plan_targets = [t for t in targets if t["plan_id"] == plan_id]
        if not plan_targets:
            continue

        entry = entries[plan_id]
        dissection = dissect(REPO_ROOT / entry.source_file)[0]
        raster_scale = _gt_scale(dissection.page_size_px)
        mm = raster_scale * MM_PER_PRED_UNIT[plan_id]  # native page pt -> mm
        selection = select_axis_aligned(dissection)
        angular_tol = selection.angular_tolerance_deg
        pair_result = pair_walls(selection, dissection.page_size_px)

        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gt_by_id = {w["id"]: w for w in gt["walls"]}
        diagonal_gt = plan_diagonal(gt["walls"])
        tau_abs = TAU_PRIMARY * diagonal_gt

        sel_mm = [
            ((s.p0[0] * mm, s.p0[1] * mm), (s.p1[0] * mm, s.p1[1] * mm)) for s in selection.candidates
        ]

        for t in plan_targets:
            gw = gt_by_id[t["gt_wall_id"]]
            gs, ge = tuple(gw["start"]), tuple(gw["end"])
            wall_len = math.hypot(ge[0] - gs[0], ge[1] - gs[1])
            wall_angle = _angle_mod180(gs, ge)
            ua = ((ge[0] - gs[0]) / wall_len, (ge[1] - gs[1]) / wall_len)
            up = (-ua[1], ua[0])

            # --- L1: covering select segments (the ink that IS on this wall) ---
            covering = []
            for i, (a, b) in enumerate(sel_mm):
                if _circ_dist_mod180(_angle_mod180(a, b), wall_angle) > angular_tol:
                    continue
                m = _mid(a, b)
                off = _signed_perp(m, gs, up)
                if abs(off) > tau_abs:
                    continue
                along = (m[0] - gs[0]) * ua[0] + (m[1] - gs[1]) * ua[1]
                if along < -tau_abs or along > wall_len + tau_abs:
                    continue
                covering.append({"select_idx": i, "offset_mm": round(off, 1)})

            cov_idxs = [c["select_idx"] for c in covering]

            # --- L2: pre-merge candidates (face-pair centerlines) built from that ink ---
            l2 = []
            for ci in cov_idxs:
                for pi, pw in _walls_containing(pair_result.pre_merge_walls, ci):
                    off = _signed_perp(
                        _mid((pw.start[0] * mm, pw.start[1] * mm), (pw.end[0] * mm, pw.end[1] * mm)), gs, up
                    )
                    l2.append(
                        {
                            "pre_merge_idx": pi,
                            "via_select_idx": ci,
                            "offset_mm": round(off, 1),
                            "thickness_mm": round(pw.thickness * mm, 1),
                            "partner_source_indices": list(pw.source_segment_indices),
                        }
                    )

            # --- L3: final merged candidates ---
            l3 = []
            for ci in cov_idxs:
                for fi, fw in _walls_containing(pair_result.walls, ci):
                    off = _signed_perp(
                        _mid((fw.start[0] * mm, fw.start[1] * mm), (fw.end[0] * mm, fw.end[1] * mm)), gs, up
                    )
                    l3.append(
                        {
                            "final_idx": fi,
                            "via_select_idx": ci,
                            "offset_mm": round(off, 1),
                            "thickness_mm": round(fw.thickness * mm, 1),
                            "n_members": len(fw.member_source_indices),
                        }
                    )

            # "intended" final candidate = the one carrying the most covering ink
            best_final = None
            if l3:
                by_final: dict[int, int] = {}
                for r in l3:
                    by_final[r["final_idx"]] = by_final.get(r["final_idx"], 0) + 1
                best_idx = max(by_final, key=by_final.get)
                best_final = next(r for r in l3 if r["final_idx"] == best_idx)
                best_final = {**best_final, "n_covering_segments_carried": by_final[best_idx]}

            def dedup_stats(rows, key="offset_mm"):
                vals = sorted({(r[key]) for r in rows})
                if not vals:
                    return None
                return {
                    "n_distinct": len(vals),
                    "min": vals[0],
                    "max": vals[-1],
                    "median": round(statistics.median(vals), 1),
                }

            record = {
                "plan_id": plan_id,
                "gt_wall_id": t["gt_wall_id"],
                "gt_length_mm": round(wall_len, 1),
                "gt_thickness_mm": gw["thickness"],
                "gt_orientation": "H" if abs(ge[0] - gs[0]) >= abs(ge[1] - gs[1]) else "V",
                "n_covering_select_segments": len(covering),
                "L1_select_offsets": dedup_stats(covering),
                "L2_pre_merge_offsets": dedup_stats(l2),
                "L2_pre_merge_thicknesses": dedup_stats(l2, "thickness_mm"),
                "L3_final_offsets": dedup_stats(l3),
                "intended_final_candidate": best_final,
                "displacement_mm": best_final["offset_mm"] if best_final else None,
                "_detail": {"L1": covering, "L2": l2, "L3": l3},
            }
            results.append(record)

            if best_final is not None:
                fw = pair_result.walls[best_final["final_idx"]]
                overlay_payloads.append(
                    {
                        "title": f"{plan_id.split('-')[0]} {t['gt_wall_id']}  disp={best_final['offset_mm']:.0f}mm",
                        "gt": (gs, ge),
                        "final": (
                            (fw.start[0] * mm, fw.start[1] * mm),
                            (fw.end[0] * mm, fw.end[1] * mm),
                        ),
                        "members": [sel_mm[i] for i in fw.member_source_indices if i < len(sel_mm)],
                        "covering": [sel_mm[i] for i in cov_idxs],
                    }
                )

    # ---------------- overlays: one frame per wall, true scale ----------------
    n = len(overlay_payloads)
    ncols = 4
    nrows = max(1, math.ceil(n / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(5 * ncols, 5 * nrows))
    axes = axes.ravel() if n > 1 else [axes]
    for ax, p in zip(axes, overlay_payloads):
        for i, (a, b) in enumerate(p["members"]):
            ax.plot([a[0], b[0]], [a[1], b[1]], color="0.65", lw=0.8,
                    label="member source segs" if i == 0 else None)
        for i, (a, b) in enumerate(p["covering"]):
            ax.plot([a[0], b[0]], [a[1], b[1]], color="tab:orange", lw=1.8,
                    label="covering ink (on GT)" if i == 0 else None)
        (gs, ge) = p["gt"]
        ax.plot([gs[0], ge[0]], [gs[1], ge[1]], color="tab:green", lw=3.0, alpha=0.7, label="GT centerline")
        (fa, fb) = p["final"]
        ax.plot([fa[0], fb[0]], [fa[1], fb[1]], color="tab:red", lw=2.0, label="final candidate")
        ax.set_title(p["title"], fontsize=9)
        ax.set_aspect("equal")
        ax.invert_yaxis()
        ax.tick_params(labelsize=6)
        ax.legend(fontsize=6, loc="best")
    for ax in axes[n:]:
        ax.axis("off")
    fig.tight_layout()
    overlay_path = OUT_DIR / "step3a_displacement_overlays.png"
    fig.savefig(overlay_path, dpi=130)
    plt.close(fig)

    # ---------------- population summary ----------------
    disps = [r["displacement_mm"] for r in results if r["displacement_mm"] is not None]
    abs_disps = [abs(d) for d in disps]

    def corr(xs, ys):
        if len(xs) < 3:
            return None
        mx, my = statistics.mean(xs), statistics.mean(ys)
        num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
        dy = math.sqrt(sum((y - my) ** 2 for y in ys))
        return round(num / (dx * dy), 4) if dx and dy else None

    lengths = [r["gt_length_mm"] for r in results if r["displacement_mm"] is not None]
    members = [r["intended_final_candidate"]["n_members"] for r in results if r["displacement_mm"] is not None]
    thicks = [r["gt_thickness_mm"] for r in results if r["displacement_mm"] is not None]

    summary = {
        "taxonomy_correction": "bucket (b) renamed b_displaced_candidate -- a candidate EXISTS with correct orientation and near-correct thickness but sits off-position; nothing was rejected. below_length_floor (2 walls) is a separate, still-queued lever.",
        "n_walls": len(results),
        "displacement_mm": {
            "values": disps,
            "abs_mean": round(statistics.mean(abs_disps), 1) if abs_disps else None,
            "abs_median": round(statistics.median(abs_disps), 1) if abs_disps else None,
            "abs_min": round(min(abs_disps), 1) if abs_disps else None,
            "abs_max": round(max(abs_disps), 1) if abs_disps else None,
            "n_positive": sum(1 for d in disps if d > 0),
            "n_negative": sum(1 for d in disps if d < 0),
        },
        "correlations_n8_fragile": {
            "note": "n=8 is the FULL population of this bucket, but a Pearson r at n=8 is fragile -- read as descriptive, not inferential.",
            "abs_displacement_vs_gt_length": corr(lengths, abs_disps),
            "abs_displacement_vs_member_count": corr(members, abs_disps),
            "abs_displacement_vs_gt_thickness": corr(thicks, abs_disps),
        },
        "overlay_path": str(overlay_path.relative_to(REPO_ROOT)),
    }

    out = {"summary": summary, "per_wall": results}
    (OUT_DIR / "step3a_displacement.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

    compact = []
    for r in results:
        compact.append(
            {
                "wall": f"{r['plan_id'].split('-')[0]}:{r['gt_wall_id']}",
                "gt_len": r["gt_length_mm"],
                "disp_mm": r["displacement_mm"],
                "L1_sel": r["L1_select_offsets"],
                "L2_pre": r["L2_pre_merge_offsets"],
                "L2_thick": r["L2_pre_merge_thicknesses"],
                "L3_fin": r["L3_final_offsets"],
                "n_members": r["intended_final_candidate"]["n_members"] if r["intended_final_candidate"] else None,
            }
        )
    print(json.dumps({"summary": summary, "compact": compact}, indent=2))


if __name__ == "__main__":
    main()
