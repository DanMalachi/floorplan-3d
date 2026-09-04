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

export function KitchenIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={3.5} y={4} width={5} height={16} rx={1} />
      <circle cx={6} cy={7.2} r={0.6} fill="currentColor" stroke="none" />
      <rect x={11} y={14} width={9.5} height={6} rx={1} />
      <circle cx={13.3} cy={17} r={1.15} />
      <circle cx={17} cy={17} r={1.15} />
      <path d="M11 10.5h9.5" />
    </Base>
  );
}

export function BathroomIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 12h16v2.5a4.5 4.5 0 0 1-4.5 4.5h-7A4.5 4.5 0 0 1 4 14.5z" />
      <path d="M6 12V7a2 2 0 0 1 3.2-1.6" />
      <path d="M9 19v1.5M15 19v1.5" />
    </Base>
  );
}

export function BedroomIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 19v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" />
      <path d="M3 16h18" />
      <path d="M5.5 10V7a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 11.5 7v3" />
    </Base>
  );
}

export function LivingIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 12.5V17h16v-4.5" />
      <path d="M4 12.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
      <path d="M6 10V7.5A1.5 1.5 0 0 1 7.5 6h9A1.5 1.5 0 0 1 18 7.5V10" />
      <path d="M4 17v2.5M20 17v2.5" />
    </Base>
  );
}

export function DiningIcon(p: IconProps) {
  return (
    <Base {...p}>
      <ellipse cx={12} cy={9} rx={8} ry={3} />
      <path d="M4 9v3.5c0 1.66 3.58 3 8 3s8-1.34 8-3V9" />
      <path d="M12 15.5V20" />
    </Base>
  );
}

export function StudyIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={3.5} y={5} width={17} height={11} rx={1} />
      <path d="M3.5 16 2 19.5h20L20.5 16" />
      <path d="M9 9.5h6M9 12h4" />
    </Base>
  );
}

export function OutdoorsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 3v6" />
      <path d="M12 9c-3 0-5.5 2-6.5 5.5C4.6 18 6.5 21 12 21s7.4-3 6.5-6.5C17.5 11 15 9 12 9Z" />
      <path d="M8.5 21c0-3 1.5-5 3.5-5s3.5 2 3.5 5" />
    </Base>
  );
}

export function LaundryIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={4} y={3.5} width={16} height={17} rx={1.5} />
      <circle cx={12} cy={13} r={5} />
      <circle cx={12} cy={13} r={2.3} />
      <path d="M7 6.5h1.5M11 6.5h1.5" />
    </Base>
  );
}

export function ClosetIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={4} y={3} width={16} height={18} rx={1} />
      <path d="M12 3v18" />
      <circle cx={9.5} cy={12} r={0.6} fill="currentColor" stroke="none" />
      <circle cx={14.5} cy={12} r={0.6} fill="currentColor" stroke="none" />
    </Base>
  );
}

export function KidsIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={3.5} y={4} width={7} height={7} rx={1} />
      <circle cx={16.5} cy={7.5} r={3.5} />
      <path d="M4 20v-4a4 4 0 0 1 4-4h1a4 4 0 0 1 4 4v4" />
      <path d="M14.5 20v-2.5a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3V20" />
    </Base>
  );
}

export function GarageIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 20V9.5L12 4l9 5.5V20" />
      <path d="M3 20h18" />
      <path d="M5.5 20v-8h13v8" />
      <path d="M5.5 15h13M5.5 17.5h13" />
    </Base>
  );
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

/** ⬓ — the Build tool. This is a wall IN PLAN with an opening cut through it:
 *  two parallel faces, broken in the middle, with the jambs closed off. Which
 *  is exactly how the tool is used and exactly what the trace canvas shows, so
 *  it borrows the drafting convention instead of inventing a metaphor.
 *
 *  Two filled stubs were tried first and read as a chain link. */
export function OpeningToolIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M2 8.5h7M15 8.5h7" />
      <path d="M2 15.5h7M15 15.5h7" />
      <path d="M9 8.5v7M15 8.5v7" />
    </Base>
  );
}

/** ◇ — the select tool. A pointer, because that is what it does. */
export function SelectIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5.5 3.5l13.5 7.6-6.1 1.5-2.6 6z" />
    </Base>
  );
}

/** ▤ — the wall tool. Courses, so it cannot be confused with a plain box. */
export function WallToolIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x={3} y={5.5} width={18} height={13} rx={1} />
      <path d="M3 12h18M9 5.5v6.5M15 12v6.5" />
    </Base>
  );
}

/** ↔ / 📏 — the measure tool, and "set/redo scale" in the trace rail. */
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
