import { shareSigningConfigured } from "@/collab/grant.server";
import { serviceRoleConfigured } from "@/lib/supabase/admin";

// Uptime probe. Point an external monitor (UptimeRobot, Better Stack, Vercel's
// own checks) at /api/health and alert on a non-200 or on `ok: false`.
//
// Deliberately unauthenticated and deliberately dull: it reports whether THIS
// deployment is configured and serving, never anything about users or data. A
// health endpoint that needs a credential cannot be watched by a monitor, and
// one that leaks configuration values hands an attacker a map.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Booleans only — whether a secret is SET, never any part of its value.
  const checks = {
    accounts: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    sharing: shareSigningConfigured(),
    liveblocks: Boolean(process.env.LIVEBLOCKS_SECRET_KEY),
    rateLimiting: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    accountDeletion: serviceRoleConfigured,
  };

  // Sharing and accounts are the ones that make the app broken-in-public if
  // missing; the rest degrade rather than break, so they are reported but do not
  // fail the probe. See docs/PROVISIONING.md.
  const ok = checks.accounts && checks.sharing;

  return Response.json(
    {
      ok,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      checks,
      time: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { "cache-control": "no-store, max-age=0" },
    },
  );
}
