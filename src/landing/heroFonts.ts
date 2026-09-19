import { Archivo, Bona_Nova, Heebo, Newsreader } from "next/font/google";

// The homepage hero's own type (approved 2026-09-19, docs/design/hero-2026-09-19).
// Scoped to the hero rather than added to the root layout: nothing else on the
// site uses these faces, and the editor should not pay for them.
//
// All four are SIL Open Font License 1.1 — logged in docs/DATA_RIGHTS.md.
//
//   English   Archivo (headline 800, hero copy 400/700) + Newsreader Italic 500
//   Hebrew    Heebo (headline 900, hero copy 400/700)   + Bona Nova Italic (see below)
//
// Bona Nova is the reason Hebrew slants at all: it ships a true Hebrew italic,
// where every other free Hebrew serif would be a browser-faked oblique.
//
// Preloading follows the language that uses the face. The Hebrew pair is not
// preloaded, so an English visitor never downloads it; the cost is that /he
// fetches it on first paint rather than ahead of it (display: swap either way).

export const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

export const newsreader = Newsreader({
  subsets: ["latin"],
  weight: "500",
  style: "italic",
  variable: "--font-newsreader",
  display: "swap",
});

export const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
  preload: false,
});

// Bona Nova ships its italic at 400 ONLY (asking Google for ital,700 is an HTTP 400).
// The approved mockup asked for 700 and the browser synthesised the bold from
// this 400, so that synthesised weight IS the approved look: load 400 and keep
// Hero.tsx asking for 700. Do not "fix" it to 400 without showing Dan.
export const bonaNova = Bona_Nova({
  subsets: ["hebrew", "latin"],
  weight: "400",
  style: "italic",
  variable: "--font-bona-nova",
  display: "swap",
  preload: false,
});

export const HERO_FONT_VARS = [archivo, newsreader, heebo, bonaNova].map((f) => f.variable).join(" ");
