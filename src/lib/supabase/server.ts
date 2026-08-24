import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// -----------------------------------------------------------------------------
// Server-side Supabase, for route handlers that need to know who is calling
// (the OAuth callback, and the Liveblocks authorizer once rooms carry real
// identities). Reads the session from cookies written by the browser client.
//
// Returns null when accounts aren't configured, for the same reason as
// client.ts: a deployment without Supabase must still serve guests.
// -----------------------------------------------------------------------------

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!url || !anonKey) return null;
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (written) => {
        try {
          for (const { name, value, options } of written) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  });
}

/** The signed-in user, or null for a guest (or an unconfigured deployment). */
export async function getServerUser() {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
