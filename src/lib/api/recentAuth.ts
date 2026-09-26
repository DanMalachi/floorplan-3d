// F-17 — require a RECENT sign-in before an irreversible, sensitive action
// (account deletion today). "Recent" means a fresh Google sign-in, not the
// user's ordinary long-lived session: a stolen or left-open session cookie is
// exactly the case this exists to catch, and the audit's own scenario is
// "typing your own e-mail is the only step-up" — a client-side check an
// attacker with the session already satisfies trivially.
//
// `last_sign_in_at` is written by Supabase itself the moment a session is
// established (OAuth code exchange, refresh does NOT bump it) — never
// client-writable, so it is a server fact, not something the request can
// assert about itself. This is why the check lives here, reading the value
// `getServerUser()` returned from Supabase's own `getUser()` call, and not
// anywhere the browser could influence.

/** How fresh a sign-in must be for a sensitive action. Chosen to survive an
 *  honest multi-step flow (open /account, read the warnings, type the email)
 *  without a second Google prompt, while still meaningfully bounding a
 *  hijacked session: 15 minutes is short enough that a session idle for a
 *  normal day is long past it. */
export const RECENT_AUTH_WINDOW_MS = 15 * 60 * 1000;

/**
 * Is `lastSignInAt` (an ISO timestamp, or the field's absence) within the
 * recent-auth window right now?
 *
 * Fails closed on anything that isn't a parseable, in-range timestamp —
 * missing, malformed, or (defensively) in the future all read as "not
 * recent", never as "trust it".
 */
export function isRecentlyAuthenticated(
  lastSignInAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastSignInAt) return false;
  const t = Date.parse(lastSignInAt);
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  return age >= 0 && age <= RECENT_AUTH_WINDOW_MS;
}
