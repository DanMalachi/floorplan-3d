"use client";

import { isoBox, Extrusion, Toilet, Bathtub, Bin, TowelRail, BasinCutout, KnobRow, Rug, FramedArt, DETAIL_LINE, DETAIL_LIGHT, RoomSceneShell, ITEMS_Y, FLOOR_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const BATHROOM_HOTSPOTS: RoomHotspot[] = [
  { id: "toilet", label: "Toilet", keywords: ["toilet"] },
  // "shower" also matches the "Shower head" catalog item by substring — no
  // separate hotspot needed for it.
  { id: "shower", label: "Shower", keywords: ["shower"] },
  { id: "bathtub", label: "Bathtub", keywords: ["bathtub", "tub"] },
  { id: "vanity", label: "Sink & vanity", keywords: ["sink", "basin", "vanity"] },
  // Israeli bathrooms routinely hold the laundry pair, and Phase 2 put a
  // tumble dryer in the catalog — a hotspot that only said "washer" left it
  // with no way in.
  { id: "washer", label: "Washer & dryer", keywords: ["washer", "washing machine", "dryer", "laundry"] },
  // Mirrors were folded into "extras" and so had no button of their own, even
  // though a mirror is one of the things people go looking for first.
  { id: "mirror", label: "Mirror", keywords: ["mirror"] },
  // Towels and the bin used to share one "extras" button, which is the same
  // mistake the generator made — they are different products bought at
  // different times. Split, they also stop competing for one hit box that
  // spanned the wall band down to the floor.
  { id: "towels", label: "Towels", keywords: ["towel", "hook"] },
  { id: "bin", label: "Bin", keywords: ["trash", "waste", "recycl"] },
  // Wide roll-out: the same rug product as every other room, but a rug in a
  // bathroom is a bathmat, so it gets the name people actually use for it.
  { id: "rug", label: "Bath mat", keywords: ["rug", "carpet", "mat"] },
  // Wall art reaches the bathroom for the same reason it reaches the laundry:
  // one small framed print is what a narrow wall gets, and it is the cheapest
  // thing that stops the room reading as a showroom.
  { id: "art", label: "Wall art", keywords: ["wall art", "artwork", "picture", "poster"] },
];

const kw = (id: string) => BATHROOM_HOTSPOTS.find((h) => h.id === id)!.keywords;

export const BATHROOM_X0 = 12;
export const BATHROOM_WIDTH = 194;

function BathroomItems(): RoomItem[] {
  // The room is drawn in two bands: fixtures stand on the floor line, and
  // wall-mounted things hang in the wall band above it (ITEMS_Y - WALL_H up to
  // ITEMS_Y). A mirror belongs on the wall OVER the vanity at something like
  // its real size — the first pass squeezed it into the floor row as a small
  // box beside the dryer, which is not where or what a mirror is.
  const toiletBox = isoBox(14, ITEMS_Y, 22, 24, 16);
  const shower = isoBox(42, ITEMS_Y, 32, 54, 18);
  const tub = isoBox(80, ITEMS_Y, 46, 14, 20);
  const vanity = isoBox(132, ITEMS_Y, 30, 24, 16);
  const washer = isoBox(168, ITEMS_Y, 22, 28, 16);

  // Wall band. The mirror spans the vanity below it and stops just clear of
  // the vanity's projected top face, so the two hit boxes never overlap.
  const mirror = isoBox(130, 96, 34, 26, 2);

  // Towel rail hangs on the wall; the bin stands on the floor beneath it.
  // Two objects, two hit boxes, two buttons.
  const RAIL_Y = 100;
  const RAIL_X = 190;
  const RAIL_W = 18;
  const towels = isoBox(RAIL_X, RAIL_Y + 18, RAIL_W, 20, 6);
  const BIN_X = 192;
  const BIN_W = 13;
  const BIN_H = 15;
  const binBox = isoBox(BIN_X, ITEMS_Y + 3, BIN_W, BIN_H, 9);

  // A bath mat is small — real scale next to the tub it sits in front of, not
  // the area-rug size the other rooms draw. Sits in the open floor strip
  // below the fixture row, well clear of the compass badge over the panel's
  // bottom-left corner.
  const matBox = isoBox(86, FLOOR_Y - 6, 28, 0, 14);

  // Over the tub, in the wall band's one free stretch between the shower
  // enclosure and the mirror. Small, because a bathroom print is small.
  const artBox = isoBox(88, 104, 20, 22, 2);

  return [
    { id: "toilet", label: "Toilet", keywords: kw("toilet"), box: toiletBox, art: <Toilet x={14} yFront={ITEMS_Y} w={22} depth={16} /> },
    {
      id: "shower",
      label: "Shower",
      keywords: kw("shower"),
      box: shower,
      art: (
        <>
          <Extrusion box={shower} top="oklch(0.7 0.03 220 / 0.4)" front="oklch(0.62 0.03 220 / 0.35)" right="oklch(0.5 0.03 220 / 0.4)" />
          <line x1={shower.face.x + 3} y1={shower.face.yFront - 2} x2={shower.face.x + shower.face.w - 3} y2={shower.face.yFront - shower.face.h + 4} stroke={DETAIL_LINE} strokeWidth={0.6} />
        </>
      ),
    },
    { id: "bathtub", label: "Bathtub", keywords: kw("bathtub"), box: tub, art: <Bathtub x={80} yFront={ITEMS_Y} w={46} depth={20} /> },
    {
      id: "vanity",
      label: "Sink & vanity",
      keywords: kw("vanity"),
      box: vanity,
      art: (
        <>
          <Extrusion box={vanity} />
          <BasinCutout box={vanity} />
        </>
      ),
    },
    {
      id: "washer",
      label: "Washer & dryer",
      keywords: kw("washer"),
      box: washer,
      art: (
        <>
          <Extrusion box={washer} />
          <circle cx={washer.face.x + washer.face.w / 2} cy={washer.face.yFront - washer.face.h * 0.55} r={5} fill="none" stroke={DETAIL_LINE} strokeWidth={0.7} />
          <KnobRow box={washer} count={2} atH={0.15} />
        </>
      ),
    },
    {
      // Hangs flat ON the wall above the vanity, at close to a real mirror's
      // size relative to the unit below it. Drawn as a framed pane with a
      // reflection sheen rather than an extruded solid, because a mirror has
      // no depth to speak of — an isometric box would read as a cabinet.
      id: "mirror",
      label: "Mirror",
      keywords: kw("mirror"),
      box: mirror,
      art: (
        <g>
          <rect
            x={mirror.face.x}
            y={mirror.face.yFront - mirror.face.h}
            width={mirror.face.w}
            height={mirror.face.h}
            rx={1.5}
            fill="oklch(0.72 0.035 220 / 0.5)"
            stroke={DETAIL_LINE}
            strokeWidth={1.1}
          />
          {/* Two diagonal sheen strokes — the shorthand that reads as glass. */}
          <line
            x1={mirror.face.x + 4}
            y1={mirror.face.yFront - 3}
            x2={mirror.face.x + mirror.face.w * 0.55}
            y2={mirror.face.yFront - mirror.face.h + 3}
            stroke={DETAIL_LIGHT}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <line
            x1={mirror.face.x + mirror.face.w * 0.5}
            y1={mirror.face.yFront - 3}
            x2={mirror.face.x + mirror.face.w - 4}
            y2={mirror.face.yFront - mirror.face.h * 0.62}
            stroke={DETAIL_LIGHT}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeOpacity={0.7}
          />
        </g>
      ),
    },
    {
      id: "towels",
      label: "Towels",
      keywords: kw("towels"),
      box: towels,
      art: <TowelRail x={RAIL_X} y={RAIL_Y} w={RAIL_W} />,
    },
    {
      id: "bin",
      label: "Bin",
      keywords: kw("bin"),
      box: binBox,
      art: <Bin x={BIN_X} yFront={ITEMS_Y + 3} w={BIN_W} h={BIN_H} />,
    },
    { id: "rug", label: "Bath mat", keywords: kw("rug"), box: matBox, art: <Rug x={86} yFront={FLOOR_Y - 6} w={28} depth={14} /> },
    { id: "art", label: "Wall art", keywords: kw("art"), box: artBox, art: <FramedArt x={88} yTop={82} w={20} h={22} scene="landscape" /> },
  ];
}

export function BathroomScene({
  activeHotspot,
  onHotspotClick,
  onFloorClick,
}: {
  activeHotspot: string | null;
  onHotspotClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  return <RoomSceneShell x0={BATHROOM_X0} width={BATHROOM_WIDTH} items={BathroomItems()} activeHotspot={activeHotspot} onHotspotClick={onHotspotClick} onFloorClick={onFloorClick} />;
}
