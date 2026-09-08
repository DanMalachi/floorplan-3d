import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { PSEUDO_LOCALE_COOKIE } from "@/i18n/pseudoLocaleCookie";

// -----------------------------------------------------------------------------
// The app's single edge entry point (Next 16's `proxy`, formerly `middleware`).
//
// It does two jobs, and it has to do both HERE because Next runs exactly one
// such file per app. A second one named `middleware.ts` is not a second hook —
// Next 16 fails the build if it finds both, and a root-level `middleware.ts`
// beside `src/` is ignored with no warning at all.
//
//   1. Locale routing (next-intl). `localePrefix: "as-needed"` means the
//      English URLs carry no prefix, so SOMETHING has to rewrite `/about` to
//      `/en/about` before the router sees it. Without that rewrite `/about` is
//      read as `[locale] = "about"`, fails `hasLocale`, and 404s — while every
//      `/he/...` URL keeps working, because those carry their locale in the
//      path. An entirely 404'ing English site with a healthy Hebrew one is the
//      signature of this hook not running.
//
//   2. Supabase session refresh. Access tokens are short-lived. Without a
//      refresh on the way through, a user who leaves a tab open comes back
//      signed out — and any server route that reads the session (the Liveblocks
//      authorizer) sees a guest. `getUser()` refreshes when needed and writes
//      the new cookies onto the response.
//
// ── Order is load-bearing ───────────────────────────────────────────────────
// Supabase runs FIRST. Its `setAll` writes the refreshed tokens into
// `request.cookies`, which is backed by the request's `cookie` header — and
// next-intl builds its rewrite by copying `request.headers` onto the forwarded
// request. So refreshing first is what lets THIS request's server components
// see the new token rather than the expired one; the reverse order would hand
// them the stale cookie and only fix the next navigation.
//
// The refreshed cookies are then copied onto whatever response next-intl
// returns, rather than onto a fresh `NextResponse.next()`. That response is the
// rewrite (or redirect), so replacing it would throw the locale routing away.
//
// Both halves are no-ops when their config is absent: no Supabase env vars
// means no session work, and an exempt path skips locale routing entirely.
// -----------------------------------------------------------------------------

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Paths that must reach the router with their URL untouched.
 *
 * This is a function rather than more regex in `config.matcher` because the
 * matcher has to stay broad: the Supabase refresh above wants to run on
 * `/api/*` too (the Liveblocks authorizer reads the session there), while
 * locale routing must not touch those routes at all. One matcher, two
 * audiences — so the narrower rule lives here where it can be read.
 */
function skipsLocaleRouting(pathname: string): boolean {
  return (
    // Route handlers, and everything else that never moved under `[locale]`.
    // `/auth/callback` especially: it is the Google OAuth return URL, and
    // rewriting it to `/en/auth/callback` 404s the whole sign-in round trip.
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/_vercel") ||
    pathname.startsWith("/monitoring") ||
    // Anything with an extension: favicon.ico, og images, /furniture/*.glb,
    // textures, and the generated /robots.txt and /sitemap.xml.
    pathname.includes(".")
  );
}

export default async function proxy(request: NextRequest) {
  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];

  // Dev-only pseudo-locale toggle — `?pseudo=1` / `?pseudo=0` on any URL sets
  // (or clears) a cookie that `src/i18n/request.ts` reads to decide whether
  // to run messages through `pseudoLocale.ts`. `NODE_ENV` check here means the
  // query param is inert in a production deploy — it never even sets the
  // cookie, on top of `request.ts`'s own independent check before reading it.
  if (process.env.NODE_ENV !== "production") {
    const toggle = request.nextUrl.searchParams.get("pseudo");
    if (toggle === "1" || toggle === "0") {
      const value = toggle === "1" ? "1" : "0";
      request.cookies.set(PSEUDO_LOCALE_COOKIE, value);
      pending.push({ name: PSEUDO_LOCALE_COOKIE, value, options: { path: "/" } });
    }
  }

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (written) => {
          for (const { name, value, options } of written) {
            // Onto the request, so the forwarded render sees the fresh token…
            request.cookies.set(name, value);
            // …and held for the response, so the browser keeps it.
            pending.push({ name, value, options: options as Record<string, unknown> });
          }
        },
      },
    });

    try {
      await supabase.auth.getUser();
    } catch {
      // Offline or Supabase unreachable — serve the page anyway; the browser
      // client will retry, and a guest session is a valid state.
    }
  }

  const response = skipsLocaleRouting(request.nextUrl.pathname)
    ? NextResponse.next({ request })
    : intlMiddleware(request);

  for (const { name, value, options } of pending) response.cookies.set(name, value, options);

  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own assets and static files. The 3D app pulls
    // hundreds of .glb/.ktx2/image requests, and none of them carry a session.
    "/((?!_next/static|_next/image|favicon.ico|furniture/|materials/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|ktx2|hdr|bin)$).*)",
  ],
};
