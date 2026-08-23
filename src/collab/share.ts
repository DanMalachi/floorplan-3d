// Client-safe share primitives (no secret). A share link carries a signed grant
// in ?g=; the role inside decides which modes the viewer may use. The grant is
// verified server-side in /api/liveblocks-auth (this file only READS the role for
// UI gating — it is not the security boundary).

import type { AppMode } from "@/store/useSceneStore";

export type ShareRole = "view" | "decorate" | "build";

/** App modes each role may use (View is always allowed). */
export const ROLE_MODES: Record<ShareRole, AppMode[]> = {
  view: ["view"],
  decorate: ["view", "furnish"],
  build: ["build", "furnish", "view"],
};

export const ROLE_LABEL: Record<ShareRole, string> = {
  view: "Can view",
  decorate: "Can view + decorate",
  build: "Can edit everything",
};

/** Liveblocks room id for a share id. */
export const lbRoom = (id: string) => `floorplan-${id}`;

/** Decode a grant's payload without verifying it. UI-only — never a security check. */
function payloadOf(grant: string): { room?: string; role?: string } | null {
  try {
    const body = grant.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(body));
  } catch {
    return null;
  }
}

// A recipient's grant arrives once, in the URL of the link they were sent. When
// they later reopen the same project from their own gallery there is no ?g= —
// but the server now requires proof of access before it will mint anything. So
// the grant is kept per room, and replayed as that proof. It is a capability the
// user was legitimately given; storing it locally hands out nothing new.
const GRANT_KEY = (room: string) => `fp:grant:${room}`;

const RANK: Record<ShareRole, number> = { view: 1, decorate: 2, build: 3 };
const rankOf = (grant: string | null): number => {
  const role = grant ? payloadOf(grant)?.role : null;
  return role === "view" || role === "decorate" || role === "build" ? RANK[role] : 0;
};

function rememberGrant(grant: string): void {
  const room = payloadOf(grant)?.room;
  if (!room || typeof window === "undefined") return;
  // Keep the strongest grant held for this room. Minting a view link to send to
  // someone else must not demote the build access you were minting it with.
  if (rankOf(grant) < rankOf(rememberedGrant(room))) return;
  try {
    window.localStorage.setItem(GRANT_KEY(room), grant);
  } catch {
    /* private mode / quota — the link still works, gallery re-entry just won't */
  }
}

function rememberedGrant(room: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(GRANT_KEY(room));
  } catch {
    return null;
  }
}

/** Read the role out of a grant for UI gating. No grant = no claim to anything, so
 *  the UI shows its most restricted form; the server decides the truth (an owner
 *  arriving without ?g= is still served build access by /api/liveblocks-auth).
 *  This used to default to "build", which offered edit tools to link recipients.
 *
 *  Side effect by design: this is the one call every room entry makes, so it is
 *  where an arriving grant gets remembered for later gallery re-entry. */
export function roleFromGrant(grant: string | null | undefined): ShareRole {
  if (!grant) return "view";
  rememberGrant(grant);
  const role = payloadOf(grant)?.role;
  return role === "view" || role === "decorate" || role === "build" ? role : "view";
}

/** The caller's proof of access to `room`: the ?g= it was opened with, or the one
 *  remembered from the link that first brought them here. */
export function currentGrant(room?: string): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = new URLSearchParams(window.location.search).get("g");
  if (fromUrl && (!room || payloadOf(fromUrl)?.room === room)) return fromUrl;
  return room ? rememberedGrant(room) : fromUrl;
}

/**
 * POST /api/share to mint a signed grant for (room, role).
 *
 * The server authorizes this now, so it can fail: you may only mint at or below
 * your own role, and only an owner may mint for a room they hold no grant for.
 * `create: true` claims a brand-new room (first "Go live").
 */
export async function mintGrant(
  room: string,
  role: ShareRole,
  opts: { create?: boolean } = {},
): Promise<string> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room, role, holding: currentGrant(room), create: opts.create ?? false }),
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b: { error?: string }) => b?.error)
      .catch(() => null);
    throw new Error(detail ?? "share failed");
  }
  const grant = (await res.json()).grant as string;
  rememberGrant(grant);
  return grant;
}
