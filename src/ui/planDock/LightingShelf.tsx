"use client";

// The Lighting "room": its navigator picture (navArt/lightingCorner.ts) shows
// every kind of light, and this is the shelf beside it. Lighting used to be a
// section tab of its own on the shelf's rail (FixtureCatalog, a protected
// file, still in the tree but no longer mounted); Dan moved it into the
// navigator as a twelfth room, so a light is found the way furniture is —
// pick the room, click the object in the picture, the shelf narrows to it.
//
// Same tile and filter row as FixtureCatalog, plus the hotspot filter.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import { FIXTURE_CATALOG, type FixtureAsset, type FixtureCategory, type FixtureShape } from "@/fixtures/catalog";
import { LinearLightIcon, GlobePendantIcon, DrumPendantIcon, GlobeSconceIcon, BoxSconceIcon, SquareLightIcon } from "@/fixtures/icons";
import { announce } from "@/ui/a11y/Announcer";
import { PD, pdChip } from "./tokens";
import { useHover } from "./useHover";
import { Tooltip } from "./Tooltip";
import { DiscLightIcon, PendantIcon, SconceIcon } from "./icons";
import type { RoomHotspot } from "./KitchenScene";

/** Objects in the Lighting picture. `keywords` is unused here (fixtures are
 *  matched by shape, below) and kept empty only to share the RoomHotspot type
 *  with the furniture rooms. */
export const LIGHTING_HOTSPOTS: RoomHotspot[] = [
  { id: "ceiling", labelKey: "lighting.ceiling", keywords: [] },
  { id: "strip", labelKey: "lighting.strip", keywords: [] },
  { id: "pendant", labelKey: "lighting.pendant", keywords: [] },
  { id: "wall", labelKey: "lighting.wall", keywords: [] },
  { id: "floorLamp", labelKey: "lighting.floorLamp", keywords: [] },
  { id: "tableLamp", labelKey: "lighting.tableLamp", keywords: [] },
];

/** Which catalog lights each object in the picture stands for. Floor and
 *  table lamps have none yet: the catalog has no free-standing lamp, so those
 *  two show the shelf's empty state until one is added. */
const HOTSPOT_SHAPES: Record<string, FixtureShape[]> = {
  ceiling: ["flushDisc", "flushSquare"],
  strip: ["linear"],
  pendant: ["pendant", "globePendant", "drumPendant"],
  wall: ["sconce", "globeSconce", "boxSconce"],
  floorLamp: [],
  tableLamp: [],
};

const SHAPE_ICON: Record<FixtureShape, (p: { size?: number }) => React.ReactElement> = {
  flushDisc: DiscLightIcon,
  pendant: PendantIcon,
  sconce: SconceIcon,
  linear: LinearLightIcon,
  globePendant: GlobePendantIcon,
  drumPendant: DrumPendantIcon,
  globeSconce: GlobeSconceIcon,
  boxSconce: BoxSconceIcon,
  flushSquare: SquareLightIcon,
};

const CATEGORIES: FixtureCategory[] = ["Ceiling", "Wall"];

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const [hovered, hoverBind] = useHover();
  return (
    <button onClick={onClick} {...hoverBind} aria-pressed={active} style={pdChip(active, { padding: "3px 8px", fontSize: 10.5 }, hovered)}>
      {children}
    </button>
  );
}

/** Same shape as the furniture ItemCard (92 wide, 72px picture). */
function FixtureTile({ asset }: { asset: FixtureAsset }) {
  const t = useTranslations("editor");
  const name = t(`inspector.fixture.names.${asset.nameKey}`);
  const placing = useSceneStore((s) => s.placing);
  const active = placing?.assetId === asset.assetId;
  const [hovered, hoverBind] = useHover();
  const Icon = SHAPE_ICON[asset.shape];
  return (
    <Tooltip label={name} placement="bottom">
      <button
        onClick={() => useSceneStore.getState().setPlacing(active ? null : asset.assetId)}
        {...hoverBind}
        aria-pressed={active}
        style={{
          flex: "0 0 auto",
          width: 92,
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
          aria-hidden
          style={{
            width: 72,
            height: 72,
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: active ? PD.accentText : "oklch(0.82 0.1 75)",
          }}
        >
          <Icon size={40} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: PD.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {name}
        </span>
      </button>
    </Tooltip>
  );
}

export function LightingShelf({ activeHotspot }: { activeHotspot: string | null }) {
  const t = useTranslations("editor.lighting");
  const td = useTranslations("editor.dock");
  const placing = useSceneStore((s) => s.placing);
  const [activeCategory, setActiveCategory] = useState<FixtureCategory | null>(null);
  const hint = placing ? t(placing.assetId === "fx:linear" ? "drawHint" : "placeHint") : null;
  // Arming a light changes what the next click does; the hint line is the only
  // notice of it, so it is spoken too.
  useEffect(() => {
    if (hint) announce(hint);
  }, [hint]);
  const items = useMemo(() => {
    const shapes = activeHotspot ? HOTSPOT_SHAPES[activeHotspot] : null;
    return FIXTURE_CATALOG.filter((a) => (!shapes || shapes.includes(a.shape)) && (!activeCategory || a.category === activeCategory));
  }, [activeHotspot, activeCategory]);
  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <div role="group" aria-label={t("filterLabel")} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 3 }}>
        <CategoryChip active={activeCategory === null} onClick={() => setActiveCategory(null)}>
          {t("filterAll")}
        </CategoryChip>
        {/* `c` is the stored FixtureCategory; only the LABEL is translated. */}
        {CATEGORIES.map((c) => (
          <CategoryChip key={c} active={activeCategory === c} onClick={() => setActiveCategory(c)}>
            {t(`filter${c}`)}
          </CategoryChip>
        ))}
        {hint && <span style={{ marginInlineStart: "auto", fontSize: 10.5, color: PD.accentText, fontFamily: PD.fontMono }}>{hint}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 6, overflowY: "auto", overflowX: "hidden", alignContent: "flex-start", alignItems: "flex-start" }}>
        {items.length === 0 ? (
          <div style={{ padding: "8px 4px", fontSize: 11, color: PD.textTertiary }}>{td("nothingHere")}</div>
        ) : (
          items.map((asset) => <FixtureTile key={asset.assetId} asset={asset} />)
        )}
      </div>
    </div>
  );
}
