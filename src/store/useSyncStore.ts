import { create } from "zustand";

// -----------------------------------------------------------------------------
// What the cloud sync is doing right now, for the one line of UI that shows it.
//
// Deliberately its own tiny store rather than a slice of useSceneStore: sync
// status changes several times a minute and every useSceneStore mutation runs
// the autosave subscriber, so putting it there would churn the save path with
// state that is never saved.
// -----------------------------------------------------------------------------

export type SyncStatus =
  | "off" // no account (guest), or Supabase not configured
  | "idle" // signed in, everything pushed
  | "syncing"
  | "offline" // queued locally, will drain when the network returns
  | "error"
  | "conflict"; // another device won a race; both copies were kept

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  /** Projects with local changes not yet accepted by the server. */
  pending: number;
  /** Short human-readable detail for the status line (a conflict's copy name). */
  detail: string | null;
  setStatus: (status: SyncStatus, detail?: string | null) => void;
  setPending: (pending: number) => void;
  markSynced: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "off",
  lastSyncedAt: null,
  pending: 0,
  detail: null,
  setStatus: (status, detail = null) => set({ status, detail }),
  setPending: (pending) => set({ pending }),
  markSynced: () => set({ status: "idle", lastSyncedAt: Date.now(), pending: 0, detail: null }),
}));
