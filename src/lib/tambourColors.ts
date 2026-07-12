/**
 * Typed, lazy accessor for the Tambour fan deck.
 *
 * The 1651-shade dataset (~130 KB) is code-split out of the main bundle: it is
 * only fetched the first time this loader runs — call it when the colour picker
 * opens, not at module top level.
 *
 * The data is produced offline by scripts/scrape.mjs + scripts/normalize.mjs and
 * committed as data/tambour-colors.json. Until the scrape has been run it is an
 * empty array, so the app degrades to "no swatches" rather than a build error.
 */

export type TambourFamily =
  | "white"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "neutral";

export interface TambourColor {
  /** Fan-deck code, e.g. "0077A". */
  code: string;
  nameEn: string;
  nameHe: string;
  family: TambourFamily;
  /** Normalized 6-digit hex, e.g. "#b23a2f". */
  hex: string;
  /** [lightness 0–1, chroma, hue°] — perceptual sorting / matching. */
  oklch: [number, number, number];
}

let cache: TambourColor[] | null = null;

/** Load (and memoize) the full fan deck. Safe to call repeatedly. */
export async function loadTambourColors(): Promise<TambourColor[]> {
  if (cache) return cache;
  const mod = await import("../../data/tambour-colors.json");
  cache = mod.default as TambourColor[];
  return cache;
}

/** Numeric part of a fan-deck code, e.g. "1016P" → 1016, "TL0077A" → 77. */
function codeNumber(code: string): number {
  const m = code.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}

/** Order two colours by their Tambour code number, then the full code, so a
 *  family reads "1016P, 1017T, 1018P, …" in ascending fan-deck order. */
export function byCode(a: TambourColor, b: TambourColor): number {
  const na = codeNumber(a.code);
  const nb = codeNumber(b.code);
  if (na !== nb) return na - nb;
  return a.code.localeCompare(b.code);
}

/** Group the deck by family, each family sorted by Tambour code number. */
export function groupByFamily(
  colors: TambourColor[],
): Record<TambourFamily, TambourColor[]> {
  const groups = {} as Record<TambourFamily, TambourColor[]>;
  for (const c of colors) (groups[c.family] ??= []).push(c);
  for (const key of Object.keys(groups) as TambourFamily[]) groups[key].sort(byCode);
  return groups;
}
