// Cross-site request forgery guard for cookie-authenticated, state-changing routes.
//
// The session cookies are SameSite=Lax, which already stops a browser attaching
// them to a cross-site POST. This is the second, independent layer (defence in
// depth — Lax has carve-outs, and sibling subdomains are same-SITE): refuse any
// request whose browser-supplied provenance says it came from another origin, and
// insist on a JSON content type, which a plain HTML form cannot send without a
// CORS preflight this app never approves.
//
// Requests with no Origin header at all (curl, server-to-server, some same-origin
// navigations) are allowed through: a browser always sends Origin on a cross-origin
// POST, so its absence is not a forged browser request, and every one of these
// routes still needs the session or the grant it is protecting.

import { forbidden, apiError } from "./http";

function requestHost(req: Request): string | null {
  return req.headers.get("x-forwarded-host") ?? req.headers.get("host");
}

/** Returns a 403/415 Response to hand back, or null when the request may proceed. */
export function rejectCrossSiteWrite(req: Request, opts: { requireJson?: boolean } = {}): Response | null {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return forbidden("cross-site request refused");
  }

  const origin = req.headers.get("origin");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      // "null" (sandboxed iframe, file://) or garbage: not an origin we serve.
      return forbidden("cross-site request refused");
    }
    const host = requestHost(req);
    if (host && originHost !== host) return forbidden("cross-site request refused");
  }

  if (opts.requireJson !== false && !req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return apiError(415, "expected application/json");
  }
  return null;
}
