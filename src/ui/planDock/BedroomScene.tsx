"use client";

import { isoBox, Extrusion, Bed, DoorSeam, ShelfLines, Plant, Rug, WallTv, DETAIL_LINE, FACE_FRONT, RoomSceneShell, ITEMS_Y, FLOOR_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

// See LivingScene: "rug" moved off the decor button onto its own, now that
// rugs are real products rather than a keyword hoping to match an IKEA item.
export const BEDROOM_HOTSPOTS: RoomHotspot[] = [
  { id: "bed", label: "Bed", keywords: ["bed"] },
  { id: "nightstand", label: "Nightstand", keywords: ["side table", "nightstand"] },
  { id: "wardrobe", label: "Wardrobe", keywords: ["bookcase", "wardrobe", "closet", "coat rack"] },
  { id: "rug", label: "Rug", keywords: ["rug", "carpet", "mat"] },
  { id: "decor", label: "Lamp & decor", keywords: ["lamp", "plant"] },
  // Wide roll-out: no media console here (unlike Living), so a plain
  // wall-mounted panel of its own.
  { id: "tv", label: "TV", keywords: ["tv", "television"] },
];

export const BEDROOM_X0 = 12;
export const BEDROOM_WIDTH = 178;

function LampArt({ x, yFront }: { x: number; yFront: number }) {
  const poleH = 16;
  const shadeH = 6;
  return (
    <>
      <line x1={x} y1={yFront} x2={x} y2={yFront - poleH} stroke={DETAIL_LINE} strokeWidth={1} />
      <polygon
        points={`${x - 5},${yFront - poleH} ${x + 5},${yFront - poleH} ${x + 3.5},${yFront - poleH - shadeH} ${x - 3.5},${yFront - poleH - shadeH}`}
        fill={FACE_FRONT}
        stroke={DETAIL_LINE}
        strokeWidth={0.6}
      />
    </>
  );
}

function BedroomItems(): RoomItem[] {
  const bedBox = isoBox(12, ITEMS_Y, 74, 22, 30);
  const nightstand = isoBox(90, ITEMS_Y, 16, 16, 14);
  const wardrobe = isoBox(110, ITEMS_Y, 34, 50, 16);
  const decorBox = isoBox(150, ITEMS_Y, 30, 22, 14);
  // Bedside rug: it runs along the open side of the bed, in the floor strip in
  // front of it, at the length a real one has against a 2m bed. Held off the
  // panel's bottom-left corner, which the app's compass badge sits over.
  const rugBox = isoBox(48, FLOOR_Y - 9, 66, 0, 24);
  // Wall-mounted, above the lamp/plant corner — clear of the wardrobe's own
  // wall-band footprint to its left.
  const wallTvBox = isoBox(154, 92, 32, 20, 2);

  return [
    { id: "bed", label: "Bed", keywords: BEDROOM_HOTSPOTS[0].keywords, box: bedBox, art: <Bed x={12} yFront={ITEMS_Y} w={74} depth={30} /> },
    { id: "rug", label: "Rug", keywords: BEDROOM_HOTSPOTS[3].keywords, box: rugBox, art: <Rug x={48} yFront={FLOOR_Y - 9} w={66} depth={24} /> },
    {
      id: "nightstand",
      label: "Nightstand",
      keywords: BEDROOM_HOTSPOTS[1].keywords,
      box: nightstand,
      art: (
        <>
          <Extrusion box={nightstand} />
          <ShelfLines box={nightstand} count={1} />
        </>
      ),
    },
    {
      id: "wardrobe",
      label: "Wardrobe",
      keywords: BEDROOM_HOTSPOTS[2].keywords,
      box: wardrobe,
      art: (
        <>
          <Extrusion box={wardrobe} />
          <DoorSeam box={wardrobe} at={0.5} />
        </>
      ),
    },
    {
      id: "decor",
      label: "Lamp & decor",
      keywords: BEDROOM_HOTSPOTS[4].keywords,
      box: decorBox,
      art: (
        <>
          <LampArt x={158} yFront={ITEMS_Y + 2} />
          <Plant x={172} yFront={ITEMS_Y + 6} r={4} potH={6} canopyR={6} />
        </>
      ),
    },
    { id: "tv", label: "TV", keywords: BEDROOM_HOTSPOTS[5].keywords, box: wallTvBox, art: <WallTv box={wallTvBox} /> },
  ];
}

export function BedroomScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={BEDROOM_X0} width={BEDROOM_WIDTH} items={BedroomItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
