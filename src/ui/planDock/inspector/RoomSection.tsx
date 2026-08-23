"use client";

// Room inspector (Plan Dock P5) — PD port of Viewport.tsx's old MiniInspector
// room block: area, semantics verdict + evidence, door/window/exterior-wall
// counts. The "Understand rooms" VLM trigger was retired — see the
// classify-routes removal commit.

import type { Room } from "@/schema/scene";
import { WALL_HEIGHT } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { roomArea, nodeMap } from "@/lib/rooms/roomArea";
import { displayRoomType } from "@/lib/rooms/roomTaxonomy";
import { resolveCeilingHeights } from "@/render/ceilingHeight";
import { PD, pdChip } from "../tokens";
import { pdInspectorPanel, PdSectionTitle, PdHelpText, PdNumField } from "./panelKit";

export function RoomSection({ room }: { room: Room }) {
  const scene = useSceneStore((s) => s.scene);
  const area = roomArea(room.loop, nodeMap(scene.nodes));
  const sem = room.semantics;
  // Derived (wall-height) fallback when unauthored — same resolver the 3D
  // layer renders from, so this field always shows what's actually built.
  const derivedCeilingHeight = resolveCeilingHeights(scene).get(room.id) ?? WALL_HEIGHT;
  const setCeilingHeight = (v: number) => {
    const s = useSceneStore.getState();
    s.commitScene("Ceiling height", {
      ...s.scene,
      rooms: s.scene.rooms.map((r) => (r.id === room.id ? { ...r, ceilingHeight: v } : r)),
    });
  };
  return (
    <div style={pdInspectorPanel}>
      <PdSectionTitle title={room.name ?? "Room"} meta={`${area.toFixed(1)} m²`} />
      <PdNumField
        label="Ceiling height"
        value={room.ceilingHeight ?? derivedCeilingHeight}
        onCommit={(v) => setCeilingHeight(Math.min(6, Math.max(2, v)))}
        displayScale={100}
        unit="cm"
      />
      {sem && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={pdChip(true, { textTransform: "capitalize" })}>{displayRoomType(sem.type)}</span>
            <span style={{ color: PD.textTertiary, fontSize: 11 }}>
              {Math.round(sem.confidence * 100)}% · {sem.source}
              {sem.function ? ` · ${sem.function.replace(/_/g, " ")}` : ""}
            </span>
          </div>
          {sem.evidence.length > 0 && (
            <div style={{ color: PD.textTertiary, fontSize: 11, lineHeight: 1.5 }}>
              {sem.evidence.slice(0, 4).map((e, i) => (
                <div key={i}>
                  · {e.feature}
                  {e.value !== undefined && e.value !== true ? `: ${e.value}` : ""}
                  <span style={{ opacity: 0.6 }}> ({e.source})</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ color: PD.textTertiary, fontSize: 11 }}>
            {sem.features.doorCount} door{sem.features.doorCount === 1 ? "" : "s"} · {sem.features.windowCount} window
            {sem.features.windowCount === 1 ? "" : "s"} · {sem.features.exteriorWallCount} ext wall
            {sem.features.exteriorWallCount === 1 ? "" : "s"}
            {sem.features.hasCloset ? " · closet" : ""}
          </div>
        </>
      )}
      <PdHelpText>
        Change the floor in <b style={{ color: PD.textSecondary, fontWeight: 600 }}>Decorate</b>: pick a material, click the floor.
      </PdHelpText>
    </div>
  );
}
