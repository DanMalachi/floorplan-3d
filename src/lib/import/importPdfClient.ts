// -----------------------------------------------------------------------------
// Client-side PDF import.
//
// Replaces the POST to /api/extract, which spawned Python (PyMuPDF) via
// child_process. That only ever worked on a machine with Python installed:
// Vercel's Node runtime has no `py`/`python3`, so the spawn failed with ENOENT.
// It also base64'd the full-resolution page render into the JSON response,
// which for a 3000px raster plan exceeds Vercel's 4.5 MB response cap — so the
// route was unshippable regardless of the interpreter.
//
// Doing it in the browser removes both limits, the upload round-trip and the
// function cold start. Output matches extract_pdf.py's contract exactly; the
// geometry decoder is verified segment-for-segment against it (see
// pdfOpsToGeometry.ts).
//
// The legacy module this supersedes stays untouched in legacy/ per CLAUDE.md
// rule 2 — nothing here imports its runtime code, only the shared trace types.
// -----------------------------------------------------------------------------
import type { ImportSegment, ImportArc } from "@legacy/trace2d/types";
import { opsToGeometry, type OpCodes, type OperatorList } from "./pdfOpsToGeometry";

/** A text word from the PDF, converted to image-pixel space. */
export interface ImportText {
  x: number;
  y: number;
  text: string;
}

export interface ImportResult {
  isVector: boolean;
  pageCount: number;
  image: { src: string; width: number; height: number };
  segments: ImportSegment[];
  arcs: ImportArc[];
  texts: ImportText[];
  stats: { drawings: number; images: number; segments: number; arcs: number };
}

/** Long-edge target for the background render, matching extract_pdf.py. */
const RENDER_LONG_PX = 1600;
/** Cap for the higher-resolution raster branch, matching extract_pdf.py. */
const RASTER_MAX_PX = 3000;
/** A plan with at least this many painted paths is treated as true vector art. */
const VECTOR_PATH_MIN = 50;

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

// pdf.js is ~1 MB; only pull it in when someone actually imports a PDF.
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    // Bundled by the app, not fetched from a CDN — a strict CSP or an offline
    // demo machine would break a remote worker URL.
    m.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return m;
  });
  return pdfjsPromise;
}

/**
 * Read a floor-plan PDF entirely in the browser: raw drawing geometry for the
 * trace overlay plus a rendered background to trace over.
 *
 * Coordinates come back in the background image's pixel space, which is the
 * space the trace editor works in — same as the old server extractor.
 */
export async function importPdf(file: File, page = 0): Promise<ImportResult> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const pageCount = doc.numPages;
    // getPage is 1-based; the caller's index is 0-based, as in the Python script.
    const pno = page >= 0 && page < pageCount ? page : 0;
    const pdfPage = await doc.getPage(pno + 1);

    const base = pdfPage.getViewport({ scale: 1 });

    // IMPORTANT: decode the operator list BEFORE rendering. pdf.js caches a
    // Path2D back into the constructPath args once a page has been painted,
    // and a Path2D cannot be read back into coordinates.
    const opList = (await pdfPage.getOperatorList()) as unknown as OperatorList;
    const ops = opCodes(pdfjs);

    const { pathCount, imageSizes } = surveyOps(opList, pdfjs);
    const isVector = pathCount >= VECTOR_PATH_MIN;

    const zoom = renderZoom(base.width, base.height, isVector, imageSizes);
    const viewport = pdfPage.getViewport({ scale: zoom });

    // Geometry comes out in page points; scale to the rendered pixel space so
    // the overlay lands exactly on the background.
    const raw = opsToGeometry(opList, ops, base.height);
    const segments: ImportSegment[] = raw.segments.map((s) => ({
      x0: s.x0 * zoom,
      y0: s.y0 * zoom,
      x1: s.x1 * zoom,
      y1: s.y1 * zoom,
      color: s.color,
      width: s.width,
      layer: s.layer,
    }));
    const arcs: ImportArc[] = raw.arcs.map((a) => ({
      x0: a.x0 * zoom,
      y0: a.y0 * zoom,
      x1: a.x1 * zoom,
      y1: a.y1 * zoom,
      chord: a.chord * zoom,
      color: a.color,
      width: a.width,
      layer: a.layer,
    }));

    const texts = await readTexts(pdfPage, base.height, zoom);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    // A plan is drawn without a page background, so an unpainted canvas stays
    // transparent and reads as black in the tracing view — fill it white.
    await pdfPage.render({ canvas, viewport, background: "#ffffff" }).promise;
    const src = canvas.toDataURL("image/png");

    return {
      isVector,
      pageCount,
      image: { src, width: canvas.width, height: canvas.height },
      segments,
      arcs,
      texts,
      stats: {
        drawings: pathCount,
        images: imageSizes.length,
        segments: segments.length,
        arcs: arcs.length,
      },
    };
  } finally {
    // Release the worker's page/font caches; a demo session imports repeatedly.
    await loadingTask.destroy().catch(() => {});
  }
}

/** Map pdfjs' OPS table onto the decoder's op-code contract. */
function opCodes(pdfjs: PdfjsModule): OpCodes {
  const O = pdfjs.OPS as unknown as Record<string, number>;
  return {
    save: O.save,
    restore: O.restore,
    transform: O.transform,
    constructPath: O.constructPath,
    setLineWidth: O.setLineWidth,
    setStrokeRGBColor: O.setStrokeRGBColor,
    setFillRGBColor: O.setFillRGBColor,
    setGState: O.setGState,
    paintFormXObjectBegin: O.paintFormXObjectBegin,
    paintFormXObjectEnd: O.paintFormXObjectEnd,
    beginGroup: O.beginGroup,
    endGroup: O.endGroup,
    stroke: O.stroke,
    closeStroke: O.closeStroke,
    fill: O.fill,
    eoFill: O.eoFill,
    fillStroke: O.fillStroke,
    eoFillStroke: O.eoFillStroke,
    closeFillStroke: O.closeFillStroke,
    closeEOFillStroke: O.closeEOFillStroke,
  };
}

/** Count painted paths and collect embedded image sizes, for the vector/raster call. */
function surveyOps(
  opList: OperatorList,
  pdfjs: PdfjsModule,
): { pathCount: number; imageSizes: [number, number][] } {
  const O = pdfjs.OPS as unknown as Record<string, number>;
  const painted = new Set([
    O.stroke,
    O.closeStroke,
    O.fill,
    O.eoFill,
    O.fillStroke,
    O.eoFillStroke,
    O.closeFillStroke,
    O.closeEOFillStroke,
  ]);
  const imageOps = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageXObjectRepeat]);

  let pathCount = 0;
  const imageSizes: [number, number][] = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === O.constructPath) {
      // args[0] is the paint op; clip paths (endPath/clip) are not drawings.
      const paintOp = (opList.argsArray[i] as unknown[])[0] as number;
      if (painted.has(paintOp)) pathCount++;
    } else if (imageOps.has(fn)) {
      const a = opList.argsArray[i] as unknown[];
      const w = a[1];
      const h = a[2];
      if (typeof w === "number" && typeof h === "number") imageSizes.push([w, h]);
      else imageSizes.push([0, 0]);
    }
  }
  return { pathCount, imageSizes };
}

/**
 * Background render scale. Mirrors extract_pdf.py: a fixed long-edge target for
 * vector plans, but for an image-only PDF the render IS the plan, so match the
 * embedded image's native resolution instead (capped, and never upscaled past it).
 */
function renderZoom(
  widthPt: number,
  heightPt: number,
  isVector: boolean,
  imageSizes: [number, number][],
): number {
  let zoom = Math.min(RENDER_LONG_PX / widthPt, RENDER_LONG_PX / heightPt);
  if (!isVector && imageSizes.length > 0) {
    const native = Math.max(0, ...imageSizes.map(([w, h]) => Math.max(w, h)));
    if (native > 0) {
      const target = Math.min(native, RASTER_MAX_PX);
      zoom = Math.max(zoom, Math.min(target / widthPt, target / heightPt));
    }
  }
  return zoom;
}

interface TextItemLike {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
}

/**
 * Room labels ("BEDROOM", "WC") in image-pixel space. pdf.js returns text runs
 * rather than words, so a run holding several words is split and each word
 * placed by its character offset — the Python side emitted per-word centres.
 */
async function readTexts(
  pdfPage: { getTextContent: () => Promise<{ items: unknown[] }> },
  pageHeightPt: number,
  zoom: number,
): Promise<ImportText[]> {
  const out: ImportText[] = [];
  let content: { items: unknown[] };
  try {
    content = await pdfPage.getTextContent();
  } catch {
    return out; // Scans carry no text layer; the label cue is simply absent.
  }

  for (const raw of content.items) {
    const item = raw as TextItemLike;
    const str = (item.str ?? "").trim();
    if (!str || !item.transform) continue;

    const [, , , , e, f] = item.transform;
    const w = item.width ?? 0;
    const h = item.height ?? 0;
    // PDF text origin sits on the baseline, y-up; the editor wants a y-down centre.
    const yTop = pageHeightPt - (f + h / 2);

    const words = str.split(/\s+/).filter((t) => t.length >= 2);
    if (words.length === 0) continue;

    if (words.length === 1) {
      out.push({ x: (e + w / 2) * zoom, y: yTop * zoom, text: words[0] });
      continue;
    }
    // Distribute by character offset — good enough to attribute a label to a room.
    const total = str.length || 1;
    let cursor = 0;
    for (const word of words) {
      const at = str.indexOf(word, cursor);
      const start = at >= 0 ? at : cursor;
      cursor = start + word.length;
      const centre = (start + word.length / 2) / total;
      out.push({ x: (e + centre * w) * zoom, y: yTop * zoom, text: word });
    }
  }
  return out;
}
