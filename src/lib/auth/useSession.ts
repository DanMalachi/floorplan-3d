"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

// -----------------------------------------------------------------------------
// Who is signed in, if anyone. The one hook the UI reads.
//
// `user === null` is the normal guest state, not an error — the editor works the
// same either way; a session only decides whether projects also live in the
// cloud. `loading` is true only until the first session read resolves, so the
// account control doesn't flash "Sign in" at someone who is already signed in.
// -----------------------------------------------------------------------------

export interface SessionState {
  user: User | null;
  loading: boolean;
  /** False when this deployment has no Supabase configured at all. */
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Display name for a signed-in user: their Google name, else their email. */
export function displayName(user: User | null): string {
  if (!user) return "Guest";
  const meta = user.user_metadata ?? {};
  return (meta.full_name as string) || (meta.name as string) || user.email || "Signed in";
}

export function avatarUrl(user: User | null): string | null {
  const meta = user?.user_metadata ?? {};
  return (meta.avatar_url as string) || (meta.picture as string) || null;
}

export function useSession(): SessionState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let live = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // No access_type/prompt overrides: we never call Google's own APIs, and
      // forcing the consent screen would re-prompt on every single sign-in.
      // Supabase issues its own refresh token either way.
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { user, loading, configured: supabaseConfigured, signInWithGoogle, signOut };
}
