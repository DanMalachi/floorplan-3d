# Aggregate style-signal measurements across the corpus into one table.
# This is the "statistics as threshold calibration" tool: signal thresholds
# stay crisp rules, but their evidence is watched here — when a column stops
# showing clear water between the strong and absent populations, the
# threshold needs revisiting (with data, not vibes).
#
# Usage: py scripts/eval/signal-table.py [eval-out/style-signals]
import json, glob, os, sys

root = sys.argv[1] if len(sys.argv) > 1 else os.path.join("eval-out", "style-signals")
rows = []
for f in sorted(glob.glob(os.path.join(root, "*", "signals.json"))):
    raw = open(f, "rb").read()
    d = None
    for enc in ("utf-8-sig", "utf-16", "utf-8"):
        try:
            d = json.loads(raw.decode(enc))
            break
        except Exception:
            continue
    if d is None or "routing" not in d:
        continue
    a, b = d["grayPoche"], d["thickStroke"]
    rows.append({
        "plan": os.path.basename(os.path.dirname(f)),
        "route": d["routing"]["style"],
        "grayVerdict": a.get("verdict"),
        "separation": a.get("separation"),
        "midArea": a.get("midAreaRatio"),
        "survival": a.get("survivalAfterOpen"),
        "skelLen": a.get("skelLenPerLongEdge"),
        "barTh": a.get("barMedianThicknessPx"),
        "texRej": a.get("textureRejectedShare"),
        "slabRej": a.get("slabRejectedShare"),
        "conn": a.get("largestComponentShare"),
        "wallEst": b.get("wallEstPx"),
        "modeShare": b.get("thickModeShare"),
    })

cols = ["plan", "route", "grayVerdict", "separation", "midArea", "survival",
        "skelLen", "barTh", "texRej", "slabRej", "conn", "wallEst", "modeShare"]
widths = {c: max(len(c), max((len(str(r.get(c, ""))) for r in rows), default=0)) for c in cols}
print("  ".join(c.ljust(widths[c]) for c in cols))
for r in rows:
    print("  ".join(str(r.get(c, "")).ljust(widths[c]) for c in rows and cols))

# population separation on the deciding gate
strong = [r["survival"] for r in rows if r["grayVerdict"] == "strong" and r["survival"] is not None]
rest = [r["survival"] for r in rows if r["grayVerdict"] != "strong" and r["survival"] is not None]
if strong and rest:
    print(f"\nsurvival gate (0.35): strong population min={min(strong)}  "
          f"others max={max(rest)}  margin={round(min(strong) - max(rest), 3)}")

out_csv = os.path.join(root, "feature-table.csv")
with open(out_csv, "w", encoding="utf-8") as fh:
    fh.write(",".join(cols) + "\n")
    for r in rows:
        fh.write(",".join(str(r.get(c, "")) for c in cols) + "\n")
print(f"\nwrote {out_csv}")
