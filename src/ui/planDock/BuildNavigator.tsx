"use client";

// Build-tab floating panel (Plan Dock P4): same footprint as Decorate's
// NavigatorPanel (left/bottom 16, 208×224) so Build and Decorate read as the
// same product, but there's one house-cutaway scene instead of an 11-room
// switcher — Build isn't organized by room, it's organized by WHAT you're
// building. Hotspots arm a build tool (or deep-link into Decorate for
// Floors/Paint, which have no build-mode tool of their own) instead of
// filtering a catalog; `activeHotspot` is derived from live store state
// (buildTool/openingType) rather than local UI state, so the highlighted
// hotspot always matches what's actually armed — including when the tool
// was armed from BuildToolbar instead of a hotspot click.

import { useSceneStore } from "@/store/useSceneStore";
import { pdGlass, PD } from "./tokens";
import { pdToast } from "./toast";
import { BuildHouseScene, type BuildHotspotId } from "./BuildHouseScene";

function activeHotspotFor(buildTool: string, openingType: string): BuildHotspotId | null {
  if (buildTool === "wall") return "walls";
  if (buildTool === "measure") return "measure";
  if (buildTool === "opening") {
    if (openingType === "window") return "windows";
    if (openingType === "door") return "doors";
  }
  return null;
}

export function BuildNavigator() {
  const buildTool = useSceneStore((s) => s.buildTool);
  const openingType = useSceneStore((s) => s.openingType);
  const activeHotspot = activeHotspotFor(buildTool, openingType);

  const onHotspotClick = (id: BuildHotspotId) => {
    const s = useSceneStore.getState();
    switch (id) {
      case "walls":
        s.setBuildTool("wall");
        pdToast("Wall tool armed — click to start, click to draw");
        break;
      case "doors":
        s.setBuildTool("opening");
        s.setOpeningType("door");
        pdToast("Door armed — click a wall to place it");
        break;
      case "windows":
        s.setBuildTool("opening");
        s.setOpeningType("window");
        pdToast("Window armed — click a wall to place it");
        break;
      case "measure":
        s.setBuildTool("measure");
        pdToast("Measure armed — click two points on the floor");
        break;
      case "floors":
        s.requestDock("floors");
        pdToast("Jumped to Decorate · Floors");
        break;
      case "paint":
        s.requestDock("paint");
        pdToast("Jumped to Decorate · Paint");
        break;
      case "stairs":
        pdToast("No Build-mode stair tool yet — trace stairs in the Trace tab");
        break;
    }
  };

  return (
    <div style={{ position: "absolute", left: 16, bottom: 16, width: 208, height: 224, display: "flex", flexDirection: "column", ...pdGlass() }}>
      <div style={{ padding: "10px 12px 2px", fontSize: 11.5, fontWeight: 600, color: PD.textSecondary }}>Build</div>
      <div style={{ flex: 1, minHeight: 0, padding: "2px 12px 12px" }}>
        <BuildHouseScene activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} />
      </div>
    </div>
  );
}
