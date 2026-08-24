"use client";

// Laundry room scene. Phase 2 (appliances) gave the washing machine its own
// button: the room had a Dryer hotspot and no Washer one, so the machine this
// room is named after was unreachable from the picture. The row is re-spaced
// around it rather than having the washer wedged in as a small box.

import { isoBox, Extrusion, BasinCutout, KnobRow, FramedArt, DETAIL_LINE, DETAIL_LIGHT, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const LAUNDRY_HOTSPOTS: RoomHotspot[] = [
  { id: "washer", label: "Washing machine", keywords: ["washer", "washing machine"] },
  { id: "dryer", label: "Dryer", keywords: ["dryer"] },
  { id: "sink", label: "Laundry sink", keywords: ["sink"] },
  { id: "rack", label: "Drying rack", keywords: ["rack"] },
  { id: "iron", label: "Ironing board", keywords: ["ironing"] },
  // The wall over the machines is the only decorated surface a laundry gets.
  { id: "art", label: "Wall art", keywords: ["wall art", "artwork", "picture", "poster"] },
];

const kw = (id: string) => LAUNDRY_HOTSPOTS.find((h) => h.id === id)!.keywords;

export const LAUNDRY_X0 = 14;
export const LAUNDRY_WIDTH = 168;

/** Front-loader face: porthole, control fascia, and (for the washer) the
 *  detergent drawer that is the only thing telling the two machines apart. */
function MachineFace({ box, drawer }: { box: ReturnType<typeof isoBox>; drawer: boolean }) {
  const { x, yFront, w, h } = box.face;
  return (
    <>
      <line x1={x + 1.5} y1={yFront - h + 5} x2={x + w - 1.5} y2={yFront - h + 5} stroke={DETAIL_LINE} strokeWidth={0.6} />
      <circle cx={x + w / 2} cy={yFront - h * 0.45} r={6} fill="none" stroke={DETAIL_LINE} strokeWidth={0.9} />
      <circle cx={x + w / 2} cy={yFront - h * 0.45} r={3.2} fill="none" stroke={DETAIL_LIGHT} strokeWidth={0.6} />
      {drawer ? (
        <rect x={x + 2.5} y={yFront - h + 1.2} width={w * 0.42} height={2.6} rx={0.8} fill="none" stroke={DETAIL_LINE} strokeWidth={0.6} />
      ) : (
        [0, 1, 2].map((i) => (
          <line key={i} x1={x + w * 0.28} y1={yFront - 2 - i * 1.6} x2={x + w * 0.72} y2={yFront - 2 - i * 1.6} stroke={DETAIL_LINE} strokeWidth={0.5} />
        ))
      )}
      <KnobRow box={box} count={2} atH={0.88} />
    </>
  );
}

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
  const washer = isoBox(14, ITEMS_Y, 26, 28, 16);
  const dryer = isoBox(44, ITEMS_Y, 26, 28, 16);
  const sink = isoBox(74, ITEMS_Y, 26, 24, 16);
  const rackBox = isoBox(106, ITEMS_Y, 26, 30, 4);
  const ironBox = isoBox(140, ITEMS_Y, 34, 20, 8);
  // Wall band over the washer/dryer pair, the only stretch of wall this room
  // has that nothing already stands against.
  const artBox = isoBox(22, 96, 20, 22, 2);

  return [
    {
      id: "washer",
      label: "Washing machine",
      keywords: kw("washer"),
      box: washer,
      art: (
        <>
          <Extrusion box={washer} />
          <MachineFace box={washer} drawer />
        </>
      ),
    },
    {
      id: "dryer",
      label: "Dryer",
      keywords: kw("dryer"),
      box: dryer,
      art: (
        <>
          <Extrusion box={dryer} />
          <MachineFace box={dryer} drawer={false} />
        </>
      ),
    },
    {
      id: "sink",
      label: "Laundry sink",
      keywords: kw("sink"),
      box: sink,
      art: (
        <>
          <Extrusion box={sink} />
          <BasinCutout box={sink} />
        </>
      ),
    },
    { id: "rack", label: "Drying rack", keywords: kw("rack"), box: rackBox, art: <DryingRack x={106} yFront={ITEMS_Y} /> },
    { id: "iron", label: "Ironing board", keywords: kw("iron"), box: ironBox, art: <IroningBoard x={140} yFront={ITEMS_Y} w={34} /> },
    { id: "art", label: "Wall art", keywords: kw("art"), box: artBox, art: <FramedArt x={22} yTop={74} w={20} h={22} scene="abstract" /> },
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
