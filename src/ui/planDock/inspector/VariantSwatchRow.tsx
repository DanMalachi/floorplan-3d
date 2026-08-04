"use client";

// Color/finish variant swatch row for FurnitureSection (Plan Dock P5 stub,
// filled in by P6). Its own file — not inlined into FurnitureSection — so P6
// only has to replace this one file's body; FurnitureSection's layout is
// already final and doesn't change shape when the real variant grouping
// lands.

import type { FurnitureItem } from "@/schema/scene";

export function VariantSwatchRow({ item }: { item: FurnitureItem }) {
  void item;
  return null;
}
