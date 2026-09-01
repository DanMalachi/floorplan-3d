import type { MetadataRoute } from "next";
import { landingEnabled } from "@/lib/featureFlags";

// Only the pages meant to be publicly discoverable — see robots.ts for the
// reasoning (`/v/*` share links and app internals are deliberately excluded).
//
// The marketing pages appear only once NEXT_PUBLIC_LANDING_ENABLED is on;
// until then they redirect to the editor and listing them would advertise a
// redirect as a destination.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  const marketing: MetadataRoute.Sitemap = landingEnabled
    ? [
        { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
        { url: `${base}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
      ]
    : [];

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...marketing,
    // The editor is an app shell with little for a crawler to read, but it is a
    // real destination people link to and robots.ts already allows it — so it
    // belongs here rather than being found only through the landing page.
    { url: `${base}/design`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
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
