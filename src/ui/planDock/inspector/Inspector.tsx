"use client";

// Contextual inspector dispatcher (Plan Dock P5) — docked top-right whenever
// something is selected, same slot the old Viewport.tsx MiniInspector used
// (right 14, top 64). Replaces MiniInspector: every selection kind it
// handled (wall/rail/portal, opening, stair, furniture, fixture, room) has a
// PD-styled equivalent here, so this is a straight swap in Viewport.tsx, not
// a narrower reimplementation.
//
// A new selection is also said out loud ("Wall · 3.20 m selected"), since the
// panel opens away from where the click happened and nothing else tells a
// screen reader it did. Focus stays put: moving it into the panel would take
// it off the 3D view, where R and Delete act on the selection.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import { StairInspector } from "@/viewport3d/StairInspector";
import { announce } from "@/ui/a11y/Announcer";
import { WallSection } from "./WallSection";
import { OpeningSection } from "./OpeningSection";
import { FurnitureSection } from "./FurnitureSection";
import { ParametricSection } from "./ParametricSection";
import { FixtureSection } from "./FixtureSection";
import { RoomSection } from "./RoomSection";

export function Inspector() {
  const t = useTranslations("editor.inspector");
  const sel3d = useSceneStore((s) => s.sel3d);
  const scene = useSceneStore((s) => s.scene);
  const boxRef = useRef<HTMLDivElement>(null);

  // Once per selection, not on every edit made in the panel.
  const selKey = sel3d ? `${sel3d.kind}:${sel3d.id}` : null;
  useEffect(() => {
    if (!selKey) return;
    const title = boxRef.current?.querySelector("[data-inspector-title]")?.textContent?.trim();
    if (title) announce(t("selected", { what: title }));
    // The stair panel is protected 3D-layer code and has no title line.
    else if (selKey.startsWith("stair:")) announce(t("stairSelected"));
  }, [selKey, t]);

  const panel = sel3d ? panelFor(sel3d, scene) : null;
  if (!panel) return null;
  return (
    <div ref={boxRef} style={{ display: "contents" }}>
      {panel}
    </div>
  );
}

type Sel = NonNullable<ReturnType<typeof useSceneStore.getState>["sel3d"]>;
type SceneT = ReturnType<typeof useSceneStore.getState>["scene"];

function panelFor(sel3d: Sel, scene: SceneT) {
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
