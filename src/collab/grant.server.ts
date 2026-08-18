// Server-only: sign/verify share grants with the Liveblocks secret as the HMAC
// key. Tamper-proof role links without a database — a user can't edit ?g= to
// upgrade "view" to "build" because they can't forge the signature. Import only
// from route handlers (never from client code — it reads process.env secret).

import crypto from "node:crypto";
import type { ShareRole } from "./share";

export interface GrantPayload {
  room: string; // the Liveblocks room this grant authorizes
  role: ShareRole;
  exp?: number; // epoch ms; links auto-expire (stateless time-boxed revoke)
}

// Share links get their own key. Reusing the Liveblocks secret meant rotating one
// silently invalidated the other, and it gave a single value two unrelated jobs.
// SHARE_SIGNING_SECRET is the one to set; the Liveblocks key stays as a fallback
// so links already in circulation keep verifying (see LEGACY_SECRETS below).
const secret = () =>
  process.env.SHARE_SIGNING_SECRET ?? process.env.LIVEBLOCKS_SECRET_KEY ?? "dev-unsafe-secret";

/** Keys a grant may have been signed with before the current one. Grants live 30
 *  days, so dropping the old key would break every link already sent. */
const LEGACY_SECRETS = (): string[] =>
  process.env.SHARE_SIGNING_SECRET && process.env.LIVEBLOCKS_SECRET_KEY
    ? [process.env.LIVEBLOCKS_SECRET_KEY]
    : [];

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signGrant(p: Omit<GrantPayload, "exp"> & { ttlMs?: number }): string {
  const { ttlMs, ...rest } = p;
  const payload: GrantPayload = { ...rest, exp: Date.now() + (ttlMs ?? DEFAULT_TTL_MS) };
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function signatureMatches(body: string, sig: string, key: string): boolean {
  const expect = crypto.createHmac("sha256", key).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyGrant(grant: string): GrantPayload | null {
  const [body, sig] = grant.split(".");
  if (!body || !sig) return null;
  const keys = [secret(), ...LEGACY_SECRETS()];
  if (!keys.some((k) => signatureMatches(body, sig, k))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as GrantPayload;
    if (p.exp && Date.now() > p.exp) return null; // expired link
    return p;
  } catch {
    return null;
  }
}
