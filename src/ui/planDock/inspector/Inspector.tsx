"use client";

// Contextual inspector dispatcher (Plan Dock P5) — docked top-right whenever
// something is selected, same slot the old Viewport.tsx MiniInspector used
// (right 14, top 64). Replaces MiniInspector: every selection kind it
// handled (wall/rail/portal, opening, stair, furniture, fixture, room) has a
// PD-styled equivalent here, so this is a straight swap in Viewport.tsx, not
// a narrower reimplementation.

import { useSceneStore } from "@/store/useSceneStore";
import { StairInspector } from "@/viewport3d/StairInspector";
import { WallSection } from "./WallSection";
import { OpeningSection } from "./OpeningSection";
import { FurnitureSection } from "./FurnitureSection";
import { ParametricSection } from "./ParametricSection";
import { FixtureSection } from "./FixtureSection";
import { RoomSection } from "./RoomSection";

export function Inspector() {
  const sel3d = useSceneStore((s) => s.sel3d);
  const scene = useSceneStore((s) => s.scene);

  if (!sel3d) return null;

  switch (sel3d.kind) {
    case "wall": {
      const wall = scene.walls.find((w) => w.id === sel3d.id);
      return wall ? <WallSection wall={wall} /> : null;
    }
    case "opening": {
      const opening = scene.openings.find((o) => o.id === sel3d.id);
      return opening ? <OpeningSection opening={opening} /> : null;
    }
    case "stair": {
      const stair = (scene.stairs ?? []).find((s) => s.id === sel3d.id);
      return stair ? <StairInspector stair={stair} /> : null;
    }
    case "furniture": {
      const item = scene.furniture.find((f) => f.id === sel3d.id);
      if (!item) return null;
      return item.parametric ? <ParametricSection item={item} /> : <FurnitureSection item={item} />;
    }
    case "fixture": {
      const item = (scene.fixtures ?? []).find((f) => f.id === sel3d.id);
      return item ? <FixtureSection item={item} /> : null;
    }
    case "room": {
      const room = scene.rooms.find((r) => r.id === sel3d.id);
      return room ? <RoomSection room={room} /> : null;
    }
    default:
      return null;
  }
}
