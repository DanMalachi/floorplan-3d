"use client";

import { isoBox, Extrusion, TableWithLegs, DETAIL_LINE, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const OUTDOORS_HOTSPOTS: RoomHotspot[] = [
  { id: "table", label: "Patio table", keywords: ["table"] },
  { id: "seating", label: "Chair & bench", keywords: ["chair", "bench"] },
  { id: "grill", label: "BBQ grill", keywords: ["grill", "bbq"] },
  { id: "decor", label: "Planter", keywords: ["planter"] },
];

export const OUTDOORS_X0 = 12;
export const OUTDOORS_WIDTH = 190;

function PatioChair({ x, yFront }: { x: number; yFront: number }) {
  const seat = isoBox(x, yFront, 12, 7, 10);
  const back = isoBox(x, yFront - 7 + 2, 12, 11, 2);
  return (
    <>
      <Extrusion box={seat} top="oklch(0.6 0.03 140 / 0.85)" />
      <Extrusion box={back} top="oklch(0.6 0.03 140 / 0.85)" />
    </>
  );
}

/** Round dome lid + short legs — BBQ grill. */
function BbqGrill({ x, yFront, w }: { x: number; yFront: number; w: number }) {
  const bodyH = 12;
  const body = isoBox(x, yFront, w, bodyH, w * 0.8);
  const lidCx = x + w / 2;
  const lidCy = yFront - bodyH;
  return (
    <>
      <line x1={x + 3} y1={yFront} x2={x + 3} y2={yFront - 18} stroke={DETAIL_LINE} strokeWidth={1.4} />
      <line x1={x + w - 3} y1={yFront} x2={x + w - 3} y2={yFront - 18} stroke={DETAIL_LINE} strokeWidth={1.4} />
      <Extrusion box={body} top="oklch(0.3 0.01 90 / 0.9)" front="oklch(0.24 0.01 90 / 0.9)" right="oklch(0.18 0.01 90 / 0.9)" />
      <ellipse cx={lidCx} cy={lidCy - 6} rx={w * 0.42} ry={7} fill="oklch(0.32 0.01 90 / 0.9)" stroke={DETAIL_LINE} strokeWidth={0.6} />
    </>
  );
}

/** Rectangular planter box with a small canopy cluster — distinct from the
 *  round-pot `Plant` composite, since a planter box isn't a cylinder. */
function PlanterBox({ x, yFront, w }: { x: number; yFront: number; w: number }) {
  const box = isoBox(x, yFront, w, 10, 12);
  const cx = x + w / 2;
  const topY = yFront - 10;
  return (
    <>
      <Extrusion box={box} top="oklch(0.42 0.03 60 / 0.85)" />
      <circle cx={cx - 4} cy={topY - 5} r={5} fill="oklch(0.48 0.09 145 / 0.85)" />
      <circle cx={cx + 4} cy={topY - 6} r={5.5} fill="oklch(0.53 0.1 145 / 0.85)" />
      <circle cx={cx} cy={topY - 9} r={4.5} fill="oklch(0.58 0.1 145 / 0.85)" />
    </>
  );
}

function OutdoorsItems(): RoomItem[] {
  const tableBox = isoBox(12, ITEMS_Y, 40, 16, 26);
  const seatingBox = isoBox(60, ITEMS_Y, 60, 18, 12);
  const grillBox = isoBox(128, ITEMS_Y, 26, 30, 20);
  const decorBox = isoBox(162, ITEMS_Y, 24, 20, 14);

  return [
    { id: "table", label: "Patio table", keywords: OUTDOORS_HOTSPOTS[0].keywords, box: tableBox, art: <TableWithLegs x={12} yFront={ITEMS_Y} w={40} depth={26} topH={3} legH={13} /> },
    {
      id: "seating",
      label: "Chair & bench",
      keywords: OUTDOORS_HOTSPOTS[1].keywords,
      box: seatingBox,
      art: (
        <>
          <PatioChair x={60} yFront={ITEMS_Y} />
          <Extrusion box={isoBox(80, ITEMS_Y, 38, 9, 12)} top="oklch(0.6 0.03 140 / 0.85)" />
        </>
      ),
    },
    { id: "grill", label: "BBQ grill", keywords: OUTDOORS_HOTSPOTS[2].keywords, box: grillBox, art: <BbqGrill x={128} yFront={ITEMS_Y} w={26} /> },
    { id: "decor", label: "Planter", keywords: OUTDOORS_HOTSPOTS[3].keywords, box: decorBox, art: <PlanterBox x={162} yFront={ITEMS_Y} w={24} /> },
  ];
}

export function OutdoorsScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={OUTDOORS_X0} width={OUTDOORS_WIDTH} items={OutdoorsItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
