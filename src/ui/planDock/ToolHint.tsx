"use client";

// What the armed tool expects next, top-centre, shown only while a tool is
// armed. This was the second row of the Build toolbar; the toolbar's tool
// row (Select / Wall / Opening / Measure) is gone (Dan, 2026-10-01) — the
// tools live in the Build navigator's tiles, and Measure also in Decorate's
// shelf rail. What's left: the Wall and Measure hints, and while Opening is
// armed the Door / Window / Passage choice, Passage's only home.

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import type { OpeningType } from "@/schema/scene";
import { PD, pdGlass, pdChip } from "./tokens";
import { useHover } from "./useHover";
import { OpenDoorIcon, WindowPanesIcon, PassageIcon } from "./icons";

type Glyph = ComponentType<{ size?: number }>;

// `id` is the persisted `openingType` / `Opening.type` enum value and must NOT
// be renamed — it is in IndexedDB, Supabase and live Yjs docs. Only the LABEL
// changes: `effectiveSlide()` silently draws any door at or past
// PATIO_MIN_WIDTH as a glazed patio slider, so the type genuinely is "a door
// or a patio depending on width".
const OPENING_TYPES: { id: OpeningType; labelKey: string; Glyph: Glyph }[] = [
  { id: "door", labelKey: "door", Glyph: OpenDoorIcon },
  { id: "window", labelKey: "window", Glyph: WindowPanesIcon },
  { id: "passage", labelKey: "passage", Glyph: PassageIcon },
];

/** One opening-type chip (Door / Patio, Window, Passage). */
function OpeningTypeChip({ type, active, onPick }: { type: (typeof OPENING_TYPES)[number]; active: boolean; onPick: (t: OpeningType) => void }) {
  const t = useTranslations("editor.chrome");
  const [hovered, hoverBind] = useHover();
  const { Glyph } = type;
  return (
    <button
      {...hoverBind}
      onClick={() => onPick(type.id)}
      aria-pressed={active}
      style={{ ...pdChip(active, undefined, hovered), display: "flex", alignItems: "center", gap: 5 }}
    >
      {/* Passage keeps its old line glyph, drawn for 14px. */}
      <Glyph size={type.id === "passage" ? 14 : 18} aria-hidden />
      {t(`buildToolbar.openingTypes.${type.labelKey}`)}
    </button>
  );
}

export function ToolHint() {
  const t = useTranslations("editor.chrome");
  const appMode = useSceneStore((s) => s.appMode);
  const buildTool = useSceneStore((s) => s.buildTool);
  const openingType = useSceneStore((s) => s.openingType);
  const setOpeningType = useSceneStore((s) => s.setOpeningType);
  const build = appMode === "build";
  if (buildTool === "select" || (!build && buildTool !== "measure")) return null;

  const pill = (text: string) => (
    // role="status": the only statement of what the armed tool now expects,
    // announced when the tool is armed.
    <div role="status" style={{ padding: "5px 12px", fontSize: 11.5, fontFamily: PD.fontMono, color: PD.accentText, ...pdGlass({ borderRadius: 999 }) }}>
      {text}
    </div>
  );
  return (
    <div style={{ position: "absolute", top: 62, left: "50%", transform: "translateX(-50%)", zIndex: 29, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {buildTool === "measure" && pill(t("buildToolbar.measureHint"))}
      {build && buildTool === "wall" && pill(t("buildToolbar.wallHint"))}
      {build && buildTool === "opening" && (
        <div role="group" aria-label={t("buildToolbar.openingTypeGroupLabel")} style={{ display: "flex", alignItems: "center", gap: 4, padding: 4, ...pdGlass({ borderRadius: 999 }) }}>
          {OPENING_TYPES.map((o) => (
            <OpeningTypeChip key={o.id} type={o} active={openingType === o.id} onPick={setOpeningType} />
          ))}
        </div>
      )}
    </div>
  );
}
