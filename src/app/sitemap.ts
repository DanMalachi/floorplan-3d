import type { MetadataRoute } from "next";
import { landingEnabled } from "@/lib/featureFlags";
import { routing } from "@/i18n/routing";
import { localePath } from "@/i18n/navigation";
import { INDEXABLE_ALWAYS, INDEXABLE_MARKETING } from "@/i18n/alternates";

// Only the pages meant to be publicly discoverable — see robots.ts for the
// reasoning (`/v/*` share links and app internals are deliberately excluded).
//
// The marketing pages appear only once NEXT_PUBLIC_LANDING_ENABLED is on;
// until then they redirect to the editor and listing them would advertise a
// redirect as a destination.
//
// ── Both locales, and each entry naming the other ───────────────────────────
// Every path is emitted once per locale, and each entry carries the same
// `alternates.languages` map the page's own `<link rel="alternate">` tags
// declare (both come from src/i18n/alternates.ts, so they cannot drift). That
// agreement is the whole point: a crawler that finds a sitemap claiming one
// pairing and a page head claiming another discards both.
//
// This file stays OUTSIDE `[locale]` — a sitemap is one document for the whole
// site, not a per-locale page, and Next serves it at /sitemap.xml either way.

const CHANGE: Record<string, { freq: MetadataRoute.Sitemap[number]["changeFrequency"]; pri: number }> = {
  "/": { freq: "weekly", pri: 1 },
  "/about": { freq: "monthly", pri: 0.6 },
  "/pricing": { freq: "monthly", pri: 0.7 },
  "/faq": { freq: "monthly", pri: 0.6 },
  // The editor is an app shell with little for a crawler to read, but it is a
  // real destination people link to and robots.ts already allows it — so it
  // belongs here rather than being found only through the landing page.
  "/design": { freq: "monthly", pri: 0.5 },
  "/legal/privacy": { freq: "yearly", pri: 0.3 },
  "/legal/terms": { freq: "yearly", pri: 0.3 },
  "/legal/cookies": { freq: "yearly", pri: 0.3 },
  "/legal/credits": { freq: "yearly", pri: 0.3 },
};

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  const paths = [
    ...INDEXABLE_ALWAYS,
    ...(landingEnabled ? INDEXABLE_MARKETING : []),
  ] as readonly `/${string}`[];

  return paths.flatMap((path) => {
    // Hebrew's entry lists English and vice versa. Absolute URLs here, unlike
    // the page-level map, because a sitemap has no metadataBase to resolve
    // against — every <loc> and <xhtml:link> must be fully qualified.
    const languages = {
      ...Object.fromEntries(routing.locales.map((l) => [l, `${base}${localePath(l, path)}`])),
      // Carried here too, so the sitemap states the same map the page head
      // does. Dropping it on one side is the disagreement this file exists to
      // avoid.
      "x-default": `${base}${localePath(routing.defaultLocale, path)}`,
    };
    const { freq, pri } = CHANGE[path];
    return routing.locales.map((locale) => ({
      url: `${base}${localePath(locale, path)}`,
      lastModified: now,
      changeFrequency: freq,
      priority: pri,
      alternates: { languages },
    }));
  });
}

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  // On a production deployment VERCEL_URL is the per-deployment *.vercel.app
  // alias, not the domain people visit. Listing those in the sitemap makes
  // Search Console reject every URL as off-property for done.design, so the
  // real domain wins there and VERCEL_URL is left to serve previews.
  if (process.env.VERCEL_ENV === "production") return "https://done.design";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // See robots.ts — done.design has been the production domain since
  // 2026-08-27; NEXT_PUBLIC_SITE_URL still overrides for previews.
  return "https://done.design";
}
