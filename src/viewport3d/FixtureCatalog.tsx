"use client";

import { useMemo, useState } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import { FIXTURE_CATALOG, type FixtureAsset, type FixtureCategory } from "@/fixtures/catalog";
import { PD, pdChip } from "@/ui/planDock/tokens";

/** A flat icon per shape — no GLB thumbnail machinery here (that's furniture-
 *  specific, coupled to CATALOG_BY_ID/spec.model): these are procedural
 *  primitives, not downloaded models. */
const SHAPE_ICON: Record<FixtureAsset["shape"], string> = {
  flushDisc: "●", // ●
  pendant: "☀",   // ☀ — stands in for a shade + bulb glow
  sconce: "◨",    // ◨ — a plate on a wall
};

const CATEGORIES: FixtureCategory[] = ["Ceiling", "Wall"];

/** Same 68px item-card shape as Plan Dock's furniture `ItemCard`, so Lighting
 *  reads as one system with Furniture/Paint/Floors instead of a leftover
 *  pre-overhaul component. */
function FixtureTile({ asset }: { asset: FixtureAsset }) {
  const placing = useSceneStore((s) => s.placing);
  const active = placing?.assetId === asset.assetId;
  return (
    <button
      onClick={() => useSceneStore.getState().setPlacing(active ? null : asset.assetId)}
      title={asset.name}
      style={{
        flex: "0 0 auto",
        width: 68,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: 4,
        borderRadius: PD.radiusS,
        border: `1.5px solid ${active ? PD.accent : "transparent"}`,
        background: active ? PD.accentTint : PD.surfaceMuted,
        cursor: "pointer",
        fontFamily: PD.fontUi,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          color: active ? PD.accentText : "oklch(0.82 0.1 75)",
        }}
      >
        {SHAPE_ICON[asset.shape]}
      </div>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: PD.textPrimary,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {asset.name}
      </span>
    </button>
  );
}

/** Lighting sub-catalog for the Decorate "Lighting" tab. Restyled onto Plan
 *  Dock's dark-glass tokens/ItemCard shape (Phase D) — was still the old
 *  pre-overhaul component (T tokens, vertical 3-col grid) until now; it read
 *  fine against the new dark backdrop but didn't match Furniture/Paint/Floors
 *  as one system. */
export function FixtureCatalog() {
  const placing = useSceneStore((s) => s.placing);
  const [activeCategory, setActiveCategory] = useState<FixtureCategory | null>(null);
  const items = useMemo(
    () => (activeCategory ? FIXTURE_CATALOG.filter((a) => a.category === activeCategory) : FIXTURE_CATALOG),
    [activeCategory],
  );
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <button onClick={() => setActiveCategory(null)} style={pdChip(activeCategory === null, { padding: "3px 8px", fontSize: 10.5 })}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setActiveCategory(c)} style={pdChip(activeCategory === c, { padding: "3px 8px", fontSize: 10.5 })}>
            {c}
          </button>
        ))}
        {placing && (
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: PD.accentText, fontFamily: PD.fontMono }}>
            Click to place · R rotates · Esc done
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 6, overflowY: "auto", overflowX: "hidden", alignContent: "flex-start", alignItems: "flex-start" }}>
        {items.map((asset) => (
          <FixtureTile key={asset.assetId} asset={asset} />
        ))}
      </div>
    </div>
  );
}
