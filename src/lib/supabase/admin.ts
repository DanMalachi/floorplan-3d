import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------------
// THE SERVICE-ROLE CLIENT. Read this before importing it anywhere.
//
// `SUPABASE_SERVICE_ROLE_KEY` is not "a more powerful API key" — it is a JWT
// minted with the `service_role` claim, and Postgres runs its statements with
// RLS **bypassed entirely**. Every `owner = auth.uid()` policy in
// supabase/migrations/0001_projects.sql becomes a no-op for a request carrying
// it. Anyone holding it can read, rewrite, or delete every account's plans.
// There is exactly one thing in this product that genuinely cannot be done
// without it (deleting a row from `auth.users`), so it exists for that, plus the
// scheduled retention sweep, which has to act with no user session at all.
//
// How it is kept off the client bundle — three independent barriers:
//
//   1. The var name has no `NEXT_PUBLIC_` prefix. Next only inlines
//      `NEXT_PUBLIC_*` into browser bundles; every other `process.env.X` read
//      from client code compiles to `undefined`. So even a mistaken import
//      cannot carry the value across.
//   2. `assertServer()` throws if a browser ever evaluates this module, so that
//      mistake fails loudly in dev instead of silently shipping a null client.
//   3. Only route handlers pinned to `runtime = "nodejs"` import this file, and
//      each one is under src/app/api/account/ — a server-only directory.
//
// The rule that keeps all three true: **nothing under src/ui, src/store, or any
// file carrying "use client" may import this module.** If you need something it
// can do, put it behind a route handler.
// -----------------------------------------------------------------------------

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * True when this deployment can perform privileged operations (account deletion,
 * the retention sweep). False is a legitimate state — a local checkout or a
 * guest-only deployment — and the UI asks this before offering the button, so a
 * user never gets a delete control that 500s.
 */
export const serviceRoleConfigured = Boolean(url && serviceRoleKey);

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "supabase/admin.ts was imported into browser code. The service-role key bypasses every RLS policy; move this call behind a route handler.",
    );
  }
}

/**
 * A Supabase client bound to the service role.
 *
 * Fails loudly rather than degrading: a deployment that has accounts but no
 * service-role key must not silently "succeed" at deleting an account while
 * leaving the auth user alive. Callers catch this and return 503 with the name
 * of the missing var.
 *
 * Constructed per call (not memoised) so it never accumulates state, and with
 * session persistence off — there is no user to persist and writing tokens to a
 * shared server-side store would be a cross-request leak.
 */
export function getAdminSupabase(): SupabaseClient {
  assertServer();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — refusing to run a privileged operation that would only half-complete.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
