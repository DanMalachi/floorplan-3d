// The pure half of room authorization: what a room id may look like, and which
// role may hand out which other role. Kept free of next/headers and Supabase so
// the rules that decide access can be tested directly (roomPolicy.test.ts) rather
// than only through a running server.

import type { ShareRole } from "@/collab/share";

/** Liveblocks room strings are `floorplan-<share id>` (see collab/share.ts). */
const ROOM_RE = /^floorplan-[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/;

export const isValidRoom = (room: string) => ROOM_RE.test(room);

/**
 * True when the share id is a full UUID. New rooms use crypto.randomUUID() whole;
 * rooms created before this change used only its first 8 characters — 32 bits,
 * which is enumerable. That difference decides whether a deployment with no
 * database may accept a first-come ownership claim: an unguessable id makes
 * "whoever asks first" safe, an 8-character one does not.
 */
export const isUnguessableRoom = (room: string) =>
  /^floorplan-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room);

/** The caller's relationship to a room, as the database reports it. */
export type OwnerState = "owner" | "other" | "free";

/** What a claim attempt resolved to. "unavailable" means the database never answered. */
export type ClaimOutcome = "claimed" | "taken" | "unavailable";

/**
 * Turn the database's answer to a claim into a decision.
 *
 * The load-bearing case is `null`. The claim RPC itself only ever returns 'owner'
 * or 'other' (migration 0002), so null never means "the room is free" — it means
 * the question did not get through: unreachable Supabase, an unapplied migration,
 * a failed RPC. Ownership may only be CREATED on a definite 'owner', because the
 * owner cookie a claim mints is trusted by ownsRoom precisely when the database is
 * too unwell to contradict it. Silence is not consent.
 */
export const claimOutcome = (answer: OwnerState | null): ClaimOutcome =>
  answer === "owner" ? "claimed" : answer === "other" ? "taken" : "unavailable";

/**
 * One entry of the signed owner cookie: the room AND the account that claimed it.
 *
 * The cookie is a fallback for when the database cannot answer, and it is
 * browser-scoped, not person-scoped — so an entry that names only the room is
 * honoured for whoever next sits at that browser (sign out, then act as a guest;
 * or sign in as someone else). Binding the entry to the claiming account means the
 * fallback can only ever confirm the same person the database already confirmed.
 * A guest-only deployment (no accounts) has no account to bind to, and uses the
 * empty prefix. Entries written before this binding was added are bare room ids,
 * match nothing here, and simply fall back to the database — which is authoritative
 * anyway.
 */
export const ownedCookieEntry = (userId: string | null, room: string) => `${userId ?? ""}|${room}`;

export const ROLE_RANK: Record<ShareRole, number> = { view: 1, decorate: 2, build: 3 };

/**
 * May a holder of `held` mint `wanted`? Only at their own level or below. This one
 * comparison is what stops a view-link recipient from minting themselves a build
 * grant — the escalation the share route used to allow outright.
 */
export const canAttenuateTo = (held: ShareRole, wanted: ShareRole) =>
  ROLE_RANK[wanted] <= ROLE_RANK[held];
