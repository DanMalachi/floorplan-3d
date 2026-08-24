// One place deciding whether error tracking is on, and how loudly.
//
// Sentry is OPT-IN: with no DSN the SDK initialises to a no-op, so a checkout
// without one behaves exactly as before — no network, no cost, no signup needed
// to run this app. That is why every init below is guarded rather than assumed.
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "";

export const sentryEnabled = Boolean(SENTRY_DSN);

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
} as const;
