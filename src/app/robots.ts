import type { MetadataRoute } from "next";
import { landingEnabled } from "@/lib/featureFlags";

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
  return {
    rules: {
      userAgent: "*",
      allow: landingEnabled
        ? ["/", "/design", "/about", "/faq", "/pricing", "/legal"]
        : ["/", "/design", "/legal"],
      disallow: ["/v/", "/api/", "/auth/", "/calibration"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // The production domain, live since 2026-08-27 (Namecheap DNS → Vercel).
  // NEXT_PUBLIC_SITE_URL is still the override for preview deployments and
  // any future domain change; this is the fallback, not a hardcoding.
  return "https://done.design";
}
