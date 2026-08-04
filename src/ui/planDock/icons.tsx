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

export function CloseIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M5 5l14 14M19 5 5 19" />
    </Base>
  );
}
