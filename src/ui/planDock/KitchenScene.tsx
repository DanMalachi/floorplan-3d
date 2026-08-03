"use client";

// Kitchen room scene — see isoArt.tsx for the shared projection/hotspot
// mechanics. Objects are recognizable composites (fridge door seam+handle,
// stove burners+knobs, sink basin, cabinet shelf lines, a bar stool cylinder
// beside the counter), not plain boxes — per Dan's Phase-C review.

import { isoBox, Extrusion, DoorSeam, ShelfLines, KnobRow, BurnerRings, BasinCutout, Cylinder, isoCylinder, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";

export interface RoomHotspot {
  id: string;
  label: string;
  keywords: string[];
}

export const KITCHEN_HOTSPOTS: RoomHotspot[] = [
  { id: "fridge", label: "Fridge", keywords: ["fridge", "refrigerator"] },
  { id: "cabinets", label: "Cabinets", keywords: ["cabinet"] },
  { id: "sink", label: "Sink", keywords: ["sink"] },
  { id: "stove", label: "Stove", keywords: ["stove", "oven", "cooktop"] },
  { id: "counter", label: "Counter & bar", keywords: ["counter", "bar", "stool"] },
];

export const KITCHEN_X0 = 20;
export const KITCHEN_WIDTH = 180;

function KitchenItems(): RoomItem[] {
  const fridge = isoBox(20, ITEMS_Y, 26, 56, 16);
  const cabinets = isoBox(48, ITEMS_Y, 32, 26, 16);
  const sink = isoBox(82, ITEMS_Y, 28, 26, 16);
  const stove = isoBox(112, ITEMS_Y, 26, 26, 16);
  const counter = isoBox(140, ITEMS_Y, 26, 40, 16);
  const stool = isoCylinder(178, ITEMS_Y + 4, 5, 20);

  return [
    {
      id: "fridge",
      label: "Fridge",
      keywords: KITCHEN_HOTSPOTS[0].keywords,
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
      keywords: KITCHEN_HOTSPOTS[1].keywords,
      box: cabinets,
      art: (
        <>
          <Extrusion box={cabinets} />
          <ShelfLines box={cabinets} count={1} />
          <DoorSeam box={cabinets} at={0.33} />
          <DoorSeam box={cabinets} at={0.66} />
        </>
      ),
    },
    {
      id: "sink",
      label: "Sink",
      keywords: KITCHEN_HOTSPOTS[2].keywords,
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
      label: "Stove",
      keywords: KITCHEN_HOTSPOTS[3].keywords,
      box: stove,
      art: (
        <>
          <Extrusion box={stove} />
          <BurnerRings box={stove} />
          <KnobRow box={stove} count={3} atH={0.3} />
        </>
      ),
    },
    {
      id: "counter",
      label: "Counter & bar",
      keywords: KITCHEN_HOTSPOTS[4].keywords,
      box: { ...counter, bbox: { x0: counter.bbox.x0, y0: counter.bbox.y0, x1: counter.bbox.x1 + 12, y1: counter.bbox.y1 } },
      art: (
        <>
          <Extrusion box={counter} />
          <Cylinder c={stool} />
        </>
      ),
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
