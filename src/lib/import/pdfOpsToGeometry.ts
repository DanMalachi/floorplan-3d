// -----------------------------------------------------------------------------
// pdf.js operator-list -> raw plan geometry.
//
// This replaces what legacy/scripts/extract_pdf.py got from PyMuPDF's
// page.get_drawings(). The crucial difference: PyMuPDF hands back coordinates
// with the CTM already resolved ("PyMuPDF resolves the CTM for us", per that
// script), whereas pdf.js hands back a raw op stream. We must therefore run the
// graphics-state machine ourselves -- transform stack, stroke/fill colour and
// line width -- or the overlay silently lands offset from the background and
// wall snapping grabs the wrong lines.
//
// Output space is PDF page points, y-down from the top-left corner -- exactly
// what extract_pdf.py emitted, so the existing `* zoom` conversion to
// image-pixel space in the caller is unchanged.
//
// Pure module: no DOM, no pdfjs import. The op codes are passed in so this can
// be unit-tested and diffed against the Python baseline under plain Node.
// -----------------------------------------------------------------------------

/** PDF transform matrix [a,b,c,d,e,f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface RawSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: [number, number, number] | null;
  width: number; // stroke width in pt (page space), matching the Python emitter
  layer: string;
}

export interface RawArc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  chord: number;
  color: [number, number, number] | null;
  width: number;
  layer: string;
}

/** The subset of pdfjs `OPS` this decoder needs. Injected to keep the module pure. */
export interface OpCodes {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  setLineWidth: number;
  setStrokeRGBColor: number;
  setFillRGBColor: number;
  setGState: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  beginGroup: number;
  endGroup: number;
  stroke: number;
  closeStroke: number;
  fill: number;
  eoFill: number;
  fillStroke: number;
  eoFillStroke: number;
  closeFillStroke: number;
  closeEOFillStroke: number;
}

export interface OperatorList {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

// pdf.js DrawOPS, from makePathFromDrawOPS() in pdf.mjs. The path payload is a
// flat numeric array: [op, ...coords, op, ...coords, ...].
const DRAW_MOVE_TO = 0;
const DRAW_LINE_TO = 1;
const DRAW_CURVE_TO = 2;
const DRAW_QUAD_TO = 3;
const DRAW_CLOSE = 4;

/** Number of cubic subdivisions. Matches flatten_cubic(n=8) in extract_pdf.py. */
const CURVE_STEPS = 8;

/** Degenerate-segment threshold in pt. Matches the guard in extract_pdf.py's emit(). */
const MIN_LEN_PT = 0.01;

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Compose so that `inner` is applied first, then `outer` (pdf.js Util.transform). */
function mul(outer: Matrix, inner: Matrix): Matrix {
  return [
    outer[0] * inner[0] + outer[2] * inner[1],
    outer[1] * inner[0] + outer[3] * inner[1],
    outer[0] * inner[2] + outer[2] * inner[3],
    outer[1] * inner[2] + outer[3] * inner[3],
    outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
    outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Uniform scale carried by a matrix — used to take line width into page space. */
function scaleOf(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

// pdf.js v6 normalises colours to CSS hex strings ("#000000"); the trace overlay
// and groupByColor() expect PyMuPDF's 0..1 float triples.
function hexToRgb(v: unknown): [number, number, number] | null {
  if (typeof v !== "string") return null;
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  // 3 decimals matches the Python emitter's round(v, 3); groupByColor() keys on
  // these values, so keeping the same precision keeps overlay grouping identical.
  const c = (v: number) => Math.round((v / 255) * 1000) / 1000;
  return [c((n >> 16) & 0xff), c((n >> 8) & 0xff), c(n & 0xff)];
}

interface GState {
  ctm: Matrix;
  lineWidth: number;
  stroke: [number, number, number] | null;
  fill: [number, number, number] | null;
}

function cloneState(s: GState): GState {
  return { ctm: [...s.ctm] as Matrix, lineWidth: s.lineWidth, stroke: s.stroke, fill: s.fill };
}

/**
 * Walk the operator list and emit straight segments (curves flattened) plus the
 * raw cubics, in page points with a top-left, y-down origin.
 *
 * @param pageHeightPt page height, for the y-flip out of PDF's y-up user space.
 */
export function opsToGeometry(
  opList: OperatorList,
  ops: OpCodes,
  pageHeightPt: number,
): { segments: RawSegment[]; arcs: RawArc[] } {
  // PDF user space is y-up from the bottom-left; the trace editor (and PyMuPDF)
  // use y-down from the top-left. This is the pdf.js viewport transform at
  // scale 1 — the caller applies the render zoom afterwards.
  const flipY: Matrix = [1, 0, 0, -1, 0, pageHeightPt];

  const segments: RawSegment[] = [];
  const arcs: RawArc[] = [];

  let st: GState = { ctm: [...IDENTITY] as Matrix, lineWidth: 0, stroke: null, fill: null };
  const stack: GState[] = [];

  const paintOps = new Set([
    ops.stroke,
    ops.closeStroke,
    ops.fill,
    ops.eoFill,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
  ]);
  // Ops that paint a stroke — these carry the stroke colour and a real width.
  // A fill-only path reports width 0, mirroring PyMuPDF (`width` is None there).
  const strokingOps = new Set([
    ops.stroke,
    ops.closeStroke,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
  ]);

  const n = opList.fnArray.length;
  for (let i = 0; i < n; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as never[];

    switch (fn) {
      case ops.save:
        stack.push(cloneState(st));
        break;

      case ops.restore:
        st = stack.pop() ?? st;
        break;

      case ops.transform:
        st.ctm = mul(st.ctm, args as unknown as Matrix);
        break;

      case ops.setLineWidth:
        st.lineWidth = (args[0] as number) ?? 0;
        break;

      case ops.setStrokeRGBColor:
        st.stroke = hexToRgb(args[0]);
        break;

      case ops.setFillRGBColor:
        st.fill = hexToRgb(args[0]);
        break;

      case ops.setGState: {
        // Only LW moves geometry; the rest is paint state we don't model.
        const entries = args[0] as unknown as [string, unknown][] | undefined;
        if (Array.isArray(entries)) {
          for (const e of entries) {
            if (Array.isArray(e) && e[0] === "LW") st.lineWidth = (e[1] as number) ?? 0;
          }
        }
        break;
      }

      // A form XObject is save() + transform(matrix) in the canvas backend; its
      // End is a plain restore(). Missing this offsets every path inside the form.
      case ops.paintFormXObjectBegin: {
        stack.push(cloneState(st));
        const m = args[0] as unknown as Matrix | null;
        if (m) st.ctm = mul(st.ctm, m);
        break;
      }
      case ops.paintFormXObjectEnd:
        st = stack.pop() ?? st;
        break;

      // Transparency groups likewise save/restore. The canvas backend also
      // offsets a scratch canvas, but endGroup composites it back at the same
      // offset, so the net effect on final coordinates is nil.
      case ops.beginGroup: {
        stack.push(cloneState(st));
        const g = args[0] as unknown as { matrix?: Matrix } | undefined;
        if (g?.matrix) st.ctm = mul(st.ctm, g.matrix);
        break;
      }
      case ops.endGroup:
        st = stack.pop() ?? st;
        break;

      case ops.constructPath: {
        const paintOp = args[0] as unknown as number;
        // Clip paths (endPath/clip/eoClip) bound other art rather than being
        // drawn; PyMuPDF's get_drawings() omits them too.
        if (!paintOps.has(paintOp)) break;

        const holder = args[1] as unknown as ArrayLike<number>[] | undefined;
        const data = holder?.[0];
        // pdf.js caches a Path2D back into this slot once the page has been
        // rendered. Decode before rendering; if we do see a Path2D the geometry
        // is unrecoverable, so skip rather than emit silent garbage.
        if (!data || typeof (data as ArrayLike<number>).length !== "number") break;

        const stroking = strokingOps.has(paintOp);
        const color = stroking ? (st.stroke ?? st.fill) : (st.fill ?? st.stroke);
        const widthPt = stroking ? st.lineWidth * scaleOf(st.ctm) : 0;
        const total = mul(flipY, st.ctm);

        emitPath(data, total, color, widthPt, segments, arcs);
        break;
      }

      default:
        break;
    }
  }

  return { segments, arcs };
}

function emitPath(
  data: ArrayLike<number>,
  total: Matrix,
  color: [number, number, number] | null,
  widthPt: number,
  segments: RawSegment[],
  arcs: RawArc[],
): void {
  const layer = "0"; // PDFs carry no CAD layer names; the DXF path supplies real ones.

  const push = (x0: number, y0: number, x1: number, y1: number) => {
    if (Math.abs(x1 - x0) < MIN_LEN_PT && Math.abs(y1 - y0) < MIN_LEN_PT) return;
    segments.push({ x0, y0, x1, y1, color, width: widthPt, layer });
  };

  // Current point and subpath start, in *device* space (already transformed).
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let has = false;

  for (let i = 0; i < data.length; ) {
    switch (data[i++]) {
      case DRAW_MOVE_TO: {
        const [x, y] = apply(total, data[i++], data[i++]);
        cx = sx = x;
        cy = sy = y;
        has = true;
        break;
      }
      case DRAW_LINE_TO: {
        const [x, y] = apply(total, data[i++], data[i++]);
        if (has) push(cx, cy, x, y);
        cx = x;
        cy = y;
        has = true;
        break;
      }
      case DRAW_CURVE_TO: {
        const [x1, y1] = apply(total, data[i++], data[i++]);
        const [x2, y2] = apply(total, data[i++], data[i++]);
        const [x3, y3] = apply(total, data[i++], data[i++]);
        emitCubic(cx, cy, x1, y1, x2, y2, x3, y3, push);
        arcs.push({
          x0: cx,
          y0: cy,
          x1: x3,
          y1: y3,
          chord: Math.hypot(x3 - cx, y3 - cy),
          color,
          width: widthPt,
          layer,
        });
        cx = x3;
        cy = y3;
        has = true;
        break;
      }
      case DRAW_QUAD_TO: {
        // PDF paths have no quadratics, but glyph outlines do. Elevate to a
        // cubic so curve handling stays in one place.
        const [qx, qy] = apply(total, data[i++], data[i++]);
        const [ex, ey] = apply(total, data[i++], data[i++]);
        const c1x = cx + (2 / 3) * (qx - cx);
        const c1y = cy + (2 / 3) * (qy - cy);
        const c2x = ex + (2 / 3) * (qx - ex);
        const c2y = ey + (2 / 3) * (qy - ey);
        emitCubic(cx, cy, c1x, c1y, c2x, c2y, ex, ey, push);
        cx = ex;
        cy = ey;
        has = true;
        break;
      }
      case DRAW_CLOSE:
        if (has) push(cx, cy, sx, sy);
        cx = sx;
        cy = sy;
        break;
      default:
        // Unknown opcode: the rest of the buffer can no longer be parsed safely.
        return;
    }
  }
}

function emitCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  push: (a: number, b: number, c: number, d: number) => void,
): void {
  let px = x0;
  let py = y0;
  for (let s = 1; s <= CURVE_STEPS; s++) {
    const t = s / CURVE_STEPS;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    const nx = a * x0 + b * x1 + c * x2 + d * x3;
    const ny = a * y0 + b * y1 + c * y2 + d * y3;
    push(px, py, nx, ny);
    px = nx;
    py = ny;
  }
}
