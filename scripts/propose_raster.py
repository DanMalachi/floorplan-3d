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


def main():
    if len(sys.argv) < 2:
        fail("usage: propose_raster.py <image> [--png-out out.png]")
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

    # Wall mask: opening removes strokes thinner than the kernel. On
    # thin-stroke plans (walls drawn as ~2px outlines) opening would erase
    # everything - keep all ink and let the VLM sort it out.
    if wall_est >= 5.0:
        k = max(3, int(round(wall_est * 0.5)) | 1)
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        mask = cv2.morphologyEx(ink, cv2.MORPH_OPEN, kern)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kern)
        branch = "filled"
    else:
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
    if branch == "filled":
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
            "maskBranch": branch, "verdict": verdict, "notes": notes,
        },
        "centerlines": centerlines,
        "islands": islands,
    }))


if __name__ == "__main__":
    main()
