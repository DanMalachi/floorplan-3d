"use client";

import {
  isoBox,
  Sofa,
  TableWithLegs,
  WallTv,
  Extrusion,
  DoorSeam,
  Plant,
  Rug,
  FramedArt,
  WallClockArt,
  RoomSceneShell,
  unionBox,
  ITEMS_Y,
  FLOOR_Y,
  type RoomItem,
} from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

// "rug" left the decor button when rugs became a product of their own: a card
// nobody can reach through the picture does not exist, and a rug sharing a
// button with lamps and plants is a rug nobody finds.
export const LIVING_HOTSPOTS: RoomHotspot[] = [
  { id: "sofa", label: "Sofa", keywords: ["sofa", "couch", "lounge chair", "bench"] },
  { id: "coffeeTable", label: "Coffee table", keywords: ["coffee table", "side table"] },
  { id: "tv", label: "TV & storage", keywords: ["tv", "television", "cabinet", "bookcase"] },
  { id: "rug", label: "Rug", keywords: ["rug", "carpet", "mat"] },
  { id: "decor", label: "Lamp & decor", keywords: ["lamp", "plant"] },
  { id: "art", label: "Wall art", keywords: ["wall art", "artwork", "picture", "poster"] },
  { id: "clock", label: "Clock", keywords: ["clock"] },
];

export const LIVING_X0 = 10;
export const LIVING_WIDTH = 190;

function LivingItems(): RoomItem[] {
  const sofaBox = isoBox(10, ITEMS_Y, 72, 30, 20);
  const tableBox = isoBox(90, ITEMS_Y, 26, 18, 16);
  // The TV button now reaches two products at once: the parametric TV set
  // (three wall-mounted cards, two on stands) and the media storage that was
  // always here. So the picture shows both, each where it really sits — the
  // panel hangs on the WALL BAND above a low console, not as a monitor
  // balanced on a cabinet in the furniture row. One hit rect covers the pair.
  const consoleBox = isoBox(126, ITEMS_Y, 44, 13, 15);
  const wallTvBox = isoBox(130, 96, 38, 22, 2);
  const tvBox = unionBox(consoleBox, wallTvBox);
  const decorBox = isoBox(176, ITEMS_Y, 24, 22, 14);
  // The rug lies in the open floor in FRONT of the furniture row — which is
  // both where a rug goes in a wall-backed living room and the only part of
  // the scene not already spoken for. Drawn at true scale against the sofa it
  // sits in front of (a 2.4m rug next to a 2.2m sofa), not shrunk to fit a gap.
  // It starts at x=52, not at the sofa's own x: the app's floating compass
  // badge covers the panel's bottom-left corner, and art parked under it is
  // art nobody can click.
  const rugBox = isoBox(52, FLOOR_Y - 10, 62, 0, 26);
  // A gallery wall over the sofa: the wall band's one free stretch, and where
  // a set of prints actually hangs. Sized against the sofa below it — about
  // 1.3m of frames over a 2.2m sofa — rather than shrunk into a corner.
  const artBox = isoBox(24, 96, 44, 28, 2);
  // The clock goes high and to the side, over the plant corner. Small, but a
  // 0.3m dial IS small next to a sofa; drawing it any bigger would be the
  // "cheap patch" the navigator rules exist to stop.
  const clockBox = isoBox(178, 92, 18, 18, 2);

  return [
    { id: "sofa", label: "Sofa", keywords: LIVING_HOTSPOTS[0].keywords, box: sofaBox, art: <Sofa x={10} yFront={ITEMS_Y} w={72} depth={20} /> },
    { id: "rug", label: "Rug", keywords: LIVING_HOTSPOTS[3].keywords, box: rugBox, art: <Rug x={52} yFront={FLOOR_Y - 10} w={62} depth={26} /> },
    { id: "coffeeTable", label: "Coffee table", keywords: LIVING_HOTSPOTS[1].keywords, box: tableBox, art: <TableWithLegs x={90} yFront={ITEMS_Y} w={26} depth={16} topH={3} legH={14} /> },
    {
      id: "tv",
      label: "TV & storage",
      keywords: LIVING_HOTSPOTS[2].keywords,
      box: tvBox,
      art: (
        <>
          <Extrusion box={consoleBox} />
          <DoorSeam box={consoleBox} at={0.5} />
          <WallTv box={wallTvBox} />
        </>
      ),
    },
    { id: "decor", label: "Lamp & decor", keywords: LIVING_HOTSPOTS[4].keywords, box: decorBox, art: <Plant x={188} yFront={ITEMS_Y + 6} r={5} potH={7} canopyR={8} /> },
    {
      id: "art",
      label: "Wall art",
      keywords: LIVING_HOTSPOTS[5].keywords,
      box: artBox,
      art: (
        <>
          <FramedArt x={24} yTop={68} w={26} h={28} scene="landscape" />
          <FramedArt x={53} yTop={68} w={15} h={13} scene="abstract" />
          <FramedArt x={53} yTop={84} w={15} h={12} scene="landscape" />
        </>
      ),
    },
    { id: "clock", label: "Clock", keywords: LIVING_HOTSPOTS[6].keywords, box: clockBox, art: <WallClockArt cx={187} cy={83} r={9} /> },
  ];
}

export function LivingScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={LIVING_X0} width={LIVING_WIDTH} items={LivingItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
