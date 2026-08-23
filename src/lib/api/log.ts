// Structured request logging.
//
// Vercel's log viewer can filter on JSON fields but not on prose, so every line
// is a single JSON object on one line. `console.log` is deliberate: on Vercel it
// is the log transport, and anything fancier would need a service to ship to.
//
// The rule that matters: this must never log what a user drew. Plan geometry,
// images, and request bodies stay out — the fields below are all operational.

import * as Sentry from "@sentry/nextjs";

type Level = "info" | "warn" | "error";

export interface RequestLog {
  route: string;
  status: number;
  ms: number;
  /** Supabase uid, or null for a signed-out caller. Never an email or a name. */
  userId?: string | null;
  /** Set when a request was refused, so refusals can be counted by reason. */
  reason?: string;
}

function emit(level: Level, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logRequest(entry: RequestLog): void {
  emit(entry.status >= 500 ? "error" : entry.status >= 400 ? "warn" : "info", {
    kind: "request",
    ...entry,
  });
}

/**
 * Report a server-side failure. Goes to the log always, and to Sentry when a DSN
 * is configured — the log line is what makes an unconfigured deployment still
 * debuggable, which is why it is not conditional on Sentry.
 */
export function logError(route: string, err: unknown, context?: Record<string, unknown>): void {
  const e = err instanceof Error ? err : new Error(String(err));
  emit("error", { kind: "exception", route, message: e.message, stack: e.stack, ...context });
  Sentry.captureException(e, context ? { extra: context } : undefined);
}

/** Wrap a route handler so its duration and outcome are always recorded, including
 *  on the throw path — an unlogged 500 is the one you cannot diagnose later. */
export async function withRequestLog(
  route: string,
  userId: string | null,
  run: () => Promise<Response>,
): Promise<Response> {
  const started = Date.now();
  try {
    const res = await run();
    logRequest({ route, status: res.status, ms: Date.now() - started, userId });
    return res;
  } catch (err) {
    logError(route, err, { userId });
    logRequest({ route, status: 500, ms: Date.now() - started, userId, reason: "threw" });
    throw err;
  }
}
