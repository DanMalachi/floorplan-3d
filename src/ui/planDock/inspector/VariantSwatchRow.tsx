"use client";

// Color/finish variant swatch row for FurnitureSection (Plan Dock P6). Only
// renders for the ~11 real IKEA variant groups (variantGroupFor returns null
// for everything else). A dot click swaps the PLACED item's asset in place —
// footprint is identical by construction (same variantKey = same W×D×H), so
// x/y/rotation/elevation never need to move, one undo step.

import type { FurnitureItem } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { variantGroupFor } from "@/furniture/variants";
import { PdSwatch } from "./panelKit";

export function VariantSwatchRow({ item }: { item: FurnitureItem }) {
  const group = variantGroupFor(item.assetId);
  if (!group) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {group.map((v) => (
        <PdSwatch
          key={v.assetId}
          hex={v.colors?.[0]?.hex ?? null}
          active={v.assetId === item.assetId}
          title={v.colors?.[0]?.name}
          size={16}
          onClick={() => useSceneStore.getState().replaceFurnitureAsset(item.id, v.assetId)}
        />
      ))}
    </div>
  );
}
