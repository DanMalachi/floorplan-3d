"use client";

// Light/dark switch for Plan Dock chrome (tokens.ts's PD.* values). Dan's
// call when the dark theme shipped: "may add a switch for both later" — this
// is that switch. Scope: the glass/text/accent CHROME only (panels, buttons,
// labels). The isoArt.tsx room-scene illustrations (FACE_TOP/DETAIL_LINE/…)
// keep their current dark-tuned palette either way — repainting the
// illustration set for a light backdrop is a separate, later pass, not
// bundled into this toggle.

import { useEffect, useState } from "react";
import { PD, pdGlass } from "./tokens";

export type PdTheme = "dark" | "light";

const STORAGE_KEY = "planDock:theme";

/** Light-glass values, restoring the README's original recipe (§ "Glass
 *  recipe": oklch(0.99 0.006 90 / 0.55–0.65) bg, blur(24–30px) saturate(1.6–1.7),
 *  oklch(0.48 0.15 258) accent) that Dan's dark-mode call superseded as the
 *  default — kept alive here as the light variant instead of deleted. */
const LIGHT_VARS: Record<string, string> = {
  "--pd-accent": "oklch(0.48 0.15 258)",
  "--pd-accent-text": "oklch(0.42 0.15 258)",
  "--pd-accent-tint": "oklch(0.48 0.15 258 / 0.14)",

  "--pd-text-primary": "oklch(0.22 0.012 70)",
  "--pd-text-secondary": "oklch(0.42 0.014 70)",
  "--pd-text-tertiary": "oklch(0.58 0.014 70)",

  "--pd-warn-bg": "oklch(0.9 0.08 75 / 0.6)",
  "--pd-warn-text": "oklch(0.4 0.13 75)",
  "--pd-ok": "oklch(0.5 0.16 150)",

  "--pd-glass-bg": "oklch(0.99 0.006 90 / 0.6)",
  "--pd-glass-blur": "blur(26px) saturate(1.65)",
  "--pd-glass-border": "1px solid oklch(1 0 0 / 0.7)",
  "--pd-glass-inset": "inset 0 1px 0 oklch(1 0 0 / 0.7)",
  "--pd-glass-shadow": "0 18px 40px -16px oklch(0.24 0.02 70 / 0.42)",

  "--pd-hairline": "oklch(0 0 0 / 0.08)",
  "--pd-surface-muted": "oklch(0 0 0 / 0.045)",
  "--pd-surface-muted-hover": "oklch(0 0 0 / 0.08)",
  "--pd-input-bg": "oklch(0 0 0 / 0.05)",
};

/** Injects the light-theme CSS variables, scoped to `[data-pd-theme="light"]`
 *  so the dark defaults in tokens.ts (baked in as `var(--x, <dark-fallback>)`)
 *  apply everywhere else with no stylesheet needed. Mount once, near the app
 *  root (page.tsx) — cheap to mount more than once too, React dedupes identical
 *  <style> content by tag identity per component instance regardless. */
export function PdThemeStyle() {
  const css = `[data-pd-theme="light"] {\n${Object.entries(LIGHT_VARS)
    .map(([k, val]) => `  ${k}: ${val};`)
    .join("\n")}\n}`;
  return <style>{css}</style>;
}

function applyTheme(theme: PdTheme) {
  if (theme === "light") document.documentElement.dataset.pdTheme = "light";
  else delete document.documentElement.dataset.pdTheme;
}

/** Reads/writes the theme choice (localStorage-backed — a device display
 *  preference, not project data, so it deliberately isn't in useSceneStore /
 *  autosaved scene state). Defaults to dark, matching the existing look. */
export function usePdTheme(): [PdTheme, (t: PdTheme) => void] {
  const [theme, setThemeState] = useState<PdTheme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: PdTheme = stored === "light" ? "light" : "dark";
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = (t: PdTheme) => {
    setThemeState(t);
    applyTheme(t);
    window.localStorage.setItem(STORAGE_KEY, t);
  };

  return [theme, setTheme];
}

/** Small sun/moon toggle for the top bar. */
export function ThemeToggle() {
  const [theme, setTheme] = usePdTheme();
  const isLight = theme === "light";
  return (
    <button
      onClick={() => setTheme(isLight ? "dark" : "light")}
      title={isLight ? "Switch to dark" : "Switch to light"}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        cursor: "pointer",
        fontSize: 14,
        color: PD.textSecondary,
        ...pdGlass({ borderRadius: 999, padding: 0 }),
      }}
    >
      {isLight ? "☀" : "☾"}
    </button>
  );
}
