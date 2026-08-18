import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------------
// The browser's Supabase client — accounts, and (from Phase 2) the cloud copy of
// a user's projects.
//
// Everything here is OPTIONAL by design. With no Supabase env vars the app runs
// exactly as it did before: projects live in IndexedDB, there is nothing to sign
// in to, and `getSupabase()` returns null rather than throwing. Guests are a
// supported way to use this product, not a degraded one, so no code path may
// assume a session exists.
// -----------------------------------------------------------------------------

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when this deployment has accounts wired up at all. */
export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** The shared browser client, or null when accounts aren't configured. */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  // One client per tab: each instance opens its own auth listener and token
  // refresh timer, and duplicates race each other over the same session.
  client ??= createBrowserClient(url, anonKey);
  return client;
}
