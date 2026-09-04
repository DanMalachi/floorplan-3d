import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ConsentNotice } from "@/ui/consent/ConsentNotice";

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

// Resolves relative URLs in page metadata (e.g. opengraph-image) to absolute
// ones. Vercel always sets VERCEL_URL on its deployments, but on a production
// deployment that is the per-deployment *.vercel.app alias, so the real domain
// has to win there or canonical and OG URLs would point at a host nobody
// visits; VERCEL_URL still resolves previews against themselves.
// NEXT_PUBLIC_SITE_URL remains the explicit override. `new URL()` throws on a
// malformed string, so the last resort has to be an actually-valid URL, not a
// bracketed placeholder token — localhost is the standard safe default for
// local dev (no real domain is invented; this is never shown to a user, only
// used to resolve relative metadata URLs). See src/app/robots.ts and
// sitemap.ts for the same resolution order.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_ENV === "production"
    ? "https://done.design"
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "done. — model our home",
  description:
    "Trace the floorplan you already have into a 3D model of your home, then furnish it, paint it, and walk through it in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${ibmPlexMono.variable}`}>
      <body>
        {children}
        <ConsentNotice />
      </body>
    </html>
  );
}
