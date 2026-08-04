"use client";

import { isoBox, Extrusion, ShelfLines, DETAIL_LINE, DETAIL_LIGHT, FACE_FRONT, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const KIDS_HOTSPOTS: RoomHotspot[] = [
  { id: "crib", label: "Crib", keywords: ["crib"] },
  { id: "toys", label: "Toy storage", keywords: ["toy"] },
  { id: "changing", label: "Changing table", keywords: ["changing"] },
];

export const KIDS_X0 = 20;
export const KIDS_WIDTH = 160;

/** Low mattress box with slatted vertical rails on the near face — crib. */
function Crib({ x, yFront, w, depth }: { x: number; yFront: number; w: number; depth: number }) {
  const railH = 20;
  const mattressH = 6;
  const mattress = isoBox(x, yFront - railH, w, mattressH, depth);
  const slats = [];
  for (let i = 1; i < 6; i++) {
    const sx = x + (w * i) / 6;
    slats.push(<line key={i} x1={sx} y1={yFront} x2={sx} y2={yFront - railH} stroke={DETAIL_LINE} strokeWidth={0.9} />);
  }
  return (
    <>
      <line x1={x} y1={yFront} x2={x} y2={yFront - railH} stroke={DETAIL_LINE} strokeWidth={1.2} />
      <line x1={x + w} y1={yFront} x2={x + w} y2={yFront - railH} stroke={DETAIL_LINE} strokeWidth={1.2} />
      {slats}
      <Extrusion box={mattress} top="oklch(0.7 0.03 200 / 0.85)" />
    </>
  );
}

function KidsItems(): RoomItem[] {
  const cribBox = isoBox(20, ITEMS_Y, 40, 26, 24);
  const toyBox = isoBox(72, ITEMS_Y, 34, 24, 16);
  const changingBox = isoBox(118, ITEMS_Y, 32, 26, 16);

  return [
    { id: "crib", label: "Crib", keywords: KIDS_HOTSPOTS[0].keywords, box: cribBox, art: <Crib x={20} yFront={ITEMS_Y} w={40} depth={24} /> },
    {
      id: "toys",
      label: "Toy storage",
      keywords: KIDS_HOTSPOTS[1].keywords,
      box: toyBox,
      art: (
        <>
          <Extrusion box={toyBox} />
          <ShelfLines box={toyBox} count={2} />
          <circle cx={toyBox.face.x + toyBox.face.w * 0.7} cy={toyBox.face.yFront - toyBox.face.h - 5} r={4} fill={FACE_FRONT} stroke={DETAIL_LINE} strokeWidth={0.6} />
          <circle cx={toyBox.face.x + toyBox.face.w * 0.3} cy={toyBox.face.yFront - toyBox.face.h - 5} r={3} fill={DETAIL_LIGHT} stroke={DETAIL_LINE} strokeWidth={0.6} />
        </>
      ),
    },
    {
      id: "changing",
      label: "Changing table",
      keywords: KIDS_HOTSPOTS[2].keywords,
      box: changingBox,
      art: (
        <>
          <Extrusion box={changingBox} />
          <ShelfLines box={changingBox} count={1} />
          <rect x={changingBox.face.x + 2} y={changingBox.face.yFront - changingBox.face.h - 4} width={changingBox.face.w - 4} height={4} rx={1} fill="oklch(0.78 0.02 90 / 0.6)" stroke={DETAIL_LINE} strokeWidth={0.5} />
        </>
      ),
    },
  ];
}

export function KidsScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={KIDS_X0} width={KIDS_WIDTH} items={KidsItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
