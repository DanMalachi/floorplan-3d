// The one place a route asks "who is calling, and may they?".
//
// getServerUser() returns null both for a guest AND for a deployment with no
// Supabase configured. Those must not be treated the same: a guest is a 401 (sign
// in and retry), an unconfigured deployment is a 503 (nothing the caller can do).
// Collapsing them would have made an unconfigured production silently open.

import type { User } from "@supabase/supabase-js";
import { getServerUser } from "@/lib/supabase/server";
import { unauthorized, unavailable } from "./http";

export const accountsConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export type AuthResult = { ok: true; user: User } | { ok: false; response: Response };

/** Require a signed-in account. Use for anything that costs money or touches a machine. */
export async function requireUser(): Promise<AuthResult> {
  if (!accountsConfigured()) {
    return {
      ok: false,
      response: unavailable(
        "accounts are not configured",
        "this endpoint requires sign-in; set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ),
    };
  }
  const user = await getServerUser().catch(() => null);
  if (!user) return { ok: false, response: unauthorized("sign in to use this endpoint") };
  return { ok: true, user };
}

/** The caller if signed in, else null. For routes that serve guests too. */
export async function optionalUser(): Promise<User | null> {
  if (!accountsConfigured()) return null;
  return getServerUser().catch(() => null);
}
