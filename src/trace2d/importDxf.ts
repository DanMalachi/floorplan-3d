import type { ImportSegment, ImportArc } from "@/store/useSceneStore";
import type { ImportText } from "@/trace2d/importPdf";
import { parseDxf, type ParsedDxf } from "@/trace2d/dxf/parseDxf";

// -----------------------------------------------------------------------------
// DXF importer (browser). Unlike the PDF path there is no server render — a DXF
// is pure vector, so we fit its geometry into an image-pixel canvas ourselves,
// draw a background raster for the tracing UI, and (crucially) derive a real
// metersPerPixel straight from the DXF units so a well-authored CAD file needs
// NO manual calibration. DWG files reach here too, after the server converts
// them to DXF text.
// -----------------------------------------------------------------------------

// Long-edge target for the rendered background. Big enough for precise tracing
// (well past WARN_IMAGE_PX) without producing absurd canvases.
const TARGET_LONG_PX = 2000;
const PAD_PX = 24;

export interface DxfImportResult {
  isVector: true;
  image: { src: string; width: number; height: number };
  segments: ImportSegment[];
  arcs: ImportArc[];
  texts: ImportText[];
  /** Real-world scale recovered from DXF units, or null when units are unknown. */
  metersPerPixel: number | null;
  stats: ParsedDxf["stats"] & { unitsKnown: boolean };
  summary: string;
}

// Plausible long-edge for a home/apartment plan, in meters. Used to sanity-check
// the scale we derive from $INSUNITS — real DXFs very often carry wrong units.
const PLAUSIBLE_MIN_M = 2;
const PLAUSIBLE_MAX_M = 300;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Real CAD plans routinely carry a small fraction of geometry scattered far from
// the drawing — leftover objects, off-sheet notes, a stray mirrored block. Those
// outliers wreck a naïve bounding box (one verified file: 5% of segments dragged
// the box from a 66-unit plan out to 6300 units, squashing the plan to a dot).
// So we crop to the DENSE cluster: median ± K·IQR of endpoint coordinates. IQR
// is robust to outliers, and a clean plan with no strays keeps ~everything.
const IQR_K = 6;

function denseBox(seg: { x0: number; y0: number; x1: number; y1: number }[]): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of seg) {
    xs.push(s.x0, s.x1);
    ys.push(s.y0, s.y1);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor((arr.length - 1) * p)))];
  const spanFor = (arr: number[]) => {
    const med = q(arr, 0.5);
    const iqr = Math.max(q(arr, 0.75) - q(arr, 0.25), 1e-9);
    return { med, half: IQR_K * iqr };
  };
  const X = spanFor(xs);
  const Y = spanFor(ys);
  // Use the larger half-window on both axes so an elongated (L-shaped) plan
  // isn't clipped along its long side.
  const half = Math.max(X.half, Y.half);
  return { minX: X.med - half, maxX: X.med + half, minY: Y.med - half, maxY: Y.med + half };
}

const inBox = (b: Box, x: number, y: number) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;

// Tight bounds of whatever survived the crop, for the final fit.
function tightBox(seg: { x0: number; y0: number; x1: number; y1: number }[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of seg) {
    minX = Math.min(minX, s.x0, s.x1);
    minY = Math.min(minY, s.y0, s.y1);
    maxX = Math.max(maxX, s.x0, s.x1);
    maxY = Math.max(maxY, s.y0, s.y1);
  }
  return { minX, minY, maxX, maxY };
}

export function dxfTextToResult(text: string): DxfImportResult {
  const parsed = parseDxf(text);
  if (!parsed.bounds || parsed.segments.length + parsed.arcs.length === 0) {
    throw new Error("no drawable geometry found in DXF (empty or unsupported entities)");
  }

  // Crop to the dense plan cluster, discarding scattered outlier geometry.
  const crop = denseBox(parsed.segments);
  const keptSeg = parsed.segments.filter((g) => inBox(crop, g.x0, g.y0) && inBox(crop, g.x1, g.y1));
  const keptArc = parsed.arcs.filter((a) => inBox(crop, a.x0, a.y0) && inBox(crop, a.x1, a.y1));
  const keptText = parsed.texts.filter((t) => inBox(crop, t.x, t.y));
  const droppedSeg = parsed.segments.length - keptSeg.length;

  // Fit the tight box of what survived (not the crop window, which is padded).
  const { minX, minY, maxX, maxY } = tightBox(keptSeg.length ? keptSeg : parsed.segments);
  const wModel = Math.max(maxX - minX, 1e-6);
  const hModel = Math.max(maxY - minY, 1e-6);
  // Pixels per model unit — fit the long edge, leaving a small pixel margin.
  const s = (TARGET_LONG_PX - 2 * PAD_PX) / Math.max(wModel, hModel);

  const W = Math.round(wModel * s + 2 * PAD_PX);
  const H = Math.round(hModel * s + 2 * PAD_PX);

  // Model -> image px. DXF Y points up; image Y points down, so flip.
  const tx = (x: number) => (x - minX) * s + PAD_PX;
  const ty = (y: number) => (maxY - y) * s + PAD_PX;

  // DXF line work is monochrome "ink" — every stroke is drawing geometry, like a
  // black-line vector PDF. Wall detection (extractWalls) only considers black
  // faces (`isBlack`), so strokes MUST be marked black or every wall is dropped.
  const INK: [number, number, number] = [0, 0, 0];

  const segments: ImportSegment[] = keptSeg.map((g) => ({
    x0: tx(g.x0),
    y0: ty(g.y0),
    x1: tx(g.x1),
    y1: ty(g.y1),
    color: INK,
    width: 0,
    layer: g.layer,
  }));

  const arcs: ImportArc[] = keptArc.map((a) => ({
    x0: tx(a.x0),
    y0: ty(a.y0),
    x1: tx(a.x1),
    y1: ty(a.y1),
    chord: a.chord * s,
    color: INK,
    width: 0,
    layer: a.layer,
  }));

  const texts: ImportText[] = keptText.map((t) => ({
    x: tx(t.x),
    y: ty(t.y),
    text: t.text,
  }));

  const image = renderBackground(segments, W, H);

  // Derive real-world scale from $INSUNITS, but only trust it if the resulting
  // plan size is physically plausible. Wrong/placeholder units are rife in real
  // DXFs (this file claimed mm for a whole apartment) — when in doubt, fall back
  // to manual calibration rather than silently loading a mis-scaled plan.
  let metersPerPixel: number | null = null;
  let scaleNote: string;
  if (parsed.metersPerUnit != null) {
    const longM = Math.max(wModel, hModel) * parsed.metersPerUnit;
    if (longM >= PLAUSIBLE_MIN_M && longM <= PLAUSIBLE_MAX_M) {
      metersPerPixel = parsed.metersPerUnit / s;
      scaleNote = `auto-scaled ~${(wModel * parsed.metersPerUnit).toFixed(1)}×${(hModel * parsed.metersPerUnit).toFixed(1)}m`;
    } else {
      scaleNote = `units look wrong (implies ${longM.toFixed(longM < 1 ? 3 : 0)}m) — calibrate manually`;
    }
  } else {
    scaleNote = "units unknown — calibrate manually";
  }

  const stats = { ...parsed.stats, unitsKnown: metersPerPixel != null };
  const dropNote = droppedSeg > 0 ? `, dropped ${droppedSeg} stray` : "";
  const summary = `✓ DXF — ${segments.length} lines, ${arcs.length} arcs, ${texts.length} labels${dropNote} · ${scaleNote}`;

  return { isVector: true, image, segments, arcs, texts, metersPerPixel, stats, summary };
}

/** Read a .dxf File (client) and convert to a loadable result. */
export async function importDxf(file: File): Promise<DxfImportResult> {
  const text = await file.text();
  return dxfTextToResult(text);
}

// Draw the parsed vectors onto a white canvas so the tracing overlay has a
// legible backdrop. Thin dark strokes — this is a reference image, not the trace.
function renderBackground(
  segments: ImportSegment[],
  W: number,
  H: number,
): { src: string; width: number; height: number } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const g of segments) {
    ctx.moveTo(g.x0, g.y0);
    ctx.lineTo(g.x1, g.y1);
  }
  ctx.stroke();
  return { src: canvas.toDataURL("image/png"), width: W, height: H };
}
