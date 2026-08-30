#!/usr/bin/env python3
"""
KTX2 pilot -- step 3: side-by-side + contrast-boosted diff comparison sheets.

Reads:
  - the original source image (as-shipped JPEG/PNG, from source/)
  - the UASTC-encoded KTX2, decoded back to RGBA8 (work/decoded/*__uastc.png)
  - the ETC1S-encoded KTX2, decoded back to RGBA8 (work/decoded/*__etc1s.png)

All three are the same pixel dimensions (level 0, no resize), so a crop at a
fixed region is a true 100%-zoom, pixel-for-pixel comparison.

Produces, per candidate texture, one composite PNG in output/:
  Row 1: Original crop | UASTC crop | ETC1S crop   (all at 100% zoom)
  Row 2: (full source thumbnail, crop box marked) | diff(Original,UASTC) x8 | diff(Original,ETC1S) x8

Local measurement only -- reads from this pilot's own source/ and work/
directories, writes only to this pilot's own output/ directory.
"""

import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(BASE, "source")
DECODED = os.path.join(BASE, "work", "decoded")
OUT = os.path.join(BASE, "output")
os.makedirs(OUT, exist_ok=True)

CROP = 512  # 100%-zoom crop size in source pixels
DIFF_GAIN = 8  # contrast boost multiplier for the diff panels

# label -> (source filename, crop top-left x, crop top-left y)
CANDIDATES = {
    "large_sharp_detail__IDANAS_bed_wood_grain": ("40458964__img5.jpg", 1300, 1300),
    "smooth_gradient__BILLY_glass_shelf": ("10286752__img5.png", 40, 40),
    "fabric_weave__APPLARYD_sofa": ("30506239__img2.jpg", 1200, 1200),
    "typical_median__NORDKISA_bamboo": ("60447677__img0.jpg", 500, 500),
}

try:
    FONT = ImageFont.truetype("C:\\Windows\\Fonts\\segoeui.ttf", 22)
    FONT_SMALL = ImageFont.truetype("C:\\Windows\\Fonts\\segoeui.ttf", 16)
except Exception:
    FONT = ImageFont.load_default()
    FONT_SMALL = FONT


def load_rgba(path):
    return Image.open(path).convert("RGBA")


def crop_box(img, x, y, size):
    w, h = img.size
    x = max(0, min(x, w - size))
    y = max(0, min(y, h - size))
    return img.crop((x, y, x + size, y + size)), (x, y)


def diff_image(a, b, gain):
    a_rgb = a.convert("RGB")
    b_rgb = b.convert("RGB")
    ap = a_rgb.load()
    bp = b_rgb.load()
    w, h = a_rgb.size
    out = Image.new("RGB", (w, h))
    op = out.load()
    max_d = 0
    sum_d = 0
    count = 0
    for j in range(h):
        for i in range(w):
            ar, ag, ab_ = ap[i, j]
            br, bg, bb = bp[i, j]
            dr = abs(ar - br)
            dg = abs(ag - bg)
            db = abs(ab_ - bb)
            max_d = max(max_d, dr, dg, db)
            sum_d += dr + dg + db
            count += 3
            op[i, j] = (
                min(255, dr * gain),
                min(255, dg * gain),
                min(255, db * gain),
            )
    mean_d = sum_d / count
    return out, max_d, mean_d


def label_panel(img, text, sub=None):
    pad_top = 34
    panel = Image.new("RGB", (img.width, img.height + pad_top), (24, 24, 26))
    d = ImageDraw.Draw(panel)
    d.text((6, 6), text, fill=(255, 255, 255), font=FONT)
    panel.paste(img.convert("RGB"), (0, pad_top))
    if sub:
        d.text((6, panel.height - 20), sub, fill=(0, 255, 120), font=FONT_SMALL)
    return panel


def hstack(imgs, gap=6, bg=(10, 10, 12)):
    h = max(i.height for i in imgs)
    w = sum(i.width for i in imgs) + gap * (len(imgs) - 1)
    canvas = Image.new("RGB", (w, h), bg)
    x = 0
    for im in imgs:
        canvas.paste(im, (x, 0))
        x += im.width + gap
    return canvas


def vstack(imgs, gap=10, bg=(10, 10, 12)):
    w = max(i.width for i in imgs)
    h = sum(i.height for i in imgs) + gap * (len(imgs) - 1)
    canvas = Image.new("RGB", (w, h), bg)
    y = 0
    for im in imgs:
        canvas.paste(im, (0, y))
        y += im.height + gap
    return canvas


def thumb_with_box(src_path, x, y, size, max_dim=420):
    img = load_rgba(Image.open(src_path).convert("RGBA")) if False else Image.open(src_path).convert("RGB")
    w, h = img.size
    scale = max_dim / max(w, h)
    thumb = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    d = ImageDraw.Draw(thumb)
    bx0, by0 = x * scale, y * scale
    bx1, by1 = (x + size) * scale, (y + size) * scale
    d.rectangle([bx0, by0, bx1, by1], outline=(255, 60, 60), width=3)
    return thumb


results = []
for label, (src_name, cx, cy) in CANDIDATES.items():
    src_path = os.path.join(SOURCE, src_name)
    uastc_path = os.path.join(DECODED, f"{label}__uastc.png")
    etc1s_path = os.path.join(DECODED, f"{label}__etc1s.png")

    src_img = Image.open(src_path).convert("RGBA")
    uastc_img = Image.open(uastc_path).convert("RGBA")
    etc1s_img = Image.open(etc1s_path).convert("RGBA")

    assert src_img.size == uastc_img.size == etc1s_img.size, (label, src_img.size, uastc_img.size, etc1s_img.size)

    src_crop, (ax, ay) = crop_box(src_img, cx, cy, CROP)
    uastc_crop, _ = crop_box(uastc_img, cx, cy, CROP)
    etc1s_crop, _ = crop_box(etc1s_img, cx, cy, CROP)

    diff_uastc, max_d_uastc, mean_d_uastc = diff_image(src_crop, uastc_crop, DIFF_GAIN)
    diff_etc1s, max_d_etc1s, mean_d_etc1s = diff_image(src_crop, etc1s_crop, DIFF_GAIN)

    row1 = hstack([
        label_panel(src_crop, "ORIGINAL (as shipped)", f"crop @ ({ax},{ay}) {CROP}x{CROP}, {src_img.width}x{src_img.height} full"),
        label_panel(uastc_crop, "UASTC (KTX2 -> BC7/ASTC4x4)", "high-quality tier"),
        label_panel(etc1s_crop, "ETC1S (KTX2 -> BC7/ASTC4x4)", "cheap tier"),
    ])

    thumb = thumb_with_box(src_path, ax, ay, CROP, max_dim=row1.height - 34)
    thumb_panel = label_panel(thumb, "crop location", None)

    row2 = hstack([
        thumb_panel,
        label_panel(diff_uastc, f"DIFF x{DIFF_GAIN}: orig vs UASTC", f"max {max_d_uastc}/255  mean {mean_d_uastc:.2f}/255"),
        label_panel(diff_etc1s, f"DIFF x{DIFF_GAIN}: orig vs ETC1S", f"max {max_d_etc1s}/255  mean {mean_d_etc1s:.2f}/255"),
    ])

    title = Image.new("RGB", (row1.width, 40), (10, 10, 12))
    ImageDraw.Draw(title).text((6, 8), label.replace("__", "  |  "), fill=(255, 210, 90), font=FONT)

    sheet = vstack([title, row1, row2])
    out_path = os.path.join(OUT, f"{label}.png")
    sheet.save(out_path)
    results.append((label, out_path, max_d_uastc, mean_d_uastc, max_d_etc1s, mean_d_etc1s))
    print(f"{label}: UASTC max={max_d_uastc}/255 mean={mean_d_uastc:.2f}/255  |  ETC1S max={max_d_etc1s}/255 mean={mean_d_etc1s:.2f}/255  -> {out_path}")

print("\nDone.")
