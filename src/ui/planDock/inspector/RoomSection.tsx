"use client";

// Room inspector (Plan Dock P5) — MEASUREMENTS ONLY.
//
// This panel used to lead with the Building Knowledge Layer's verdict: a
// room-type chip, a confidence percentage, its evidence list and the
// door/window/exterior-wall counts behind it. All of it is gone, along with
// the guess that produced it (see the note at the end of
// legacy/src/trace2d/traceToScene.ts). Dan's call, and it is the right one:
// a type nobody asked for is a claim the panel has to defend, whereas
// "3.40 × 2.85 m · 9.7 m²" is a fact — it is measured off the loop the user
// drew themselves, so it is never wrong and never needs correcting.
//
// There is deliberately no name field and no type picker either. Labelling a
// room buys nothing here: every consumer that once read the type is either
// gone or has its own fallback, and the room you are pointing at is already
// identified by being highlighted in the viewport.

import type { Room } from "@/schema/scene";
import { WALL_HEIGHT } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { roomArea, roomBBox, nodeMap } from "@/lib/rooms/roomArea";
import { resolveCeilingHeights } from "@/render/ceilingHeight";
import { PD } from "../tokens";
import { pdInspectorPanel, PdSectionTitle, PdHelpText, PdNumField } from "./panelKit";

export function RoomSection({ room }: { room: Room }) {
  const scene = useSceneStore((s) => s.scene);
  const nodes = nodeMap(scene.nodes);
  const area = roomArea(room.loop, nodes);
  // Bounding box, not the loop's own extents: an L-shaped room has no single
  // width, and the box is the number you reach for when you are asking
  // "does the sofa fit along there".
  const { w, h } = roomBBox(room.loop, nodes);
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
      <PdSectionTitle label={`${w.toFixed(2)} × ${h.toFixed(2)} m`} meta={`${area.toFixed(1)} m²`} />
      <PdNumField
        label="Ceiling height"
        value={room.ceilingHeight ?? derivedCeilingHeight}
        onCommit={(v) => setCeilingHeight(Math.min(6, Math.max(2, v)))}
        displayScale={100}
        unit="cm"
      />
      <PdHelpText>
        Change the floor in <b style={{ color: PD.textSecondary, fontWeight: 600 }}>Decorate</b>: pick a material, click the floor.
      </PdHelpText>
    </div>
  );
}
