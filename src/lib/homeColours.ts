export type ColourSource = "done" | "tambour" | "nirlat" | (string & {});
export type ColourFamily = "whites" | "neutrals" | "blacks" | "beiges" | "greens" | "blues" | "warm_earth" | "yellows" | "reds" | "purples";
export type ColourUse = "wall" | "ceiling" | "trim" | "cabinetry" | "door" | "accent";
export type Warmth = "all" | "warm" | "neutral" | "cool";
export type LightnessBand = "all" | "light" | "mid" | "dark";
export type SaturationBand = "all" | "low" | "medium" | "high";

export type LocalizedText = { en: string; he: string };

export type ColourSwatch = {
  id: string;
  source: ColourSource;
  sourceCode?: string;
  displayName: LocalizedText;
  family: ColourFamily;
  subgroup: string;
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number];
  lightness: number;
  chroma: number;
  undertone: string[];
  recommendedUses: ColourUse[];
  availability: "digital_only" | "licensed_supplier";
  specialist?: boolean;
  sortOrder: number;
};

export type ColourFilters = {
  family: ColourFamily | "all";
  warmth: Warmth;
  lightness: LightnessBand;
  saturation: SaturationBand;
  use: ColourUse | "all";
  query: string;
};

export const COLOUR_FAMILIES: ColourFamily[] = ["whites", "neutrals", "blacks", "beiges", "greens", "blues", "warm_earth", "yellows", "reds", "purples"];

let cache: ColourSwatch[] | null = null;

export async function loadHomeColours(): Promise<ColourSwatch[]> {
  if (cache) return cache;
  const module = await import("../../data/fan.done.v1.json");
  cache = module.default as ColourSwatch[];
  return cache;
}

export function localizedColourName(swatch: ColourSwatch, locale: string): string {
  return locale === "he" ? swatch.displayName.he : swatch.displayName.en;
}

export function filterColours(swatches: ColourSwatch[], filters: ColourFilters, locale: string): ColourSwatch[] {
  const query = filters.query.trim().toLocaleLowerCase(locale);
  return swatches.filter((swatch) => {
    if (filters.family !== "all" && swatch.family !== filters.family) return false;
    if (filters.warmth !== "all" && !swatch.undertone.includes(filters.warmth)) return false;
    if (filters.lightness === "light" && swatch.lightness < 72) return false;
    if (filters.lightness === "mid" && (swatch.lightness < 40 || swatch.lightness >= 72)) return false;
    if (filters.lightness === "dark" && swatch.lightness >= 40) return false;
    if (filters.saturation === "low" && swatch.chroma >= 12) return false;
    if (filters.saturation === "medium" && (swatch.chroma < 12 || swatch.chroma >= 28)) return false;
    if (filters.saturation === "high" && swatch.chroma < 28) return false;
    if (filters.use !== "all" && !swatch.recommendedUses.includes(filters.use)) return false;
    if (!query) return true;
    return `${swatch.displayName.en} ${swatch.displayName.he} ${swatch.id} ${swatch.family} ${swatch.subgroup}`.toLocaleLowerCase(locale).includes(query);
  });
}

export function deltaE(a: ColourSwatch, b: ColourSwatch): number {
  return Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
}

const warmthScore = (swatch: ColourSwatch): number => swatch.undertone.includes("warm") ? 1 : swatch.undertone.includes("cool") ? -1 : 0;

function nearest(selected: ColourSwatch, candidates: ColourSwatch[], score: (candidate: ColourSwatch) => number): ColourSwatch | null {
  let winner: ColourSwatch | null = null;
  let winnerScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.id === selected.id) continue;
    const value = score(candidate);
    if (value < winnerScore || (value === winnerScore && candidate.sortOrder < (winner?.sortOrder ?? Number.POSITIVE_INFINITY))) {
      winner = candidate;
      winnerScore = value;
    }
  }
  return winner;
}

export type ColourNeighbours = {
  lighter: ColourSwatch | null;
  darker: ColourSwatch | null;
  warmer: ColourSwatch | null;
  cooler: ColourSwatch | null;
  similar: ColourSwatch[];
};

export function colourNeighbours(selected: ColourSwatch, swatches: ColourSwatch[]): ColourNeighbours {
  const sameLane = swatches.filter((item) => item.subgroup === selected.subgroup && item.family === selected.family);
  const lighter = nearest(selected, sameLane.filter((item) => item.lightness > selected.lightness), (item) => item.lightness - selected.lightness);
  const darker = nearest(selected, sameLane.filter((item) => item.lightness < selected.lightness), (item) => selected.lightness - item.lightness);
  const selectedWarmth = warmthScore(selected);
  const warmer = nearest(selected, swatches.filter((item) => warmthScore(item) > selectedWarmth), (item) => deltaE(selected, item) + Math.abs(item.lightness - selected.lightness) + (item.family === selected.family ? 0 : 8));
  const cooler = nearest(selected, swatches.filter((item) => warmthScore(item) < selectedWarmth), (item) => deltaE(selected, item) + Math.abs(item.lightness - selected.lightness) + (item.family === selected.family ? 0 : 8));
  const similar = swatches
    .filter((item) => item.id !== selected.id)
    .map((item) => ({ item, distance: deltaE(selected, item) + (item.family === selected.family ? 0 : 4) + (item.subgroup === selected.subgroup ? 2 : 0) }))
    .sort((a, b) => a.distance - b.distance || a.item.sortOrder - b.item.sortOrder)
    .slice(0, 5)
    .map(({ item }) => item);
  return { lighter, darker, warmer, cooler, similar };
}
