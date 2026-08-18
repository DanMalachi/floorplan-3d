import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// -----------------------------------------------------------------------------
// Keeps the Supabase session alive (Next 16's `proxy`, formerly `middleware`).
//
// Access tokens are short-lived. Without a refresh on the way through, a user
// who leaves a tab open comes back signed out — and any server route that reads
// the session (the Liveblocks authorizer) sees a guest. Calling getUser() here
// refreshes the token when needed and writes the new cookies onto the response.
//
// This is a no-op when accounts aren't configured, and it never blocks a
// request: the app is usable signed-out, so there is nothing to guard.
//
// Named `proxy` (not `middleware`) — Next 16 renamed the convention, and the old
// filename now fails to resolve at runtime rather than warning.
// -----------------------------------------------------------------------------

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function proxy(request: NextRequest) {
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (written) => {
        for (const { name, value } of written) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of written) response.cookies.set(name, value, options);
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Offline or Supabase unreachable — serve the page anyway; the browser
    // client will retry, and a guest session is a valid state.
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own assets and static files. The 3D app pulls
    // hundreds of .glb/.ktx2/image requests, and none of them carry a session.
    "/((?!_next/static|_next/image|favicon.ico|furniture/|materials/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|gltf|ktx2|hdr|bin)$).*)",
  ],
};
