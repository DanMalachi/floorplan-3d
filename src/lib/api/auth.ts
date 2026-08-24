// The one place a route asks "who is calling, and may they?".
//
// getServerUser() returns null both for a guest AND for a deployment with no
// Supabase configured. Those must not be treated the same: a guest is a 401 (sign
// in and retry), an unconfigured deployment is a 503 (nothing the caller can do).
// Collapsing them would have made an unconfigured production silently open.

import type { User } from "@supabase/supabase-js";
import { getServerUser } from "@/lib/supabase/server";
import { unauthorized, unavailable, isProduction } from "./http";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { signBlob, verifyBlob } from "@/collab/grant.server";

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

// ---------------------------------------------------------------------------
// Stable anonymous identity
// ---------------------------------------------------------------------------

/**
 * A durable id for a signed-out link visitor.
 *
 * Liveblocks bills by MONTHLY ACTIVE USER, and it counts distinct user ids. The
 * room auth route used to mint `anon-${randomUUID()}` on every call, so the same
 * guest reloading a shared plan ten times became ten billable users — no attack
 * required, just normal use. It also handed anyone with a link an unbounded
 * supply of new identities to run the bill up with.
 *
 * The id is kept in a signed HttpOnly cookie and reused. It is deliberately NOT
 * an authorization credential — the share grant alone decides what a visitor may
 * do, so a forged or absent cookie costs nothing but a new anon id. Signing is
 * here so a caller cannot pick an id that collides with a real Supabase uid.
 */
const ANON_COOKIE = "fp_anon";
const ANON_TAG = "anon-id";
const ANON_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export async function stableAnonId(): Promise<string> {
  const jar = await cookies();
  const existing = verifyBlob<string>(ANON_TAG, jar.get(ANON_COOKIE)?.value);
  // Only accept the exact shape we mint; anything else gets a fresh id.
  if (typeof existing === "string" && /^anon-[0-9a-f-]{36}$/i.test(existing)) return existing;

  const id = `anon-${randomUUID()}`;
  jar.set(ANON_COOKIE, signBlob(ANON_TAG, id, ANON_TTL_MS), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: Math.floor(ANON_TTL_MS / 1000),
  });
  return id;
}
