import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// -----------------------------------------------------------------------------
// Security headers
// -----------------------------------------------------------------------------
// Every header below is a normal, blocking header EXCEPT Content-Security-Policy,
// which ships in Report-Only mode. See the comment on CSP_ENFORCE for why, and
// the comment on `csp()` for how each directive was derived from what the app
// actually loads (grepped, not guessed — see the per-directive comments below).
// -----------------------------------------------------------------------------

const isDev = process.env.NODE_ENV !== "production";

/**
 * Flip to true — and rename the response header a few lines down from
 * "Content-Security-Policy-Report-Only" to "Content-Security-Policy" — once
 * you've watched real traffic (browser devtools console, or a report
 * collector if you wire one up) for a while and confirmed the only
 * violations are the expected ones called out below.
 *
 * The one you WILL see and can't avoid without more work: Next.js's App
 * Router injects inline <script> tags for streaming SSR and RSC hydration
 * (`self.__next_f.push(...)`) on every page. script-src below deliberately
 * omits 'unsafe-inline' so Report-Only mode surfaces exactly this — the
 * clean fix is a per-request nonce, wired up in middleware (this repo's
 * `src/proxy.ts`, Next 16's renamed middleware file) plus the nonce being
 * threaded onto those script tags, which is Next's own machinery, not
 * something this file controls. That's out of scope here (proxy.ts isn't
 * owned by this change), so the fallback if you want to enforce sooner is
 * adding 'unsafe-inline' to script-src — which does work, but gives up most
 * of what script-src is for. Your call.
 */
const CSP_ENFORCE = false;

/**
 * Supabase project origin, derived from the same env var the client reads
 * (src/lib/supabase/client.ts, src/lib/supabase/server.ts, src/proxy.ts) so
 * this never drifts from the real project across dev/preview/prod. Falls
 * back to a wildcard so a deploy with the var briefly unset doesn't ship a
 * CSP that can never match anything (that fallback is intentionally loose —
 * *.supabase.co is Supabase's own multi-tenant domain, not attacker-chosen).
 */
function supabaseOrigins(): { http: string; ws: string } {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return { http: "https://*.supabase.co", ws: "wss://*.supabase.co" };
  try {
    const { host } = new URL(raw);
    return { http: `https://${host}`, ws: `wss://${host}` };
  } catch {
    return { http: "https://*.supabase.co", ws: "wss://*.supabase.co" };
  }
}

function csp(): string {
  const { http: supabaseHttp, ws: supabaseWs } = supabaseOrigins();

  // Dev needs 'unsafe-eval' + 'unsafe-inline' for Next's Fast Refresh/HMR
  // runtime. Production gets neither — see CSP_ENFORCE above for what that
  // costs (the known, harmless-under-Report-Only inline-script violations).
  // 'wasm-unsafe-eval' is required in BOTH: three.js's DRACOLoader and
  // KTX2Loader (public/draco/*.wasm, public/basis/*.wasm — the furniture-GLB
  // and KTX2-floor-texture decoders) instantiate WebAssembly inside blob:
  // workers that inherit this document's CSP, so this is what lets that
  // instantiation happen at all, enforcing or not.
  const scriptSrc = isDev
    ? `'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline'`
    : `'self' 'wasm-unsafe-eval'`;

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Inline `style={{...}}` props are pervasive across src/ui (34+ files) —
    // there's no CSP-clean way around 'unsafe-inline' here short of a
    // repo-wide move to CSS classes/modules. Real-world risk is low: CSS
    // injection is a much smaller attack surface than script injection,
    // which script-src above still guards tightly.
    `style-src 'self' 'unsafe-inline'`,
    // 'self'   — local assets under public/ (furniture thumbnails, materials).
    // data:    — thumbnail/plan-image data URLs (src/store/planImageStore.ts,
    //            src/store/cloudProjects.ts's blobToDataUrl after a Supabase
    //            Storage download; src/furniture/thumbnails.ts's canvas
    //            .toDataURL renders).
    // blob:    — local file preview when adding a calibration reference model
    //            (src/app/calibration/ReferenceRig.tsx: URL.createObjectURL).
    // googleusercontent.com — Google-account avatar (src/lib/auth/profile.ts
    //            reads user_metadata.avatar_url/picture from Supabase's Google
    //            OAuth session; host wildcarded since that file deliberately
    //            doesn't assume a specific one — see its own comment).
    `img-src 'self' data: blob: https://*.googleusercontent.com`,
    // next/font self-hosts Manrope + IBM Plex Mono at build time (verified:
    // src/app/layout.tsx's own comment, and no <link>/@import to
    // fonts.googleapis.com/fonts.gstatic.com anywhere in src/app) — no
    // runtime font fetch, so no external font-src host needed.
    `font-src 'self'`,
    [
      `connect-src 'self'`,
      supabaseHttp, // Supabase REST (postgrest + storage)
      supabaseWs, // Supabase Realtime
      `https://api.liveblocks.io`, // confirmed exact host: node_modules/@liveblocks/core's DEFAULT_BASE_URL
      `wss://api.liveblocks.io`, // same host, ws upgrade — Liveblocks doesn't use a separate socket host
      `https://*.public.blob.vercel-storage.com`, // furniture GLBs (data/furniture-ikea.blob.json); store-id subdomain varies per env, hence wildcard
      `blob:`, // local-file GLTFLoader.load(url) in the calibration rig
      // Sentry's browser SDK POSTs events to <org>.ingest.sentry.io. Without
      // this the CSP would silently block the very reports that tell us the CSP
      // is blocking things. Costs nothing when no DSN is configured.
      `https://*.ingest.sentry.io`,
      `https://*.ingest.de.sentry.io`,
    ].join(" "),
    // DRACOLoader/KTX2Loader both do `new Worker(URL.createObjectURL(new
    // Blob([...])))` (confirmed in node_modules/three/examples/jsm/loaders/
    // {DRACOLoader,KTX2Loader}.js) — without blob: here, every furniture
    // model silently degrades to its placeholder box and every KTX2 floor
    // texture fails to decode.
    `worker-src 'self' blob:`,
    `frame-src 'none'`, // no <iframe> anywhere in src/ — confirmed by grep
    `frame-ancestors 'none'`, // this app is never meant to be framed by anyone
    `object-src 'none'`, // no <object>/<embed>/plugins
    `base-uri 'self'`,
    `form-action 'self'`, // no <form> elements found; Supabase OAuth sign-in is a JS redirect, not a form POST
  ];
  if (!isDev) {
    // Would force http://localhost sub-requests to https and break `next dev`;
    // meaningless anyway since Report-Only ignores this directive regardless.
    directives.push(`upgrade-insecure-requests`);
  }
  return directives.join("; ");
}

const securityHeaders = [
  {
    key: CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: csp(),
  },
  {
    // 2 years + subdomains. `preload` is safe to send unconditionally — it's
    // inert until you actually submit the domain at hstspreload.org, which
    // is a manual step (see report).
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Belt-and-braces alongside CSP's frame-ancestors, for the handful of older
  // browsers that honor X-Frame-Options but not frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      // src/collab/CollabRoom.tsx: navigator.clipboard.writeText for "copy share link"
      "clipboard-write=(self)",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry wraps the build to upload source maps, so a minified stack trace maps
// back to real code. Everything here is conditional: with no auth token the
// wrapper still runs but uploads nothing, and with no DSN the SDK itself is a
// no-op — so a checkout with neither builds and behaves exactly as before.
//
// The wrapper must stay OUTSIDE `nextConfig` rather than replace it: it returns
// a merged config, and the `headers()` above (every security header, including
// the CSP) has to survive that merge.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  // Only set when Dan has created the project; absent means "skip the upload"
  // rather than "fail the build".
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Strip source maps from the client bundle after uploading them. Without this
  // the maps ship publicly, which hands anyone the unminified source.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Routes Sentry's own requests through this app's domain so ad blockers, which
  // block ingest.sentry.io by default, do not silently drop error reports.
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
