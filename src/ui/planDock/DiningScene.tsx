"use client";

import { isoBox, Extrusion, TableWithLegs, Plant, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const DINING_HOTSPOTS: RoomHotspot[] = [
  { id: "table", label: "Table", keywords: ["table"] },
  { id: "chairs", label: "Chairs", keywords: ["chair"] },
  { id: "bench", label: "Bench", keywords: ["bench"] },
  { id: "decor", label: "Decor", keywords: ["plant"] },
];

export const DINING_X0 = 12;
export const DINING_WIDTH = 176;

function Chair({ x, yFront }: { x: number; yFront: number }) {
  const seat = isoBox(x, yFront, 12, 8, 10);
  const back = isoBox(x, yFront - 8 + 2, 12, 12, 2);
  return (
    <>
      <Extrusion box={seat} />
      <Extrusion box={back} />
    </>
  );
}

function DiningItems(): RoomItem[] {
  const tableBox = isoBox(12, ITEMS_Y, 52, 18, 30);
  const chairsBox = isoBox(72, ITEMS_Y, 34, 20, 10);
  const benchBox = isoBox(114, ITEMS_Y, 40, 12, 16);
  const decorBox = isoBox(162, ITEMS_Y, 26, 22, 14);

  return [
    { id: "table", label: "Table", keywords: DINING_HOTSPOTS[0].keywords, box: tableBox, art: <TableWithLegs x={12} yFront={ITEMS_Y} w={52} depth={30} topH={4} legH={16} /> },
    {
      id: "chairs",
      label: "Chairs",
      keywords: DINING_HOTSPOTS[1].keywords,
      box: chairsBox,
      art: (
        <>
          <Chair x={72} yFront={ITEMS_Y} />
          <Chair x={90} yFront={ITEMS_Y} />
        </>
      ),
    },
    { id: "bench", label: "Bench", keywords: DINING_HOTSPOTS[2].keywords, box: benchBox, art: <Extrusion box={isoBox(114, ITEMS_Y, 40, 12, 16)} /> },
    { id: "decor", label: "Decor", keywords: DINING_HOTSPOTS[3].keywords, box: decorBox, art: <Plant x={174} yFront={ITEMS_Y + 6} r={5} potH={7} canopyR={8} /> },
  ];
}

export function DiningScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={DINING_X0} width={DINING_WIDTH} items={DiningItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
