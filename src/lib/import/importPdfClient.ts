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
// function cold start.
//
// The legacy module this supersedes stays untouched in legacy/ per CLAUDE.md
// rule 2 — nothing here imports its runtime code.
//
// NO VECTOR GEOMETRY (2026-08-24). A CAD PDF used to also give up its drawing
// segments, painted as a "vector overlay" and used as a snapping magnet. That
// was only ever worth its cost while auto-detection consumed it; by hand it
// hurt, because the decoded geometry lands offset from the rendered page on
// real AutoCAD plans (see legacy/src/lib/import/pdfOpsToGeometry.ts for why),
// and tracing over lines that don't sit on the drawing is worse than tracing
// over none. A PDF now yields exactly what an image import yields: a page to
// trace over — plus its text, which is a label cue, not geometry, and never
// gets in the pen's way. DXF/DWG are unaffected: their vectors are correctly
// registered and carry real-world scale.
// -----------------------------------------------------------------------------

/** A text word from the PDF, converted to image-pixel space. */
export interface ImportText {
  x: number;
  y: number;
  text: string;
}

export interface ImportResult {
  pageCount: number;
  image: { src: string; width: number; height: number };
  texts: ImportText[];
  /** Diagnostic only — the two counts that decided the render scale below. */
  stats: { drawings: number; images: number };
}

/** The slice of a pdf.js operator list this module reads. */
interface OperatorList {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

/** Long-edge target for the background render, matching extract_pdf.py. */
const RENDER_LONG_PX = 1600;
/** Cap for the higher-resolution raster branch, matching extract_pdf.py. */
const RASTER_MAX_PX = 3000;
/**
 * A plan with at least this many painted paths is CAD-drawn rather than a
 * scan. Nothing is extracted from those paths any more — the count survives
 * only to pick the render scale, since an image-only PDF wants its embedded
 * bitmap's native resolution while drawn art is resolution-independent.
 */
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
 * Read a floor-plan PDF entirely in the browser: a rendered page to trace over,
 * plus its text words.
 *
 * Text coordinates come back in the background image's pixel space, which is
 * the space the trace editor works in.
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

    // Survey the op stream BEFORE rendering. pdf.js caches a Path2D back into
    // the constructPath args once a page has been painted, which would make the
    // paint-op read below unreliable.
    const opList = (await pdfPage.getOperatorList()) as unknown as OperatorList;
    const { pathCount, imageSizes } = surveyOps(opList, pdfjs);

    const zoom = renderZoom(base.width, base.height, pathCount >= VECTOR_PATH_MIN, imageSizes);
    const viewport = pdfPage.getViewport({ scale: zoom });

    const texts = await readTexts(pdfPage, base.height, zoom);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    // A plan is drawn without a page background, so an unpainted canvas stays
    // transparent and reads as black in the tracing view — fill it white.
    await pdfPage.render({ canvas, viewport, background: "#ffffff" }).promise;
    const src = canvas.toDataURL("image/png");

    return {
      pageCount,
      image: { src, width: canvas.width, height: canvas.height },
      texts,
      stats: { drawings: pathCount, images: imageSizes.length },
    };
  } finally {
    // Release the worker's page/font caches; a demo session imports repeatedly.
    await loadingTask.destroy().catch(() => {});
  }
}

/** Count painted paths and collect embedded image sizes, for the render-scale call. */
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
 * drawn plans, but for an image-only PDF the render IS the plan, so match the
 * embedded image's native resolution instead (capped, and never upscaled past it).
 */
function renderZoom(
  widthPt: number,
  heightPt: number,
  isDrawn: boolean,
  imageSizes: [number, number][],
): number {
  let zoom = Math.min(RENDER_LONG_PX / widthPt, RENDER_LONG_PX / heightPt);
  if (!isDrawn && imageSizes.length > 0) {
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
