"use client";

// Build-mode toolbar (v1 README §"Build-mode toolbar"): Select / Wall /
// Opening / Measure, top-center, Build-tab only.
//
// Scope call: "Select" IS the existing click/drag-to-edit behavior (no new
// code — it's what Build mode already does). "Measure" (MeasureTool.tsx),
// "Wall" (WallTool.tsx, Plan Dock P2) and "Opening" (OpeningTool.tsx, Plan
// Dock P3) are all real, additive Canvas children now. Clicking an unbuilt
// tool (none left as of P3, kept generic for any future addition) shows
// what it'll do instead of pretending it already does it.

import type { ComponentType } from "react";
import { useSceneStore, type BuildTool } from "@/store/useSceneStore";
import type { OpeningType } from "@/schema/scene";
import { PD, pdGlass, pdChip } from "./tokens";
import { Tooltip } from "./Tooltip";
import { pdToast } from "./toast";
import { useHover } from "./useHover";
import { SelectIcon, WallToolIcon, OpeningToolIcon, MeasureIcon, DoorIcon, WindowIcon, PassageIcon } from "./icons";

type Glyph = ComponentType<{ size?: number }>;

// `Glyph` is a component, not a character. These four were the text glyphs
// `◇ ▤ ⬓ ↔`, which reflowed between fonts/platforms and never matched the SVG
// icons beside them in the dock.
const TOOLS: { id: BuildTool; label: string; Glyph: Glyph; built: boolean }[] = [
  { id: "select", label: "Select", Glyph: SelectIcon, built: true },
  { id: "wall", label: "Wall", Glyph: WallToolIcon, built: true },
  // Stays "Opening" — it is the PARENT tool, whose sub-types are Door /
  // Patio, Window and Passage. Renaming it too would read "Opening › Opening".
  { id: "opening", label: "Opening", Glyph: OpeningToolIcon, built: true },
  { id: "measure", label: "Measure", Glyph: MeasureIcon, built: true },
];

// `id` is the persisted `openingType` / `Opening.type` enum value and must NOT
// be renamed — it is in IndexedDB, Supabase and live Yjs docs. Only the LABEL
// changes: `effectiveSlide()` silently draws any door at or past
// PATIO_MIN_WIDTH as a glazed patio slider, so the type genuinely is "a door
// or a patio depending on width".
const OPENING_TYPES: { id: OpeningType; label: string; Glyph: Glyph }[] = [
  { id: "door", label: "Door / Patio", Glyph: DoorIcon },
  { id: "window", label: "Window", Glyph: WindowIcon },
  { id: "passage", label: "Passage", Glyph: PassageIcon },
];

/** One toolbar tool. Own component so `useHover` is per button rather than
 *  one flag re-rendering the whole toolbar. */
function ToolButton({ tool, active, onPick }: { tool: (typeof TOOLS)[number]; active: boolean; onPick: (t: (typeof TOOLS)[number]) => void }) {
  const [hovered, hoverBind] = useHover();
  const { Glyph } = tool;
  return (
    <Tooltip label={tool.built ? tool.label : `${tool.label} — not built yet`}>
      <button
        {...hoverBind}
        onClick={() => onPick(tool)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          fontSize: 12.5,
          fontWeight: active ? 600 : 500,
          fontFamily: PD.fontUi,
          borderRadius: 999,
          border: "none",
          background: active ? PD.accentTint : hovered ? PD.surfaceMutedHover : "transparent",
          color: active ? PD.accentText : hovered ? PD.textPrimary : tool.built ? PD.textSecondary : PD.textTertiary,
          cursor: "pointer",
          opacity: tool.built ? 1 : 0.65,
          transition: "background 140ms ease, color 140ms ease",
        }}
      >
        <Glyph size={14} />
        {tool.label}
      </button>
    </Tooltip>
  );
}

/** One opening-type chip (Door / Patio, Window, Passage). */
function OpeningTypeChip({ type, active, onPick }: { type: (typeof OPENING_TYPES)[number]; active: boolean; onPick: (t: OpeningType) => void }) {
  const [hovered, hoverBind] = useHover();
  const { Glyph } = type;
  return (
    <button
      {...hoverBind}
      onClick={() => onPick(type.id)}
      style={{ ...pdChip(active, undefined, hovered), display: "flex", alignItems: "center", gap: 5 }}
    >
      <Glyph size={14} />
      {type.label}
    </button>
  );
}

export function BuildToolbar() {
  const buildTool = useSceneStore((s) => s.buildTool);
  const setBuildTool = useSceneStore((s) => s.setBuildTool);
  const openingType = useSceneStore((s) => s.openingType);
  const setOpeningType = useSceneStore((s) => s.setOpeningType);

  const pick = (t: (typeof TOOLS)[number]) => {
    if (!t.built) {
      setBuildTool("select");
      pdToast(`${t.label} tool isn't built yet — still using Select`);
      return;
    }
    setBuildTool(t.id);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 62,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 29,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 4, ...pdGlass({ borderRadius: 999 }) }}>
        {TOOLS.map((t) => (
          <ToolButton key={t.id} tool={t} active={buildTool === t.id} onPick={pick} />
        ))}
      </div>
      {buildTool === "measure" && (
        <div style={{ padding: "5px 12px", fontSize: 11.5, fontFamily: PD.fontMono, color: PD.accentText, ...pdGlass({ borderRadius: 999 }) }}>
          Click two points — floor, wall, or ceiling · Esc clears
        </div>
      )}
      {buildTool === "wall" && (
        <div style={{ padding: "5px 12px", fontSize: 11.5, fontFamily: PD.fontMono, color: PD.accentText, ...pdGlass({ borderRadius: 999 }) }}>
          Click to start, click to draw · Esc ends the chain, Esc again to stop
        </div>
      )}
      {buildTool === "opening" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 4, ...pdGlass({ borderRadius: 999 }) }}>
          {OPENING_TYPES.map((t) => (
            <OpeningTypeChip key={t.id} type={t} active={openingType === t.id} onPick={setOpeningType} />
          ))}
        </div>
      )}
    </div>
  );
}
