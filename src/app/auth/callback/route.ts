import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { logError } from "@/lib/api/log";

export const runtime = "nodejs";

// Where Google sends the user back to. Trades the one-time code for a session,
// which lands in cookies, then drops them back into the editor. `?claim=1` tells
// the client this arrival is a fresh sign-in, so the sync engine knows to offer
// this browser's local projects to the account.

/**
 * `next` is concatenated onto our own origin, so it has to be a path on this
 * site and nothing else. Without this check `?next=//evil.com` produces
 * `https://done.design//evil.com` — a protocol-relative URL that browsers
 * resolve to evil.com, turning the callback into an open redirect that borrows
 * this domain's credibility for a phishing page. A backslash does the same job
 * in some parsers, so it is rejected too.
 *
 * Anything that isn't a plain in-site path falls back to the default rather
 * than erroring: a malformed `next` should not stop a legitimate sign-in from
 * completing.
 */
function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Default is the editor. That is the same destination this route has always
  // used — it was spelled `/` back when the editor was served from the site
  // root, and the move to /design keeps the behaviour rather than changing it.
  //
  // Signing in from the marketing header therefore also lands in the editor,
  // which is the right destination anyway: `?claim=1` is what tells the sync
  // engine to offer this browser's local plans to the new account, and that
  // only runs inside the app. Returning the visitor to the page they signed in
  // from would need `?next=` on `redirectTo`, which silently breaks Supabase's
  // Redirect URLs matching — see the comment in src/lib/auth/useSession.ts.
  const next = safeNext(searchParams.get("next"), "/design");

  // Google or Supabase refused before we ever got a code. Carry the reason back
  // to the UI as a fixed code, never the provider's own text — that text is
  // arbitrary and rendering it verbatim under our brand is a content-spoofing
  // hole (a crafted `?authError=` used to render as-is). The raw message still
  // goes to the server log/Sentry, where it's useful without being on screen.
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  if (errorParam || errorDescription) {
    logError("auth/callback", new Error(errorDescription ?? errorParam ?? "unknown"), {
      reason: errorParam ?? "unknown",
    });
    // `access_denied` is Google's code for the user backing out of the consent
    // screen — not a failure, just a change of mind, so it gets its own message.
    const authErrorCode = errorParam === "access_denied" ? "cancelled" : "failed";
    return NextResponse.redirect(`${origin}${next}?authError=${authErrorCode}`);
  }

  if (!code) return NextResponse.redirect(`${origin}${next}`);

  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.redirect(`${origin}${next}`);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logError("auth/callback", error, { reason: "exchange" });
    return NextResponse.redirect(`${origin}${next}?authError=failed`);
  }
  return NextResponse.redirect(`${origin}${next}?claim=1`);
}
