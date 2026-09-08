// Who is allowed to do what in a live room.
//
// THE HOLE THIS EXISTS TO CLOSE: minting a share grant used to require nothing at
// all, and joining a room without a grant used to be treated as "host, full
// access". Between them, knowing a room id — which every view-link recipient
// does — was enough to obtain write access to someone else's home design.
//
// The model now has exactly two ways to be authorized, and nothing else:
//
//   OWNERSHIP  — you created the room. Owners may mint any role.
//   ATTENUATION — you already hold a valid grant for the room, so you may mint
//                 grants at your own role or BELOW, never above. A view recipient
//                 re-sharing a view link is harmless (they could forward their own
//                 link anyway); a view recipient minting "build" is the attack, and
//                 rank comparison is what stops it.
//
// Ownership itself is proven server-side, two ways:
//
//   1. public.live_rooms in Supabase (migration 0002) — authoritative once applied.
//      A security-definer RPC answers owner/other/free WITHOUT leaking who the
//      other owner is, which RLS alone cannot do (an RLS select can't distinguish
//      "owned by someone else" from "not claimed").
//   2. A signed, HttpOnly owner cookie — the fallback for a deployment with no
//      Supabase at all, and the record of a claim the database already confirmed.
//      It is deliberately NOT accepted when the database says the room belongs to
//      someone else, and — the other half of the same rule — it is never ISSUED to
//      paper over a database that failed to answer. A cookie minted on an outage
//      would be believed by every later request that also cannot reach the
//      database, which is exactly when it is least deserved. See claimRoom.
//
// Claiming is first-come-wins (trust on first use), the same shape the old
// browser-local `setRoomOwner` had — except now the server records it, so a second
// browser cannot simply assert it.

import { cookies } from "next/headers";
import { signBlob, verifyBlob } from "@/collab/grant.server";
import type { ShareRole } from "@/collab/share";
import { getServerSupabase } from "@/lib/supabase/server";
import { accountsConfigured } from "./auth";
import { forbidden, unauthorized, unavailable, isProduction } from "./http";
import { canAttenuateTo, claimOutcome, isUnguessableRoom, type OwnerState } from "./roomPolicy";

// The pure predicates live in ./roomPolicy so they can be unit-tested without a
// Next request context; re-exported here so callers have one import.
export {
  isValidRoom,
  isUnguessableRoom,
  ROLE_RANK,
  canAttenuateTo,
  claimOutcome,
} from "./roomPolicy";
export type { OwnerState, ClaimOutcome } from "./roomPolicy";

// ---------------------------------------------------------------------------
// Owner cookie
// ---------------------------------------------------------------------------

const COOKIE = "fp_owned_rooms";
const COOKIE_TAG = "owned-rooms";
const COOKIE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REMEMBERED = 40; // a browser owning more rooms than this is not a real user

async function readOwnedCookie(): Promise<string[]> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  const rooms = verifyBlob<string[]>(COOKIE_TAG, raw);
  return Array.isArray(rooms) ? rooms : [];
}

async function writeOwnedCookie(rooms: string[]): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, signBlob(COOKIE_TAG, rooms.slice(-MAX_REMEMBERED), COOKIE_TTL_MS), {
    httpOnly: true, // never readable by page JS — it is an authorization credential
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: Math.floor(COOKIE_TTL_MS / 1000),
  });
}

async function rememberOwned(room: string): Promise<void> {
  const rooms = await readOwnedCookie();
  if (rooms.includes(room)) return;
  await writeOwnedCookie([...rooms, room]);
}

// ---------------------------------------------------------------------------
// Database ownership (migration 0002_live_rooms.sql)
// ---------------------------------------------------------------------------

/** Unreachable database / unapplied migration / signed-out caller all return null. */
async function dbOwnerState(room: string, userId: string | null): Promise<OwnerState | null> {
  if (!userId) return null;
  const supabase = await getServerSupabase().catch(() => null);
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("live_room_owner_state", { p_room_id: room });
  if (error) return null; // includes "function does not exist" before the migration
  return data === "owner" || data === "other" || data === "free" ? data : null;
}

/**
 * First-come-wins insert. Returns who owns it afterwards, or null if unavailable.
 *
 * null is ALWAYS "no answer", never "the room is free": claim_live_room returns
 * 'owner' or 'other' and nothing else, so every null here is a client that could
 * not be built, an RPC that errored, or a migration that is not applied. Callers
 * must not read it as permission — see claimOutcome in ./roomPolicy.
 */
async function dbClaim(room: string, userId: string | null): Promise<OwnerState | null> {
  if (!userId) return null;
  const supabase = await getServerSupabase().catch(() => null);
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("claim_live_room", { p_room_id: room });
  if (error) return null;
  return data === "owner" || data === "other" ? data : null;
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/** Does the caller own this room? Database is authoritative; cookie is the fallback. */
export async function ownsRoom(room: string, userId: string | null): Promise<boolean> {
  const state = await dbOwnerState(room, userId);
  if (state === "owner") return true;
  // "other" is a definitive no: a stale cookie must not outrank the database.
  if (state === "other") return false;
  return (await readOwnedCookie()).includes(room);
}

export type ClaimResult = "claimed" | "already-yours" | "taken" | "not-allowed" | "unavailable";

/**
 * Claim `room` for the caller. Called only when a room is first created (Go live).
 *
 * Two rules keep this from being the hole all over again.
 *
 * FIRST: when accounts are configured, claiming REQUIRES sign-in. Otherwise a link
 * recipient could claim the room they were merely invited to and mint themselves a
 * build grant.
 *
 * SECOND: creating ownership requires the database to SAY SO. This used to fall
 * through to the cookie whenever dbClaim returned null — but null is "the database
 * did not answer", never "the room is free", so that treated an outage as consent.
 * A signed-in caller retrying "Go live" against a flaky Supabase could walk away
 * holding an owner cookie for a room someone else legitimately owns, and ownsRoom
 * believes that cookie in exactly the conditions that produced it (the database is
 * unreachable, so nothing can contradict it). An unconfirmed claim now mints
 * nothing and returns "unavailable" — a retryable "ask me again", not a denial.
 *
 * The cost is bounded and deliberate: an owner who has claimed before is already
 * past this, answered "already-yours" by ownsRoom's cookie fallback above. Only a
 * genuine FIRST claim has to wait for the database to come back, and a caller who
 * merely wants back INTO the room is not blocked at all — authorizeMint takes an
 * unconfirmed claim as a non-answer and falls through to the grant they hold.
 * Better an occasional "try again" than one wrong ownership grant.
 */
export async function claimRoom(room: string, userId: string | null): Promise<ClaimResult> {
  if (await ownsRoom(room, userId)) return "already-yours";

  if (accountsConfigured()) {
    if (!userId) return "not-allowed"; // guests may join rooms, not own them
    // "claimed" only on a definite 'owner'; "taken" on 'other'; "unavailable" on
    // the null that means unreachable database or unapplied migration. Those last
    // two are not worth telling apart: an unapplied migration is a deployment that
    // has no authoritative record to claim in yet, and inventing ownership on
    // either one is the same mistake.
    const outcome = claimOutcome(await dbClaim(room, userId));
    if (outcome === "claimed") await rememberOwned(room);
    return outcome;
  }

  // No Supabase at all — a guest-only deployment. The cookie is the only record,
  // so a claim is only safe on a room id nobody can guess.
  if (isUnguessableRoom(room) || process.env.SHARE_LEGACY_ROOM_CLAIM === "true") {
    await rememberOwned(room);
    return "claimed";
  }
  return "not-allowed";
}

// ---------------------------------------------------------------------------
// The authorization decisions the routes actually ask for
// ---------------------------------------------------------------------------

export interface GrantHeld {
  room: string;
  role: ShareRole;
  exp?: number;
}

export type MintDecision =
  | { ok: true; role: ShareRole; ttlMs?: number }
  | { ok: false; response: Response };

/**
 * May the caller mint a grant for (room, requested)?
 *
 * `held` is the caller's own verified grant for this room, if any — the browser
 * sends the ?g= it is currently using. A derived grant never outlives the grant it
 * was derived from, so re-sharing cannot be used to extend a link indefinitely.
 */
export async function authorizeMint(opts: {
  room: string;
  requested: ShareRole;
  held: GrantHeld | null;
  create: boolean;
  userId: string | null;
}): Promise<MintDecision> {
  const { room, requested, held, create, userId } = opts;

  // A claim attempt is an OPPORTUNITY, never a gate. `create` is set on every
  // "Go live", including by a collaborator re-entering a room someone else owns —
  // so a failed claim must fall through to the grant they legitimately hold
  // rather than turning "you don't own this" into "you can't come in". That
  // applies to "unavailable" (the database did not answer) exactly as it does to
  // "taken": the held grant below is verified by signature alone and needs no
  // database, so an outage never shuts a collaborator out of a live room.
  let claim: ClaimResult | null = null;
  if (create) {
    claim = await claimRoom(room, userId);
    if (claim === "claimed" || claim === "already-yours") return { ok: true, role: requested };
  } else if (await ownsRoom(room, userId)) {
    return { ok: true, role: requested };
  }

  if (held && held.room === room) {
    if (!canAttenuateTo(held.role, requested)) {
      return {
        ok: false,
        response: forbidden(
          "cannot share above your own access",
          `you hold "${held.role}" for this room`,
        ),
      };
    }
    // Never outlive the parent link.
    const remaining = held.exp ? held.exp - Date.now() : undefined;
    if (remaining !== undefined && remaining <= 0) {
      return { ok: false, response: forbidden("your access to this room has expired") };
    }
    return { ok: true, role: requested, ttlMs: remaining };
  }

  // Nothing authorized this caller. Say which of the two doors was the near miss.
  //
  // "unavailable" is a THIRD answer and must not be spelled as either of them: the
  // caller is signed in (claimRoom only reaches it with a user), so "sign in" would
  // be a lie that bounces them to the sign-in page, and 403 would tell them they
  // are barred from a room that may well be theirs to claim once Supabase answers.
  // 503 is the honest one — nothing is wrong with the caller, only with us.
  if (claim === "unavailable") {
    return {
      ok: false,
      response: unavailable(
        "could not verify who owns this room",
        "the ownership record is temporarily unreachable, so a new room cannot be claimed right now — try again in a moment",
      ),
    };
  }
  if (claim === "not-allowed") {
    return {
      ok: false,
      response: accountsConfigured()
        ? unauthorized("sign in to create a shared room")
        : forbidden(
            "this room cannot be claimed",
            "a room created before share ownership existed can only be re-entered with a valid share link, or by setting SHARE_LEGACY_ROOM_CLAIM=true",
          ),
    };
  }
  return {
    ok: false,
    response: forbidden(
      "you do not have access to this room",
      "open the room with a share link, or sign in as its owner",
    ),
  };
}

/**
 * The role a joiner gets. Ownership and the grant are both considered, and the
 * better of the two wins — an owner who happens to open their own view link is
 * still the owner. `null` means no access at all, which is the case that used to
 * silently mean "build".
 */
export async function resolveJoinRole(opts: {
  room: string;
  held: GrantHeld | null;
  userId: string | null;
}): Promise<ShareRole | null> {
  const { room, held, userId } = opts;
  const fromGrant = held && held.room === room ? held.role : null;
  // "build" is the top role, so an owner is never improved on by their own grant.
  if (await ownsRoom(room, userId)) return "build";
  return fromGrant;
}
