// Rate limiting that survives Vercel serverless.
//
// THE PROBLEM WITH IN-MEMORY LIMITING HERE: every Vercel invocation may land on a
// fresh instance, and many instances run at once. A per-instance Map therefore
// limits nothing an attacker cares about — they get N requests per instance, and
// they control how many instances exist by how fast they call. It is genuinely
// useful only for a single long-lived local `next dev` process.
//
// So the durable backend is Upstash Redis over its REST API. It is HTTP, so no
// dependency and no connection pool: two commands in one pipelined POST. If you
// swap it for another provider, only `incrDurable` has to change.
//
// Two classes of route, because "fail closed" means different things for each:
//
//   "cost"  — spends Dan's money or spawns a process (LLM proxies, converters).
//             In production these REFUSE to run without a durable backend. An
//             unlimited LLM proxy is worse than a broken one.
//   "abuse" — cheap, but shouldn't be hammerable (share minting, room auth).
//             These degrade to per-instance limiting rather than take the app
//             down when Upstash isn't provisioned. Documented, not silent: the
//             server logs a warning once.

import { tooManyRequests, unavailable, isProduction, clientIp } from "./http";

export type LimitClass = "cost" | "abuse";

export interface Bucket {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
  kind: LimitClass;
}

const REST_URL = () => process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
const REST_TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasDurableBackend = () => Boolean(REST_URL() && REST_TOKEN());

let warned = false;
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[rate-limit] ${message}`);
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

/** Fixed window: INCR the counter, and set the TTL only on the first hit (NX). */
async function incrDurable(key: string, windowSec: number): Promise<number | null> {
  const url = REST_URL();
  const token = REST_TOKEN();
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSec), "NX"],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    const count = out?.[0]?.result;
    return typeof count === "number" ? count : null;
  } catch {
    return null; // network/timeout — caller decides what that means
  }
}

const memory = new Map<string, { count: number; resetAt: number }>();

function incrMemory(key: string, windowSec: number): number {
  const now = Date.now();
  const found = memory.get(key);
  if (!found || found.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    if (memory.size > 5000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return 1;
  }
  found.count += 1;
  return found.count;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Consume one token for `name` on behalf of `identity` (user id when signed in,
 * else IP). Returns a 429/503 Response to return immediately, or null to proceed.
 */
export async function enforceRateLimit(
  name: string,
  identity: string,
  bucket: Bucket,
): Promise<Response | null> {
  const window = Math.floor(Date.now() / 1000 / bucket.windowSec);
  const key = `fp:rl:${name}:${identity}:${window}`;

  if (hasDurableBackend()) {
    const count = await incrDurable(key, bucket.windowSec);
    if (count === null) {
      // Backend unreachable. A cost route must not become free because Redis
      // blinked; a cheap route must not take the app down for the same reason.
      if (bucket.kind === "cost") {
        return unavailable(
          "rate limiting unavailable",
          "the rate-limit backend could not be reached; this endpoint is closed until it recovers",
        );
      }
      return incrMemory(key, bucket.windowSec) > bucket.limit
        ? tooManyRequests("rate limit exceeded", bucket.windowSec)
        : null;
    }
    return count > bucket.limit ? tooManyRequests("rate limit exceeded", bucket.windowSec) : null;
  }

  if (bucket.kind === "cost" && isProduction()) {
    return unavailable(
      "rate limiting is not configured",
      "set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable this endpoint in production",
    );
  }

  if (isProduction()) {
    warnOnce(
      "no durable backend (UPSTASH_REDIS_REST_URL/TOKEN unset) — falling back to per-instance limiting, which is near-useless on serverless",
    );
  }
  return incrMemory(key, bucket.windowSec) > bucket.limit
    ? tooManyRequests("rate limit exceeded", bucket.windowSec)
    : null;
}

/** Identity for a rate-limit key: the account when known, else the caller's IP. */
export const rateLimitIdentity = (req: Request, userId?: string | null) =>
  userId ? `u:${userId}` : `ip:${clientIp(req)}`;
