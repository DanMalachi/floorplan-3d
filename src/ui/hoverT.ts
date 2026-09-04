"use client";

// Hover styling for the T token set (./tokens.ts) — the Trace rail, the
// Projects gallery, the live room, the legal pages and Viewport's own panels.
//
// Why this exists as a separate file rather than as a `hovered` parameter on
// `chip()` itself: `src/ui/tokens.ts` is shared with a protected file
// (src/viewport3d/walkthrough/WalkthroughMode.tsx), so it is left untouched.
// It does not need changing anyway — unlike planDock's `pdChip`, `chip()`
// ALREADY spreads its `extra` argument, so a hover overlay can simply be
// passed through it: `chip(active, { ...tChipHover(hovered, active) })`.
//
// The state itself is planDock's `useHover()` — one hook for the whole app, as
// wave 0 intended. Only the palette differs here, not the mechanism.

import type React from "react";
import { T } from "./tokens";

export { useHover } from "./planDock/useHover";

/**
 * Overlay for `chip()`. Pass the SAME `active` flag the chip was built with:
 * an active chip is already filled with the accent, so hovering it lifts the
 * fill rather than replacing it — otherwise hovering the selected chip would
 * look like deselecting it (the same rule planDock's `pdChip` follows).
 */
export const tChipHover = (hovered: boolean, active = false): React.CSSProperties => {
  if (!hovered) return {};
  return active
    ? { filter: "brightness(1.12)" }
    : // `border` shorthand, never `borderColor`: `chip()` sets the shorthand,
      // and React warns — correctly — that dropping a longhand on rerender
      // while a conflicting shorthand stays is how stale borders happen.
      { background: "rgba(255,255,255,0.13)", border: `1px solid rgba(255,255,255,0.18)` };
};

/**
 * The bare-`<button>` case in T-styled chrome: gallery cards' icon buttons,
 * the account/consent dismiss buttons, text-only actions. Transparent at rest
 * so it can sit on glass or on a card unchanged, and it lifts BOTH the surface
 * and the text together — that pairing is what reads as "the thing under the
 * cursor" rather than as a flicker.
 */
export const tGhostBtn = (hovered: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: "none",
  background: hovered ? "rgba(255,255,255,0.12)" : "transparent",
  color: hovered ? T.text : T.textDim,
  cursor: "pointer",
  fontFamily: T.font,
  borderRadius: T.radiusS,
  transition: `background ${T.dur} ${T.ease}, color ${T.dur} ${T.ease}`,
  ...extra,
});
