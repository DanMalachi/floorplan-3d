import type { ParametricSpec } from "@/schema/scene";
import type { RoomType } from "@/furniture/catalog";
import type { GeneratorDef } from "./types";
import { GENERATORS, sanitizeSpec } from "./index";

// What the dock actually browses: one card per PIECE, not per generator.
//
// Its own module so the invariants are testable headlessly — every card needs
// a glyph, a name that stands alone, and a hotspot in its room that reaches it.
// A test that imported BottomDock would drag in the store and the whole dock,
// which is the same reason generatorGlyphs.tsx was split out in Phase 1.

/** One browsable piece: a generator, plus which of its variants this card
 *  places. A generator with no variants yields a single card. */
export interface CustomPiece {
  generator: GeneratorDef;
  variantId?: string;
  label: string;
  /** Glyph key: "<generatorId>:<variantId>", falling back to the generator id. */
  glyphKey: string;
  keywords: string[];
  /** Exactly what this card places, resolved once here rather than at click
   *  time: the generator's default spec, this card's variant, and the
   *  variant's own overrides. A worktop microwave and a side-by-side fridge
   *  share a generator and cannot share a size. */
  spec: ParametricSpec;
  /** Room tabs this card belongs to — the variant's, else the generator's. */
  rooms: RoomType[];
}

/** Expands a generator into its per-variant cards. Variants are separate
 *  products in the picker — one "Toilet" card hides the fact that three
 *  different toilets are available, which makes the catalog look empty. */
export function piecesOf(g: GeneratorDef): CustomPiece[] {
  if (!g.variants || g.variants.length <= 1) {
    return [
      {
        generator: g,
        label: g.label,
        glyphKey: g.id,
        keywords: g.hotspotKeywords ?? [g.label],
        spec: g.defaultSpec,
        rooms: g.rooms,
      },
    ];
  }
  return g.variants.map((v) => ({
    generator: g,
    variantId: v.id,
    label: v.cardLabel ?? `${g.label} · ${v.label}`,
    glyphKey: `${g.id}:${v.id}`,
    keywords: v.hotspotKeywords ?? g.hotspotKeywords ?? [g.label],
    spec: sanitizeSpec({ ...g.defaultSpec, ...v.defaults, variant: v.id } as ParametricSpec),
    rooms: v.rooms ?? g.rooms,
  }));
}

/** Every browsable card in the app, in generator order. Generators with no
 *  rooms are RETIRED — kept only so items saved with them still render (the
 *  kitchenRun and bathAccessory case) — so they yield no cards at all. */
export const ALL_PIECES = (): CustomPiece[] =>
  Object.values(GENERATORS)
    .filter((g) => g.rooms.length > 0)
    .flatMap(piecesOf);
