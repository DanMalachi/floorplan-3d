"use client";

import { isoBox, Extrusion, Cylinder, isoCylinder, Toilet, Bathtub, BasinCutout, KnobRow, DETAIL_LINE, DETAIL_LIGHT, RoomSceneShell, ITEMS_Y, type RoomItem } from "./isoArt";
import type { RoomHotspot } from "./KitchenScene";

export const BATHROOM_HOTSPOTS: RoomHotspot[] = [
  { id: "toilet", label: "Toilet", keywords: ["toilet"] },
  // "shower" also matches the "Shower head" catalog item by substring — no
  // separate hotspot needed for it.
  { id: "shower", label: "Shower", keywords: ["shower"] },
  { id: "bathtub", label: "Bathtub", keywords: ["bathtub", "tub"] },
  { id: "vanity", label: "Sink & vanity", keywords: ["sink", "basin", "vanity"] },
  { id: "washer", label: "Washer", keywords: ["washer"] },
  // Mirrors were folded into "extras" and so had no button of their own, even
  // though a mirror is one of the things people go looking for first.
  { id: "mirror", label: "Mirror", keywords: ["mirror"] },
  { id: "extras", label: "Towel & bin", keywords: ["towel", "trash", "bin"] },
];

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

  // Towel rail hangs on the wall; the bin stands under it. One hotspot covers
  // both, so its hit box spans the wall band down to the floor.
  const bin = isoCylinder(199, ITEMS_Y + 2, 5, 11);
  const RAIL_Y = 100;
  const extras = isoBox(192, ITEMS_Y, 14, ITEMS_Y - RAIL_Y + 4, 10);

  return [
    { id: "toilet", label: "Toilet", keywords: BATHROOM_HOTSPOTS[0].keywords, box: toiletBox, art: <Toilet x={14} yFront={ITEMS_Y} w={22} depth={16} /> },
    {
      id: "shower",
      label: "Shower",
      keywords: BATHROOM_HOTSPOTS[1].keywords,
      box: shower,
      art: (
        <>
          <Extrusion box={shower} top="oklch(0.7 0.03 220 / 0.4)" front="oklch(0.62 0.03 220 / 0.35)" right="oklch(0.5 0.03 220 / 0.4)" />
          <line x1={shower.face.x + 3} y1={shower.face.yFront - 2} x2={shower.face.x + shower.face.w - 3} y2={shower.face.yFront - shower.face.h + 4} stroke={DETAIL_LINE} strokeWidth={0.6} />
        </>
      ),
    },
    { id: "bathtub", label: "Bathtub", keywords: BATHROOM_HOTSPOTS[2].keywords, box: tub, art: <Bathtub x={80} yFront={ITEMS_Y} w={46} depth={20} /> },
    {
      id: "vanity",
      label: "Sink & vanity",
      keywords: BATHROOM_HOTSPOTS[3].keywords,
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
      label: "Washer",
      keywords: BATHROOM_HOTSPOTS[4].keywords,
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
      keywords: BATHROOM_HOTSPOTS[5].keywords,
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
      id: "extras",
      label: "Towel & bin",
      keywords: BATHROOM_HOTSPOTS[6].keywords,
      box: extras,
      art: (
        <>
          {/* Wall-mounted rail with two towels folded over it, bin beneath. */}
          <line x1={bin.cx - 9} y1={RAIL_Y} x2={bin.cx + 9} y2={RAIL_Y} stroke={DETAIL_LINE} strokeWidth={1.4} strokeLinecap="round" />
          {[-5.5, 2].map((dx) => (
            <path
              key={dx}
              d={`M ${bin.cx + dx} ${RAIL_Y} v 13 a 1.8 1.8 0 0 0 3.4 0 v -13`}
              fill="oklch(0.74 0.03 200 / 0.5)"
              stroke={DETAIL_LINE}
              strokeWidth={0.7}
            />
          ))}
          <Cylinder c={bin} />
        </>
      ),
    },
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
