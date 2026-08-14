"use client";

import { isoBox, Extrusion, ShelfLines, Rug, WallTv, FramedArt, WallClockArt, DETAIL_LINE, DETAIL_LIGHT, FACE_FRONT, RoomSceneShell, ITEMS_Y, FLOOR_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const KIDS_HOTSPOTS: RoomHotspot[] = [
  { id: "crib", label: "Crib", keywords: ["crib"] },
  { id: "toys", label: "Toy storage", keywords: ["toy"] },
  { id: "changing", label: "Changing table", keywords: ["changing"] },
  // The custom wardrobe and sofa generators are both tagged for this room but
  // had no button that could reach them — with hotspots now filtering the
  // custom cards too, that would have made them unreachable here.
  { id: "storage", label: "Wardrobe & seating", keywords: ["wardrobe", "closet", "sofa", "couch", "armchair"] },
  // Wide roll-out.
  { id: "rug", label: "Rug", keywords: ["rug", "carpet", "mat"] },
  { id: "tv", label: "TV", keywords: ["tv", "television"] },
  { id: "art", label: "Wall art", keywords: ["wall art", "artwork", "picture", "poster"] },
  { id: "clock", label: "Clock", keywords: ["clock"] },
];

export const KIDS_X0 = 20;
export const KIDS_WIDTH = 176;

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
  const storageBox = isoBox(156, ITEMS_Y, 30, 44, 16);
  // Open floor in front of the crib, clear of the compass badge over the
  // panel's bottom-left corner.
  const rugBox = isoBox(54, FLOOR_Y - 10, 64, 0, 26);
  // Wall-mounted, over the toy storage — the same wall-band-over-furniture
  // composition LivingScene uses for its console, sized well clear of it.
  const wallTvBox = isoBox(76, 90, 26, 20, 2);
  // Two small prints over the crib — the wall a nursery actually decorates,
  // and at the size prints over a cot really are.
  const artBox = isoBox(22, 98, 34, 24, 2);
  const clockBox = isoBox(111, 91, 18, 18, 2);

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
    {
      id: "storage",
      label: "Wardrobe & seating",
      keywords: KIDS_HOTSPOTS[3].keywords,
      box: storageBox,
      art: (
        <>
          <Extrusion box={storageBox} />
          {/* Twin doors with a centre seam and two small knobs — a wardrobe. */}
          <line
            x1={storageBox.face.x + storageBox.face.w / 2}
            y1={storageBox.face.yFront}
            x2={storageBox.face.x + storageBox.face.w / 2}
            y2={storageBox.face.yFront - storageBox.face.h}
            stroke={DETAIL_LINE}
            strokeWidth={0.9}
          />
          {[0.42, 0.58].map((f) => (
            <circle
              key={f}
              cx={storageBox.face.x + storageBox.face.w * f}
              cy={storageBox.face.yFront - storageBox.face.h * 0.5}
              r={1.4}
              fill={DETAIL_LIGHT}
              stroke={DETAIL_LINE}
              strokeWidth={0.5}
            />
          ))}
        </>
      ),
    },
    { id: "rug", label: "Rug", keywords: KIDS_HOTSPOTS[4].keywords, box: rugBox, art: <Rug x={54} yFront={FLOOR_Y - 10} w={64} depth={26} /> },
    { id: "tv", label: "TV", keywords: KIDS_HOTSPOTS[5].keywords, box: wallTvBox, art: <WallTv box={wallTvBox} /> },
    {
      id: "art",
      label: "Wall art",
      keywords: KIDS_HOTSPOTS[6].keywords,
      box: artBox,
      art: (
        <>
          <FramedArt x={22} yTop={76} w={16} h={22} scene="abstract" />
          <FramedArt x={41} yTop={80} w={15} h={18} scene="landscape" />
        </>
      ),
    },
    { id: "clock", label: "Clock", keywords: KIDS_HOTSPOTS[7].keywords, box: clockBox, art: <WallClockArt cx={120} cy={82} r={9} /> },
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
