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

// Role labels are UI copy and live in messages (`collabRoom.roles.*`).

const ROOM_PREFIX = "floorplan-";

/** Liveblocks room id for a share id. */
export const lbRoom = (id: string) => `${ROOM_PREFIX}${id}`;

/**
 * The canonical Liveblocks room id, whichever of the two shapes you were handed.
 *
 * The same logical room is spelled two ways in the database: `projects.live_room_id`
 * holds the RAW share id ("Go live" writes `crypto.randomUUID()` verbatim), while
 * `live_rooms.room_id` — and Liveblocks itself — hold the `floorplan-` prefixed
 * form. Client code never notices, because it always reads the raw id and passes it
 * through `lbRoom` on the way out. Server-side deletion does notice: it reads from
 * BOTH tables, and a raw id handed to `deleteRoom` (or matched against
 * `live_rooms.room_id`) hits nothing and reports no error — the scene survives a
 * deletion the user was told had happened.
 *
 * Idempotent by design: the delete route unions both sources into one list, so this
 * must leave an already-prefixed id untouched rather than prefix it twice.
 */
export const canonicalRoom = (id: string) => (id.startsWith(ROOM_PREFIX) ? id : lbRoom(id));

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

/**
 * Find a grant in a URL's fragment or query string, fragment first. Pure — takes
 * the two pieces rather than reading `window.location` — so the parsing itself is
 * unit-testable without a DOM (see share.test.ts).
 *
 * New links (minted by this build) carry the grant in the fragment (`#g=…`),
 * which a browser never sends in the request line, a Referer header, or a
 * server access log — the fix for F-20 (grant in URL query). Links already sent
 * to people before this shipped used the query form (`?g=…`) and MUST keep
 * working, so it is read here as a fallback, never dropped.
 */
export function pickGrantFrom(search: string, hash: string): string | null {
  const fromHash = new URLSearchParams(hash.replace(/^#/, "")).get("g");
  if (fromHash) return fromHash;
  return new URLSearchParams(search.replace(/^\?/, "")).get("g");
}

/** `pickGrantFrom` against the real address bar. */
export function grantFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return pickGrantFrom(window.location.search, window.location.hash);
}

/**
 * Take a grant out of the visible URL (query or fragment) without a navigation,
 * once it has been captured (remembered in localStorage by `roleFromGrant`/
 * `currentGrant`). Keeps it out of this tab's later history entries and off the
 * address bar; for an old-format (`?g=`) link it is the only way to stop that
 * exposure going forward, since the initial request to the server already
 * carried it before this can run.
 */
export function stripGrantFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("g") && !url.hash) return;
  url.searchParams.delete("g");
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.toString());
}

/** The caller's proof of access to `room`: the grant it was opened with (fragment
 *  or, for an older link, query), or the one remembered from the link that first
 *  brought them here. */
export function currentGrant(room?: string): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = grantFromLocation();
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

/**
 * POST /api/share/revoke — withdraw every share link minted for `room` so far.
 * Owner only (the server decides); anything else rejects. New links minted after
 * this keep working. Grants this browser remembered for the room are cleared too,
 * so a stale strong grant is not replayed as proof of access it no longer confers.
 */
export async function revokeAllLinks(room: string): Promise<void> {
  const res = await fetch("/api/share/revoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room }),
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b: { error?: string }) => b?.error)
      .catch(() => null);
    throw new Error(detail ?? "revoke failed");
  }
  try {
    window.localStorage.removeItem(GRANT_KEY(room));
  } catch {
    /* private mode — nothing was stored */
  }
}
