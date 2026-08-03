// Design tokens for the Plan Dock overhaul (Build/Decorate only — see
// Downloads/UI UX overhaul/README.md + Dan's Phase-B review feedback).
// Deliberately separate from src/ui/tokens.ts: that dark-but-opaque token
// set still drives Trace/View chrome unchanged, while this set applies only
// inside the new Build/Decorate overlay components.
//
// Post-review change: flipped from the README's literal warm-light recipe to
// dark + more transparent, per Dan's call ("liquid glass more transparent
// and in dark mode and not light mode — may add a switch for both later").
// The switch itself isn't built — these are the only values that would need
// a light variant if/when that happens.
//
// Manrope / IBM Plex Mono are NOT loaded (no next/font network fetch in this
// environment) — font-family stacks name them first so they pick up
// automatically if added later (e.g. via next/font/google) without a token
// change; system sans/mono cover the fallback today.

import type React from "react";

export const PD = {
  fontUi: `Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  fontMono: `"IBM Plex Mono", ui-monospace, "SF Mono", "Cascadia Code", monospace`,

  accent: "oklch(0.62 0.15 258)",
  accentText: "oklch(0.78 0.12 258)",
  accentTint: "oklch(0.62 0.15 258 / 0.22)",

  textPrimary: "oklch(0.95 0.006 90)",
  textSecondary: "oklch(0.72 0.012 90)",
  textTertiary: "oklch(0.55 0.014 90)",

  warnBg: "oklch(0.32 0.05 75 / 0.55)",
  warnText: "oklch(0.82 0.13 75)",
  ok: "oklch(0.7 0.16 150)",

  // Deliberately low-opacity — "more transparent" per review. The scene
  // behind should read through clearly, not just tint.
  glassBg: "oklch(0.2 0.014 260 / 0.38)",
  glassBlur: "blur(20px) saturate(1.3)",
  glassBorder: "1px solid oklch(1 0 0 / 0.09)",
  glassInset: "inset 0 1px 0 oklch(1 0 0 / 0.07)",
  glassShadow: "0 14px 34px -14px oklch(0 0 0 / 0.55)",

  hairline: "oklch(1 0 0 / 0.09)",
  surfaceMuted: "oklch(1 0 0 / 0.05)",
  surfaceMutedHover: "oklch(1 0 0 / 0.09)",
  inputBg: "oklch(1 0 0 / 0.07)",

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
