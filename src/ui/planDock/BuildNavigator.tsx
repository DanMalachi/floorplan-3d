"use client";

// Build-tab floating panel: same footprint as Decorate's NavigatorPanel
// (tokens.ts PD_NAV), restyled to the round-5 mock (floorplan-3d-refs/
// navigator-icons-r5, "Build tools", approved 2026-09-30): ONE row of six
// icon tiles — Walls, Doors, Windows, Measure, Floors ↗, Paint ↗ — and the
// picture (navArt/buildCorner.ts) takes the height of the two tile rows Build
// doesn't need, so both modes keep one panel size.
//
// No Select tile (Dan: "no need for an icon for select"): selecting is what
// happens when no tool is on. Clicking the active tool again — its tile, its
// object in the picture, or the readout chip's ✕ — or pressing Esc turns it
// off (MeasureTool, WallTool and OpeningTool each own their Esc). Floors and Paint have no build tool; they jump to Decorate's shelf, so
// they carry a small ↗ and are never "on".
//
// Which tile/object is on is derived from live store state (buildTool /
// openingType), not local UI state, so it always matches what's armed —
// including Measure armed from the Decorate shelf rail.

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import { pdGlass, pdIconBtn, PD_NAV } from "./tokens";
import { pdToast } from "./toast";
import { Tooltip } from "./Tooltip";
import { useHover } from "./useHover";
import { BrickWallIcon, OpenDoorIcon, WindowPanesIcon, TapeMeasureIcon, FloorboardsIcon, PaintRollerIcon } from "./icons";
import { NavArtScene, type NavArtHotspot } from "./navArt/NavArtScene";
import { buildCorner } from "./navArt/buildCorner";

type BuildNavId = "walls" | "doors" | "windows" | "measure" | "floors" | "paint";

/** Tiles in mock order. `labelKey` is under `editor.rooms`; `jump` = opens
 *  Decorate instead of arming a tool. */
const BUILD_TILES: { id: BuildNavId; labelKey: string; Icon: ComponentType<{ size?: number }>; jump?: boolean }[] = [
  { id: "walls", labelKey: "build.walls", Icon: BrickWallIcon },
  { id: "doors", labelKey: "build.doors", Icon: OpenDoorIcon },
  { id: "windows", labelKey: "build.windows", Icon: WindowPanesIcon },
  { id: "measure", labelKey: "build.measure", Icon: TapeMeasureIcon },
  { id: "floors", labelKey: "build.floors", Icon: FloorboardsIcon, jump: true },
  { id: "paint", labelKey: "build.paint", Icon: PaintRollerIcon, jump: true },
];

/** The picture's objects (its floor is the Floors jump, via onFloorClick). */
const BUILD_NAV_HOTSPOTS: NavArtHotspot[] = BUILD_TILES.filter((b) => b.id !== "floors").map(({ id, labelKey }) => ({ id, labelKey }));

function activeFor(buildTool: string, openingType: string): BuildNavId | null {
  if (buildTool === "wall") return "walls";
  if (buildTool === "measure") return "measure";
  if (buildTool === "opening") {
    if (openingType === "window") return "windows";
    if (openingType === "door") return "doors";
  }
  return null;
}

/** ↗ in the tile's top inline-end corner: "this opens Decorate". */
function JumpMark() {
  return (
    <svg width={8} height={8} viewBox="0 0 8 8" aria-hidden style={{ position: "absolute", top: 4, insetInlineEnd: 4, opacity: 0.75, pointerEvents: "none" }}>
      <path d="M2 6 6 2M3 2h3v3" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BuildTile({ tile, active, onPick }: { tile: (typeof BUILD_TILES)[number]; active: boolean; onPick: (id: BuildNavId) => void }) {
  const t = useTranslations("editor.rooms");
  const [hovered, hoverBind] = useHover();
  const { Icon } = tile;
  return (
    <Tooltip label={t(tile.labelKey)}>
      {/* 42×36 like Decorate's room tiles: six fill the 264px row (6×42 +
          5×2 gap = 262). Jump tiles are plain buttons — they never stay on. */}
      <button
        {...hoverBind}
        onClick={() => onPick(tile.id)}
        aria-pressed={tile.jump ? undefined : active}
        style={{ ...pdIconBtn(active, 42, hovered), height: 36, position: "relative" }}
      >
        <Icon size={20} aria-hidden />
        {tile.jump && <JumpMark />}
      </button>
    </Tooltip>
  );
}

export function BuildNavigator() {
  // `pick` is a plain handler, not a render path, so it takes `t` from the
  // component's scope rather than calling the hook itself.
  const t = useTranslations("editor.navigator");
  const buildTool = useSceneStore((s) => s.buildTool);
  const openingType = useSceneStore((s) => s.openingType);
  const active = activeFor(buildTool, openingType);

  const pick = (id: string) => {
    const s = useSceneStore.getState();
    // The active tool again = off, back to selecting.
    if (id === active) {
      s.setBuildTool("select");
      return;
    }
    switch (id as BuildNavId) {
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
    }
  };

  return (
    <section
      // data-guide: onboarding anchor (src/onboarding).
      data-guide="build-navigator"
      aria-label={t("title")}
      style={{ position: "absolute", insetInlineStart: PD_NAV.inset, bottom: PD_NAV.inset, width: PD_NAV.width, height: PD_NAV.height, display: "flex", flexDirection: "column", ...pdGlass() }}
    >
      <div role="group" aria-label={t("toolGroupLabel")} style={{ display: "flex", gap: 2, padding: "8px 8px 4px" }}>
        {BUILD_TILES.map((b) => (
          <BuildTile key={b.id} tile={b} active={active === b.id} onPick={pick} />
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "0 12px 10px", overflow: "hidden" }}>
        <NavArtScene
          scene={buildCorner}
          sceneId="build"
          roomLabel={t("title")}
          hotspots={BUILD_NAV_HOTSPOTS}
          activeHotspot={active}
          onHotspotClick={pick}
          onFloorClick={() => pick("floors")}
        />
      </div>
    </section>
  );
}
