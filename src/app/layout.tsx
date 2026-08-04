import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Plan Dock P8: load the two fonts its token stacks have named since P0
// (src/ui/planDock/tokens.ts: `fontUi`/`fontMono` list "Manrope"/"IBM Plex
// Mono" literally, as plain CSS family-name strings — not a next/font CSS
// variable). next/font self-hosts each Google font and injects its
// @font-face under that SAME literal family name, so no token change is
// needed here: once the @font-face rules exist anywhere on the page (which
// requires actually using `.variable`/`.className` on a rendered element),
// every existing `Manrope, -apple-system, ...` stack starts resolving to the
// real font instead of falling through to the system sans/mono fallback.
// `variable` mode (not `className`) is deliberate: it defines a CSS custom
// property without forcing a default font-family onto <html>, so it can't
// fight with the rest of the app's own font stacks (src/ui/tokens.ts's older,
// unrelated dark-token set still drives Trace/View chrome).
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Floorplan → 3D",
  description: "Phase 1: trace a 2D plan into an editable 3D model",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
