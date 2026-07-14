// Global Liveblocks type registration. Presence is what each client broadcasts
// about itself; the shared *document* (the scene) lives in a Yjs doc, not in
// Liveblocks Storage. Cursor/selection are reserved for S2 (world-anchored
// presence added with the editing bridge).

import "@liveblocks/client";

export type RemoteSelection = { kind: "wall" | "opening" | "room" | "furniture"; id: string } | null;

declare global {
  interface Liveblocks {
    Presence: {
      name: string;
      color: string; // hex
      selection: RemoteSelection; // what this user has selected (S2 presence)
    };
  }
}

export {};
