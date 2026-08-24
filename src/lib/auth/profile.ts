// How a Supabase user is presented to people — shared by the account menu and by
// the server route that names collaborators in a live room, so both show the same
// thing. Deliberately framework-free (no "use client") and typed on the fields it
// actually reads, so a server route can import it without dragging in React.

export interface ProfileLike {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export function displayName(user: ProfileLike | null): string {
  if (!user) return "Guest";
  const meta = user.user_metadata ?? {};
  const full = typeof meta.full_name === "string" ? meta.full_name : null;
  const name = typeof meta.name === "string" ? meta.name : null;
  return full || name || user.email || "Signed in";
}

export function avatarUrl(user: ProfileLike | null): string | null {
  const meta = user?.user_metadata ?? {};
  const avatar = typeof meta.avatar_url === "string" ? meta.avatar_url : null;
  const picture = typeof meta.picture === "string" ? meta.picture : null;
  return avatar || picture || null;
}
