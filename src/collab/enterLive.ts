// Navigate into a project's live room. Used by both the "Go live / Open live"
// button and the Projects gallery (opening a live project drops into its room).
// The room lives on a full-reload route, so we record room ownership (for the
// room→project mirror) and optionally stash a first-time seed BEFORE navigating.

import { hardNavHref } from "@/i18n/navigation";
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
  // `create` asks the server to record room ownership as well (first-come-wins).
  // It is harmless when the room is already claimed by this caller, and it is what
  // lets the host mint a build grant later without holding one — the local
  // setRoomOwner above is a browser-side note, never an authorization.
  const grant = await mintGrant(lbRoom(roomId), role, { create: role === "build" });
  // Seed is consumed only if the room is still empty (first go-live); harmless after.
  if (seed) stashGoLiveSeed(roomId, seed);
  // Keeps the caller's locale across the reload. The share links already out in
  // the world are unprefixed and stay valid — this only affects the hand-off a
  // Hebrew session makes for itself.
  window.location.href = hardNavHref(`/v/${roomId}?g=${grant}`);
}
