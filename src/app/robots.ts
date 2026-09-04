import type { MetadataRoute } from "next";
import { landingEnabled } from "@/lib/featureFlags";
import { routing } from "@/i18n/routing";
import { localePath } from "@/i18n/navigation";

// What crawlers may index.
//
//   - `/` and the marketing pages (`/about`, `/faq`, `/pricing`) are the
//     public face and are meant to be found.
//   - `/design` — the editor — is allowed rather than blocked: it is a real
//     destination people link to, even though it is an app shell with little
//     for a crawler to read.
//   - `/legal/*` is the legal surface and stays indexable.
//   - `/v/*` — live share links (src/app/v/[id]/page.tsx) — are user-generated,
//     often-private sessions, not pages to promote in search results. That page
//     already sets its own `robots: { index: false, follow: false }`; this is a
//     second, host-level layer for the same rule.
//   - `/api/*`, `/auth/*`, `/calibration` are app internals with nothing to
//     index.
//
// While NEXT_PUBLIC_LANDING_ENABLED is off the marketing routes redirect to the
// editor, so they are left out of the allow list until they are real pages —
// advertising a redirect as a destination is how a site teaches a crawler to
// distrust its own sitemap.
export default function robots(): MetadataRoute.Robots {
  const paths: `/${string}`[] = landingEnabled
    ? ["/", "/design", "/about", "/faq", "/pricing", "/legal"]
    : ["/", "/design", "/legal"];

  // Every rule is stated once per locale. `as-needed` means the English paths
  // above ARE the unprefixed URLs, so they already cover English; Hebrew lives
  // under a prefix these rules would otherwise say nothing about — and the
  // disallow list matters more than the allow list there. `/he/v/` and
  // `/he/calibration` are the same internals as their English twins and must
  // be blocked in both, or the entire denylist is one prefix away from being
  // bypassed.
  const forEachLocale = (p: `/${string}`) => routing.locales.map((l) => localePath(l, p));

  return {
    rules: {
      userAgent: "*",
      allow: paths.flatMap(forEachLocale),
      disallow: [
        // These two live under `[locale]`, so they have a Hebrew twin to block.
        ...(["/v/", "/calibration"] as `/${string}`[]).flatMap(forEachLocale),
        // These stayed at the app root and are excluded from the locale
        // middleware's matcher entirely — there is no /he/api to disallow.
        "/api/",
        "/auth/",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  // Production must advertise the real domain: a `Sitemap:` line pointing at a
  // *.vercel.app alias sends crawlers to a host that is not the verified
  // Search Console property. VERCEL_URL stays the right answer for previews.
  if (process.env.VERCEL_ENV === "production") return "https://done.design";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // The production domain, live since 2026-08-27 (Namecheap DNS → Vercel).
  // NEXT_PUBLIC_SITE_URL is still the override for preview deployments and
  // any future domain change; this is the fallback, not a hardcoding.
  return "https://done.design";
}
