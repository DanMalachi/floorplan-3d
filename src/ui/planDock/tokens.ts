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
  fontUi: `Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  fontMono: `"IBM Plex Mono", ui-monospace, "SF Mono", "Cascadia Code", monospace`,

  accent: v("accent", "oklch(0.62 0.15 258)"),
  accentText: v("accent-text", "oklch(0.78 0.12 258)"),
  accentTint: v("accent-tint", "oklch(0.62 0.15 258 / 0.22)"),

  textPrimary: v("text-primary", "oklch(0.95 0.006 90)"),
  textSecondary: v("text-secondary", "oklch(0.72 0.012 90)"),
  textTertiary: v("text-tertiary", "oklch(0.55 0.014 90)"),

  warnBg: v("warn-bg", "oklch(0.32 0.05 75 / 0.55)"),
  warnText: v("warn-text", "oklch(0.82 0.13 75)"),
  ok: v("ok", "oklch(0.7 0.16 150)"),

  // Deliberately low-opacity — "more transparent" per review. The scene
  // behind should read through clearly, not just tint.
  glassBg: v("glass-bg", "oklch(0.2 0.014 260 / 0.38)"),
  glassBlur: v("glass-blur", "blur(20px) saturate(1.3)"),
  glassBorder: v("glass-border", "1px solid oklch(1 0 0 / 0.09)"),
  glassInset: v("glass-inset", "inset 0 1px 0 oklch(1 0 0 / 0.07)"),
  glassShadow: v("glass-shadow", "0 14px 34px -14px oklch(0 0 0 / 0.55)"),

  hairline: v("hairline", "oklch(1 0 0 / 0.09)"),
  surfaceMuted: v("surface-muted", "oklch(1 0 0 / 0.05)"),
  surfaceMutedHover: v("surface-muted-hover", "oklch(1 0 0 / 0.09)"),
  inputBg: v("input-bg", "oklch(1 0 0 / 0.07)"),

  radiusS: 10,
  radiusM: 14,
  radiusL: 20,
} as const;

/** The shared "Liquid Glass" surface recipe (README §3), dark + more
 *  transparent per review. */
export const pdGlass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: PD.glassBg,
  backdropFilter: PD.glassBlur,
  WebkitBackdropFilter: PD.glassBlur,
  border: PD.glassBorder,
  boxShadow: `${PD.glassInset}, ${PD.glassShadow}`,
  borderRadius: PD.radiusL,
  color: PD.textPrimary,
  fontFamily: PD.fontUi,
  ...extra,
});

/** Accent-tintable chip/pill, glass family. */
export const pdChip = (active = false, extra?: React.CSSProperties): React.CSSProperties => ({
  padding: "6px 12px",
  fontSize: 12,
  fontFamily: PD.fontUi,
  fontWeight: active ? 600 : 500,
  borderRadius: PD.radiusS,
  border: "none",
  background: active ? PD.accentTint : "transparent",
  color: active ? PD.accentText : PD.textSecondary,
  cursor: "pointer",
  transition: "background 160ms ease, color 160ms ease",
  userSelect: "none",
  whiteSpace: "nowrap",
});

/** Small square icon button — the tab row / room-switcher / search-toggle
 *  all use this shape now instead of text pills. */
export const pdIconBtn = (active = false, size = 28): React.CSSProperties => ({
  width: size,
  height: size,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: PD.radiusS,
  border: "none",
  background: active ? PD.accentTint : "transparent",
  color: active ? PD.accentText : PD.textSecondary,
  cursor: "pointer",
  transition: "background 140ms ease, color 140ms ease",
  flex: "0 0 auto",
  padding: 0,
});

export const pdMicroLabel = (color: string = PD.textTertiary): React.CSSProperties => ({
  fontSize: 9.5,
  letterSpacing: 0.7,
  textTransform: "uppercase",
  fontWeight: 700,
  color,
  fontFamily: PD.fontMono,
});
