// Hover + focus rules for the marketing site.
//
// The editor holds hover in React state (src/ui/planDock/useHover.ts) because
// its chrome is absolutely-positioned inline-styled panels over a canvas, and a
// style object cannot express `:hover`. The marketing site had already made the
// opposite bargain twice — `Hero.tsx`'s `TRACE_BTN_CSS` and `DemoStage.tsx`'s
// `STAGE_CSS` both inject a real stylesheet and hang `:hover` / `:focus-visible`
// off a class — so this follows that, rather than dragging the dock's hook onto
// pages styled from the brand tokens. One idiom per surface.
//
// Injected once by src/app/(marketing)/layout.tsx, so every marketing route has
// these classes available. Inline <style> is already sanctioned by the CSP
// (style-src 'unsafe-inline'), which the app needs regardless.

import { B } from "@/brand/tokens";

/** Filled copper CTA (`ctaPrimary`). It already declared
 *  `transition: filter, transform` and had nothing to trigger it. */
export const CTA_CLASS = "done-cta";
/** Hairline CTA (`ctaGhost`, and the transparent `ctaPrimary` variants on
 *  /about and /faq). */
export const CTA_GHOST_CLASS = "done-cta-ghost";
/** Header nav links. */
export const NAV_LINK_CLASS = "done-navlink";
/** Bordered square control — the narrow-screen menu button, the avatar. */
export const OUTLINE_BTN_CLASS = "done-outline-btn";
/** A row inside a dropdown panel. */
export const MENU_ITEM_CLASS = "done-menu-item";
/** A quiet text-only button (header "Sign in"). */
export const TEXT_BTN_CLASS = "done-text-btn";

/**
 * The header breakpoint, and the two classes that act on it.
 *
 * These are CSS rather than the `useState` + `matchMedia` pair Header.tsx used
 * to hold, because that pair cannot run on the server. `narrow` started
 * `false`, so the SERVER rendered the desktop bar and every phone painted it:
 * About, FAQ and the locale link sitting in the open, and the CTA running off
 * the right edge — header content measured 420px in a 393px window, silently
 * cropped by the shell's `overflowX: hidden`. The hamburger only appeared once
 * React hydrated, which on a phone is *after* the hero's 3D chunk, long enough
 * to be the whole first impression.
 *
 * A media query has no such gap: the right bar is in the first paint, with
 * JavaScript off entirely. Both trees ship in the HTML and one is display:none,
 * which also keeps it out of the accessibility tree — so there are no duplicate
 * nav links for a screen reader.
 *
 * `!important` is load-bearing: this site styles with inline objects, and an
 * inline `display` would otherwise beat a class. An important declaration in a
 * stylesheet wins over a non-important inline one. Hiding by `display: none`
 * rather than setting a display VALUE means each element keeps whatever
 * `display` its own inline style asks for when it is shown (the nav is flex,
 * the menu button inline-flex, the sheet a flex column).
 */
export const NAV_BREAK = 860;
/** Shown only from the breakpoint up. */
export const WIDE_ONLY_CLASS = "done-wide-only";
/** Shown only below the breakpoint. */
export const NARROW_ONLY_CLASS = "done-narrow-only";

export const LANDING_HOVER_CSS = `
.${CTA_CLASS} { transition: filter ${B.dur} ${B.ease}, transform ${B.dur} ${B.ease}; }
.${CTA_CLASS}:hover { filter: brightness(1.08); transform: translateY(-1px); }
.${CTA_CLASS}:active { transform: translateY(0); }
.${CTA_CLASS}:focus-visible { outline: 2px solid ${B.accent}; outline-offset: 3px; }

.${CTA_GHOST_CLASS} { transition: border-color ${B.dur} ${B.ease}, background ${B.dur} ${B.ease}, color ${B.dur} ${B.ease}; }
.${CTA_GHOST_CLASS}:hover { border-color: ${B.hairline2}; background: ${B.canvas}; color: ${B.ink}; }
.${CTA_GHOST_CLASS}:focus-visible { outline: 2px solid ${B.accent}; outline-offset: 3px; }

.${NAV_LINK_CLASS} { transition: color ${B.dur} ${B.ease}; }
.${NAV_LINK_CLASS}:hover { color: ${B.ink}; }
.${NAV_LINK_CLASS}:focus-visible { outline: 2px solid ${B.accent}; outline-offset: 4px; border-radius: 4px; }

.${OUTLINE_BTN_CLASS} { transition: border-color ${B.dur} ${B.ease}, background ${B.dur} ${B.ease}; }
.${OUTLINE_BTN_CLASS}:hover { border-color: ${B.hairline2}; background: ${B.canvas}; }
.${OUTLINE_BTN_CLASS}:focus-visible { outline: 2px solid ${B.accent}; outline-offset: 2px; }

.${MENU_ITEM_CLASS} { transition: background ${B.dur} ${B.ease}, color ${B.dur} ${B.ease}; }
.${MENU_ITEM_CLASS}:hover { background: ${B.canvas}; color: ${B.ink}; }
.${MENU_ITEM_CLASS}:focus-visible { outline: 2px solid ${B.accent}; outline-offset: -2px; }

.${TEXT_BTN_CLASS} { transition: color ${B.dur} ${B.ease}; }
.${TEXT_BTN_CLASS}:hover { color: ${B.ink}; }
.${TEXT_BTN_CLASS}:focus-visible { outline: 2px solid ${B.accent}; outline-offset: 3px; border-radius: 4px; }

@media (max-width: ${NAV_BREAK}px) {
  .${WIDE_ONLY_CLASS} { display: none !important; }
}
@media (min-width: ${NAV_BREAK + 1}px) {
  .${NARROW_ONLY_CLASS} { display: none !important; }
}

@media (prefers-reduced-motion: reduce) {
  .${CTA_CLASS}:hover { transform: none; }
}
`;
