"use client";

// Wall/rail/portal inspector (Plan Dock P5) — PD port of Viewport.tsx's old
// WallInspector, plus one new control the old one never had: painted-face
// swatch chips that RE-ARM the paint brush with that face's current color,
// so touching up or extending a paint job doesn't require reopening the
// Paint tab and hunting for the exact shade again.

import { useSceneStore } from "@/store/useSceneStore";
import type { Wall } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";
import { PD } from "../tokens";
import { pdToast } from "../toast";
import {
  pdInspectorPanel,
  PdSectionTitle,
  PdHelpText,
  PdNumField,
  PdChip,
  pdChipFlex,
  PdSwatch,
  PdActionButton,
  PdActionRow,
} from "./panelKit";

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

  // Roll one colour over the whole plan in a single commit (one undo step), so
  // a scheme decided on one wall doesn't have to be clicked onto every face.
  // BOTH faces of every wall: side A is a wall's own local +Z, which flips with
  // the direction it happens to have been drawn in, so it carries no shared
  // inside/outside meaning — mapping A->A across the plan would paint some
  // rooms' interiors and some rooms' exteriors. Rails and portals are skipped:
  // neither has a painted face.
  const paintAllWalls = (hex: string | undefined) => {
    const s = useSceneStore.getState();
    const targets = s.scene.walls.filter((w) => (w.kind ?? "wall") === "wall");
    s.commitScene("Paint all walls", {
      ...s.scene,
      walls: s.scene.walls.map((w) =>
        (w.kind ?? "wall") === "wall" ? { ...w, paintA: hex, paintB: hex } : w,
      ),
    });
    pdToast(`${targets.length} wall${targets.length === 1 ? "" : "s"} painted ${hex ?? "back to plaster"}`);
  };
  // One button when both faces already agree; otherwise one per face, since
  // there is no way to guess which of the two the "all" is meant to spread.
  const allButtons =
    wall.paintA === wall.paintB
      ? [{ hex: wall.paintA, label: "Paint every wall" }]
      : [
          // Worded rather than arrowed: "← A" put a directional glyph inside a
          // user-facing label, which reads as decoration and would have to
          // mirror under RTL in wave 2.
          { hex: wall.paintA, label: "All walls from A" },
          { hex: wall.paintB, label: "All walls from B" },
        ];

  return (
    <div style={pdInspectorPanel}>
      <PdSectionTitle label={KIND_LABEL[kind]} meta={`${len.toFixed(2)} m`} />
      <div style={{ display: "flex", gap: 4 }}>
        {(["wall", "rail", "portal"] as const).map((k) => (
          <PdChip
            key={k}
            active={kind === k}
            extra={pdChipFlex}
            onClick={() => setKind(k)}
            tip={
              k === "portal"
                ? "No barrier at all — the room still closes, nothing gets built. For a space that simply gives onto the next."
                : k === "rail"
                  ? "Low, see-through barrier — balcony or terrace railing."
                  : "Full-height solid wall."
            }
          >
            {k === "portal" ? "⇿ Open" : k === "rail" ? "▭ Rail" : "▉ Wall"}
          </PdChip>
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
                <PdSwatch hex={wall.paintA ?? null} tip="Face A — click to re-arm this colour" onClick={() => armPaint(wall.paintA, "Face A")} />
                <PdSwatch hex={wall.paintB ?? null} tip="Face B — click to re-arm this colour" onClick={() => armPaint(wall.paintB, "Face B")} />
              </div>
              <PdActionRow>
                {allButtons.map((b) => (
                  <PdActionButton key={b.label} label={b.label} onClick={() => paintAllWalls(b.hex)} />
                ))}
              </PdActionRow>
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
