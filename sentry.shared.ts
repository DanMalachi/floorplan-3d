// One place deciding whether error tracking is on, and how loudly.
//
// Sentry is OPT-IN: with no DSN the SDK initialises to a no-op, so a checkout
// without one behaves exactly as before — no network, no cost, no signup needed
// to run this app. That is why every init below is guarded rather than assumed.
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "";

export const sentryEnabled = Boolean(SENTRY_DSN);

// -----------------------------------------------------------------------------
// Scrubbing
// -----------------------------------------------------------------------------
//
// A share link is a CAPABILITY in the URL (`/v/<room>?g=<signed grant>`), and the
// OAuth return carries a one-time `code`. Sentry records the page URL on every
// event and breadcrumb, so without this a stored error report would be a stored
// copy of a working share link — readable by anyone with access to the Sentry
// project, and retained long after the owner might have wanted it gone. Request
// bodies, cookies and headers are stripped for the same reason: they carry the
// session, and floor-plan content is the user's home.

const SENSITIVE_PARAMS = new Set([
  "g", // share grant
  "grant",
  "code", // OAuth authorization code
  "state",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "key",
  "apikey",
  "api_key",
  "authorization",
  "session",
]);

/** Redact sensitive query params and the whole fragment of a URL or path. */
export function scrubUrl(input: string | undefined): string | undefined {
  if (!input) return input;
  const hashAt = input.indexOf("#");
  const noHash = hashAt >= 0 ? input.slice(0, hashAt) : input;
  const q = noHash.indexOf("?");
  if (q < 0) return noHash;
  const base = noHash.slice(0, q);
  const params = new URLSearchParams(noHash.slice(q + 1));
  for (const name of [...params.keys()]) {
    if (SENSITIVE_PARAMS.has(name.toLowerCase())) params.set(name, "[redacted]");
  }
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    event.request.url = scrubUrl(event.request.url);
    if (typeof event.request.query_string === "string") {
      event.request.query_string = scrubUrl(`?${event.request.query_string}`)?.slice(1);
    }
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  if (event.user) {
    // Keep the opaque id (useful for "how many users hit this"); drop everything
    // that identifies a person.
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  for (const crumb of event.breadcrumbs ?? []) scrubBreadcrumb(crumb);
  return event;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  const d = crumb.data as Record<string, unknown> | undefined;
  if (d) {
    for (const k of ["url", "from", "to"]) {
      if (typeof d[k] === "string") d[k] = scrubUrl(d[k] as string);
    }
  }
  return crumb;
}

export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: sentryEnabled,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  // Vercel exposes the deploy's commit; without it every release looks the same
  // and a regression cannot be tied to what shipped.
  release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  // Errors are the point here, not performance. Tracing every request on a free
  // tier burns the quota that error reports need, so it stays off until asked.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  // A floor plan is the user's home. Never let the SDK's convenience defaults
  // ship request bodies, cookies, or headers to a third party.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
} as const;
