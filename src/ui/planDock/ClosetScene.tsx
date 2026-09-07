"use client";

import { isoBox, Extrusion, DoorSeam, ShelfLines, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const CLOSET_HOTSPOTS: RoomHotspot[] = [
  { id: "wardrobe", labelKey: "closet.wardrobe", keywords: ["wardrobe"] },
  { id: "shoes", labelKey: "closet.shoes", keywords: ["shoe"] },
];

const lbl = (id: string) => CLOSET_HOTSPOTS.find((h) => h.id === id)!.labelKey;

export const CLOSET_X0 = 40;
export const CLOSET_WIDTH = 110;

function ClosetItems(): RoomItem[] {
  const wardrobe = isoBox(40, ITEMS_Y, 40, 52, 18);
  const shoes = isoBox(94, ITEMS_Y, 30, 24, 12);

  return [
    {
      id: "wardrobe",
      labelKey: lbl("wardrobe"),
      keywords: CLOSET_HOTSPOTS[0].keywords,
      box: wardrobe,
      art: (
        <>
          <Extrusion box={wardrobe} />
          <DoorSeam box={wardrobe} at={0.5} />
        </>
      ),
    },
    {
      id: "shoes",
      labelKey: lbl("shoes"),
      keywords: CLOSET_HOTSPOTS[1].keywords,
      box: shoes,
      art: (
        <>
          <Extrusion box={shoes} />
          <ShelfLines box={shoes} count={3} />
        </>
      ),
    },
  ];
}

export function ClosetScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={CLOSET_X0} width={CLOSET_WIDTH} items={ClosetItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
