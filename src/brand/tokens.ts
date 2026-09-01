// The done. brand, in one file.
//
// This is the ONLY place the marketing site's look is defined. Change a value
// here and every landing-page surface follows — that is the entire point of
// the file, because the brand is deliberately unfinished (Brand Book Rev C,
// Aug 2026: the wordmark is a recommendation, not a decision, and the logo is
// explicitly the LAST thing to draw, not the first).
//
// ── Why this is separate from the app's own tokens ──────────────────────────
// Two token sets already exist and neither is touched here:
//   src/ui/tokens.ts          — `T`, the older opaque dark set (Trace/View chrome)
//   src/ui/planDock/tokens.ts — `PD`, the newer oklch glass set (Build/Decorate)
// Both still carry the pre-naming blue accent (#0a84ff / oklch(.62 .15 258)),
// which the brand book replaces with copper. Migrating them is a separate,
// single, app-wide job — doing it piecemeal from the landing page is how a
// product ends up half-rebranded, so this file stops at the marketing routes.
// When that sweep happens, it should read its values FROM here, not re-declare
// them.
//
// ── The one rule that makes the identity work ───────────────────────────────
// The period is the only thing in the brand that is ever copper. Everywhere
// else stays in the warm-neutral range. One coloured object, appearing once.
// `accent` below is therefore used far less than an accent colour normally is:
// the wordmark's full stop, and CTA fills. Not links, not rules, not icons.
//
// ── How the values work ─────────────────────────────────────────────────────
// Every colour is a CSS custom property with the DARK value inlined as its
// fallback, exactly like `PD` does. That means:
//   - nothing breaks if <BrandThemeStyle /> never mounts (you get dark), and
//   - the light theme is a variable swap that cascades live, with no React
//     re-render, because these are plain inline-style strings and not values
//     computed once at mount.

import type React from "react";

const v = (name: string, dark: string) => `var(--br-${name}, ${dark})`;

/** Copper. The single accent, at OKLCH hue 48. */
const COPPER = "#DF7940";

export const B = {
  // ── Type ────────────────────────────────────────────────────────────────
  // Manrope and IBM Plex Mono are already self-hosted by next/font in
  // src/app/layout.tsx (variable mode), so naming them literally here is
  // enough — the @font-face rules are on the page already. Manrope is loaded
  // as a variable font with no weight array, so 800 is available.
  fontDisplay: `Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  fontUi: `Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  fontMono: `"IBM Plex Mono", ui-monospace, "SF Mono", "Cascadia Code", monospace`,

  // ── Grounds ─────────────────────────────────────────────────────────────
  //
  // `ground` is #101014 rather than the brand book's #111315, and the two
  // pixels of difference are deliberate: #101014 is exactly `studioBg` in
  // src/viewport3d/environment/Environment3d.tsx, the opaque colour the
  // renderer paints behind the model when `envPreset` is "none".
  //
  // The hero's canvas cannot be transparent — the render contract sets
  // `alpha: false` on the GL context on purpose (src/render/contract.ts) — so
  // the only way the 3D room can sit ON the page rather than in a visible
  // rectangle cut into it is for the page to be the same colour the canvas
  // paints. Matching here costs nothing (the shift is imperceptible) and needs
  // no change to protected render code.
  //
  // If that constant ever moves, this moves with it, or a seam appears across
  // the full width of the hero.
  ground: v("ground", "#101014"), // page background — matched to studioBg
  canvas: v("canvas", "#18191D"), // section background, one step up
  raised: v("raised", "#1E2025"), // cards, control pills

  // ── Ink ─────────────────────────────────────────────────────────────────
  ink: v("ink", "#F0EEEA"), // headlines, body
  ink2: v("ink-2", "#A7A49C"), // secondary copy
  ink3: v("ink-3", "#8C8980"), // captions, nav rest state
  ink4: v("ink-4", "#757168"), // micro-labels, footer fine print

  // ── The one colour ──────────────────────────────────────────────────────
  accent: v("accent", COPPER),
  accentText: v("accent-text", "#FDA578"), // copper legible AS TEXT on dark
  accentTint: v("accent-tint", "rgba(223,121,64,0.14)"),

  // ── Structure ───────────────────────────────────────────────────────────
  hairline: v("hairline", "rgba(255,255,255,0.10)"),
  hairline2: v("hairline-2", "rgba(255,255,255,0.18)"),

  // ── Status (kept for form/CTA states; not part of the identity) ──────────
  ok: v("ok", "#5DC47E"),
  warn: v("warn", "#ECD065"),
  err: v("err", "#ED537C"),

  shadow: v("shadow", "0 18px 40px -22px rgba(0,0,0,0.8)"),

  // ── Geometry ────────────────────────────────────────────────────────────
  radiusS: 8,
  radiusM: 14,
  radiusL: 22,

  // ── Motion ──────────────────────────────────────────────────────────────
  // "Confidence sounds like a low voice" applies to movement too: nothing on
  // this site bounces, and every duration below is slower than the app's 180ms
  // chrome, because marketing motion that snaps reads as urgent.
  dur: "260ms",
  durSlow: "520ms",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",

  // ── Layout ──────────────────────────────────────────────────────────────
  maxWidth: 1120, // content column
  /** The FRAME column: the header, the footer and the hero's demo.
   *
   *  Wider than the reading column on purpose — nav and full-width media want
   *  the screen, running text does not (that is what `maxWidthText` is for).
   *  The three that use it must agree, or the header's CTA sits visibly inset
   *  from the panel directly beneath it, which is what it did at 1120 against a
   *  1400 demo. */
  maxWidthWide: 1320,
  maxWidthText: 680, // long-form column (About, FAQ), ~75ch at 18px
  gutter: 24,
} as const;

/**
 * The light theme, and the dark values restated at `:root`.
 *
 * Mounted once by the marketing layout. Two things to know:
 *
 * 1. This is scoped to `[data-br-theme]` on <html>, NOT to the app's existing
 *    `[data-pd-theme]` switch. They are independent on purpose — the landing
 *    page's theme should not be silently inherited from whatever the user last
 *    picked inside the editor's Plan Dock, and vice versa.
 *
 * 2. The light palette is NOT a mechanical inversion. Copper drops to #A74900
 *    because #DF7940 on a near-white ground measures under 4.5:1 as text — the
 *    same contrast trap the brand book caught in two shipping app tokens.
 */
export const BRAND_THEME_CSS = `
:root {
  --br-ground: #101014;
  --br-canvas: #18191D;
  --br-raised: #1E2025;
  --br-ink: #F0EEEA;
  --br-ink-2: #A7A49C;
  --br-ink-3: #8C8980;
  --br-ink-4: #757168;
  --br-accent: ${COPPER};
  --br-accent-text: #FDA578;
  --br-accent-tint: rgba(223,121,64,0.14);
  --br-hairline: rgba(255,255,255,0.10);
  --br-hairline-2: rgba(255,255,255,0.18);
  --br-ok: #5DC47E;
  --br-warn: #ECD065;
  --br-err: #ED537C;
  --br-shadow: 0 18px 40px -22px rgba(0,0,0,0.8);
}
[data-br-theme="light"] {
  --br-ground: #F8F7F4;
  --br-canvas: #FFFFFF;
  --br-raised: #FFFFFF;
  --br-ink: #26241F;
  --br-ink-2: #535047;
  --br-ink-3: #757168;
  --br-ink-4: #8C8980;
  --br-accent: #A74900;
  --br-accent-text: #913F04;
  --br-accent-tint: rgba(167,73,0,0.10);
  --br-hairline: rgba(11,10,7,0.13);
  --br-hairline-2: rgba(11,10,7,0.22);
  --br-ok: #137D41;
  --br-warn: #806A02;
  --br-err: #C61E58;
  --br-shadow: 0 14px 34px -24px rgba(11,10,7,0.35);
}
`;

/**
 * Display type scale, in px, clamped so it works from 360px to 1440px without
 * a media query per level. `clamp()` handles the fluid step; the ratios are
 * roughly 1.25 on mobile widening to 1.33 at desktop.
 */
export const type = {
  hero: "clamp(44px, 8.5vw, 92px)",
  h1: "clamp(32px, 5vw, 52px)",
  h2: "clamp(24px, 3.4vw, 36px)",
  h3: "clamp(19px, 2.2vw, 23px)",
  lead: "clamp(17px, 2.1vw, 21px)",
  body: "16.5px",
  small: "14px",
  micro: "11px",
} as const;

/** Section shell: the standard vertical rhythm and centred content column. */
export const section = (extra?: React.CSSProperties): React.CSSProperties => ({
  width: "100%",
  maxWidth: B.maxWidth,
  margin: "0 auto",
  padding: `clamp(64px, 10vw, 128px) ${B.gutter}px`,
  boxSizing: "border-box",
  ...extra,
});

/**
 * The primary call to action. Copper fill — one of only two places the accent
 * is allowed to appear at size (the other is the wordmark's period).
 */
export const ctaPrimary = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 24px",
  fontFamily: B.fontUi,
  fontSize: 15.5,
  fontWeight: 700,
  letterSpacing: "-0.005em",
  lineHeight: 1,
  color: "#FFFFFF",
  background: B.accent,
  border: "1px solid transparent",
  borderRadius: B.radiusS,
  textDecoration: "none",
  cursor: "pointer",
  transition: `filter ${B.dur} ${B.ease}, transform ${B.dur} ${B.ease}`,
  ...extra,
});

/** The quiet alternative. Hairline only — never a second copper object. */
export const ctaGhost = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 22px",
  fontFamily: B.fontUi,
  fontSize: 15.5,
  fontWeight: 600,
  lineHeight: 1,
  color: B.ink,
  background: "transparent",
  border: `1px solid ${B.hairline2}`,
  borderRadius: B.radiusS,
  textDecoration: "none",
  cursor: "pointer",
  transition: `background ${B.dur} ${B.ease}, border-color ${B.dur} ${B.ease}`,
  ...extra,
});

/**
 * Tiny uppercase section label, lifted from the app's own annotation layer
 * (the 9.5px mono micro-labels in the Plan Dock). Reusing the product's
 * drafting register is the cheapest way for the marketing page to feel like
 * the same object as the app.
 */
export const microLabel = (extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: B.fontMono,
  fontSize: type.micro,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: B.ink4,
  ...extra,
});

/** A card / panel on the section ground. */
export const card = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: B.raised,
  border: `1px solid ${B.hairline}`,
  borderRadius: B.radiusM,
  padding: 24,
  boxSizing: "border-box",
  ...extra,
});
