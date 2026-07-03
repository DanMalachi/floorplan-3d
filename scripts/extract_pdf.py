"""
Phase 2 PDF extractor (serverless side).

Reads a vector floor-plan PDF and emits raw drawing geometry as JSON on stdout:
all stroked/filled path segments with their stroke color + width, in PDF page
coordinates (PyMuPDF resolves the CTM for us; origin is top-left, y-down, which
already matches the editor's image-pixel convention). Also renders the page to a
PNG (background reference for tracing) and flags flattened/raster input.

Interpretation (wall pairing, opening detection) is intentionally NOT done here —
that lives in TypeScript so it reuses the existing trace-space + snapping + faces.

Usage: py extract_pdf.py <pdf_path> [page_index]
"""
import sys, json, base64, math
import fitz  # PyMuPDF


def flatten_cubic(p0, p1, p2, p3, n=8):
    """Sample a cubic Bezier into n straight segments (for the raw overlay)."""
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = (mt**3) * p0[0] + 3 * (mt**2) * t * p1[0] + 3 * mt * (t**2) * p2[0] + (t**3) * p3[0]
        y = (mt**3) * p0[1] + 3 * (mt**2) * t * p1[1] + 3 * mt * (t**2) * p2[1] + (t**3) * p3[1]
        pts.append((x, y))
    return pts


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no pdf path"})); return
    path = sys.argv[1]
    pno = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    try:
        doc = fitz.open(path)
    except Exception as e:
        print(json.dumps({"error": f"open failed: {e}"})); return
    if pno >= doc.page_count:
        pno = 0
    page = doc[pno]
    rect = page.rect

    drawings = page.get_drawings()
    images = page.get_images(full=True)

    # Raster / flattened detection: a true vector plan has many vector paths and
    # little-to-no full-page imagery. A scan is the opposite.
    is_vector = len(drawings) >= 50
    big_image = False
    for im in images:
        if im[2] >= rect.width * 1.5 and im[3] >= rect.height * 1.5:
            big_image = True
    if big_image and len(drawings) < 30:
        is_vector = False

    def rgb(c):
        return [round(v, 3) for v in c] if c else None

    segments = []   # straight pieces (lines, rects, flattened curves) for overlay
    arcs = []       # raw cubic curves kept for door-swing detection (M3)

    def emit(x0, y0, x1, y1, color, width, src, layer):
        if abs(x1 - x0) < 0.01 and abs(y1 - y0) < 0.01:
            return
        segments.append({
            "x0": round(x0, 2), "y0": round(y0, 2),
            "x1": round(x1, 2), "y1": round(y1, 2),
            "color": color, "width": round(width, 2), "src": src,
            "layer": layer,
        })

    for d in drawings:
        color = rgb(d.get("color")) or rgb(d.get("fill"))
        width = d.get("width") or 0.0
        layer = d.get("layer") or "0"
        for it in d["items"]:
            op = it[0]
            if op == "l":
                a, b = it[1], it[2]
                emit(a.x, a.y, b.x, b.y, color, width, "l", layer)
            elif op == "re":
                r = it[1]
                emit(r.x0, r.y0, r.x1, r.y0, color, width, "re", layer)
                emit(r.x1, r.y0, r.x1, r.y1, color, width, "re", layer)
                emit(r.x1, r.y1, r.x0, r.y1, color, width, "re", layer)
                emit(r.x0, r.y1, r.x0, r.y0, color, width, "re", layer)
            elif op == "qu":
                q = it[1]
                pts = [q.ul, q.ur, q.lr, q.ll, q.ul]
                for i in range(4):
                    emit(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, color, width, "qu", layer)
            elif op == "c":
                p0, p1, p2, p3 = it[1], it[2], it[3], it[4]
                flat = flatten_cubic((p0.x, p0.y), (p1.x, p1.y), (p2.x, p2.y), (p3.x, p3.y))
                for i in range(len(flat) - 1):
                    emit(flat[i][0], flat[i][1], flat[i + 1][0], flat[i + 1][1], color, width, "c", layer)
                chord = math.hypot(p3.x - p0.x, p3.y - p0.y)
                arcs.append({
                    "x0": round(p0.x, 2), "y0": round(p0.y, 2),
                    "x1": round(p3.x, 2), "y1": round(p3.y, 2),
                    "chord": round(chord, 2), "color": color, "width": round(width, 2),
                    "layer": layer,
                })

    # Render the page as a background reference (display only, not for extraction).
    zoom = min(1600 / rect.width, 1600 / rect.height)
    if not is_vector:
        # Image-only PDF: the render IS the plan the raster proposer consumes,
        # so match the embedded image's native resolution instead of a fixed
        # 1600px (capped — payload; never upscaled past native).
        native = max((max(im[2], im[3]) for im in images), default=0)
        if native > 0:
            target = min(native, 3000)
            zoom = max(zoom, min(target / rect.width, target / rect.height))
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    png_b64 = base64.b64encode(pix.tobytes("png")).decode("ascii")

    out = {
        "isVector": is_vector,
        "page": {"widthPt": round(rect.width, 2), "heightPt": round(rect.height, 2), "index": pno, "pageCount": doc.page_count},
        "render": {
            "dataUrl": "data:image/png;base64," + png_b64,
            "zoom": round(zoom, 5),
            "widthPx": pix.width,
            "heightPx": pix.height,
        },
        "segments": segments,
        "arcs": arcs,
        "stats": {"drawings": len(drawings), "images": len(images), "segments": len(segments), "arcs": len(arcs)},
    }
    doc.close()
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
