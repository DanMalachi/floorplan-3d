// Server-only: sign/verify share grants with an HMAC secret. Tamper-proof role
// links without a database — a user can't edit ?g= to upgrade "view" to "build"
// because they can't forge the signature. Import only from route handlers (never
// from client code — it reads process.env secret).

import crypto from "node:crypto";
import type { ShareRole } from "./share";

export interface GrantPayload {
  room: string; // the Liveblocks room this grant authorizes
  role: ShareRole;
  exp?: number; // epoch ms; links auto-expire (stateless time-boxed revoke)
}

/** Thrown when there is no usable signing secret. Routes turn this into a 503. */
export class MissingShareSecret extends Error {
  constructor() {
    super("no share signing secret configured");
    this.name = "MissingShareSecret";
  }
}

// Share links get their own key. Reusing the Liveblocks secret meant rotating one
// silently invalidated the other, and it gave a single value two unrelated jobs.
// SHARE_SIGNING_SECRET is the one to set; the Liveblocks key stays as a fallback
// so links already in circulation keep verifying (see LEGACY_SECRETS below).
//
// There used to be a third fallback, the literal string "dev-unsafe-secret". That
// is a hardcoded, world-readable key: any deployment missing both env vars was
// signing grants with a value an attacker can read in this file, so anyone could
// forge a "build" grant for any room. It is gone — configuration is now required,
// and a deployment without it fails closed instead of pretending to be secure.
const DEV_ONLY_FALLBACK = "dev-unsafe-secret";

/** True when grants can be signed/verified at all. Routes should 503 when false. */
export function shareSigningConfigured(): boolean {
  if (process.env.SHARE_SIGNING_SECRET || process.env.LIVEBLOCKS_SECRET_KEY) return true;
  // Local development stays frictionless; production must be configured.
  return process.env.NODE_ENV !== "production";
}

export function shareSecret(): string {
  const configured = process.env.SHARE_SIGNING_SECRET ?? process.env.LIVEBLOCKS_SECRET_KEY;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new MissingShareSecret();
  return DEV_ONLY_FALLBACK;
}

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
  const sig = crypto.createHmac("sha256", shareSecret()).update(body).digest("base64url");
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
  const keys = [shareSecret(), ...LEGACY_SECRETS()];
  if (!keys.some((k) => signatureMatches(body, sig, k))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as GrantPayload;
    // Verify the SHAPE, not just the signature. The owner cookie below is signed
    // with the same key, so without this a cookie deserialises into a grant whose
    // room and role are undefined. Callers happen to reject that today, which
    // means this only ever failed safe by accident — an accident one refactor
    // away from being a real confusion between two different capabilities.
    if (typeof p !== "object" || p === null) return null;
    if (typeof p.room !== "string" || !p.room) return null;
    if (p.role !== "view" && p.role !== "decorate" && p.role !== "build") return null;
    if (p.exp && Date.now() > p.exp) return null; // expired link
    return p;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generic signed blobs — same key, different job
// ---------------------------------------------------------------------------
//
// Used for the room-ownership cookie (src/lib/api/rooms.ts). Kept here so there is
// exactly one HMAC implementation and one secret lookup in the codebase. The `t`
// tag is a domain separator: a signed value minted for one purpose must not verify
// as another, or an owner cookie could be replayed as a grant.

export function signBlob<T>(tag: string, value: T, ttlMs: number): string {
  const body = b64(JSON.stringify({ t: tag, v: value, exp: Date.now() + ttlMs }));
  const sig = crypto.createHmac("sha256", shareSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyBlob<T>(tag: string, blob: string | null | undefined): T | null {
  if (!blob) return null;
  const [body, sig] = blob.split(".");
  if (!body || !sig) return null;
  const keys = [shareSecret(), ...LEGACY_SECRETS()];
  if (!keys.some((k) => signatureMatches(body, sig, k))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      t?: string;
      v?: T;
      exp?: number;
    };
    if (p.t !== tag) return null;
    if (p.exp && Date.now() > p.exp) return null;
    return (p.v ?? null) as T | null;
  } catch {
    return null;
  }
}
