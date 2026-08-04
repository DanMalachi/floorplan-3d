"use client";

import { isoBox, Extrusion, ShelfLines, TableWithLegs, DETAIL_LINE, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const GARAGE_HOTSPOTS: RoomHotspot[] = [
  { id: "workbench", label: "Workbench", keywords: ["workbench"] },
  { id: "tools", label: "Tool rack", keywords: ["tool"] },
  { id: "shelving", label: "Shelving", keywords: ["shelving", "shelf"] },
];

export const GARAGE_X0 = 20;
export const GARAGE_WIDTH = 170;

/** Wall-mounted board with a row of hanging tool silhouettes — tool rack. */
function ToolRack({ x, yFront, w }: { x: number; yFront: number; w: number }) {
  const board = isoBox(x, yFront - 24, w, 3, 2);
  const tools = [0.15, 0.4, 0.65, 0.9];
  return (
    <>
      <Extrusion box={board} />
      {tools.map((f, i) => (
        <line key={i} x1={x + w * f} y1={yFront - 21} x2={x + w * f} y2={yFront - 4} stroke={DETAIL_LINE} strokeWidth={1.3} />
      ))}
    </>
  );
}

function GarageItems(): RoomItem[] {
  const benchBox = isoBox(20, ITEMS_Y, 44, 20, 22);
  const toolBox = isoBox(78, ITEMS_Y, 32, 26, 4);
  const shelfBox = isoBox(120, ITEMS_Y, 34, 48, 16);

  return [
    { id: "workbench", label: "Workbench", keywords: GARAGE_HOTSPOTS[0].keywords, box: benchBox, art: <TableWithLegs x={20} yFront={ITEMS_Y} w={44} depth={22} topH={3} legH={16} /> },
    { id: "tools", label: "Tool rack", keywords: GARAGE_HOTSPOTS[1].keywords, box: toolBox, art: <ToolRack x={78} yFront={ITEMS_Y} w={32} /> },
    {
      id: "shelving",
      label: "Shelving",
      keywords: GARAGE_HOTSPOTS[2].keywords,
      box: shelfBox,
      art: (
        <>
          <Extrusion box={shelfBox} />
          <ShelfLines box={shelfBox} count={3} />
        </>
      ),
    },
  ];
}

export function GarageScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={GARAGE_X0} width={GARAGE_WIDTH} items={GarageItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
