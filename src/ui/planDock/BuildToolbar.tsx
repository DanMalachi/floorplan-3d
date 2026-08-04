"use client";

// Build-mode toolbar (v1 README §"Build-mode toolbar"): Select / Wall /
// Opening / Measure, top-center, Build-tab only.
//
// Scope call: only "Select" and "Measure" are real tools here. "Select" IS
// the existing click/drag-to-edit behavior (no new code — it's what Build
// mode already does), and "Measure" is wired to MeasureTool.tsx, a new
// additive Canvas child. "Wall" and "Opening" (draw a brand-new wall from
// scratch / drop a new opening by clicking a wall) are real new 3D-editing
// features — node creation, wall-junction solving, snapping — not a toolbar
// reskin, so they're left as visible-but-inert per Dan's "no half-finished
// implementations" rule rather than silently faked. Clicking them shows what
// they'll do instead of pretending they already do it.

import { useState } from "react";
import { useSceneStore, type BuildTool } from "@/store/useSceneStore";
import { PD, pdGlass } from "./tokens";
import { Tooltip } from "./Tooltip";

const TOOLS: { id: BuildTool; label: string; glyph: string; built: boolean }[] = [
  { id: "select", label: "Select", glyph: "◇", built: true },
  { id: "wall", label: "Wall", glyph: "▤", built: false },
  { id: "opening", label: "Opening", glyph: "⬓", built: false },
  { id: "measure", label: "Measure", glyph: "↔", built: true },
];

export function BuildToolbar() {
  const buildTool = useSceneStore((s) => s.buildTool);
  const setBuildTool = useSceneStore((s) => s.setBuildTool);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = (t: (typeof TOOLS)[number]) => {
    if (!t.built) {
      setBuildTool("select");
      setNotice(`${t.label} tool isn't built yet — still using Select`);
      window.setTimeout(() => setNotice(null), 2200);
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
      {notice && (
        <div style={{ padding: "5px 12px", fontSize: 11.5, fontFamily: PD.fontMono, color: PD.warnText, ...pdGlass({ borderRadius: 999 }) }}>
          {notice}
        </div>
      )}
      {buildTool === "measure" && (
        <div style={{ padding: "5px 12px", fontSize: 11.5, fontFamily: PD.fontMono, color: PD.accentText, ...pdGlass({ borderRadius: 999 }) }}>
          Click two points on the floor · Esc clears
        </div>
      )}
    </div>
  );
}
