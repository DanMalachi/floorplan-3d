"use client";

// Wall/rail/portal inspector (Plan Dock P5) — PD port of Viewport.tsx's old
// WallInspector, plus one new control the old one never had: painted-face
// swatch chips that RE-ARM the paint brush with that face's current color,
// so touching up or extending a paint job doesn't require reopening the
// Paint tab and hunting for the exact shade again.

import { useSceneStore } from "@/store/useSceneStore";
import type { Wall } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";
import { PD, pdChip } from "../tokens";
import { pdToast } from "../toast";
import { pdInspectorPanel, PdSectionTitle, PdHelpText, PdNumField, pdChipFlex, PdSwatch } from "./panelKit";

const KIND_LABEL = { wall: "Wall", rail: "Rail", portal: "Open boundary" } as const;

export function WallSection({ wall }: { wall: Wall }) {
  const scene = useSceneStore((s) => s.scene);
  const a = scene.nodes.find((n) => n.id === wall.a);
  const b = scene.nodes.find((n) => n.id === wall.b);
  const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const kind = wall.kind ?? "wall";
  const isPortal = kind === "portal";

  const patch = (label: string, p: Partial<Wall>) => {
    const s = useSceneStore.getState();
    s.commitScene(label, {
      ...s.scene,
      walls: s.scene.walls.map((w) => (w.id === wall.id ? { ...w, ...p } : w)),
    });
  };
  // Converting DROPS the openings on this edge: a rail or an open boundary has
  // nothing to cut a hole in, so leaving them would strand doors in mid-air.
  const setKind = (next: "wall" | "rail" | "portal") => {
    if (next === kind) return;
    const s = useSceneStore.getState();
    s.commitScene(`Make ${KIND_LABEL[next].toLowerCase()}`, {
      ...s.scene,
      walls: s.scene.walls.map((w) => (w.id === wall.id ? { ...w, kind: next } : w)),
      openings: next === "wall" ? s.scene.openings : s.scene.openings.filter((o) => o.wallId !== wall.id),
    });
  };

  // Re-arm the paint brush with a face's CURRENT color (undefined -> plaster)
  // so extending an existing paint job to another wall doesn't need the Paint
  // tab reopened and the shade rediscovered.
  const armPaint = (hex: string | undefined, label: string) => {
    const s = useSceneStore.getState();
    s.setAppMode("furnish");
    s.setBrush({ kind: "paint", hex: hex ?? null });
    pdToast(`${label} armed — click a wall face to paint`);
  };

  return (
    <div style={pdInspectorPanel}>
      <PdSectionTitle title={KIND_LABEL[kind]} meta={`${len.toFixed(2)} m`} />
      <div style={{ display: "flex", gap: 4 }}>
        {(["wall", "rail", "portal"] as const).map((k) => (
          <button
            key={k}
            style={pdChip(kind === k, pdChipFlex)}
            onClick={() => setKind(k)}
            title={
              k === "portal"
                ? "No barrier at all — the room still closes, nothing gets built. For a space that simply gives onto the next."
                : k === "rail"
                  ? "Low, see-through barrier — balcony or terrace railing."
                  : "Full-height solid wall."
            }
          >
            {k === "portal" ? "⇿ Open" : k === "rail" ? "▭ Rail" : "▉ Wall"}
          </button>
        ))}
      </div>
      {isPortal ? (
        <PdHelpText>Nothing is built here — the rooms on each side stay separate but flow together.</PdHelpText>
      ) : (
        <>
          <PdNumField
            label="Height"
            value={wall.height ?? WALL_HEIGHT}
            onCommit={(v) => patch("Wall height", { height: Math.min(6, Math.max(0.5, v)) })}
            displayScale={100}
            unit="cm"
          />
          <PdNumField
            label="Thickness"
            value={wall.thickness ?? DEFAULT_THICKNESS}
            onCommit={(v) => patch("Wall thickness", { thickness: Math.min(1, Math.max(0.05, v)) })}
            displayScale={100}
            unit="cm"
          />
          {kind === "wall" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: PD.textSecondary, fontSize: 11.5 }}>Faces</span>
                <PdSwatch hex={wall.paintA ?? null} title="Face A — click to re-arm this colour" onClick={() => armPaint(wall.paintA, "Face A")} />
                <PdSwatch hex={wall.paintB ?? null} title="Face B — click to re-arm this colour" onClick={() => armPaint(wall.paintB, "Face B")} />
              </div>
              <PdHelpText>
                Paint in <b style={{ color: PD.textSecondary, fontWeight: 600 }}>Decorate</b>: pick a colour, click faces.
              </PdHelpText>
            </>
          )}
        </>
      )}
    </div>
  );
}
