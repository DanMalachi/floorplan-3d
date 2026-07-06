# Phase 3 M2 - classical-CV raster wall proposer.
#
# Takes a floor-plan image (listing screenshot / flat scan / export) and emits
# rough wall-centerline segments with per-segment thickness. Geometry is only
# PROPOSED here; deterministic regularization (ortho snap, collinear merge,
# gap-door detection) happens on the TS side in src/trace2d/rasterCandidates.ts,
# and all semantics stay with the Phase 2.5 VLM classifier. Recall-first: noise
# in the output is expected and cheap (one reject click / one VLM label);
# a missed wall is not.
#
# Pipeline: darkness image (max RGB channel, so colored floor fills read light)
# -> binarize (Otsu ∪ adaptive) -> despeckle -> stroke-width stats -> wall mask
# (morphological opening sized from the dominant thick-stroke width) -> drop
# letter-sized blobs -> skeletonize -> split at junctions -> trace branches ->
# Douglas-Peucker -> segments (original-image px) + quality report.
#
# Usage: propose_raster.py <image> [--png-out normalized.png]
# stdout: {"quality": {...}, "centerlines": [{x0,y0,x1,y1,thicknessPx}, ...]}

import sys
import json
import math

import numpy as np
import cv2
from PIL import Image, ImageOps
from skimage.morphology import skeletonize

MAX_PROC_PX = 3000   # process at most this long edge; coords scaled back
MIN_GOOD_PX = 1000   # below this, flag quality as marginal


def fail(msg, detail=""):
    sys.stdout.write(json.dumps({"error": msg, "detail": detail}))
    sys.exit(0)


def order_chain(pixels, pixel_set):
    """Order a branch's pixels into a walkable chain (8-connectivity)."""
    if len(pixels) == 1:
        return pixels
    neigh = {}
    for (y, x) in pixels:
        ns = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if (dy or dx) and (y + dy, x + dx) in pixel_set:
                    ns.append((y + dy, x + dx))
        neigh[(y, x)] = ns
    start = next((p for p in pixels if len(neigh[p]) <= 1), pixels[0])
    chain = [start]
    seen = {start}
    cur = start
    while True:
        nxt = None
        for n in neigh[cur]:
            if n not in seen:
                nxt = n
                break
        if nxt is None:
            break
        chain.append(nxt)
        seen.add(nxt)
        cur = nxt
    return chain


# ---------------------------------------------------------------------------
# Style signals (Step 1 of the style router). Three INDEPENDENT global
# measurements of "which wall signal does this plan have". No routing here:
# each signal is measured and reported on its own; the router (Step 2) will
# consume them explicitly.
# ---------------------------------------------------------------------------

def _ink_mask(gray, long_edge):
    """Binarize + despeckle exactly as the main pipeline does."""
    otsu_t, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    blk = max(31, (long_edge // 40) | 1)
    adap = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, blk, 15)
    ink = cv2.bitwise_or(otsu, adap)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    min_area = max(4, round((long_edge / 1600.0) ** 2 * 8))
    keep = stats[:, cv2.CC_STAT_AREA] >= min_area
    keep[0] = False
    ink = np.where(keep[lab], 255, 0).astype(np.uint8)
    return ink, float(otsu_t)


def _save_contrib_png(arr, mask, path):
    """Diagnostic: plan dimmed, contributing pixels in red."""
    out = (arr * 0.55 + 255 * 0.45).astype(np.uint8)
    out[mask > 0] = [220, 30, 30]
    Image.fromarray(out).save(path)


def _reject_periodic_texture(bars, long_edge):
    """Remove PERIODIC PARALLEL TEXTURE (wood decking, tile grids, rugs) from
    a bar mask — the same geometric principle as the vector pipeline's
    hatch/stair rejection: a bar with >=2 overlapping parallel neighbors at
    uniform, texture-dense spacing is part of a stripe field, never a wall.

    Why the thresholds generalize (drafting truths, not plan tuning):
    - neighbor search window <= 6x bar thickness: textures are DENSE — the
      gap between stripes is comparable to the stripe width itself, while
      rooms separate architectural parallels by >=10x wall thickness, so
      real walls never see 2 uniform neighbors inside the window;
    - stack size >=3 (self + 2 neighbors): the vector hatch rule verbatim;
    - spacing uniformity max/min <= 2.2: periodic texture is regular
      (vector stair rule used 2.0; slightly looser for raster wobble).

    Returns (cleaned mask, rejected-area share, texture line count).
    """
    area0 = float((bars > 0).sum())
    if area0 < 100:
        return bars, 0.0, 0
    sk = skeletonize(bars > 0).astype(np.uint8) * 255
    dist = cv2.distanceTransform(bars, cv2.DIST_L2, 5)
    med_th = float(np.median(2.0 * dist[sk > 0])) if (sk > 0).any() else 4.0
    lines = cv2.HoughLinesP(sk, 1, np.pi / 360, threshold=20,
                            minLineLength=max(12, long_edge // 100), maxLineGap=5)
    if lines is None:
        return bars, 0.0, 0
    segs = []
    for l in np.asarray(lines).reshape(-1, 4):
        x0, y0, x1, y1 = map(float, l)
        L = math.hypot(x1 - x0, y1 - y0)
        if L < 2:
            continue
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        segs.append({"p0": (x0, y0), "p1": (x1, y1), "u": (ux, uy),
                     "mid": ((x0 + x1) / 2, (y0 + y1) / 2), "len": L})
    win = max(6.0, 6.0 * med_th)
    sin_tol = math.sin(math.radians(10))
    rejected = set()
    for i, a in enumerate(segs):
        gaps = []
        for j, b in enumerate(segs):
            if i == j:
                continue
            cross = abs(a["u"][0] * b["u"][1] - a["u"][1] * b["u"][0])
            if cross > sin_tol:
                continue
            dxm = b["mid"][0] - a["mid"][0]
            dym = b["mid"][1] - a["mid"][1]
            perp = abs(dxm * -a["u"][1] + dym * a["u"][0])
            if perp < max(2.0, med_th * 0.5) or perp > win:
                continue
            # overlap along a's direction
            s0 = min(0.0, (b["p0"][0] - a["p0"][0]) * a["u"][0] + (b["p0"][1] - a["p0"][1]) * a["u"][1])
            sb = sorted([
                (b["p0"][0] - a["p0"][0]) * a["u"][0] + (b["p0"][1] - a["p0"][1]) * a["u"][1],
                (b["p1"][0] - a["p0"][0]) * a["u"][0] + (b["p1"][1] - a["p0"][1]) * a["u"][1],
            ])
            overlap = min(a["len"], sb[1]) - max(0.0, sb[0])
            if overlap < 0.4 * min(a["len"], b["len"]):
                continue
            gaps.append(perp)
        if len(gaps) >= 2:
            gaps.sort()
            if gaps[-1] / max(1.0, gaps[0]) <= 2.2:
                rejected.add(i)
    if not rejected:
        return bars, 0.0, 0
    eraser = np.zeros_like(bars)
    w = max(3, int(round(med_th * 2.5)))
    for i in rejected:
        s = segs[i]
        cv2.line(eraser, (int(s["p0"][0]), int(s["p0"][1])),
                 (int(s["p1"][0]), int(s["p1"][1])), 255, w)
    cleaned = cv2.bitwise_and(bars, cv2.bitwise_not(eraser))
    # a stripe field loses its body with the stripes: drop leftover specks
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cleaned, 8)
    keep = stats[:, cv2.CC_STAT_AREA] >= (med_th * med_th * 4)
    keep[0] = False
    cleaned = np.where(keep[lab], 255, 0).astype(np.uint8)
    share = 1.0 - float((cleaned > 0).sum()) / area0
    return cleaned, share, len(rejected)


def _reject_slabs(bars):
    """Remove locally MASSIVE regions: fused texture fields, pools, rugs,
    logo blobs. Generalizes because wall thickness stays within a small
    family on any one plan (exterior <= ~2.5x interior by drafting
    convention), so a region that survives an opening by 3x the median bar
    thickness cannot be a wall. Returns (cleaned mask, rejected share)."""
    area0 = float((bars > 0).sum())
    if area0 < 100:
        return bars, 0.0
    dist = cv2.distanceTransform(bars, cv2.DIST_L2, 5)
    sk = skeletonize(bars > 0)
    if not sk.any():
        return bars, 0.0
    med_th = float(np.median(2.0 * dist[sk]))
    k_big = max(7, int(round(3.0 * med_th)) | 1)
    slabs = cv2.morphologyEx(bars, cv2.MORPH_OPEN,
                             cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_big, k_big)))
    if not (slabs > 0).any():
        return bars, 0.0
    slabs = cv2.dilate(slabs, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    cleaned = cv2.bitwise_and(bars, cv2.bitwise_not(slabs))
    return cleaned, 1.0 - float((cleaned > 0).sum()) / area0


def signal_gray_poche(arr, gray, long_edge, stroke_median, out_png=None,
                      out_png_pre=None, connectivity="log"):
    """Signal A: walls drawn as solid MID-GRAY fills (poché) while annotation
    is near-black. Evidence = a tonally distinct mid-gray ink population
    whose morphology is elongated bars.

    Thresholds and why they should generalize (none tuned to one plan):
    - the mid band is DERIVED per image by two-level Otsu (paper vs ink,
      then black vs mid within ink) — no fixed gray values;
    - separation >= 2.0: poché uses a gray screen tone visually distinct
      from full-black linework by drafting convention, so the two ink
      classes' mean gap is many times their spread; an arbitrary Otsu split
      of a single-tone population yields adjacent, overlapping classes;
    - open-kernel scaled from resolution (like despeckle): JPEG/AA halos
      hug black strokes at 1-3px at any plan style, while a *fill* is by
      definition wider than a halo shell — opening kills halos, spares fills;
    - survival >= 0.35: halo/text populations lose >90% of their area to
      that opening; genuine fills lose only their rim;
    - skeleton length >= 2x long edge: walls trace the building, so their
      total centerline length is at least building-perimeter scale on any
      framed plan; surviving text specks never accumulate that much;
    - bar thickness >= max(4px, 1.5x all-ink stroke median): walls are
      thicker than line annotation, again drafting convention.
    """
    sig = {"name": "gray-poche"}
    t_paper, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink_vals = gray[gray < t_paper]
    sig["paperT"] = float(t_paper)
    if ink_vals.size < 500:
        sig.update({"verdict": "absent", "reason": "almost no ink"})
        return sig

    # second-level Otsu inside the ink population: black vs mid-gray
    t_dark, _ = cv2.threshold(ink_vals.reshape(-1, 1), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    black = ink_vals[ink_vals < t_dark].astype(np.float64)
    mid = ink_vals[ink_vals >= t_dark].astype(np.float64)
    sig["darkT"] = float(t_dark)
    if black.size < 200 or mid.size < 200:
        sig.update({"verdict": "absent", "reason": "ink population not splittable"})
        return sig
    spread = max(2.0, (float(black.std()) + float(mid.std())) / 2.0)
    separation = (float(mid.mean()) - float(black.mean())) / spread
    sig["separation"] = round(separation, 2)
    sig["blackMean"] = round(float(black.mean()), 1)
    sig["midMean"] = round(float(mid.mean()), 1)

    mid_mask = ((gray >= t_dark) & (gray < t_paper)).astype(np.uint8) * 255
    mid_area = float((mid_mask > 0).sum())
    sig["midAreaRatio"] = round(mid_area / gray.size, 4)

    k_open = max(3, int(round(5 * long_edge / 1600.0)) | 1)
    k_close = max(k_open, int(round(k_open * 1.4)) | 1)
    kern_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_open, k_open))
    kern_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_close, k_close))
    opened = cv2.morphologyEx(mid_mask, cv2.MORPH_OPEN, kern_open)
    if out_png_pre:
        # "before texture rejection" view, same open+close as the original
        _save_contrib_png(arr, cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kern_close), out_png_pre)
        sig["diagnosticPreTexture"] = out_png_pre

    # Texture rejection runs on the OPENED mask, before close: stripes must
    # still be individual lines for the parallel-stack test (the close fuses
    # decking into slabs). Two rejections, both drafting truths:
    # (1) periodic parallel stacks = hatch principle (decking/tile/rug);
    # (2) locally massive regions = no wall is 3x the median bar thickness
    #     (fused texture, pools, logos).
    bars, stripe_share, tex_lines = _reject_periodic_texture(opened, long_edge)
    bars, slab_share = _reject_slabs(bars)
    sig["textureRejectedShare"] = round(stripe_share, 3)
    sig["textureLines"] = tex_lines
    sig["slabRejectedShare"] = round(slab_share, 3)

    # Only now heal annotation crossings; texture is gone so nothing refuses.
    bars = cv2.morphologyEx(bars, cv2.MORPH_CLOSE, kern_close)

    bar_area = float((bars > 0).sum())
    survival = bar_area / mid_area if mid_area else 0.0
    sig["survivalAfterOpen"] = round(survival, 3)

    skel = skeletonize(bars > 0)
    skel_len = float(skel.sum())
    sig["skelLenPerLongEdge"] = round(skel_len / long_edge, 2)
    if skel_len:
        dist = cv2.distanceTransform(bars, cv2.DIST_L2, 5)
        med_th = float(np.median(2.0 * dist[skel]))
    else:
        med_th = 0.0
    sig["barMedianThicknessPx"] = round(med_th, 1)
    sig["strokeMedianPx"] = round(stroke_median, 2)

    checks = {
        "separated": separation >= 2.0,
        "areaReal": sig["midAreaRatio"] >= 0.005,
        "survives": survival >= 0.35,
        "longEnough": sig["skelLenPerLongEdge"] >= 2.0,
        "wallGrade": med_th >= max(4.0, 1.5 * stroke_median),
    }
    sig["checks"] = checks
    passed = sum(checks.values())
    sig["verdict"] = "strong" if passed == len(checks) else ("weak" if passed >= 3 else "absent")

    # Optional SECONDARY filter (default: measured and logged, NOT gating).
    # Measured on this corpus, largest-component share INVERTS as a wall
    # test: real poché wall webs fragment at door openings and annotation
    # crossings (0.16-0.29 on confirmed positives) while fused texture reads
    # as one giant component. Kept as an opt-in gate ("gate") for future
    # styles where it may hold; it can only downgrade strong -> weak, never
    # rescue a failing signal.
    if connectivity != "off" and bar_area > 0:
        n_cc, lab_cc, st_cc, _ = cv2.connectedComponentsWithStats(bars, 8)
        largest = float(st_cc[1:, cv2.CC_STAT_AREA].max()) / bar_area if n_cc > 1 else 0.0
        sig["largestComponentShare"] = round(largest, 3)
        sig["connectedCheck"] = largest >= 0.35
        if connectivity == "gate" and sig["verdict"] == "strong" and not sig["connectedCheck"]:
            sig["verdict"] = "weak"
            sig["downgradedBy"] = "connectivity"
    if out_png:
        _save_contrib_png(arr, bars, out_png)
        sig["diagnostic"] = out_png
    return sig


def signal_thick_stroke(arr, ink, long_edge, out_png=None):
    """Signal B: the CURRENT branch logic, measured and reported verbatim —
    stroke-width histogram over the all-ink skeleton, wall estimate = the
    dominant mode above 1.3x median. No new thresholds introduced."""
    sig = {"name": "thick-stroke"}
    dist = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    skel_all = skeletonize(ink > 0)
    th_all = 2.0 * dist[skel_all]
    stroke_median = float(np.median(th_all)) if th_all.size else 0.0
    wall_est = max(4.0, stroke_median)
    mode_share = 0.0
    if th_all.size:
        hist = np.bincount(np.clip(np.round(th_all).astype(int), 0, 80), minlength=81)
        lo = max(4, int(round(stroke_median * 1.3)))
        if hist[lo:].sum() > 0:
            wall_est = float(np.argmax(hist[lo:]) + lo)
            w = int(wall_est)
            mode_share = float(hist[max(0, w - 1):w + 2].sum()) / float(th_all.size)
    sig["strokeMedianPx"] = round(stroke_median, 2)
    sig["wallEstPx"] = round(wall_est, 1)
    sig["thickModeShare"] = round(mode_share, 4)
    sig["currentBranch"] = "filled" if wall_est >= 5.0 else "thin-strokes"

    # the wall mask the current branch would use
    if wall_est >= 5.0:
        k = max(3, int(round(wall_est * 0.5)) | 1)
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        mask = cv2.morphologyEx(ink, cv2.MORPH_OPEN, kern)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kern)
    else:
        mask = ink
    sig["maskInkRatio"] = round(float((mask > 0).mean()), 4)
    if out_png:
        _save_contrib_png(arr, mask, out_png)
        sig["diagnostic"] = out_png
    return sig


def signal_solid_polygon(ink, stroke_median):
    """Signal C: walls as large solid BLACK polygons (Matterport-style).
    No representative raster test plan has been validated for this style,
    so this is interface + logged observables ONLY — verdict is honestly
    'unknown' rather than a threshold invented without evidence."""
    dist = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    core = 2.0 * float(dist.max())
    base = max(2.0, stroke_median)
    massive = float((dist >= 2.0 * base).sum()) / max(1.0, float((ink > 0).sum()))
    return {
        "name": "solid-polygon",
        "verdict": "unknown",
        "reason": "no representative raster test plan validated; observables logged, no thresholds",
        "observables": {
            "maxCoreThicknessPx": round(core, 1),
            "inkShareWithCoreGe4xMedian": round(massive, 4),
        },
    }


def extract_gray_poche_mask(gray, long_edge):
    """The gray-poché wall-mask EXTRACTOR (Step 3). Same chain the signal
    validated: per-image two-level Otsu band -> open (kills halos) ->
    periodic-texture + slab rejection -> close (heals annotation crossings).
    Returns (mask, wall_est) — wall_est measured from the surviving bars so
    the shared downstream (letter filter, islands, spur prune, eps) scales
    correctly. Empty mask means the extractor declined; caller falls back."""
    empty = np.zeros_like(gray)
    t_paper, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink_vals = gray[gray < t_paper]
    if ink_vals.size < 500:
        return empty, 0.0
    t_dark, _ = cv2.threshold(ink_vals.reshape(-1, 1), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mid_mask = ((gray >= t_dark) & (gray < t_paper)).astype(np.uint8) * 255

    k_open = max(3, int(round(5 * long_edge / 1600.0)) | 1)
    k_close = max(k_open, int(round(k_open * 1.4)) | 1)
    bars = cv2.morphologyEx(mid_mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_open, k_open)))
    bars, _, _ = _reject_periodic_texture(bars, long_edge)
    bars, _ = _reject_slabs(bars)
    bars = cv2.morphologyEx(bars, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_close, k_close)))
    if not (bars > 0).any():
        return empty, 0.0
    dist = cv2.distanceTransform(bars, cv2.DIST_L2, 5)
    skel = skeletonize(bars > 0)
    if not skel.any():
        return empty, 0.0
    wall_est = float(np.median(2.0 * dist[skel]))
    return bars, wall_est


def route_style(gray_sig, wall_est, stroke_median, solid_sig):
    """Step 2: the explicit style router. A plain if/elif chain over the
    independent signals — no weighted scoring, no ML, no blended confidence.
    Order encodes specificity: a gray-poche plan ALSO contains black strokes
    (annotation), so the more specific fill signal must be checked before
    the generic thick-stroke mode; solid-polygon sits after thick-stroke
    because its detector is not yet validated (returns 'unknown')."""
    if gray_sig.get("verdict") == "strong":
        return "gray-poche", (
            "gray-poche: mid-gray fill population is wall-grade "
            f"(survival {gray_sig['survivalAfterOpen']}, bars {gray_sig['barMedianThicknessPx']}px, "
            f"skeleton {gray_sig['skelLenPerLongEdge']}x long edge)"
        )
    if wall_est >= 5.0:
        return "thick-stroke", (
            f"thick-stroke: dominant stroke mode {wall_est:.0f}px >= 5px over median "
            f"{stroke_median:.1f}px (existing filled branch, unchanged)"
        )
    if solid_sig.get("verdict") == "strong":
        return "solid-polygon", "solid-polygon: large filled black polygons dominate ink"
    return "thin-strokes", (
        f"fallback: no strong style signal (gray-poche {gray_sig.get('verdict')}, "
        f"stroke mode {wall_est:.0f}px < 5px, solid-polygon {solid_sig.get('verdict')}) — all-ink mask"
    )


def detect_style_signals(arr, long_edge, out_dir):
    """Compute all three style signals independently. Shared inputs (gray
    image, ink mask, all-ink stroke median) are measurements, not decisions;
    no signal reads another signal's verdict."""
    import os
    os.makedirs(out_dir, exist_ok=True)
    gray = arr.max(axis=2).astype(np.uint8)
    inverted = False
    if gray.mean() < 100:
        gray = 255 - gray
        inverted = True
    ink, otsu_t = _ink_mask(gray, long_edge)
    dist = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    skel_all = skeletonize(ink > 0)
    th_all = 2.0 * dist[skel_all]
    stroke_median = float(np.median(th_all)) if th_all.size else 0.0

    a = signal_gray_poche(arr, gray, long_edge, stroke_median,
                          out_png=os.path.join(out_dir, "signalA-gray-poche.png"),
                          out_png_pre=os.path.join(out_dir, "signalA-pre-texture.png"))
    b = signal_thick_stroke(arr, ink, long_edge,
                            out_png=os.path.join(out_dir, "signalB-thick-stroke-mask.png"))
    c = signal_solid_polygon(ink, stroke_median)
    style, why = route_style(a, b["wallEstPx"], stroke_median, c)
    return {
        "shared": {"otsuT": otsu_t, "strokeMedianPx": round(stroke_median, 2),
                   "inkRatio": round(float((ink > 0).mean()), 4), "inverted": inverted},
        "grayPoche": a,
        "thickStroke": b,
        "solidPolygon": c,
        "routing": {"style": style, "reason": why},
    }


def main():
    if len(sys.argv) < 2:
        fail("usage: propose_raster.py <image> [--png-out out.png] [--signals out_dir]")
    path = sys.argv[1]
    png_out = None
    if "--png-out" in sys.argv:
        png_out = sys.argv[sys.argv.index("--png-out") + 1]

    try:
        im = ImageOps.exif_transpose(Image.open(path))
        rgb = im.convert("RGB")
    except Exception as e:  # noqa: BLE001
        fail("open failed", str(e))
    if png_out:
        rgb.save(png_out, "PNG")

    arr = np.asarray(rgb)
    H0, W0 = arr.shape[:2]
    notes = []
    scale = 1.0
    if max(H0, W0) > MAX_PROC_PX:
        scale = MAX_PROC_PX / max(H0, W0)
        arr = cv2.resize(arr, (round(W0 * scale), round(H0 * scale)), interpolation=cv2.INTER_AREA)
        notes.append(f"processed at {scale:.3f}x")
    H, W = arr.shape[:2]
    long_edge = max(H, W)

    # Style-signal mode (router Step 1): measure signals, write diagnostics,
    # and exit. The normal proposal pipeline below is untouched.
    if "--signals" in sys.argv:
        out_dir = sys.argv[sys.argv.index("--signals") + 1]
        sig = detect_style_signals(arr, long_edge, out_dir)
        sig["scale"] = round(scale, 4)
        sys.stdout.write(json.dumps(sig))
        return

    # Darkness image: max channel makes colored fills (beige floors, tinted
    # rooms) read light, so only near-black ink survives binarization.
    gray = arr.max(axis=2).astype(np.uint8)
    if gray.mean() < 100:
        gray = 255 - gray
        notes.append("inverted light-on-dark input")

    # Otsu keeps filled walls solid; adaptive survives uneven scan lighting.
    otsu_t, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    blk = max(31, (long_edge // 40) | 1)
    adap = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, blk, 15)
    ink = cv2.bitwise_or(otsu, adap)
    if float(ink.mean()) / 255.0 > 0.45:
        dark_t = min(float(otsu_t), float(np.percentile(gray, 20)))
        ink = ((gray <= dark_t) * 255).astype(np.uint8)
        notes.append("otsu flooded (heavy fills); dark-percentile threshold used")

    # Despeckle: kill dust/JPEG-artifact specks.
    n, lab, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    min_area = max(4, round((long_edge / 1600.0) ** 2 * 8))
    keep = stats[:, cv2.CC_STAT_AREA] >= min_area
    keep[0] = False
    ink = np.where(keep[lab], 255, 0).astype(np.uint8)
    ink_ratio = float((ink > 0).mean())

    # Stroke-width statistics over the full-ink skeleton: text/furniture/dim
    # strokes cluster thin; walls are the dominant thick mode.
    dist = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    skel_all = skeletonize(ink > 0)
    th_all = 2.0 * dist[skel_all]
    stroke_median = float(np.median(th_all)) if th_all.size else 0.0
    wall_est = max(4.0, stroke_median)
    if th_all.size:
        hist = np.bincount(np.clip(np.round(th_all).astype(int), 0, 80), minlength=81)
        lo = max(4, int(round(stroke_median * 1.3)))
        if hist[lo:].sum() > 0:
            wall_est = float(np.argmax(hist[lo:]) + lo)

    # Style router (Step 2): explicit selection of the deterministic
    # extractor. The router only DECIDES; each branch below builds its own
    # wall mask. gray-poche/solid-polygon extractors that are not yet
    # implemented fall through honestly to the thin-stroke fallback.
    sig_gray = signal_gray_poche(arr, gray, long_edge, stroke_median)
    sig_solid = signal_solid_polygon(ink, stroke_median)
    style, why = route_style(sig_gray, wall_est, stroke_median, sig_solid)
    notes.append("router: " + why)

    if style == "gray-poche":
        mask, gray_est = extract_gray_poche_mask(gray, long_edge)
        if (mask > 0).any() and gray_est > 0:
            wall_est = gray_est
            branch = "gray-poche"
            notes.append(f"gray-poche extractor: wall mask from fill bars, wall_est {gray_est:.1f}px")
        else:
            mask = ink.copy()
            branch = "thin-strokes"
            notes.append("gray-poche extractor declined (empty mask); thin-stroke fallback")
    elif style == "thick-stroke":
        # Wall mask: opening removes strokes thinner than the kernel.
        k = max(3, int(round(wall_est * 0.5)) | 1)
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        mask = cv2.morphologyEx(ink, cv2.MORPH_OPEN, kern)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kern)
        branch = "filled"
    elif style == "solid-polygon":
        notes.append("solid-polygon detected but extractor not implemented; thin-stroke fallback")
        mask = ink.copy()
        branch = "thin-strokes"
    else:
        # Thin-stroke plans (walls drawn as ~2px outlines) can't be opened —
        # keep all ink and let the VLM sort it out.
        mask = ink.copy()
        branch = "thin-strokes"
        notes.append("thin-stroke plan: wall mask = all ink (noisier candidates)")

    # Drop letter/symbol blobs: components much smaller than a wall span.
    n, lab, stats, cent = cv2.connectedComponentsWithStats(mask, 8)
    min_side = wall_est * 2.2
    bbox_long = np.maximum(stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT])
    keep = bbox_long >= min_side
    keep[0] = False

    # Islands: dropped blobs with a wall-grade THICK core are not letters —
    # they're short wall stubs (e.g. the pier between two adjacent doorways).
    # Letters are thin-stroked, so 2×max(distance transform) separates them
    # cleanly. Emitted as a side channel (never into the mask/skeleton): the
    # TS gap-door pass uses them to split an oversized gap into real doorways.
    islands = []
    if branch in ("filled", "gray-poche"):
        dist_pre = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
        inv = 1.0 / scale
        for i in range(1, n):
            if keep[i]:
                continue
            if bbox_long[i] < wall_est * 0.6:
                continue  # speck
            core = 2.0 * float(dist_pre[lab == i].max())
            if core < wall_est * 0.7:
                continue  # thin-stroked = letter/symbol
            islands.append({
                "x": round(float(cent[i][0]) * inv, 1),
                "y": round(float(cent[i][1]) * inv, 1),
                "thicknessPx": round(core * inv, 1),
                "longPx": round(float(bbox_long[i]) * inv, 1),
            })

    mask = np.where(keep[lab], 255, 0).astype(np.uint8)

    dist_m = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    skel = skeletonize(mask > 0)
    sk = skel.astype(np.uint8)

    # Junction split: degree>=3 pixels become shared corner points; the rest
    # decomposes into simple branches we can walk.
    kernel8 = np.ones((3, 3), np.uint8)
    kernel8[1, 1] = 0
    deg = cv2.filter2D(sk, -1, kernel8, borderType=cv2.BORDER_CONSTANT) * sk
    junct = ((deg >= 3) & (sk > 0)).astype(np.uint8)
    branches = (sk > 0) & (junct == 0)
    nb, blab = cv2.connectedComponents(branches.astype(np.uint8), connectivity=8)
    nj, jlab, jstats, jcent = cv2.connectedComponentsWithStats(junct, 8)

    spur_len = wall_est * 1.75
    eps = max(1.5, wall_est * 0.15)
    centerlines = []

    ys, xs = np.nonzero(blab)
    by_branch = {}
    for y, x, b in zip(ys.tolist(), xs.tolist(), blab[ys, xs].tolist()):
        by_branch.setdefault(b, []).append((y, x))

    for b, pixels in by_branch.items():
        pixel_set = set(pixels)
        chain = order_chain(pixels, pixel_set)

        # Re-attach junction endpoints: branches lost their junction pixel;
        # append the adjacent junction cluster's centroid so segments meet.
        attached = [False, False]
        for end_i, (y, x) in ((0, chain[0]), (1, chain[-1])):
            found = None
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and jlab[yy, xx] > 0:
                        found = jlab[yy, xx]
                        break
                if found:
                    break
            if found:
                cx, cy = jcent[found]
                pt = (int(round(cy)), int(round(cx)))
                chain = ([pt] + chain) if end_i == 0 else (chain + [pt])
                attached[end_i] = True

        clen = sum(math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1])
                   for i in range(len(chain) - 1))
        # Spur prune: short dangling twig off a junction = skeleton artifact.
        if clen < spur_len and not all(attached):
            continue
        if clen < 2:
            continue

        th = float(np.median([2.0 * dist_m[y, x] for (y, x) in pixels]))
        pts = np.array([[x, y] for (y, x) in chain], dtype=np.int32).reshape(-1, 1, 2)
        approx = cv2.approxPolyDP(pts, eps, False).reshape(-1, 2)
        if len(approx) < 2:
            continue
        for i in range(len(approx) - 1):
            x0, y0 = approx[i]
            x1, y1 = approx[i + 1]
            if math.hypot(float(x1) - float(x0), float(y1) - float(y0)) < 2:
                continue
            inv = 1.0 / scale
            centerlines.append({
                "x0": round(float(x0) * inv, 1), "y0": round(float(y0) * inv, 1),
                "x1": round(float(x1) * inv, 1), "y1": round(float(y1) * inv, 1),
                "thicknessPx": round(th * inv, 1),
            })

    verdict = "good"
    if max(H0, W0) < MIN_GOOD_PX:
        verdict = "marginal"
        notes.append(f"low resolution ({W0}x{H0}px): suggestions may be poor")
    if ink_ratio < 0.005 or not centerlines:
        verdict = "poor"
        notes.append("almost no wall-like structure found")

    sys.stdout.write(json.dumps({
        "quality": {
            "width": W0, "height": H0, "scale": round(scale, 4),
            "inkRatio": round(ink_ratio, 4),
            "strokeMedianPx": round(stroke_median / scale, 2),
            "wallThicknessPx": round(wall_est / scale, 2),
            "maskBranch": branch, "style": style, "verdict": verdict, "notes": notes,
        },
        "centerlines": centerlines,
        "islands": islands,
    }))


if __name__ == "__main__":
    main()
