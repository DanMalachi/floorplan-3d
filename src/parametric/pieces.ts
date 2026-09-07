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
  /** Resolve with `useTranslations("editor.parametric")` at the render site.
   *  When `variantLabelKey` is ALSO set, this variant carries no card caption
   *  of its own and the render site must compose
   *  `${t(labelKey)} · ${t(variantLabelKey)}` — two resolved translations,
   *  never a template built over the keys themselves (the keys are not
   *  words). Every live generator gives every one of its variants an
   *  explicit `cardLabelKey` except cooktop, so this composition is cooktop's
   *  three cards today, not a hypothetical. */
  labelKey: string;
  variantLabelKey?: string;
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
        labelKey: g.labelKey,
        glyphKey: g.id,
        // Every live generator sets its own hotspotKeywords explicitly (see
        // types.ts); `g.id` is a defensive last resort only, not a real
        // fallback path — unlike the old `g.label`, a translation key is not
        // searchable English.
        keywords: g.hotspotKeywords ?? [g.id],
        spec: g.defaultSpec,
        rooms: g.rooms,
      },
    ];
  }
  return g.variants.map((v) => ({
    generator: g,
    variantId: v.id,
    labelKey: v.cardLabelKey ?? g.labelKey,
    variantLabelKey: v.cardLabelKey ? undefined : v.labelKey,
    glyphKey: `${g.id}:${v.id}`,
    keywords: v.hotspotKeywords ?? g.hotspotKeywords ?? [g.id],
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
