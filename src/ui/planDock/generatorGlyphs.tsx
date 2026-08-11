"use client";

// Icon glyphs for the parametric "Custom" cards in the Plan Dock.
//
// Its own module so the coverage invariant is testable headlessly: every
// browsable piece needs a glyph, and a missing one renders as an empty tile
// (which is how the bathroom fixtures first shipped). Importing BottomDock in
// a test would drag in the store and the whole dock; this file is React only.

import type { ReactElement } from "react";

function WardrobeGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9.5" cy="12" r="0.8" fill="currentColor" />
      <circle cx="14.5" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

function BaseRunGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="8" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="13" y="8" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <line x1="7" y1="10.5" x2="7" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="17" y1="10.5" x2="17" y2="14.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function WallCabinetsGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="4" x2="22" y2="4" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="6" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="13" y="6" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <line x1="7" y1="7.5" x2="7" y2="10.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="17" y1="7.5" x2="17" y2="10.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SofaGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 20v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 20v-2M20 20v-2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 11V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.4" />
      <line x1="9" y1="11" x2="9" y2="16" stroke="currentColor" strokeWidth="1.2" />
      <line x1="15" y1="11" x2="15" y2="16" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SinkGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="6" y="9" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M15 6V3.5a1.5 1.5 0 0 1 3 0V5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CooktopGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8.5" cy="10" r="2" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="15.5" cy="10" r="2" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="8.5" cy="15" r="2" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="15.5" cy="15" r="2" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function ToiletGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 4h12v4H6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 16v3h4v-3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BathtubGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 11h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 11V6a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 18.5V20M18 18.5V20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ShowerGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 21V8a3 3 0 0 1 6 0v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="15.5" cy="9.5" rx="4.5" ry="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M13 14v1M15.5 13.5v2M18 14v1M14 17.5v1M17 17.5v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function VanityGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 10h16v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 10V6a2 2 0 0 1 2-2h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7 16v4M17 16v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function MirrorGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="6" y="3" width="12" height="15" rx="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.5 8.5a3.2 3.2 0 0 1 2.5-2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 21h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ── Per-variant bathroom glyphs ───────────────────────────────────────────
// Each variant is its own card, so each needs its own silhouette: three
// identical toilet icons would defeat the point of splitting them.

function ToiletWallHungGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 3v18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 2" />
      <path d="M6 8h11v3a4 4 0 0 1-4 4H6V8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="6" y="4" width="5" height="3" rx="0.6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ToiletBackToWallGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BathFreestandingGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 10c0-1 1-2 3-2h12c2 0 3 1 3 2v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 18v2M17 18v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ShowerWalkInGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 3v18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="12" y="4" width="8" height="15" rx="0.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 7h3M7 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ShowerWetRoomGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 3v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4 9h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 12v1.5M8.5 12v2M11 12v1.5M7 16v1.5M10 16v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="17" cy="20" r="1.6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function VanityDrawersGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 9h16v3a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="5" y="15" width="14" height="6" rx="0.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 18h14" stroke="currentColor" strokeWidth="1.1" />
      <path d="M12 9V6a2 2 0 0 1 2-2h1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function VesselBasinGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 7h11v2.5a3.5 3.5 0 0 1-3.5 3.5h-4A3.5 3.5 0 0 1 6 9.5V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M19 7V5a1.5 1.5 0 0 0-3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="4" y="14" width="16" height="7" rx="0.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function PedestalBasinGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16v2.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 13.5v5.5M14 13.5v5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 21h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MirrorCabinetGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 3v18" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.5 11.5h1M13.5 11.5h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function TowelRailGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 6v2M20 6v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 6v11a1 1 0 0 0 2 0V6M14 6v13a1 1 0 0 0 2 0V6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function TowelLadderGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 3v18M18 3v18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 6h12M6 10h12M6 14h12M6 18h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function BinGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.5 7 7.5 20a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1L17.5 7" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// Keyed by GeneratorDef.id, or "<id>:<variantId>" when a variant has its own
// silhouette (the per-variant key wins). Every card needs an entry — a missing
// one renders an empty tile, which is what the bathroom cards first shipped as.

// Cooktop variants — separate cards since the variant split, so each needs its
// own hob pattern rather than three copies of the generic cooktop icon.
function CooktopInductionGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8.5" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.1" strokeDasharray="1.2 1.2" />
      <circle cx="15.5" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.1" strokeDasharray="1.2 1.2" />
      <circle cx="8.5" cy="15" r="1.8" stroke="currentColor" strokeWidth="1.1" strokeDasharray="1.2 1.2" />
      <circle cx="15.5" cy="15" r="1.8" stroke="currentColor" strokeWidth="1.1" strokeDasharray="1.2 1.2" />
    </svg>
  );
}

function CooktopRadiantGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8.5" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="15.5" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="15" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15.5" cy="15" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CooktopGasGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8.5" cy="12" r="3" stroke="currentColor" strokeWidth="1.1" />
      <path d="M8.5 9v6M5.5 12h6" stroke="currentColor" strokeWidth="1" />
      <circle cx="16" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.1" />
      <path d="M16 9.6v4.8M13.6 12h4.8" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export const GENERATOR_GLYPH: Record<string, (props: { size: number }) => ReactElement> = {
  "cooktop:induction": CooktopInductionGlyph,
  "cooktop:radiant": CooktopRadiantGlyph,
  "cooktop:gas": CooktopGasGlyph,
  "toilet:wall-hung": ToiletWallHungGlyph,
  "toilet:back-to-wall": ToiletBackToWallGlyph,
  "bathtub:freestanding": BathFreestandingGlyph,
  "shower:walk-in": ShowerWalkInGlyph,
  "shower:wet-room": ShowerWetRoomGlyph,
  "vanity:vanity-drawers": VanityDrawersGlyph,
  "vanity:countertop": VesselBasinGlyph,
  "vanity:pedestal": PedestalBasinGlyph,
  "bathAccessory:cabinet": MirrorCabinetGlyph,
  "bathAccessory:towel-rail": TowelRailGlyph,
  "bathAccessory:towel-ladder": TowelLadderGlyph,
  "bathAccessory:bin": BinGlyph,
  wardrobe: WardrobeGlyph,
  kitchenBase: BaseRunGlyph,
  kitchenWall: WallCabinetsGlyph,
  sofa: SofaGlyph,
  sink: SinkGlyph,
  cooktop: CooktopGlyph,
  toilet: ToiletGlyph,
  bathtub: BathtubGlyph,
  shower: ShowerGlyph,
  vanity: VanityGlyph,
  bathAccessory: MirrorGlyph,
};
