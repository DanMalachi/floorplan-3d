"use client";

import type React from "react";
import { B } from "./tokens";

/**
 * The done. wordmark — Brand Book Rev C, Study 03 ("the quiet fact").
 *
 * Manrope 800, lowercase, tracking -0.022em, with the full stop set as a
 * copper SQUARE rather than the font's own round period.
 *
 * ── Why this shape ──────────────────────────────────────────────────────────
 * Manrope is the app's own UI typeface promoted to display: a humanist
 * geometric, so the letterforms stay warm while the proportions stay rigorous
 * — precision and warmth in one object instead of two adjectives. The square
 * dot reads as both a full stop and a room in plan, and it is the only
 * coloured thing in the entire identity.
 *
 * Lowercase is not a style preference. `DONE.` proclaims; `done.` states —
 * and lowercase is how the word actually appears when something is finished,
 * in a sentence or a status line. It also matches the domain, which people
 * type lowercase every time.
 *
 * ── Swapping to the alternative ─────────────────────────────────────────────
 * The brand book's honest alternative is Study 02 (the same idea in a heavier
 * grotesque — Archivo 900, lowercase, tracking -0.035em). To try it: change
 * `family` and `weight`/`tracking` below. Archivo is not currently loaded by
 * next/font, so that swap also needs a font added in src/app/layout.tsx.
 * Do NOT take Study 01 (uppercase) — it costs the quiet, and quiet is the one
 * thing in this category nobody else has.
 *
 * ── The period's one rule ───────────────────────────────────────────────────
 * The square is copper here and nowhere else in the system. If you find
 * yourself reaching for a second copper object on a page, the answer is that
 * the page has too much colour, not that the rule is wrong.
 */

type Tone = "brand" | "ink" | "inverse";

export function Wordmark({
  size = 28,
  tone = "brand",
  style,
  title = "done.",
}: {
  /** Cap-height-ish visual size in px. Everything else scales in `em`. */
  size?: number;
  /**
   * `brand`  — ink letterforms, copper period. The default, and the only one
   *            to use when the mark is standing for the company.
   * `ink`    — the period takes the ink colour too. For places the accent
   *            would be a second copper object competing with a CTA.
   * `inverse`— for laying the mark over a light photograph or the copper fill.
   */
  tone?: Tone;
  style?: React.CSSProperties;
  title?: string;
}) {
  const letterColor = tone === "inverse" ? "#FFFFFF" : B.ink;
  const dotColor =
    tone === "brand" ? B.accent : tone === "inverse" ? "#FFFFFF" : B.ink;

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontFamily: B.fontDisplay,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.022em",
        color: letterColor,
        // The mark is a name, not a sentence — never let it inherit a
        // text-transform from a heading or nav it happens to sit inside.
        textTransform: "none",
        userSelect: "none",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      done
      <WordmarkPeriod color={dotColor} />
    </span>
  );
}

/**
 * The period on its own.
 *
 * Exported because the favicon IS this square: at 16px the wordmark is
 * illegible, so the icon is one copper square on the dark ground and nothing
 * else. Also useful as a loading indicator or a list bullet where the full
 * mark would be too loud.
 *
 * Sized in `em` so it tracks whatever font-size it is dropped into. 0.16em is
 * optically matched to Manrope 800's own period, which is ~0.11em wide — a
 * square needs to be a little larger than the circle it replaces to read at
 * the same weight.
 */
export function WordmarkPeriod({
  color = B.accent,
  style,
}: {
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        // An inline-block with no in-flow content baseline-aligns on its
        // bottom margin edge, so the square sits exactly on the baseline
        // without a magic vertical offset.
        display: "inline-block",
        width: "0.16em",
        height: "0.16em",
        marginLeft: "0.055em",
        background: color,
        borderRadius: 1,
        flex: "none",
        ...style,
      }}
    />
  );
}

/**
 * The mark plus the domain, for the one place each page needs to say the full
 * brand unit out loud — the footer, and the browser tab.
 *
 * `done.design` is the brand, not a name plus a fallback TLD (the monday.com
 * playbook: "monday" alone is unownable, monday.com is a brand). So the mark
 * carries the period in the logo, and the machine-readable string carries the
 * whole domain. Never render `done.` where a URL, handle or legal entity is
 * what is actually meant.
 */
export function WordmarkLockup({
  size = 22,
  style,
}: {
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "0.5em", ...style }}>
      <Wordmark size={size} />
      <span
        style={{
          fontFamily: B.fontMono,
          fontSize: size * 0.42,
          letterSpacing: "0.06em",
          color: B.ink4,
        }}
      >
        done.design
      </span>
    </span>
  );
}
