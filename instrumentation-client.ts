import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions, sentryEnabled } from "./sentry.shared";

// Browser-side errors. Only NEXT_PUBLIC_SENTRY_DSN can reach here — a bare
// SENTRY_DSN is server-only and Next will not inline it into the bundle.
if (sentryEnabled) {
  Sentry.init({
    ...sharedSentryOptions,
    // Session replay would record the user's floor plan. Off.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
