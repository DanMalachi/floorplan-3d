import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions, sentryEnabled } from "./sentry.shared";

// Next 16 loads this once per server runtime. Both branches are guarded so a
// deployment with no DSN never opens a connection to Sentry at all.
export async function register() {
  if (!sentryEnabled) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sharedSentryOptions);
  }
}

// Surfaces server-side React rendering errors. Safe to export unconditionally —
// it is a no-op when the SDK was never initialised.
export const onRequestError = Sentry.captureRequestError;
