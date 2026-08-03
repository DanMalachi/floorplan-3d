"use client";

import { isoBox, Extrusion, Toilet, Bathtub, BasinCutout, KnobRow, DETAIL_LINE, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const BATHROOM_HOTSPOTS: RoomHotspot[] = [
  { id: "toilet", label: "Toilet", keywords: ["toilet"] },
  { id: "shower", label: "Shower", keywords: ["shower"] },
  { id: "bathtub", label: "Bathtub", keywords: ["bathtub", "tub"] },
  { id: "vanity", label: "Sink & vanity", keywords: ["sink", "basin", "vanity"] },
  { id: "washer", label: "Washer", keywords: ["washer"] },
];

export const BATHROOM_X0 = 12;
export const BATHROOM_WIDTH = 190;

function BathroomItems(): RoomItem[] {
  const toiletBox = isoBox(12, ITEMS_Y, 22, 24, 16);
  const shower = isoBox(46, ITEMS_Y, 34, 54, 18);
  const tub = isoBox(92, ITEMS_Y, 50, 14, 20);
  const vanity = isoBox(154, ITEMS_Y, 26, 24, 16);
  const washer = isoBox(184, ITEMS_Y, 22, 28, 16);

  return [
    { id: "toilet", label: "Toilet", keywords: BATHROOM_HOTSPOTS[0].keywords, box: toiletBox, art: <Toilet x={12} yFront={ITEMS_Y} w={22} depth={16} /> },
    {
      id: "shower",
      label: "Shower",
      keywords: BATHROOM_HOTSPOTS[1].keywords,
      box: shower,
      art: (
        <>
          <Extrusion box={shower} top="oklch(0.7 0.03 220 / 0.4)" front="oklch(0.62 0.03 220 / 0.35)" right="oklch(0.5 0.03 220 / 0.4)" />
          <line x1={shower.face.x + 3} y1={shower.face.yFront - 2} x2={shower.face.x + shower.face.w - 3} y2={shower.face.yFront - shower.face.h + 4} stroke={DETAIL_LINE} strokeWidth={0.6} />
        </>
      ),
    },
    { id: "bathtub", label: "Bathtub", keywords: BATHROOM_HOTSPOTS[2].keywords, box: tub, art: <Bathtub x={92} yFront={ITEMS_Y} w={50} depth={20} /> },
    {
      id: "vanity",
      label: "Sink & vanity",
      keywords: BATHROOM_HOTSPOTS[3].keywords,
      box: vanity,
      art: (
        <>
          <Extrusion box={vanity} />
          <BasinCutout box={vanity} />
        </>
      ),
    },
    {
      id: "washer",
      label: "Washer",
      keywords: BATHROOM_HOTSPOTS[4].keywords,
      box: washer,
      art: (
        <>
          <Extrusion box={washer} />
          <circle cx={washer.face.x + washer.face.w / 2} cy={washer.face.yFront - washer.face.h * 0.55} r={5} fill="none" stroke={DETAIL_LINE} strokeWidth={0.7} />
          <KnobRow box={washer} count={2} atH={0.15} />
        </>
      ),
    },
  ];
}

export function BathroomScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={BATHROOM_X0} width={BATHROOM_WIDTH} items={BathroomItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
