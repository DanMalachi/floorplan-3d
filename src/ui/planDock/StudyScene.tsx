"use client";

import { isoBox, Extrusion, TableWithLegs, ShelfLines, Plant, Rug, WallTv, FACE_RIGHT, RoomSceneShell, ITEMS_Y, FLOOR_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const STUDY_HOTSPOTS: RoomHotspot[] = [
  { id: "desk", label: "Desk", keywords: ["desk"] },
  // "sofa"/"couch" included so the custom sofa generator, which is tagged for
  // the study, is reachable from a button — a study armchair or two-seater is
  // the same choice a user is making here.
  { id: "chair", label: "Chair & sofa", keywords: ["chair", "sofa", "couch"] },
  { id: "bookcase", label: "Bookcase", keywords: ["bookcase"] },
  { id: "decor", label: "Lamp & decor", keywords: ["lamp", "plant"] },
  // Wide roll-out.
  { id: "rug", label: "Rug", keywords: ["rug", "carpet", "mat"] },
  { id: "tv", label: "TV", keywords: ["tv", "television"] },
];

export const STUDY_X0 = 14;
export const STUDY_WIDTH = 170;

function DeskWithMonitor({ x, yFront, w, depth }: { x: number; yFront: number; w: number; depth: number }) {
  const legH = 15;
  const monitor = isoBox(x + w * 0.6, yFront - legH - 4 - 3, w * 0.2, 10, 1);
  return (
    <>
      <TableWithLegs x={x} yFront={yFront} w={w} depth={depth} topH={4} legH={legH} />
      <Extrusion box={monitor} top={FACE_RIGHT} />
    </>
  );
}

function StudyChair({ x, yFront }: { x: number; yFront: number }) {
  const seat = isoBox(x, yFront, 13, 9, 11);
  const back = isoBox(x, yFront - 9 + 2, 13, 16, 2);
  return (
    <>
      <Extrusion box={seat} />
      <Extrusion box={back} />
    </>
  );
}

function StudyItems(): RoomItem[] {
  const deskBox = isoBox(14, ITEMS_Y, 46, 24, 24);
  const chairBox = isoBox(66, ITEMS_Y, 16, 25, 11);
  const bookcaseBox = isoBox(88, ITEMS_Y, 32, 48, 16);
  const decorBox = isoBox(126, ITEMS_Y, 26, 22, 14);
  // Open floor in front of the desk, clear of the compass badge over the
  // panel's bottom-left corner.
  const rugBox = isoBox(52, FLOOR_Y - 10, 64, 0, 26);
  // Wall-mounted, in the room's own unused wall space to the right of the
  // bookcase and decor — a study TV for calls/media, not paired with any
  // console here (unlike Living, this room has none).
  const wallTvBox = isoBox(156, 96, 26, 20, 2);

  return [
    { id: "desk", label: "Desk", keywords: STUDY_HOTSPOTS[0].keywords, box: deskBox, art: <DeskWithMonitor x={14} yFront={ITEMS_Y} w={46} depth={24} /> },
    { id: "chair", label: "Chair", keywords: STUDY_HOTSPOTS[1].keywords, box: chairBox, art: <StudyChair x={66} yFront={ITEMS_Y} /> },
    {
      id: "bookcase",
      label: "Bookcase",
      keywords: STUDY_HOTSPOTS[2].keywords,
      box: bookcaseBox,
      art: (
        <>
          <Extrusion box={bookcaseBox} />
          <ShelfLines box={bookcaseBox} count={3} />
        </>
      ),
    },
    { id: "decor", label: "Lamp & decor", keywords: STUDY_HOTSPOTS[3].keywords, box: decorBox, art: <Plant x={138} yFront={ITEMS_Y + 6} r={5} potH={7} canopyR={8} /> },
    { id: "rug", label: "Rug", keywords: STUDY_HOTSPOTS[4].keywords, box: rugBox, art: <Rug x={52} yFront={FLOOR_Y - 10} w={64} depth={26} /> },
    { id: "tv", label: "TV", keywords: STUDY_HOTSPOTS[5].keywords, box: wallTvBox, art: <WallTv box={wallTvBox} /> },
  ];
}

export function StudyScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={STUDY_X0} width={STUDY_WIDTH} items={StudyItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
