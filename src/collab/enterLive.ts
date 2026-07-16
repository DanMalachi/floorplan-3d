// Navigate into a project's live room. Used by both the "Go live / Open live"
// button and the Projects gallery (opening a live project drops into its room).
// The room lives on a full-reload route, so we record room ownership (for the
// room→project mirror) and optionally stash a first-time seed BEFORE navigating.

import { mintGrant, lbRoom, type ShareRole } from "./share";
import { setRoomOwner } from "@/store/projectPersistence";
import { stashGoLiveSeed, type GoLiveSeed } from "./goLiveHandoff";

export async function enterLiveRoom(
  roomId: string,
  projectId: string | null,
  opts: { seed?: GoLiveSeed; role?: ShareRole } = {},
): Promise<void> {
  const { seed, role = "build" } = opts;
  // This browser owns the room on behalf of the project, so it mirrors edits back.
  if (projectId) await setRoomOwner(roomId, projectId);
  const grant = await mintGrant(lbRoom(roomId), role);
  // Seed is consumed only if the room is still empty (first go-live); harmless after.
  if (seed) stashGoLiveSeed(roomId, seed);
  window.location.href = `/v/${roomId}?g=${grant}`;
}
