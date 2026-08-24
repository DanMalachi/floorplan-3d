import type { MetadataRoute } from "next";

// Production currently sits behind Vercel's deployment-protection/SSO gate
// (memory: floorplan-3d-deploy — dans-projects7/floorplan-3d, private/
// SSO-gated). No crawler can reach ANY route today no matter what this file
// says — it's inert until that gate is lifted for a public launch. Written
// now so the intent is explicit for whenever that happens:
//   - `/` and `/legal/*` (the product + its legal surface) are meant to be
//     indexed.
//   - `/v/*` — live share links (src/app/v/[id]/page.tsx) — are user-
//     generated, often-private sessions, not pages to promote in search
//     results. That page already sets its own `robots: { index: false,
//     follow: false }`; this is a second, host-level layer for the same
//     rule.
//   - `/api/*`, `/auth/*`, `/calibration` are app internals with nothing to
//     index.
//
// [[VERIFY: confirm the Vercel deployment-protection gate is actually removed
// before relying on this file to control what gets indexed]]
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/legal"],
      disallow: ["/v/", "/api/", "/auth/", "/calibration"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // No custom domain configured anywhere in this repo (grepped for
  // NEXT_PUBLIC_SITE_URL) — Vercel deployments always set VERCEL_URL, so
  // this branch is a local/other-host fallback only.
  return "https://[[PLACEHOLDER: production domain]]";
}
