# EYES layer — OCR observation channel for RASTER plans.
#
# Pure perception: recovers "what text exists and where" and NOTHING more. Each
# observation is the LOCKED Text contract {bbox, text, script?, confidence} in
# ORIGINAL image-px. The eyes attach ZERO meaning here — no room assignment, no
# "balcony"/"mamad"/level-marker interpretation. Associating text with regions
# is the interpreter's job; concluding what it means is the brain's.
#
# Vector PDFs already carry real text (extract_pdf.py get_text); this fills the
# gap for scans/JPEGs/screenshots, which had no OCR at all.
#
# The engine is PLUGGABLE behind the contract (see docs / [[ocr-eyes-channel]]):
#   --engine surya      strong neural OCR (Hebrew + rotation). OFFLINE / eval
#                       use only — license-encumbered for shipping. Default,
#                       because the near-term use is unblocking the interpreter/
#                       brain and setting the recovery ceiling.
#   --engine tesseract  Apache-2.0, shippable, but weaker on rotated/dense CAD
#                       Hebrew. The runtime engine until the ship-engine choice
#                       is made.
# Output is identical either way, so downstream code never sees the engine.
#
# Usage: ocr_raster.py <image> [--engine surya|tesseract] [--json out] [--overlay out]
# stdout: {"imageSize":[W,H], "source":..., "engine":..., "texts":[...]}

import sys
import os
import re
import json
import html as htmlmod

import numpy as np
from PIL import Image, ImageOps, ImageDraw

# Unicode-range script tag. Deterministic, no model — still pure perception
# (it describes the glyphs' script, not the label's meaning).
HEB = re.compile(r"[֐-׿]")
LAT = re.compile(r"[A-Za-z]")
DIG = re.compile(r"[0-9]")


def script_of(s):
    kinds = [k for k, on in (("hebrew", HEB.search(s)), ("latin", LAT.search(s)),
                             ("digit", DIG.search(s))) if on]
    if not kinds:
        return "other"
    return kinds[0] if len(kinds) == 1 else "mixed"


def _norm_bbox(x0, y0, x1, y1, inv=1.0):
    return [round(float(x0) * inv, 1), round(float(y0) * inv, 1),
            round(float(x1) * inv, 1), round(float(y1) * inv, 1)]


# --------------------------------------------------------------------------- #
# Engine: Surya (offline strong reader).
# --------------------------------------------------------------------------- #
def run_surya(im):
    from surya.detection import DetectionPredictor
    from surya.recognition import RecognitionPredictor
    det = DetectionPredictor()
    rec = RecognitionPredictor()
    # math_mode=False: default True wraps bare numbers (dimensions, +6.00 level
    # markers) in LaTeX, which mangles them — we want the raw string.
    page = rec([im], det_predictor=det, math_mode=False)[0]
    out = []
    for ln in page.text_lines:
        t = (ln.text or "").strip()
        if not t:
            continue
        bb = ln.bbox
        conf = getattr(ln, "confidence", None)
        out.append({
            "bbox": _norm_bbox(bb[0], bb[1], bb[2], bb[3]),
            "text": t,
            "script": script_of(t),
            "confidence": round(float(conf), 3) if conf is not None else 0.0,
        })
    return out


# --------------------------------------------------------------------------- #
# Engine: Tesseract (shippable, Apache-2.0). Machine paths resolve from env
# first (mirrors the /api/extract python resolution), with this machine's known
# install as fallback so the script runs out of the box.
# --------------------------------------------------------------------------- #
def run_tesseract(im):
    import pytesseract
    exe = os.environ.get("TESSERACT_EXE") or r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(exe):
        pytesseract.pytesseract.tesseract_cmd = exe
    tessdata = os.environ.get("TESSDATA_PREFIX") or r"C:\Users\dandu\AppData\Local\tessdata"
    if os.path.isdir(tessdata):
        os.environ["TESSDATA_PREFIX"] = tessdata

    # Tesseract wants ~300dpi-equivalent glyph height; upscale small plans.
    W0, H0 = im.size
    long_edge = max(W0, H0)
    scale = 2600.0 / long_edge if long_edge < 2600 else 1.0
    proc = im.resize((round(W0 * scale), round(H0 * scale)), Image.LANCZOS) if scale != 1.0 else im
    gray = ImageOps.grayscale(proc)

    data = pytesseract.image_to_data(gray, lang="heb+eng", config="--oem 1 --psm 11",
                                     output_type=pytesseract.Output.DICT)
    inv = 1.0 / scale
    out = []
    for i in range(len(data["text"])):
        t = (data["text"][i] or "").strip()
        try:
            conf = float(data["conf"][i])
        except ValueError:
            conf = -1.0
        if not t or conf < 0:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        out.append({
            "bbox": _norm_bbox(x, y, x + w, y + h, inv),
            "text": t,
            "script": script_of(t),
            "confidence": round(conf / 100.0, 3),
        })
    return out


ENGINES = {"surya": run_surya, "tesseract": run_tesseract}


def main():
    if len(sys.argv) < 2:
        sys.stdout.write(json.dumps({"error": "usage: ocr_raster.py <image> "
                                     "[--engine surya|tesseract] [--json out] [--overlay out]"}))
        return
    path = sys.argv[1]
    engine = sys.argv[sys.argv.index("--engine") + 1] if "--engine" in sys.argv else "surya"
    jout = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
    overlay = sys.argv[sys.argv.index("--overlay") + 1] if "--overlay" in sys.argv else None
    if engine not in ENGINES:
        sys.stdout.write(json.dumps({"error": f"unknown engine {engine!r}; use surya|tesseract"}))
        return

    try:
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        sys.stdout.write(json.dumps({"error": "open failed", "detail": str(e)}))
        return

    texts = ENGINES[engine](im)
    result = {"imageSize": list(im.size), "source": os.path.basename(path),
              "engine": engine, "texts": texts}

    if jout:
        with open(jout, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
    if overlay:
        color = {"hebrew": (220, 30, 30), "latin": (30, 90, 220), "digit": (20, 160, 60),
                 "mixed": (180, 60, 200), "other": (120, 120, 120)}
        base = (np.asarray(im).astype(float) * 0.5 + 255 * 0.5).astype(np.uint8)
        canvas = Image.fromarray(base)
        dr = ImageDraw.Draw(canvas)
        for o in texts:
            if o["confidence"] < 0.3:
                continue
            x0, y0, x1, y1 = o["bbox"]
            dr.rectangle([x0, y0, x1, y1], outline=color.get(o["script"], (120, 120, 120)), width=2)
        canvas.save(overlay)

    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
