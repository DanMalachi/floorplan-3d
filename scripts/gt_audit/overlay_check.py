"""Visual sanity check: render source, overlay GT walls transformed via calibrate().
Writes a PNG to scripts/gt_audit/_check/<plan_id>.png"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import numpy as np
from PIL import Image, ImageDraw

from scripts.gt_audit.calibrate import calibrate, load_gt

OUT = Path(__file__).resolve().parent / "_check"
OUT.mkdir(exist_ok=True)


def run(plan_id: str):
    calib, mask, gray = calibrate(plan_id)
    gt = load_gt(plan_id)
    img = Image.fromarray(gray.astype(np.uint8)).convert("RGB")
    draw = ImageDraw.Draw(img)
    for wl in gt["walls"]:
        x0, y0 = calib.mm_to_px(*wl["start"])
        x1, y1 = calib.mm_to_px(*wl["end"])
        draw.line([(x0, y0), (x1, y1)], fill=(255, 0, 0), width=2)
    img.save(OUT / f"{plan_id}.png")
    print(plan_id, "sx=", round(calib.sx, 4), "sy=", round(calib.sy, 4),
          "res_x=", round(calib.residual_x, 3), "res_y=", round(calib.residual_y, 3),
          "env_q=", round(calib.envelope_quality, 3), "consistent=", calib.consistent,
          "strategy=", calib.strategy)


if __name__ == "__main__":
    for pid in sys.argv[1:]:
        run(pid)
