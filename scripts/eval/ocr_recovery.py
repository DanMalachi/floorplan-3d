# OCR EVIDENCE-RECOVERY report for the EYES Text channel (scripts/ocr_raster.py).
#
# Runs the OCR channel over the RASTER plans in the corpus and reports, per plan
# and per style, whether the domain EVIDENCE the interpreter/brain needs was
# recovered: balcony (מרפסת), railing (מעקה), safe-room (ממ"ד), level markers
# (+6.00 style), and room labels. This is a RECOVERY proxy (token presence),
# not a precision metric — we have no OCR ground truth — but it directly answers
# "did the eyes surface the balcony/rail/level cues we were discarding?".
#
# Loads the (slow) Surya model ONCE and reuses it across all plans.
#
# Usage: ocr_recovery.py [--split benchmark|dev|all] [--engine surya|tesseract]
#        run from the repo root (reads eval/corpus.jsonl).

import os
import re
import sys
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ocr_raster import script_of, _norm_bbox  # noqa: E402
from PIL import Image, ImageOps  # noqa: E402

RASTER_EXT = (".jpg", ".jpeg", ".png", ".webp")

BALCONY = ("מרפסת", "מרפס", "חרפסת", "חרפס")  # incl. common מ→ח 1-glyph OCR slip
RAILING = ("מעקה", "מעק")
MAMAD = ("ממ\"ד", "ממ״ד", "ממד", "מקלט")
ROOMS = ("סלון", "מטבח", "מקלחת", "אמבטיה", "חדר", "ארונות", "הורים",
         "שינה", "כניסה", "מלתחה", "מחסן", "שירות", "רחצה")
LEVEL = re.compile(r"[+\-]?\d+\.\d{2}")


def any_in(texts, needles):
    return sum(1 for o in texts if any(n in o["text"] for n in needles))


def load_corpus(split):
    rows = []
    with open("eval/corpus.jsonl", encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln:
                continue
            r = json.loads(ln)
            if not r["source"].lower().endswith(RASTER_EXT):
                continue
            if split != "all" and r["split"] != split:
                continue
            rows.append(r)
    return rows


def build_runner(engine):
    if engine == "surya":
        from surya.detection import DetectionPredictor
        from surya.recognition import RecognitionPredictor
        det, rec = DetectionPredictor(), RecognitionPredictor()

        def run(im):
            page = rec([im], det_predictor=det, math_mode=False)[0]
            out = []
            for ln in page.text_lines:
                t = (ln.text or "").strip()
                if not t:
                    continue
                bb = ln.bbox
                c = getattr(ln, "confidence", None)
                out.append({"bbox": _norm_bbox(bb[0], bb[1], bb[2], bb[3]), "text": t,
                            "script": script_of(t), "confidence": round(float(c), 3) if c is not None else 0.0})
            return out
        return run
    else:
        from ocr_raster import run_tesseract
        return run_tesseract


def main():
    split = sys.argv[sys.argv.index("--split") + 1] if "--split" in sys.argv else "benchmark"
    engine = sys.argv[sys.argv.index("--engine") + 1] if "--engine" in sys.argv else "surya"
    sys.stdout.reconfigure(encoding="utf-8")

    rows = load_corpus(split)
    print(f"OCR recovery — engine={engine} split={split} — {len(rows)} raster plans\n")
    run = build_runner(engine)

    hdr = f"{'plan':22} {'style':13} {'#obs':>4} {'heb':>4} | {'balc':>4} {'rail':>4} {'mamad':>5} {'level':>5} {'rooms':>5}"
    print(hdr)
    print("-" * len(hdr))
    agg = {}
    for r in rows:
        try:
            im = ImageOps.exif_transpose(Image.open(r["source"])).convert("RGB")
        except Exception as e:  # noqa: BLE001
            print(f"{r['id'][:22]:22} OPEN FAILED: {e}")
            continue
        texts = run(im)
        heb = sum(1 for o in texts if o["script"] in ("hebrew", "mixed"))
        rec = {
            "balc": any_in(texts, BALCONY), "rail": any_in(texts, RAILING),
            "mamad": any_in(texts, MAMAD),
            "level": sum(1 for o in texts if LEVEL.search(o["text"])),
            "rooms": any_in(texts, ROOMS),
        }
        print(f"{r['id'][:22]:22} {r['style'][:13]:13} {len(texts):>4} {heb:>4} | "
              f"{rec['balc']:>4} {rec['rail']:>4} {rec['mamad']:>5} {rec['level']:>5} {rec['rooms']:>5}")
        a = agg.setdefault(r["style"], {"n": 0, **{k: 0 for k in rec}})
        a["n"] += 1
        for k in rec:
            a[k] += 1 if rec[k] else 0

    print("\nplans with >=1 hit, by style:")
    for style, a in sorted(agg.items()):
        print(f"  {style:13} n={a['n']}  balc {a['balc']}/{a['n']}  rail {a['rail']}/{a['n']}  "
              f"mamad {a['mamad']}/{a['n']}  level {a['level']}/{a['n']}  rooms {a['rooms']}/{a['n']}")


if __name__ == "__main__":
    main()
