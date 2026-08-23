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

export const ROLE_RANK: Record<ShareRole, number> = { view: 1, decorate: 2, build: 3 };

/**
 * May a holder of `held` mint `wanted`? Only at their own level or below. This one
 * comparison is what stops a view-link recipient from minting themselves a build
 * grant — the escalation the share route used to allow outright.
 */
export const canAttenuateTo = (held: ShareRole, wanted: ShareRole) =>
  ROLE_RANK[wanted] <= ROLE_RANK[held];
