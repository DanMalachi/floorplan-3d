// Locale routing. There was no middleware in this app before i18n, so nothing
// here is competing with anything: Supabase auth runs through @supabase/ssr in
// server components and route handlers, not here.
//
// The matcher is a denylist rather than an allowlist because the app serves
// share links at `/v/<id>` and those must keep resolving unprefixed. Anything
// that is not an API route, a Next internal, or a file with an extension gets
// locale handling.

import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: [
    // Everything except: /api, /_next, /_vercel, Sentry's tunnel, and any path
    // with a dot in it (favicon.ico, og images, /furniture/*.glb, textures).
    "/((?!api|_next|_vercel|monitoring|.*\..*).*)",
  ],
};
