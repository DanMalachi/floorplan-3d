"use client";

import { isoBox, Extrusion, BasinCutout, KnobRow, DETAIL_LINE, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const LAUNDRY_HOTSPOTS: RoomHotspot[] = [
  { id: "dryer", label: "Dryer", keywords: ["dryer"] },
  { id: "sink", label: "Laundry sink", keywords: ["sink"] },
  { id: "rack", label: "Drying rack", keywords: ["rack"] },
  { id: "iron", label: "Ironing board", keywords: ["ironing"] },
];

export const LAUNDRY_X0 = 22;
export const LAUNDRY_WIDTH = 150;

/** Wire A-frame with horizontal bars — drying rack. Line art, not a box, so it
 *  reads as open/see-through against the wall like the real object. */
function DryingRack({ x, yFront }: { x: number; yFront: number }) {
  const h = 30;
  const w = 26;
  return (
    <>
      <line x1={x} y1={yFront} x2={x + w * 0.15} y2={yFront - h} stroke={DETAIL_LINE} strokeWidth={1} />
      <line x1={x + w} y1={yFront} x2={x + w * 0.85} y2={yFront - h} stroke={DETAIL_LINE} strokeWidth={1} />
      <line x1={x + w * 0.3} y1={yFront} x2={x + w * 0.15} y2={yFront - h} stroke={DETAIL_LINE} strokeWidth={1} />
      <line x1={x + w * 0.7} y1={yFront} x2={x + w * 0.85} y2={yFront - h} stroke={DETAIL_LINE} strokeWidth={1} />
      {[0.3, 0.55, 0.8].map((f) => (
        <line key={f} x1={x + w * 0.15} y1={yFront - h * f} x2={x + w * 0.85} y2={yFront - h * f} stroke={DETAIL_LINE} strokeWidth={0.6} />
      ))}
    </>
  );
}

/** Thin narrow board on crossed legs — ironing board. */
function IroningBoard({ x, yFront, w }: { x: number; yFront: number; w: number }) {
  const legH = 20;
  const board = isoBox(x, yFront - legH, w, 3, 8);
  return (
    <>
      <line x1={x + 2} y1={yFront} x2={x + w * 0.5} y2={yFront - legH + 2} stroke={DETAIL_LINE} strokeWidth={1} />
      <line x1={x + w - 2} y1={yFront} x2={x + w * 0.5} y2={yFront - legH + 2} stroke={DETAIL_LINE} strokeWidth={1} />
      <Extrusion box={board} />
    </>
  );
}

function LaundryItems(): RoomItem[] {
  const dryer = isoBox(22, ITEMS_Y, 26, 28, 16);
  const sink = isoBox(56, ITEMS_Y, 26, 24, 16);
  const rackBox = isoBox(90, ITEMS_Y, 26, 30, 4);
  const ironBox = isoBox(126, ITEMS_Y, 34, 20, 8);

  return [
    {
      id: "dryer",
      label: "Dryer",
      keywords: LAUNDRY_HOTSPOTS[0].keywords,
      box: dryer,
      art: (
        <>
          <Extrusion box={dryer} />
          <circle cx={dryer.face.x + dryer.face.w / 2} cy={dryer.face.yFront - dryer.face.h * 0.55} r={6} fill="none" stroke={DETAIL_LINE} strokeWidth={0.7} />
          <KnobRow box={dryer} count={2} atH={0.15} />
        </>
      ),
    },
    {
      id: "sink",
      label: "Laundry sink",
      keywords: LAUNDRY_HOTSPOTS[1].keywords,
      box: sink,
      art: (
        <>
          <Extrusion box={sink} />
          <BasinCutout box={sink} />
        </>
      ),
    },
    { id: "rack", label: "Drying rack", keywords: LAUNDRY_HOTSPOTS[2].keywords, box: rackBox, art: <DryingRack x={90} yFront={ITEMS_Y} /> },
    { id: "iron", label: "Ironing board", keywords: LAUNDRY_HOTSPOTS[3].keywords, box: ironBox, art: <IroningBoard x={126} yFront={ITEMS_Y} w={34} /> },
  ];
}

export function LaundryScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={LAUNDRY_X0} width={LAUNDRY_WIDTH} items={LaundryItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
