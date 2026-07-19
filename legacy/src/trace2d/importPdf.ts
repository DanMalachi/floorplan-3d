import type { ImportSegment, ImportArc } from "./types";

interface RawSeg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: [number, number, number] | null;
  width: number;
  layer: string;
}

interface RawArc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  chord: number;
  color: [number, number, number] | null;
  width: number;
  layer: string;
}

interface RawText {
  x: number;
  y: number;
  text: string;
}

interface RawExtract {
  error?: string;
  detail?: string;
  isVector: boolean;
  page: { widthPt: number; heightPt: number; index: number; pageCount: number };
  render: { dataUrl: string; zoom: number; widthPx: number; heightPx: number };
  segments: RawSeg[];
  arcs: RawArc[];
  texts?: RawText[];
  stats: { drawings: number; images: number; segments: number; arcs: number };
}

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
  stats: RawExtract["stats"];
}

// POST the PDF to the serverless extractor, then convert raw pt geometry into
// the rendered-page pixel space (so the overlay aligns with the background).
export async function importPdf(file: File, page = 0): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("page", String(page));

  const res = await fetch("/api/extract", { method: "POST", body: form });
  const j = (await res.json()) as RawExtract;
  if (!res.ok || j.error) {
    throw new Error(j.error ? `${j.error}${j.detail ? `: ${j.detail}` : ""}` : `HTTP ${res.status}`);
  }

  const z = j.render.zoom;
  const segments: ImportSegment[] = j.segments.map((s) => ({
    x0: s.x0 * z,
    y0: s.y0 * z,
    x1: s.x1 * z,
    y1: s.y1 * z,
    color: s.color ?? null,
    width: s.width ?? 0,
    layer: s.layer ?? "0",
  }));
  const arcs: ImportArc[] = (j.arcs ?? []).map((a) => ({
    x0: a.x0 * z,
    y0: a.y0 * z,
    x1: a.x1 * z,
    y1: a.y1 * z,
    chord: a.chord * z,
    color: a.color ?? null,
    width: a.width ?? 0,
    layer: a.layer ?? "0",
  }));

  const texts: ImportText[] = (j.texts ?? []).map((t) => ({
    x: t.x * z,
    y: t.y * z,
    text: t.text,
  }));

  return {
    isVector: j.isVector,
    pageCount: j.page.pageCount,
    image: { src: j.render.dataUrl, width: j.render.widthPx, height: j.render.heightPx },
    segments,
    arcs,
    texts,
    stats: j.stats,
  };
}
