"use client";

// Kitchen room scene — see isoArt.tsx for the shared projection/hotspot
// mechanics. Objects are recognizable composites (fridge door seam+handle,
// stove burners+knobs, sink basin, cabinet shelf lines, a bar stool cylinder
// beside the counter), not plain boxes — per Dan's Phase-C review.
//
// Phase 2 (appliances) added two buttons and re-spaced the whole row for them.
// Both were things you could only reach by clicking something that doesn't say
// its name: a dishwasher hid behind "Cabinets", and an extractor behind
// "Stove". A shopper hunting for a dishwasher does not click Cabinets.

import { isoBox, Extrusion, DoorSeam, ShelfLines, KnobRow, BurnerRings, BasinCutout, Bin, Cylinder, isoCylinder, RoomSceneShell, ITEMS_Y, DETAIL_LINE, DETAIL_LIGHT, FACE_TOP, FACE_FRONT, FACE_STROKE, RX, RY, type RoomItem } from "./isoArt";

export interface RoomHotspot {
  id: string;
  label: string;
  keywords: string[];
}

export const KITCHEN_HOTSPOTS: RoomHotspot[] = [
  { id: "fridge", label: "Fridge", keywords: ["fridge", "refrigerator"] },
  { id: "cabinets", label: "Cabinets", keywords: ["cabinet"] },
  { id: "dishwasher", label: "Dishwasher", keywords: ["dishwasher"] },
  { id: "sink", label: "Sink", keywords: ["sink"] },
  { id: "stove", label: "Stove & oven", keywords: ["stove", "oven", "cooktop", "cooker", "range"] },
  { id: "hood", label: "Range hood", keywords: ["hood", "extractor"] },
  { id: "counter", label: "Counter & bar", keywords: ["counter", "bar", "stool", "island"] },
  { id: "microwave", label: "Microwave", keywords: ["microwave"] },
  // "bin" is deliberately NOT a keyword: it is a substring of "cabinet", so it
  // fills the Trash button with kitchen cabinets. The bathroom bin card is
  // reached by "trash", which it also carries.
  { id: "trash", label: "Trash", keywords: ["trash", "waste", "recycl"] },
];

const kw = (id: string) => KITCHEN_HOTSPOTS.find((h) => h.id === id)!.keywords;

export const KITCHEN_X0 = 12;
export const KITCHEN_WIDTH = 196;

/** Canopy + flue, hanging in the wall band over the hob. Drawn as a hanging
 *  shape rather than an extruded box on the floor line, because where it is
 *  IS what it is — this is the one kitchen item that isn't standing on
 *  anything. */
function ChimneyHood({ x, yBottom, w, depth }: { x: number; yBottom: number; w: number; depth: number }) {
  const dx = depth * RX;
  const dy = depth * RY;
  const canopyH = 9;
  const flueW = w * 0.38;
  const flueTop = yBottom - canopyH - 15;
  const p = (pts: [number, number][]) => pts.map((q) => q.join(",")).join(" ");
  return (
    <>
      {/* Flue running up to the ceiling. */}
      <polygon
        points={p([
          [x + (w - flueW) / 2, yBottom - canopyH],
          [x + (w + flueW) / 2, yBottom - canopyH],
          [x + (w + flueW) / 2, flueTop],
          [x + (w - flueW) / 2, flueTop],
        ])}
        fill={FACE_FRONT}
        stroke={FACE_STROKE}
        strokeWidth={0.6}
      />
      <polygon
        points={p([
          [x + (w - flueW) / 2, flueTop],
          [x + (w + flueW) / 2, flueTop],
          [x + (w + flueW) / 2 + dx, flueTop + dy],
          [x + (w - flueW) / 2 + dx, flueTop + dy],
        ])}
        fill={FACE_TOP}
        stroke={FACE_STROKE}
        strokeWidth={0.6}
      />
      {/* Canopy: front face plus its top, so it reads as a solid hanging box. */}
      <polygon
        points={p([[x, yBottom], [x + w, yBottom], [x + w, yBottom - canopyH], [x, yBottom - canopyH]])}
        fill={FACE_FRONT}
        stroke={FACE_STROKE}
        strokeWidth={0.6}
      />
      <polygon
        points={p([
          [x, yBottom - canopyH],
          [x + w, yBottom - canopyH],
          [x + w + dx, yBottom - canopyH + dy],
          [x + dx, yBottom - canopyH + dy],
        ])}
        fill={FACE_TOP}
        stroke={FACE_STROKE}
        strokeWidth={0.6}
      />
      {/* Filter slats on the underside — the face you see from the room. */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={x + 3} y1={yBottom - canopyH * f * 0.5} x2={x + w - 3} y2={yBottom - canopyH * f * 0.5} stroke={DETAIL_LINE} strokeWidth={0.5} />
      ))}
      <circle cx={x + w * 0.3} cy={yBottom - 1.5} r={1.3} fill={DETAIL_LIGHT} />
      <circle cx={x + w * 0.7} cy={yBottom - 1.5} r={1.3} fill={DETAIL_LIGHT} />
    </>
  );
}

function KitchenItems(): RoomItem[] {
  const fridge = isoBox(12, ITEMS_Y, 24, 56, 16);
  const cabinets = isoBox(40, ITEMS_Y, 22, 26, 16);
  const dishwasher = isoBox(66, ITEMS_Y, 20, 26, 16);
  const sink = isoBox(90, ITEMS_Y, 24, 26, 16);
  const stove = isoBox(118, ITEMS_Y, 24, 26, 16);
  const counter = isoBox(146, ITEMS_Y, 24, 26, 16);
  const stool = isoCylinder(176, ITEMS_Y + 4, 5, 20);
  // A microwave stands ON the worktop — which is also exactly how the app
  // places one. Drawn floating in the floor row next to the bin (and sharing
  // its button) it read as an unidentifiable small box.
  const microwave = isoBox(150, ITEMS_Y - 26, 16, 9, 10);
  // Same Bin art the bathroom uses — a bin should look like the same object
  // in every room, and a kitchen one is simply taller.
  const BIN_X = 188;
  const BIN_W = 16;
  const BIN_H = 26;
  const trashBin = isoBox(BIN_X, ITEMS_Y + 2, BIN_W, BIN_H, 10);

  // The hood hangs in the wall band directly over the hob, at the width of the
  // hob below it. Its hit box stops clear of the stove's projected top face so
  // the two never fight for the same click.
  const HOOD_BOTTOM = 96;
  const hood = isoBox(118, HOOD_BOTTOM, 24, 24, 8);

  return [
    {
      id: "fridge",
      label: "Fridge",
      keywords: kw("fridge"),
      box: fridge,
      art: (
        <>
          <Extrusion box={fridge} />
          <DoorSeam box={fridge} at={0.5} />
        </>
      ),
    },
    {
      id: "cabinets",
      label: "Cabinets",
      keywords: kw("cabinets"),
      box: cabinets,
      art: (
        <>
          <Extrusion box={cabinets} />
          <ShelfLines box={cabinets} count={1} />
          <DoorSeam box={cabinets} at={0.5} />
        </>
      ),
    },
    {
      // Integrated or steel-fronted, a dishwasher reads as a single full-height
      // front with a control line along its top edge and a bar pull.
      id: "dishwasher",
      label: "Dishwasher",
      keywords: kw("dishwasher"),
      box: dishwasher,
      art: (
        <>
          <Extrusion box={dishwasher} />
          <line
            x1={dishwasher.face.x + 2}
            y1={dishwasher.face.yFront - dishwasher.face.h + 4}
            x2={dishwasher.face.x + dishwasher.face.w - 2}
            y2={dishwasher.face.yFront - dishwasher.face.h + 4}
            stroke={DETAIL_LINE}
            strokeWidth={0.6}
          />
          <line
            x1={dishwasher.face.x + 3}
            y1={dishwasher.face.yFront - dishwasher.face.h + 7.5}
            x2={dishwasher.face.x + dishwasher.face.w - 3}
            y2={dishwasher.face.yFront - dishwasher.face.h + 7.5}
            stroke={DETAIL_LIGHT}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <circle cx={dishwasher.face.x + dishwasher.face.w / 2} cy={dishwasher.face.yFront - 9} r={3.4} fill="none" stroke={DETAIL_LINE} strokeWidth={0.5} strokeDasharray="1.6 1.4" />
        </>
      ),
    },
    {
      id: "sink",
      label: "Sink",
      keywords: kw("sink"),
      box: sink,
      art: (
        <>
          <Extrusion box={sink} />
          <BasinCutout box={sink} />
        </>
      ),
    },
    {
      id: "stove",
      label: "Stove & oven",
      keywords: kw("stove"),
      box: stove,
      art: (
        <>
          <Extrusion box={stove} />
          <BurnerRings box={stove} />
          <KnobRow box={stove} count={3} atH={0.75} />
          <rect
            x={stove.face.x + 3}
            y={stove.face.yFront - stove.face.h * 0.62}
            width={stove.face.w - 6}
            height={stove.face.h * 0.44}
            rx={1}
            fill="none"
            stroke={DETAIL_LINE}
            strokeWidth={0.5}
          />
        </>
      ),
    },
    {
      id: "hood",
      label: "Range hood",
      keywords: kw("hood"),
      box: hood,
      art: <ChimneyHood x={118} yBottom={HOOD_BOTTOM} w={24} depth={8} />,
    },
    {
      id: "counter",
      label: "Counter & bar",
      keywords: kw("counter"),
      box: { ...counter, bbox: { x0: counter.bbox.x0, y0: counter.bbox.y0, x1: counter.bbox.x1 + 12, y1: counter.bbox.y1 } },
      art: (
        <>
          <Extrusion box={counter} />
          <Cylinder c={stool} />
        </>
      ),
    },
    {
      id: "microwave",
      label: "Microwave",
      keywords: kw("microwave"),
      box: microwave,
      art: (
        <>
          <Extrusion box={microwave} />
          {/* Glass door on the left, control column on the right — the split
              that makes a small box read as a microwave and not a toaster. */}
          <rect
            x={microwave.face.x + 1.5}
            y={microwave.face.yFront - microwave.face.h + 1.5}
            width={microwave.face.w * 0.62}
            height={microwave.face.h - 3}
            rx={1}
            fill="oklch(0.25 0.01 260 / 0.75)"
            stroke={DETAIL_LINE}
            strokeWidth={0.5}
          />
          <line
            x1={microwave.face.x + microwave.face.w * 0.76}
            y1={microwave.face.yFront - microwave.face.h + 2.5}
            x2={microwave.face.x + microwave.face.w - 2}
            y2={microwave.face.yFront - microwave.face.h + 2.5}
            stroke={DETAIL_LIGHT}
            strokeWidth={0.8}
          />
          <circle cx={microwave.face.x + microwave.face.w * 0.86} cy={microwave.face.yFront - 3} r={1} fill="none" stroke={DETAIL_LIGHT} strokeWidth={0.5} />
        </>
      ),
    },
    {
      id: "trash",
      label: "Trash",
      keywords: kw("trash"),
      box: trashBin,
      art: <Bin x={BIN_X} yFront={ITEMS_Y + 2} w={BIN_W} h={BIN_H} />,
    },
  ];
}

export function KitchenScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={KITCHEN_X0} width={KITCHEN_WIDTH} items={KitchenItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
