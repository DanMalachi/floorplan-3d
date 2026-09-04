"use client";

import { useMemo, useState } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import { FIXTURE_CATALOG, type FixtureAsset, type FixtureCategory } from "@/fixtures/catalog";
import { PD, pdChip } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { DiscLightIcon, PendantIcon, SconceIcon } from "@/ui/planDock/icons";

/** A drawn icon per shape — no GLB thumbnail machinery here (that's furniture-
 *  specific, coupled to CATALOG_BY_ID/spec.model): these are procedural
 *  primitives, not downloaded models.
 *
 *  These were three text characters (● ☀ ◨) until the icon sweep. Being text
 *  meant they reflowed between fonts and platforms and never matched the SVG
 *  icons in the dock beside them; the three glyphs here were drawn for exactly
 *  this row. */
const SHAPE_ICON: Record<FixtureAsset["shape"], (p: { size?: number }) => React.ReactElement> = {
  flushDisc: DiscLightIcon,
  pendant: PendantIcon,
  sconce: SconceIcon,
};

const CATEGORIES: FixtureCategory[] = ["Ceiling", "Wall"];

/** All / Ceiling / Wall. Its own component so each chip can hold a hover flag.
 *  (`pdChip` drops its `extra` argument — it always has; see tokens.ts — so the
 *  padding/fontSize below render exactly as they did before.) */
function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hovered, hoverBind] = useHover();
  return (
    <button onClick={onClick} {...hoverBind} style={pdChip(active, { padding: "3px 8px", fontSize: 10.5 }, hovered)}>
      {children}
    </button>
  );
}

/** Same 68px item-card shape as Plan Dock's furniture `ItemCard`, so Lighting
 *  reads as one system with Furniture/Paint/Floors instead of a leftover
 *  pre-overhaul component. */
function FixtureTile({ asset }: { asset: FixtureAsset }) {
  const placing = useSceneStore((s) => s.placing);
  const active = placing?.assetId === asset.assetId;
  const [hovered, hoverBind] = useHover();
  const Icon = SHAPE_ICON[asset.shape];
  return (
    <button
      onClick={() => useSceneStore.getState().setPlacing(active ? null : asset.assetId)}
      title={asset.name}
      {...hoverBind}
      style={{
        flex: "0 0 auto",
        width: 68,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: 4,
        borderRadius: PD.radiusS,
        border: `1.5px solid ${active ? PD.accent : hovered ? PD.hairline : "transparent"}`,
        background: active ? PD.accentTint : hovered ? PD.surfaceMutedHover : PD.surfaceMuted,
        cursor: "pointer",
        fontFamily: PD.fontUi,
        transition: "background 140ms ease, border-color 140ms ease",
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
          color: active ? PD.accentText : "oklch(0.82 0.1 75)",
        }}
      >
        <Icon size={26} />
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
        <CategoryChip active={activeCategory === null} onClick={() => setActiveCategory(null)}>
          All
        </CategoryChip>
        {CATEGORIES.map((c) => (
          <CategoryChip key={c} active={activeCategory === c} onClick={() => setActiveCategory(c)}>
            {c}
          </CategoryChip>
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
