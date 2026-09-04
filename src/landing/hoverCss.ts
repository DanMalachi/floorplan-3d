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

@media (prefers-reduced-motion: reduce) {
  .${CTA_CLASS}:hover { transform: none; }
}
`;
