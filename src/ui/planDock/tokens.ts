// Design tokens for the Plan Dock overhaul (Build/Decorate only — see
// Downloads/UI UX overhaul/README.md + Dan's Phase-B review feedback).
// Deliberately separate from src/ui/tokens.ts: that dark-but-opaque token
// set still drives Trace/View chrome unchanged, while this set applies only
// inside the new Build/Decorate overlay components.
//
// Post-review change: flipped from the README's literal warm-light recipe to
// dark + more transparent, per Dan's call ("liquid glass more transparent
// and in dark mode and not light mode — may add a switch for both later").
//
// Light switch (added): every color value below is a CSS custom property
// with the dark value as its fallback, e.g. `var(--pd-text-primary, oklch(...))`.
// theme.ts defines both variable sets and a <PdThemeStyle> that injects them
// at :root, toggled by `[data-pd-theme="light"]`. This means NONE of the ~15
// files that import `PD.textPrimary` etc. needed to change — the CSS
// variable cascades and updates live without a React re-render, since these
// are plain inline-style strings, not computed once. Only `theme.ts` (new)
// and page.tsx (mounts <PdThemeStyle> + the toggle button) touch theme state.
//
// Manrope / IBM Plex Mono are NOT loaded (no next/font network fetch in this
// environment) — font-family stacks name them first so they pick up
// automatically if added later (e.g. via next/font/google) without a token
// change; system sans/mono cover the fallback today.

import type React from "react";

const v = (name: string, dark: string) => `var(--pd-${name}, ${dark})`;

export const PD = {
  fontUi: `Manrope, Rubik, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  // Rubik is last, AFTER the monospace generic, and it is there for Hebrew only.
  //
  // src/app/[locale]/layout.tsx used to state that this stack needed no Hebrew
  // companion because "every mono use in this app is numeric". That stopped
  // being true when the hero's plan drawing took Hebrew room labels: STUDIO and
  // BATH became סטודיו and אמבטיה in the same `fontMono` label as the dimension
  // figures beside them, and with no Hebrew face in the list the browser
  // substituted one of its own — a different face on every OS, sitting next to
  // digits still rendering in IBM Plex Mono.
  //
  // There is no Hebrew monospace in the loaded set, so a proportional fallback
  // is the honest floor here: it means one deliberate, identical mismatch
  // everywhere instead of an unpredictable one per machine. Latin and digits are
  // unaffected — they find IBM Plex Mono first and never reach this entry.
  fontMono: `"IBM Plex Mono", ui-monospace, "SF Mono", "Cascadia Code", monospace, Rubik`,

  // 0.55 (was 0.62): white label text on the accent fill (Go live, the
  // gallery badge) reaches ~4.6:1 instead of 3.68:1. docs/ACCESSIBILITY.md P3.
  accent: v("accent", "oklch(0.55 0.15 258)"),
  // Blue text and the tint behind it are tuned as a PAIR (Dan, 2026-09-18:
  // glass stays as it is; make the text near-white and the blue less
  // transparent). The old tint (0.62 / 0.22) was LIGHTER than the glass over a
  // bright wall, so the blue labels on it ("Custom", the selected chip) fell to
  // 2.96:1. A deeper, more opaque tint (0.45 / 0.65) under 0.9 text passes in
  // rendered pixels over the normal scene, a whitened backdrop and a black
  // one. 0.9 not 0.88: at 0.88 the blue status line ("wall selected — …"),
  // which sits on bare glass, measured 4.45:1 over a bright wall. Making the
  // OLD tint more opaque made things worse (2.43:1).
  accentText: v("accent-text", "oklch(0.9 0.11 258)"),
  accentTint: v("accent-tint", "oklch(0.45 0.15 258 / 0.65)"),

  // Near-white on purpose (Dan, 2026-09-18: "more white, it reads greyish",
  // then again after the a11y review: glass unchanged, text near-white).
  // The glass is see-through, so the TEXT has to carry the contrast. Worst
  // case (a bright wall filling the view behind a panel), measured in pixels
  // with the halo: secondary 4.69:1, tertiary 4.82:1. At the old 0.88 / 0.76
  // they were 4.0 / 3.0. The hierarchy now rests on size and weight.
  textPrimary: v("text-primary", "oklch(0.985 0.004 90)"),
  textSecondary: v("text-secondary", "oklch(0.93 0.008 90)"),
  textTertiary: v("text-tertiary", "oklch(0.9 0.01 90)"),

  warnBg: v("warn-bg", "oklch(0.32 0.05 75 / 0.55)"),
  warnText: v("warn-text", "oklch(0.82 0.13 75)"),
  ok: v("ok", "oklch(0.7 0.16 150)"),

  // Deliberately low-opacity — "more transparent" per review. The scene
  // behind should read through clearly, not just tint.
  glassBg: v("glass-bg", "oklch(0.2 0.014 260 / 0.32)"),
  // brightness(0.5) is the legibility half of the recipe: it half-dims
  // whatever shows THROUGH the glass, so a bright sky can no longer wash the
  // text out (secondary text was 1.1:1 over daylight) while the panel still
  // takes the colour of the scene behind it. 0.3 was tried first and read as
  // smoked glass — too opaque. Measured in Chromium, text vs rendered glass,
  // worst case pure-white backdrop: primary 6.2:1, secondary 4.5:1.
  // docs/ACCESSIBILITY.md P1.
  glassBlur: v("glass-blur", "blur(20px) saturate(1.3) brightness(0.5)"),
  // Inherited by all text on the glass. A 2px dark halo keeps glyph edges
  // crisp over the brightest backdrops without darkening the panel itself.
  glassTextShadow: v("glass-text-shadow", "0 0 2px oklch(0 0 0 / 0.55)"),
  glassBorder: v("glass-border", "1px solid oklch(1 0 0 / 0.09)"),
  glassInset: v("glass-inset", "inset 0 1px 0 oklch(1 0 0 / 0.07)"),
  glassShadow: v("glass-shadow", "0 14px 34px -14px oklch(0 0 0 / 0.55)"),

  hairline: v("hairline", "oklch(1 0 0 / 0.09)"),
  surfaceMuted: v("surface-muted", "oklch(1 0 0 / 0.05)"),
  surfaceMutedHover: v("surface-muted-hover", "oklch(1 0 0 / 0.09)"),
  inputBg: v("input-bg", "oklch(1 0 0 / 0.07)"),

  // ── Added 2026-09-04, to absorb src/ui/tokens.ts (`T`) ──────────────────
  //
  // Two token sets were live and they disagreed about the same control: `T`
  // filled an active chip SOLID #0a84ff with white text while `pdChip` used a
  // 22% tint of oklch(0.62 .15 258). Dan saw that as "Full/Cutaway is a
  // different shade of blue"; it was really two design languages side by side.
  // Everything moves to this set, which means these four roles `T` had and
  // this set did not now need to exist here — otherwise the migration would
  // invent ad-hoc values, which is worse than two token sets.
  //
  // Note what is deliberately NOT unified: the SURFACE recipe. `pdGlass` is
  // 32% opacity + blur, which is right for a small panel floating over the
  // model and wrong for a full-screen project gallery — read through a
  // fullscreen sheet and the 3D scene behind it competes with the text. So
  // `panelBg`/`surfaceSolid` keep `T`'s heavier surfaces available while the
  // palette, the accent and the interactive states unify. Same language,
  // different weight of paper.
  bg: v("bg", "oklch(0.19 0.006 285)"), // app/page ground
  canvas: v("canvas", "oklch(0.21 0.007 285)"), // one step up
  panelBg: v("panel-bg", "oklch(0.235 0.008 285 / 0.72)"), // heavier glass, for sheets
  surfaceSolid: v("surface-solid", "oklch(0.24 0.008 285)"), // fully opaque panel

  // `T.danger` had no counterpart here at all, and delete is the one action
  // that must not borrow the neutral hover treatment.
  danger: v("danger", "oklch(0.64 0.22 27)"),
  dangerText: v("danger-text", "oklch(0.74 0.17 25)"),
  dangerTint: v("danger-tint", "oklch(0.64 0.22 27 / 0.18)"),

  radiusS: 10,
  radiusM: 14,
  radiusL: 20,

  // For non-hover transitions (panel entrances, opacity). Hover timing is
  // asymmetric and lives in `pdHoverTransition` below, not here.
  dur: "180ms",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/** The shared "Liquid Glass" surface recipe (README §3), dark + more
 *  transparent per review. */
export const pdGlass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: PD.glassBg,
  backdropFilter: PD.glassBlur,
  WebkitBackdropFilter: PD.glassBlur,
  textShadow: PD.glassTextShadow,
  border: PD.glassBorder,
  boxShadow: `${PD.glassInset}, ${PD.glassShadow}`,
  borderRadius: PD.radiusL,
  color: PD.textPrimary,
  fontFamily: PD.fontUi,
  ...extra,
});

// ── Hover ───────────────────────────────────────────────────────────────────
// Inline style objects cannot express `:hover`, so the three helpers below take
// the hover flag as a plain argument and the caller holds the state with
// `useHover()` (./useHover.ts). Every one of them already declared a
// `transition` before hover existed, so the animation was in place and only
// the trigger was missing.
//
// Each helper changes TWO things together — the surface AND the text — because
// that is what reads as "the thing under the cursor" rather than as a flicker.
// `hovered` is deliberately the LAST parameter everywhere so all existing call
// sites keep compiling untouched.

/** Fast in, slow out.
 *
 *  A symmetric 140ms in both directions is what shipped first, and it read as
 *  the highlight being yanked away — Dan's "hover disappears too soon". The
 *  asymmetry is the fix and it is not a preference: arriving under the cursor
 *  should feel immediate (the control is answering you), while leaving should
 *  decay, so that sweeping across a row of chips does not strobe and a hand
 *  that drifts a few pixels off a target does not lose it instantly.
 *
 *  It works because the transition is re-declared on every render: the style
 *  that lands when `hovered` flips to true carries the fast duration, and the
 *  one that lands when it flips to false carries the slow one. So the SAME
 *  property animates at two different speeds depending on direction, which a
 *  single static `transition` string cannot express. */
const HOVER_IN = "110ms";
const HOVER_OUT = "320ms";
export const pdHoverTransition = (hovered: boolean): string => {
  const d = hovered ? HOVER_IN : HOVER_OUT;
  // ease-out both ways: the motion should settle, never accelerate into place.
  return `background ${d} ease-out, color ${d} ease-out, border-color ${d} ease-out, box-shadow ${d} ease-out`;
};

/** Accent-tintable chip/pill, glass family. */
export const pdChip = (
  active = false,
  extra?: React.CSSProperties,
  hovered = false,
): React.CSSProperties => ({
  padding: "6px 12px",
  fontSize: 12,
  fontFamily: PD.fontUi,
  fontWeight: active ? 600 : 500,
  borderRadius: PD.radiusS,
  border: "none",
  // An active chip is already tinted, so hover deepens the tint rather than
  // replacing it — otherwise hovering the selected chip would look like
  // deselecting it.
  background: active ? PD.accentTint : hovered ? PD.surfaceMutedHover : "transparent",
  color: active ? PD.accentText : hovered ? PD.textPrimary : PD.textSecondary,
  cursor: "pointer",
  transition: pdHoverTransition(hovered),
  userSelect: "none",
  whiteSpace: "nowrap",
  // NOTE: `extra` is deliberately NOT spread here. It never has been — this
  // helper has always accepted the argument and dropped it, so all ~26 call
  // sites that pass one (`pdChipFlex`, padding/fontSize overrides, `flex: 1`)
  // are rendering without it today. Spreading it now would silently restyle
  // most of the dock, so that fix is deliberately left as a separate,
  // reviewable change. The call sites that DO get their overrides today are
  // the ones that spread manually: `{ ...pdChip(x), … }`.
});

/** Small square icon button — the tab row / room-switcher / search-toggle
 *  all use this shape now instead of text pills. */
export const pdIconBtn = (
  active = false,
  size = 28,
  hovered = false,
): React.CSSProperties => ({
  width: size,
  height: size,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: PD.radiusS,
  border: "none",
  background: active ? PD.accentTint : hovered ? PD.surfaceMutedHover : "transparent",
  color: active ? PD.accentText : hovered ? PD.textPrimary : PD.textSecondary,
  cursor: "pointer",
  transition: pdHoverTransition(hovered),
  flex: "0 0 auto",
  padding: 0,
});

/** The bare `<button>` case — mode switcher, Go live, project cards, account
 *  menu rows, dialog actions. These used neither helper before, which is why
 *  most of the app's primary navigation had no hover feedback at all.
 *
 *  Rest is transparent so it can sit on glass or on a panel unchanged. */
export const pdGhostBtn = (
  hovered = false,
  extra?: React.CSSProperties,
): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  fontFamily: PD.fontUi,
  fontSize: 12.5,
  fontWeight: 500,
  borderRadius: PD.radiusS,
  border: "none",
  background: hovered ? PD.surfaceMutedHover : "transparent",
  color: hovered ? PD.textPrimary : PD.textSecondary,
  cursor: "pointer",
  transition: pdHoverTransition(hovered),
  ...extra,
});

export const pdMicroLabel = (color: string = PD.textTertiary): React.CSSProperties => ({
  fontSize: 9.5,
  letterSpacing: 0.7,
  textTransform: "uppercase",
  fontWeight: 700,
  color,
  fontFamily: PD.fontMono,
});
