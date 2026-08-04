"use client";

import { isoBox, Sofa, TableWithLegs, TvOnStand, Plant, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const LIVING_HOTSPOTS: RoomHotspot[] = [
  { id: "sofa", label: "Sofa", keywords: ["sofa", "couch", "lounge chair", "bench"] },
  { id: "coffeeTable", label: "Coffee table", keywords: ["coffee table", "side table"] },
  { id: "tv", label: "TV & storage", keywords: ["tv", "television", "cabinet", "bookcase"] },
  { id: "decor", label: "Lamp & decor", keywords: ["lamp", "rug", "plant"] },
];

export const LIVING_X0 = 10;
export const LIVING_WIDTH = 190;

function LivingItems(): RoomItem[] {
  const sofaBox = isoBox(10, ITEMS_Y, 72, 30, 20);
  const tableBox = isoBox(90, ITEMS_Y, 26, 18, 16);
  const tvBox = isoBox(126, ITEMS_Y, 40, 32, 16);
  const decorBox = isoBox(176, ITEMS_Y, 24, 22, 14);

  return [
    { id: "sofa", label: "Sofa", keywords: LIVING_HOTSPOTS[0].keywords, box: sofaBox, art: <Sofa x={10} yFront={ITEMS_Y} w={72} depth={20} /> },
    { id: "coffeeTable", label: "Coffee table", keywords: LIVING_HOTSPOTS[1].keywords, box: tableBox, art: <TableWithLegs x={90} yFront={ITEMS_Y} w={26} depth={16} topH={3} legH={14} /> },
    { id: "tv", label: "TV & storage", keywords: LIVING_HOTSPOTS[2].keywords, box: tvBox, art: <TvOnStand x={126} yFront={ITEMS_Y} w={40} depth={16} /> },
    { id: "decor", label: "Lamp & decor", keywords: LIVING_HOTSPOTS[3].keywords, box: decorBox, art: <Plant x={188} yFront={ITEMS_Y + 6} r={5} potH={7} canopyR={8} /> },
  ];
}

export function LivingScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={LIVING_X0} width={LIVING_WIDTH} items={LivingItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
