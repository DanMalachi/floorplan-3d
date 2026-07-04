// The design language, in one place. Every panel, button and label in the app
// composes these — no ad-hoc styles. Dark, glassy, one accent: calm chrome,
// playful feedback.

import type React from "react";

export const T = {
  font: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,

  accent: "#0a84ff",
  accentSoft: "rgba(10,132,255,0.16)",
  danger: "#ff453a",
  warn: "#ffd60a",
  ok: "#30d158",

  bg: "#131316",
  bgCanvas: "#17171b",
  panelBg: "rgba(24,24,29,0.72)",
  panelBgSolid: "#1d1d22",
  panelBorder: "rgba(255,255,255,0.09)",
  inputBg: "rgba(255,255,255,0.06)",

  text: "#f2f2f5",
  textDim: "#9a9aa3",
  textFaint: "#66666e",

  radiusS: 8,
  radiusM: 12,
  radiusL: 16,

  blur: "blur(20px) saturate(1.5)",
  shadow: "0 10px 32px rgba(0,0,0,0.38)",
  dur: "180ms",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

/** A floating glass panel. */
export const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: T.panelBg,
  backdropFilter: T.blur,
  WebkitBackdropFilter: T.blur,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: T.radiusM,
  boxShadow: T.shadow,
  color: T.text,
  fontFamily: T.font,
  ...extra,
});

/** Standard control chip / button. */
export const chip = (active = false, extra?: React.CSSProperties): React.CSSProperties => ({
  padding: "5px 11px",
  fontSize: 12.5,
  fontFamily: T.font,
  borderRadius: T.radiusS,
  border: `1px solid ${active ? "transparent" : T.panelBorder}`,
  background: active ? T.accent : T.inputBg,
  color: active ? "#fff" : T.text,
  cursor: "pointer",
  transition: `background ${T.dur} ${T.ease}, color ${T.dur} ${T.ease}, border-color ${T.dur} ${T.ease}`,
  userSelect: "none",
  ...extra,
});

/** Text input. */
export const field = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: T.inputBg,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: T.radiusS,
  color: T.text,
  padding: "4px 8px",
  fontSize: 12.5,
  fontFamily: T.font,
  outline: "none",
  ...extra,
});

/** Tiny uppercase section label. */
export const microLabel = (color: string = T.textFaint): React.CSSProperties => ({
  fontSize: 9.5,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  fontWeight: 700,
  color,
  fontFamily: T.font,
});
