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

import { useSceneStore, type BuildTool } from "@/store/useSceneStore";
import type { OpeningType } from "@/schema/scene";
import { PD, pdGlass, pdChip } from "./tokens";
import { Tooltip } from "./Tooltip";
import { pdToast } from "./toast";

const TOOLS: { id: BuildTool; label: string; glyph: string; built: boolean }[] = [
  { id: "select", label: "Select", glyph: "◇", built: true },
  { id: "wall", label: "Wall", glyph: "▤", built: true },
  { id: "opening", label: "Opening", glyph: "⬓", built: true },
  { id: "measure", label: "Measure", glyph: "↔", built: true },
];

const OPENING_TYPES: { id: OpeningType; label: string; glyph: string }[] = [
  { id: "door", label: "Door", glyph: "🚪" },
  { id: "window", label: "Window", glyph: "🪟" },
  { id: "passage", label: "Passage", glyph: "⌷" },
];

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
        {TOOLS.map((t) => {
          const active = buildTool === t.id;
          return (
            <Tooltip key={t.id} label={t.built ? t.label : `${t.label} — not built yet`}>
              <button
                onClick={() => pick(t)}
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
                  background: active ? PD.accentTint : "transparent",
                  color: active ? PD.accentText : t.built ? PD.textSecondary : PD.textTertiary,
                  cursor: "pointer",
                  opacity: t.built ? 1 : 0.65,
                }}
              >
                <span style={{ fontSize: 13 }}>{t.glyph}</span>
                {t.label}
              </button>
            </Tooltip>
          );
        })}
      </div>
      {buildTool === "measure" && (
        <div style={{ padding: "5px 12px", fontSize: 11.5, fontFamily: PD.fontMono, color: PD.accentText, ...pdGlass({ borderRadius: 999 }) }}>
          Click two points on the floor · Esc clears
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
            <button key={t.id} onClick={() => setOpeningType(t.id)} style={pdChip(openingType === t.id, { display: "flex", alignItems: "center", gap: 5 })}>
              <span>{t.glyph}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
