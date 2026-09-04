import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Manrope, IBM_Plex_Mono, Rubik } from "next/font/google";
import "../globals.css";
import { ConsentNotice } from "@/ui/consent/ConsentNotice";
import { routing, dirOf, type Locale } from "@/i18n/routing";

// Plan Dock P8: load the fonts the token stacks have named since P0
// (src/ui/planDock/tokens.ts: `fontUi`/`fontMono` list "Manrope"/"IBM Plex
// Mono" literally, as plain CSS family-name strings — not a next/font CSS
// variable). next/font self-hosts each Google font and injects its @font-face
// under that SAME literal family name, so no token change is needed here: once
// the @font-face rules exist anywhere on the page (which requires actually
// using `.variable`/`.className` on a rendered element), every existing
// `Manrope, -apple-system, …` stack starts resolving to the real font instead
// of falling through to the system sans.
// `variable` mode (not `className`) is deliberate: it defines a CSS custom
// property without forcing a default font-family onto <html>, so it cannot
// fight with the rest of the app's own font stacks.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

// ── The Hebrew face ─────────────────────────────────────────────────────────
// Manrope has NO Hebrew glyphs, and no `hebrew` subset exists to add — asking
// for one throws at build time. So without a companion, Hebrew silently fell
// through the whole stack to Segoe UI, at a different weight, x-height and
// rhythm from the Latin beside it.
//
// Rubik, because it is the closest match in feel to Manrope that has native
// Hebrew — geometric, humanist, and shipping 300–900, so it can carry the 800
// the wordmark uses. (Heebo is a Roboto extension: more neutral and further
// away. Assistant is lighter in colour. Noto Sans Hebrew is a fallback face,
// not a brand one.)
//
// The elegant part is that NOTHING has to switch on locale. Rubik is appended
// to the existing stacks in the token files, so the browser falls through
// per-CHARACTER: Latin renders in Manrope, Hebrew finds no Manrope glyph and
// lands on Rubik. One stack, both scripts, no conditional anywhere.
//
// `fontMono` deliberately gets no Hebrew companion: every mono use in this app
// is numeric (dimensions, coordinates, micro-labels) and Hebrew uses Latin
// digits.
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-rubik",
  display: "swap",
});

// Resolves relative URLs in page metadata (e.g. opengraph-image) to absolute
// ones. Vercel always sets VERCEL_URL on its deployments, but on a production
// deployment that is the per-deployment *.vercel.app alias, so the real domain
// has to win there or canonical and OG URLs would point at a host nobody
// visits; VERCEL_URL still resolves previews against themselves.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_ENV === "production"
    ? "https://done.design"
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(siteUrl),
    title: t("title"),
    description: t("description"),
    // Tells search engines these are the same page in two languages rather
    // than duplicate content, and which to serve to whom. `as-needed` means
    // English carries no prefix, so its alternate is the bare path.
    alternates: {
      languages: {
        en: "/",
        he: "/he",
        "x-default": "/",
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Required for the static rendering of everything below this layout —
  // without it every page under [locale] silently becomes dynamic.
  setRequestLocale(locale as Locale);

  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${manrope.variable} ${ibmPlexMono.variable} ${rubik.variable}`}
    >
      <body>
        <NextIntlClientProvider>
          {children}
          <ConsentNotice />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
