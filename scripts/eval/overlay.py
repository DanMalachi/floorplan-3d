"""Draw a candidate set over the page render, color-coded by guess.

Usage: py scripts/eval/overlay.py plan.png candidates.json overlay.png
Also reused by the M3/M4 harness to visualize VLM labels (same JSON shape:
items need px + guess/label fields).
"""
import json, sys
from PIL import Image, ImageDraw

COLORS = {
    "wall": (230, 40, 40),
    "door": (40, 180, 60),
    "window": (30, 170, 220),
    "stairs": (200, 40, 200),
    "dimension": (255, 150, 20),
    "furniture": (150, 110, 60),
    "reject": (130, 130, 130),
}


def main():
    plan_path, cand_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    img = Image.open(plan_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    data = json.load(open(cand_path, encoding="utf-8"))
    items = data.get("candidates", data if isinstance(data, list) else [])

    for c in items:
        x0, y0, x1, y1 = c["px"]
        cls = c.get("label") or c.get("guess") or "reject"
        color = COLORS.get(cls, (255, 255, 0))
        solid = c.get("keptByHeuristic", True)
        draw.line([(x0, y0), (x1, y1)], fill=color, width=3 if solid else 2)
        # id label at the midpoint, offset a touch so it doesn't sit on the line
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        label = str(c["id"])
        tw = draw.textlength(label)
        draw.rectangle([mx + 3, my + 3, mx + 5 + tw, my + 14], fill=(255, 255, 255))
        draw.text((mx + 4, my + 3), label, fill=color)

    img.save(out_path)
    print(f"overlay: {len(items)} items -> {out_path}")


if __name__ == "__main__":
    main()
