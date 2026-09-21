// Which live rooms an erasure or a retention purge may delete.
//
// THE HOLE THIS CLOSES: `projects.live_room_id` is a column the CLIENT writes
// (push_project takes it as a parameter, and RLS lets an owner update their own
// rows freely). It is also legitimately set to someone ELSE's room: opening a
// share link registers a local copy of the shared plan, tagged with the owner's
// room id, and cloud sync pushes that tag to the recipient's own row. Account
// deletion and the nightly purge both used to read that column and hand every
// value to Liveblocks `deleteRoom` with the service key — so a collaborator who
// deleted their account (or their copy of the plan, once the 30-day purge ran)
// destroyed the OWNER's live room, and a hostile signed-in user could aim it at
// any room id they had ever been sent a link to.
//
// A column the caller controls is a claim, not evidence. The only server-held
// evidence of ownership is `public.live_rooms` (migration 0002), written solely
// by the claim_live_room RPC. A room may be deleted on the caller's behalf only
// if that table says the caller owns it.

import { canonicalRoom } from "@/collab/share";

export interface RoomPartition {
  /** Canonical room ids the caller provably owns — safe to delete. */
  deletable: string[];
  /** Canonical room ids a project row names but the caller does NOT provably own. */
  foreign: string[];
}

/**
 * Split the rooms a set of project rows refer to into those the caller owns and
 * those they merely reference.
 *
 * `referenced`  — every `projects.live_room_id` on the caller's rows (either spelling).
 * `ownedClaims` — every `live_rooms.room_id` whose owner is the caller, fetched
 *                 server-side (service role, filtered by owner). Rooms the caller
 *                 owns are ALWAYS deletable even when no project row names them
 *                 (a claim whose project row was deleted still holds a live copy).
 */
export function partitionRoomsForDeletion(
  referenced: ReadonlyArray<string | null | undefined>,
  ownedClaims: ReadonlyArray<string | null | undefined>,
): RoomPartition {
  const owned = new Set(ownedClaims.filter((r): r is string => Boolean(r)).map(canonicalRoom));
  const named = new Set(referenced.filter((r): r is string => Boolean(r)).map(canonicalRoom));
  const foreign = [...named].filter((r) => !owned.has(r));
  return { deletable: [...owned], foreign };
}

/** True when `room` (either spelling) is in the caller's owned set. */
export function isOwnedRoom(room: string, ownedClaims: ReadonlyArray<string>): boolean {
  const canonical = canonicalRoom(room);
  return ownedClaims.some((r) => canonicalRoom(r) === canonical);
}
