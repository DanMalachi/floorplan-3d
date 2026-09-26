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
  signInWithGoogle: (opts?: { forceReauth?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
}

// Presentation lives in profile.ts so the server can name collaborators the same
// way this menu does.
export { displayName, avatarUrl } from "./profile";

export function useSession(): SessionState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  // A misconfigured Redirect URL allowlist makes Supabase fall back to the
  // project's Site URL, dropping the one-time code on "/" where nothing exchanges
  // it — the user just lands back on a page that still says "Sign in". Forward it
  // to the route that knows what to do with it rather than losing the sign-in.
  useEffect(() => {
    if (!supabaseConfigured) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code || window.location.pathname.startsWith("/auth/")) return;
    window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}`);
  }, []);

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

  const signInWithGoogle = useCallback(async (opts?: { forceReauth?: boolean }) => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // No access_type/prompt overrides on an ORDINARY sign-in: we never call
      // Google's own APIs, and forcing the consent screen would re-prompt on
      // every single sign-in. Supabase issues its own refresh token either way.
      //
      // `forceReauth` is the one exception (F-17): account deletion requires a
      // RECENT authentication, enforced server-side against `last_sign_in_at`
      // (src/lib/api/recentAuth.ts) — and `last_sign_in_at` only advances on an
      // actual round-trip through Google, not on Supabase silently refreshing
      // an existing session. `prompt: "login"` is what forces that round-trip
      // even for someone Google still has signed in.
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...(opts?.forceReauth ? { queryParams: { prompt: "login" } } : {}),
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  return { user, loading, configured: supabaseConfigured, signInWithGoogle, signOut };
}
