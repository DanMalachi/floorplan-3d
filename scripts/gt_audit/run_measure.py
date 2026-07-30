"""Phase-0 GT audit: run per-wall ink-edge measurement across the corpus.
Writes scripts/gt_audit/_out/measurements.json (per-wall raw results) and
prints a calibration-confidence summary. Read-only: never touches GT files.
"""
import glob
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.gt_audit.calibrate import calibrate, load_gt
from scripts.gt_audit.measure_wall import measure_wall

OUT = Path(__file__).resolve().parent / "_out"
OUT.mkdir(exist_ok=True)

UNRELIABLE = {"Matterport Sample_BW", "739790347_2600378480416986_3044280999558553172_n.jpg"}


def main():
    ids = [os.path.basename(f)[:-5] for f in sorted(glob.glob("data/corpus/gt_provisional/*.json"))]
    results = {}
    for pid in ids:
        gt = load_gt(pid)
        entry = {
            "plan_id": pid,
            "encoding_class": gt["source"]["encoding_class"],
            "convention_class": gt["source"]["convention_class"],
            "n_walls": len(gt["walls"]),
            "calibration_reliable": pid not in UNRELIABLE,
            "walls": [],
        }
        if pid in UNRELIABLE:
            print(pid, "SKIPPED (calibration unreliable)")
            results[pid] = entry
            continue
        calib, mask, gray = calibrate(pid)
        entry["calib"] = {
            "sx": calib.sx, "sy": calib.sy, "envelope_quality": calib.envelope_quality,
            "residual_x": calib.residual_x, "residual_y": calib.residual_y,
            "consistent": calib.consistent, "strategy": calib.strategy,
        }
        for wl in gt["walls"]:
            m = measure_wall(calib, mask, wl)
            entry["walls"].append({
                "id": m.wall_id, "length_mm": m.length_mm,
                "d_neg": m.d_neg, "d_neg_on_ink": m.d_neg_on_ink, "d_neg_far": m.d_neg_far,
                "d_pos": m.d_pos, "d_pos_on_ink": m.d_pos_on_ink, "d_pos_far": m.d_pos_far,
                "cover_at_zero": m.cover_at_zero,
            })
        results[pid] = entry
        print(pid, "measured", len(entry["walls"]), "walls")

    (OUT / "measurements.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
    print("wrote", OUT / "measurements.json")


if __name__ == "__main__":
    main()
