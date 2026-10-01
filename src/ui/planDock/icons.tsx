"use client";

// Plan Dock icon set — replaces text labels per Dan's Phase-B review
// ("make an icon for each category/room scene", "make [Furniture/Lighting]
// as icons"). Simple geometric line glyphs (stroke, currentColor, 24x24
// viewBox), matching the README's "Assets" guidance for the eventual real
// icon set: monochrome, non-illustrative, one shape per concept. These are
// still placeholders — swap for a real icon set later without touching call
// sites (every icon takes the same {size} prop).

import type { ReactNode, SVGProps } from "react";

type IconProps = { size?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height">;

function Base({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function HouseAllIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M10 19.5v-6h4v6" />
    </Base>
  );
}

// Room icons, round 5 (approved by Dan 2026-09-30; sheet and sources in
// floorplan-3d-refs/navigator-icons-r5). One object everyone knows per room,
// plain lines, and a dark fill only for real openings and glass (toilet bowl,
// screen, washer door, windscreen, shirt neck). Unlike `Base`, the stroke is
// held at ~1.5 px ON SCREEN: at 20 px a fixed 1.6-unit stroke draws 1.33 px and
// the details blur, at 40 px it gets heavy. Small inner shapes are fills, not
// outlines: two parallel strokes need >= 2.5 units of gap to survive 20 px.
type Drawing = { line: string; hole?: string; dot?: string };

function Drawn({ size = 16, drawing: d, ...rest }: IconProps & { drawing: Drawing }) {
  const sw = Math.min(2, (1.5 * 24) / Math.min(size, 28));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...rest}>
      {d.hole && <path d={d.hole} fill="currentColor" fillOpacity={0.6} />}
      <path d={d.line} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      {d.dot && <path d={d.dot} fill="currentColor" />}
    </svg>
  );
}

/** Chef hat. */
const KITCHEN_DRAWING: Drawing = {
  line: "M7 14.5V11.6A3.6 3.6 0 0 1 8.4 4.9A4.3 4.3 0 0 1 15.6 4.9A3.6 3.6 0 0 1 17 11.6V14.5 M7 14.5h10v4.3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z M10 14.5v-3 M14 14.5v-3",
};
export function KitchenIcon(p: IconProps) {
  return <Drawn {...p} drawing={KITCHEN_DRAWING} />;
}

/** Toilet. */
const BATHROOM_DRAWING: Drawing = {
  line: "M7.2 11.1L6.2 5.8C6 3 8.6 1.5 12 1.5s6 1.5 5.8 4.3l-1 5.3 M4.5 13.5a7.5 3.2 0 1 0 15 0a7.5 3.2 0 1 0-15 0z M5.3 15.3c.6 2.2 2.2 3.5 3.8 4v2.2h5.8v-2.2c1.6-.5 3.2-1.8 3.8-4 M8.2 21.5h7.6",
  hole: "M7.4 13.4a4.6 1.7 0 1 0 9.2 0a4.6 1.7 0 1 0-9.2 0z",
};
export function BathroomIcon(p: IconProps) {
  return <Drawn {...p} drawing={BATHROOM_DRAWING} />;
}

/** Double bed. */
const BEDROOM_DRAWING: Drawing = {
  line: "M4 11.5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6.5 M7.3 7h3.4a1.5 1.5 0 0 1 1.5 1.5v.5h-6.4v-.5A1.5 1.5 0 0 1 7.3 7z M13.3 7h3.4a1.5 1.5 0 0 1 1.5 1.5v.5h-6.4v-.5A1.5 1.5 0 0 1 13.3 7z M2.5 12.5a1 1 0 0 1 1-1h17a1 1 0 0 1 1 1V18h-19z M2.5 15h19 M4 18v2.5 M20 18v2.5",
};
export function BedroomIcon(p: IconProps) {
  return <Drawn {...p} drawing={BEDROOM_DRAWING} />;
}

/** Sofa. */
const LIVING_DRAWING: Drawing = {
  line: "M5 12.5V8.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4 M12 6.5v6 M3.5 11A1.5 1.5 0 0 1 5 12.5v2h14v-2a1.5 1.5 0 0 1 3 0v5.5H2v-5.5A1.5 1.5 0 0 1 3.5 11z M12 14.5V18 M3.5 18v2 M20.5 18v2",
};
export function LivingIcon(p: IconProps) {
  return <Drawn {...p} drawing={LIVING_DRAWING} />;
}

/** Plate and cutlery. */
const DINING_DRAWING: Drawing = {
  line: "M6.7 12a5.3 5.3 0 1 0 10.6 0a5.3 5.3 0 1 0 -10.6 0z M9.2 12a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0z M1.6 3v3.6a1.4 1.4 0 0 0 2.8 0V3 M3 7.9V21 M20.6 21V3c1.6 1.3 2 4.7 1.7 8.6h-1.7",
};
export function DiningIcon(p: IconProps) {
  return <Drawn {...p} drawing={DINING_DRAWING} />;
}

/** Computer on a desk. */
const STUDY_DRAWING: Drawing = {
  line: "M6 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M12 13v3.5 M9 16.5h6 M2 16.5h20 M4 16.5V21.5 M20 16.5V21.5",
  hole: "M6.9 4.9h10.2v6.2H6.9z",
};
export function StudyIcon(p: IconProps) {
  return <Drawn {...p} drawing={STUDY_DRAWING} />;
}

/** Washing machine. */
const LAUNDRY_DRAWING: Drawing = {
  line: "M5.5 2.5h13a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20V4a1.5 1.5 0 0 1 1.5-1.5z M4 7h16 M6.8 14a5.2 5.2 0 1 0 10.4 0a5.2 5.2 0 1 0 -10.4 0z",
  hole: "M8.7 14a3.3 3.3 0 1 0 6.6 0a3.3 3.3 0 1 0 -6.6 0z",
  dot: "M6.3 4.75a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0z M8.9 4.75a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0z M15.4 4.75a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0z",
};
export function LaundryIcon(p: IconProps) {
  return <Drawn {...p} drawing={LAUNDRY_DRAWING} />;
}

/** Shirt on a hanger. */
const CLOSET_DRAWING: Drawing = {
  line: "M8.8 6.8L3.2 9.8L5 13.6L7 12.6V21H17V12.6L19 13.6L20.8 9.8L15.2 6.8A3.2 2.4 0 0 1 8.8 6.8z M12 6.8V5.2a1.7 1.7 0 1 1 1.7-1.7",
  hole: "M8.8 6.8A3.2 2.4 0 0 0 15.2 6.8z",
};
export function ClosetIcon(p: IconProps) {
  return <Drawn {...p} drawing={CLOSET_DRAWING} />;
}

/** Teddy bear. */
const KIDS_DRAWING: Drawing = {
  line: "M7.8 7.6a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0 -8.4 0z M7.97 6.10L7.70 6.09L7.44 6.04L7.19 5.96L6.95 5.85L6.73 5.70L6.53 5.52L6.36 5.32L6.22 5.09L6.11 4.85L6.04 4.60L6.00 4.33L6.00 4.07L6.04 3.80L6.11 3.55L6.22 3.31L6.36 3.08L6.53 2.88L6.73 2.70L6.95 2.55L7.19 2.44L7.44 2.36L7.70 2.31L7.97 2.30L8.23 2.33L8.49 2.39L8.73 2.49L8.96 2.62L9.17 2.79L9.36 2.98L9.51 3.19L9.64 3.43L9.73 3.68L9.78 3.94 M14.22 3.94L14.27 3.68L14.36 3.43L14.49 3.19L14.64 2.98L14.83 2.79L15.04 2.62L15.27 2.49L15.51 2.39L15.77 2.33L16.03 2.30L16.30 2.31L16.56 2.36L16.81 2.44L17.05 2.55L17.27 2.70L17.47 2.88L17.64 3.08L17.78 3.31L17.89 3.55L17.96 3.80L18.00 4.07L18.00 4.33L17.96 4.60L17.89 4.85L17.78 5.09L17.64 5.32L17.47 5.52L17.27 5.70L17.05 5.85L16.81 5.96L16.56 6.04L16.30 6.09L16.03 6.10 M13.11 20.46L12.48 20.57L11.84 20.60L11.20 20.53L10.89 20.46 M7.80 17.87L7.58 17.27L7.44 16.64L7.40 16.00L7.44 15.36L7.58 14.73L7.80 14.13L8.10 13.56L8.48 13.04L8.92 12.58L9.43 12.19L9.98 11.87L10.58 11.63 M13.42 11.63L14.02 11.87L14.57 12.19L15.08 12.58L15.52 13.04L15.90 13.56L16.20 14.13L16.42 14.73L16.56 15.36L16.60 16.00L16.56 16.64L16.42 17.27L16.20 17.87 M7.26 16.30L7.02 16.29L6.79 16.25L6.56 16.18L6.35 16.07L6.15 15.94L5.98 15.78L5.82 15.60L5.70 15.40L5.60 15.18L5.54 14.95L5.50 14.72L5.50 14.48L5.54 14.25L5.60 14.02L5.70 13.80L5.82 13.60L5.98 13.42L6.15 13.26L6.35 13.13L6.56 13.02L6.79 12.95L7.02 12.91L7.26 12.90L7.50 12.93L7.73 12.98L7.95 13.07L8.15 13.19 M15.85 13.19L16.05 13.07L16.27 12.98L16.50 12.93L16.74 12.90L16.98 12.91L17.21 12.95L17.44 13.02L17.65 13.13L17.85 13.26L18.02 13.42L18.18 13.60L18.30 13.80L18.40 14.02L18.46 14.25L18.50 14.48L18.50 14.72L18.46 14.95L18.40 15.18L18.30 15.40L18.18 15.60L18.02 15.78L17.85 15.94L17.65 16.07L17.44 16.18L17.21 16.25L16.98 16.29L16.74 16.30 M6.6 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z M13.4 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z",
  dot: "M9.65 7a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 1 0 -1.5 0z M12.85 7a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 1 0 -1.5 0z M11.05 9.1a0.95 0.95 0 1 0 1.9 0a0.95 0.95 0 1 0 -1.9 0z M7.8 20a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0z M14.6 20a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0z",
};
export function KidsIcon(p: IconProps) {
  return <Drawn {...p} drawing={KIDS_DRAWING} />;
}

/** Car. */
const GARAGE_DRAWING: Drawing = {
  line: "M6.3 10.3l1.6-5A1.6 1.6 0 0 1 9.4 4.2h5.2a1.6 1.6 0 0 1 1.5 1.1l1.6 5 M3 10.3h18a1 1 0 0 1 1 1V17H2v-5.7a1 1 0 0 1 1-1z M9.5 14.2h5 M4 17v2.6h3V17 M17 17v2.6h3V17",
  hole: "M8.7 9.4l1.3-3.7h4l1.3 3.7z",
  dot: "M4 13.6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0z M17.6 13.6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0z",
};
export function GarageIcon(p: IconProps) {
  return <Drawn {...p} drawing={GARAGE_DRAWING} />;
}

/** Trees. */
const OUTDOORS_DRAWING: Drawing = {
  line: "M4.75 3.5L7.5 8H6.1L8.2 12.3H6.4L8.4 16.5H1.1L3.1 12.3H1.3L3.4 8H2z M4.75 16.5V20.5 M10.8 8.6a5.2 5.2 0 1 0 10.4 0a5.2 5.2 0 1 0 -10.4 0z M16 13.8V20.5 M16 17l2.3-2 M1 20.5h22",
};
export function OutdoorsIcon(p: IconProps) {
  return <Drawn {...p} drawing={OUTDOORS_DRAWING} />;
}

/** Pendant lamp: cord, dome shade, the bulb under it, three rays. */
const LIGHTING_DRAWING: Drawing = {
  line: "M12 1.5V6 M10.5 6h3 M3.5 14.5C3.5 9.8 7.3 6 12 6s8.5 3.8 8.5 8.5z M12 19.5v2.5 M6.6 18.2l-1.5 1.7 M17.4 18.2l1.5 1.7",
  hole: "M9.3 14.5a2.7 2.7 0 0 0 5.4 0z",
};
export function LightingIcon(p: IconProps) {
  return <Drawn {...p} drawing={LIGHTING_DRAWING} />;
}

// Build tool icons, same round-5 set and recipe as the rooms above.
/** Brick wall. */
const WALLS_DRAWING: Drawing = {
  line: "M2 4h20v16H2z M2 9.3h20 M2 14.7h20 M8 4v5.3 M16 4v5.3 M5 9.3v5.4 M12 9.3v5.4 M19 9.3v5.4 M8 14.7V20 M16 14.7V20",
};
export function BrickWallIcon(p: IconProps) {
  return <Drawn {...p} drawing={WALLS_DRAWING} />;
}

/** Open door. */
const DOORS_DRAWING: Drawing = {
  line: "M7 21V2h12v19 M3.5 21h17 M7 2l5 2.2v17.9L7 21z",
  hole: "M13 3h5.1v17.1H13z",
  dot: "M9.7 12.6a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0z",
};
export function OpenDoorIcon(p: IconProps) {
  return <Drawn {...p} drawing={DOORS_DRAWING} />;
}

/** Window. */
const WINDOWS_DRAWING: Drawing = {
  line: "M4 3h16v15H4z M12 3v15 M4 11h16 M2.5 18h19v2.5h-19z",
  hole: "M5.9 4.9h5.2v5.2H5.9z M12.9 4.9h5.2v5.2h-5.2z M5.9 11.9h5.2v5.2H5.9z M12.9 11.9h5.2v5.2h-5.2z",
};
export function WindowPanesIcon(p: IconProps) {
  return <Drawn {...p} drawing={WINDOWS_DRAWING} />;
}

/** Tape measure. */
const MEASURE_DRAWING: Drawing = {
  line: "M5.5 4h6a3 3 0 0 1 3 3v9h-9a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z M5.5 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z M14.5 12.5h7V16h-7 M21.5 11v6.5 M16.8 16v-1.4 M19.2 16v-1.4",
  hole: "M7.3 10a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0z",
};
export function TapeMeasureIcon(p: IconProps) {
  return <Drawn {...p} drawing={MEASURE_DRAWING} />;
}

/** Floor planks running away from you, staggered ends. */
const FLOORS_DRAWING: Drawing = {
  line: "M6.5 7h11l4.5 13H2z M10.2 7L8.7 20 M13.8 7l1.5 13 M4.6 13h3.4 M11.2 11h2.6 M16.3 15.5h4.2",
};
export function FloorboardsIcon(p: IconProps) {
  return <Drawn {...p} drawing={FLOORS_DRAWING} />;
}

/** Paint roller: roller, frame, handle. */
const PAINT_DRAWING: Drawing = {
  line: "M4.5 3h11a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 1 15.5 8h-11A1.5 1.5 0 0 1 3 6.5v-2A1.5 1.5 0 0 1 4.5 3z M17 5.5h2.5v5H11V14 M9.8 14h2.4v7.5H9.8z",
};
export function PaintRollerIcon(p: IconProps) {
  return <Drawn {...p} drawing={PAINT_DRAWING} />;
}

export const ROOM_ICON = {
  kitchen: KitchenIcon,
  bathroom: BathroomIcon,
  bedroom: BedroomIcon,
  living: LivingIcon,
  dining: DiningIcon,
  study: StudyIcon,
  laundry: LaundryIcon,
  closet: ClosetIcon,
  kids: KidsIcon,
  garage: GarageIcon,
  outdoors: OutdoorsIcon,
  lighting: LightingIcon,
} as const;

export function SofaIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
      <path d="M3.5 12h17a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 20.5 18h-17A1.5 1.5 0 0 1 2 16.5v-3A1.5 1.5 0 0 1 3.5 12Z" />
      <path d="M4 18v2M20 18v2" />
    </Base>
  );
}

export function BulbIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.9V16h5v-.2c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3Z" />
    </Base>
  );
}

export function PaintIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 8.5 12.5 3l8.5 5.5-9.5 5.5z" />
      <path d="M6 10v6c0 2 2.5 3.5 5.5 3.5h1c1.4 0 2.5-1 2.5-2.3 0-.9-.6-1.4-.6-2.2 0-1.1 1-1.5 2.1-1.5" />
    </Base>
  );
}

export function FloorIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={3} y={3} width={8} height={8} rx={0.5} />
      <rect x={13} y={3} width={8} height={8} rx={0.5} />
      <rect x={3} y={13} width={8} height={8} rx={0.5} />
      <rect x={13} y={13} width={8} height={8} rx={0.5} />
    </Base>
  );
}

export const SECTION_ICON = {
  furniture: SofaIcon,
  lighting: BulbIcon,
  paint: PaintIcon,
  floors: FloorIcon,
} as const;

export function SearchIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx={10.5} cy={10.5} r={6.5} />
      <path d="m20 20-4.8-4.8" />
    </Base>
  );
}

export function EyedropperIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="m19 3-4.5 4.5" />
      <path d="M16.5 5.5a2.4 2.4 0 0 1 0 3.4L8 17.4l-4.5 1.1 1.1-4.5 8.5-8.5a2.4 2.4 0 0 1 3.4 0Z" />
      <path d="m13 8 3 3" />
    </Base>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 5l14 14M19 5 5 19" />
    </Base>
  );
}

// ── Replacing the emoji and the typographic symbols ──────────────────────────
//
// Everything below exists to retire a character that was standing in for an
// icon: 25 real emoji (🚪 🪟 🎨 🗑 🌧 🌙 🚶 🗺 📏 🧲 …) and ~40 dingbats
// (◇ ▤ ⬓ ↔ ☀ ☾ ✓ ✗ ⚠ ✎ ◈ ‹ ● ◨). Both fail the same way: they are TEXT, so
// they pick a different face on every platform, ignore `strokeWidth`, sit on
// the text baseline instead of the icon grid, and never match the SVG glyphs
// beside them.
//
// Same `Base` contract as the icons above — 24×24, currentColor, 1.6 stroke,
// one `size` prop — so a call site swaps a string for a component and changes
// nothing else. Reused rather than redrawn where one already fit: PaintIcon
// for 🎨, CloseIcon for ✕/✗/×.

/** 🚪 — a door leaf in its frame. The type the user places, not the tool. */
export function DoorIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17" />
      <path d="M3.5 21h17" />
      <circle cx={14} cy={12.5} r={0.9} fill="currentColor" stroke="none" />
    </Base>
  );
}

/** 🪟 — sash and mullions. */
export function WindowIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={4} y={4} width={16} height={16} rx={1} />
      <path d="M12 4v16M4 12h16" />
    </Base>
  );
}

/** ⌷ — a cased opening: the same frame as a door with nothing hung in it, plus
 *  an arrow, because the point of a passage is that you walk through it. The
 *  arrow is what keeps it distinct from DoorIcon at 15px, where a door's knob
 *  is close to invisible. */
export function PassageIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6 21V4h12v17" />
      <path d="M2.5 21h19" />
      <path d="M9.5 12.5h5M12.5 10.5l2 2-2 2" />
    </Base>
  );
}

/** ▤ — the old wall-tool glyph. The Build toolbar uses BrickWallIcon now;
 *  kept because legacy/src/trace2d/TraceRail.tsx still imports it. */
export function WallToolIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={3} y={5.5} width={18} height={13} rx={1} />
      <path d="M3 12h18M9 5.5v6.5M15 12v6.5" />
    </Base>
  );
}

/** ↔ — the old measure glyph. The Build toolbar uses TapeMeasureIcon now;
 *  kept because legacy/src/trace2d/TraceRail.tsx still imports it. */
export function MeasureIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 12h18" />
      <path d="M6.5 8.5L3 12l3.5 3.5M17.5 8.5L21 12l-3.5 3.5" />
      <path d="M9.5 9.5v5M14.5 9.5v5" />
    </Base>
  );
}

/** 🧲 — snapping to CAD centrelines. */
export function MagnetIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" />
      <path d="M6 4h4v8a2 2 0 0 0 4 0V4h4" />
      <path d="M6 9h4M14 9h4" />
    </Base>
  );
}

/** 🗺 — the trace panel's empty state. Drawn to read at 34px, not 16. */
export function PlanMapIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 6.5l6-2.5 6 2.5 6-2.5v14l-6 2.5-6-2.5-6 2.5z" />
      <path d="M9 4v15M15 6.5v15" />
    </Base>
  );
}

// ── Weather / time of day (Viewport) ────────────────────────────────────────

/** ☀ — clear. Also the light half of the theme toggle. */
export function SunIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </Base>
  );
}

/** ☁ — cloudy. */
export function CloudIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M7 18.5a4.2 4.2 0 0 1 .7-8.35 5.4 5.4 0 0 1 10.2 1.65A3.6 3.6 0 0 1 17.4 18.5z" />
    </Base>
  );
}

/** 🌧 — rain. */
export function RainIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M7 15.5a4 4 0 0 1 .7-7.95 5.2 5.2 0 0 1 9.8 1.6A3.5 3.5 0 0 1 17.1 15.5z" />
      <path d="M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5" />
    </Base>
  );
}

/** 🌙 / ☾ — night, and the dark half of the theme toggle. */
export function MoonIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6z" />
    </Base>
  );
}

/** 🚶 — enter the walkthrough. */
export function WalkIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx={13.5} cy={4.2} r={1.7} />
      <path d="M13.8 8l-3.3 1.6-1 4.4" />
      <path d="M13.8 8l1.7 3.4 2.5 1.2" />
      <path d="M13 11.4l-2.4 4.2L8.5 21M13 11.4l1.6 4.2 1.4 5.4" />
    </Base>
  );
}

// ── Light fixtures (FixtureCatalog SHAPE_ICON) ──────────────────────────────

/** ● — flush-mounted disc. */
export function DiscLightIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx={12} cy={12} r={7.5} />
      <circle cx={12} cy={12} r={3} />
    </Base>
  );
}

/** ☀ (as a fixture) — a pendant on its drop. */
export function PendantIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 3v6" />
      <path d="M5.5 16.5a6.5 6.5 0 0 1 13 0z" />
      <path d="M9 20h6" />
    </Base>
  );
}

/** ◨ — a wall sconce: the wall it hangs on, the arm, and a half-shade. The
 *  shade carries the shape, so it is sized to fill the grid rather than sit
 *  politely beside the wall line. */
export function SconceIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3.5 3v18" />
      <path d="M3.5 12h3.5" />
      <path d="M7 16.5a5.8 5.8 0 0 1 11.6 0z" />
    </Base>
  );
}

// ── Status and actions ──────────────────────────────────────────────────────

/** ✓ — succeeded. (✗ / ✕ / × reuse CloseIcon above.) */
export function CheckIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Base>
  );
}

/** ⚠ — a warning that is not an error. */
export function WarnIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 3.5L2.5 20.5h19z" />
      <path d="M12 10v4.6" />
      <circle cx={12} cy={17.6} r={0.85} fill="currentColor" stroke="none" />
    </Base>
  );
}

/** ✎ — rename. */
export function PencilIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 20.5h4.2L20.5 8.2l-4.2-4.2L4 16.3z" />
      <path d="M14.8 5.5l4.2 4.2" />
    </Base>
  );
}

/** 🗑 — delete. */
export function TrashIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3.5 6.5h17" />
      <path d="M9.5 3.5h5" />
      <path d="M5.8 6.5l1 14h10.4l1-14" />
      <path d="M10 10.5v6.5M14 10.5v6.5" />
    </Base>
  );
}

/** ‹ — back to the project library. */
export function ChevronLeftIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 4.5l-7.5 7.5L15 19.5" />
    </Base>
  );
}

/** ◈ — go live / open live. A shared room broadcasting. */
export function LiveIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx={12} cy={12} r={2.6} />
      <path d="M6.9 6.9a7.2 7.2 0 0 0 0 10.2M17.1 6.9a7.2 7.2 0 0 1 0 10.2" />
      <path d="M3.6 3.6a11.9 11.9 0 0 0 0 16.8M20.4 3.6a11.9 11.9 0 0 1 0 16.8" />
    </Base>
  );
}

/** ▤ (in the stair inspector) — a flight of stairs. */
export function StairsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 20.5v-4h4.5v-4H12v-4h4.5v-4H21" />
      <path d="M3 20.5h18" />
    </Base>
  );
}

/** ▉ (in the stair inspector) — a closed-stringer flight: the same profile,
 *  boxed in down to the floor. Paired with StairsIcon, which is the open one. */
export function StairsSolidIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 20.5v-4h4.5v-4H12v-4h4.5v-4H21" />
      <path d="M3 20.5h18" />
      <path d="M21 4.5v16" />
    </Base>
  );
}

// ── Trace rail (legacy/src/trace2d) ─────────────────────────────────────────
// The guided trace rail was missed by the first icon sweep because it lives
// under legacy/ and only src/ was scanned. Its "Draw by hand" row is one strip
// of five buttons, so all five need to be the same kind of thing.

/** ▭ — a balcony/terrace railing: posts under a top rail (schema/scene.ts
 *  `kind: "rail"`). Low and see-through, which is the whole distinction from a
 *  wall. */
export function RailIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M2.5 8.5h19" />
      <path d="M2.5 19.5h19" />
      <path d="M6.5 8.5v11M12 8.5v11M17.5 8.5v11" />
    </Base>
  );
}

/** ⊾ — the ortho lock: constrain the next wall to 90°. */
export function OrthoIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4.5 3.5v17h16" />
      <path d="M4.5 15.5h5v5" />
    </Base>
  );
}

/** ↶ — undo. */
export function UndoIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 9.5h9.5a5.5 5.5 0 1 1 0 11H8" />
      <path d="M7.5 5.5L3.5 9.5l4 4" />
    </Base>
  );
}

/** ⬇ — download a file (the eval ground-truth export). */
export function DownloadIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 3.5v12" />
      <path d="M7.5 11.5L12 16l4.5-4.5" />
      <path d="M4 20.5h16" />
    </Base>
  );
}

/** ▾ — a disclosure that is closed/open. One glyph, rotated by the caller when
 *  it needs to point right (see ChevronRightIcon). */
export function ChevronDownIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4.5 8.5L12 16l7.5-7.5" />
    </Base>
  );
}

/** ▸ — a collapsed disclosure. */
export function ChevronRightIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M8.5 4.5L16 12l-7.5 7.5" />
    </Base>
  );
}

// ── Canvas + gallery controls ───────────────────────────────────────────────

/** ＋ — zoom in / add. */
export function PlusIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 4.5v15M4.5 12h15" />
    </Base>
  );
}

/** － — zoom out. */
export function MinusIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4.5 12h15" />
    </Base>
  );
}

/** ⤢ — reset the view so the whole plan fits. */
export function FitIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M9.5 3.5h-6v6" />
      <path d="M14.5 20.5h6v-6" />
      <path d="M3.5 3.5l7 7M20.5 20.5l-7-7" />
    </Base>
  );
}

// ── Dev tools (src/dev/GtLab.tsx) ───────────────────────────────────────────

/** ⚗ — the ground-truth lab. Dev-only chrome. */
export function FlaskIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M9 3.5h6" />
      <path d="M10 3.5v6L4.5 19a1.6 1.6 0 0 0 1.4 2.4h12.2a1.6 1.6 0 0 0 1.4-2.4L14 9.5v-6" />
      <path d="M7 15.5h10" />
    </Base>
  );
}

/** ⇪ — drop files here. */
export function UploadIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 16.5v-12" />
      <path d="M7.5 9L12 4.5 16.5 9" />
      <path d="M4 20.5h16" />
    </Base>
  );
}
