// Hands the plan you're working on to a new live room across the "Go live"
// navigation. Going live does a full page load (deliberately — it keeps the room
// free of the main app's IndexedDB autosave), which resets the in-memory store to
// its default sample scene before the room can read it. To seed the room with THIS
// plan instead, we stash the current scene + presentation in sessionStorage (which
// survives a same-tab navigation) keyed by the room id, and the room consumes it
// once on first load. Falls back silently to the store's scene if absent.

import type { Scene } from "@/schema/scene";
import type { Presentation } from "./sceneDoc";

export interface GoLiveSeed extends Presentation {
  scene: Scene;
  title?: string | null; // the owner's project name, so receivers can mirror it
}

const key = (roomId: string) => `golive-seed:${roomId}`;

export function stashGoLiveSeed(roomId: string, seed: GoLiveSeed): void {
  try {
    sessionStorage.setItem(key(roomId), JSON.stringify(seed));
  } catch {
    /* private mode / quota — the room just falls back to the default seed */
  }
}

/** Read and remove the handoff for a room (single-use, so a later empty room in
 *  the same tab doesn't accidentally reseed from a stale plan). */
export function consumeGoLiveSeed(roomId: string): GoLiveSeed | null {
  try {
    const raw = sessionStorage.getItem(key(roomId));
    if (!raw) return null;
    sessionStorage.removeItem(key(roomId));
    return JSON.parse(raw) as GoLiveSeed;
  } catch {
    return null;
  }
}
