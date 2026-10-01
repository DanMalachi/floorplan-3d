"use client";

// Build-tab floating panel (Plan Dock P4): same footprint as Decorate's
// NavigatorPanel (tokens.ts PD_NAV) so Build and Decorate read as the
// same product, but there's one house-cutaway scene instead of an 11-room
// switcher — Build isn't organized by room, it's organized by WHAT you're
// building. Hotspots arm a build tool (or deep-link into Decorate for
// Floors/Paint, which have no build-mode tool of their own) instead of
// filtering a catalog; `activeHotspot` is derived from live store state
// (buildTool/openingType) rather than local UI state, so the highlighted
// hotspot always matches what's actually armed — including when the tool
// was armed from BuildToolbar instead of a hotspot click.

import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import { pdGlass, PD, PD_NAV } from "./tokens";
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
  // `onHotspotClick` is a plain handler, not a render path, so it takes `t`
  // from the component's scope rather than calling the hook itself.
  const t = useTranslations("editor.navigator");
  const buildTool = useSceneStore((s) => s.buildTool);
  const openingType = useSceneStore((s) => s.openingType);
  const activeHotspot = activeHotspotFor(buildTool, openingType);

  const onHotspotClick = (id: BuildHotspotId) => {
    const s = useSceneStore.getState();
    switch (id) {
      case "walls":
        s.setBuildTool("wall");
        pdToast(t("wallArmed"));
        break;
      case "doors":
        s.setBuildTool("opening");
        s.setOpeningType("door");
        pdToast(t("doorArmed"));
        break;
      case "windows":
        s.setBuildTool("opening");
        s.setOpeningType("window");
        pdToast(t("windowArmed"));
        break;
      case "measure":
        s.setBuildTool("measure");
        pdToast(t("measureArmed"));
        break;
      case "floors":
        s.requestDock("floors");
        pdToast(t("jumpedFloors"));
        break;
      case "paint":
        s.requestDock("paint");
        pdToast(t("jumpedPaint"));
        break;
      case "stairs":
        pdToast(t("noStairTool"));
        break;
    }
  };

  return (
    <section
      // data-guide: onboarding anchor (src/onboarding).
      data-guide="build-navigator"
      aria-label={t("title")}
      style={{ position: "absolute", insetInlineStart: PD_NAV.inset, bottom: PD_NAV.inset, width: PD_NAV.width, height: PD_NAV.height, display: "flex", flexDirection: "column", ...pdGlass() }}
    >
      <div style={{ padding: "10px 12px 2px", fontSize: 11.5, fontWeight: 600, color: PD.textSecondary }}>{t("title")}</div>
      {/* Clipped: the house floor runs ~26px past the panel's edge at this
          scale (its depth recedes beyond the 220-unit viewBox). */}
      <div style={{ flex: 1, minHeight: 0, padding: "2px 12px 12px", overflow: "hidden" }}>
        <BuildHouseScene activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} />
      </div>
    </section>
  );
}
