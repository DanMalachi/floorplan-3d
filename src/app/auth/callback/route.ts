import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Where Google sends the user back to. Trades the one-time code for a session,
// which lands in cookies, then drops them back into the editor. `?claim=1` tells
// the client this arrival is a fresh sign-in, so the sync engine knows to offer
// this browser's local projects to the account.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) return NextResponse.redirect(`${origin}${next}`);

  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.redirect(`${origin}${next}`);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}${next}?authError=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}${next}?claim=1`);
}
