"use client";

import { useCallback, useState } from "react";
import { useSyncStore, type SyncStatus } from "@/store/useSyncStore";
import { syncNow } from "@/store/syncEngine";

// -----------------------------------------------------------------------------
// F-18 — sign-out must not silently lose unsynced local work.
//
// The editor is local-first: IndexedDB is the working copy, and cloud sync
// pushes it a few seconds after edits settle (src/store/syncEngine.ts). Signing
// out has never touched IndexedDB (stopSync() says so explicitly: "Local
// projects stay exactly where they are") — so no data is actually destroyed by
// today's plain sign-out. The audit's finding is about the SILENCE, not a
// deletion: someone who signs out while offline, or the instant after an edit,
// has no way to know whether that edit made it to the account before this
// browser stops being "this account" — and a shared-computer user in
// particular has no cue to make an informed choice.
//
// This hook is that cue. Before calling the real `signOut()`, it checks the
// sync store (`pending` projects with local changes not yet accepted by the
// server, or a `status` that means the last sync attempt didn't finish) and,
// only if there is something to warn about, asks the caller to render a
// confirmation instead of signing out immediately.
//
// Deliberately NOT implemented: an "and remove this device's local copy"
// option the audit mentions as one possible mitigation. Building that safely
// means telling apart THIS ACCOUNT's synced projects from plans that were
// never signed in with at all (guest projects, which are local-first by design
// and are not this account's data — see wipeLocalData's own doc comment on why
// account deletion is allowed to take everything but a shared-computer
// sign-out should not). Getting that boundary wrong is a data-loss bug, so it
// is left out rather than guessed at: sign-out here only ever offers "sync
// first" or "leave local data as it is", never a delete.
// -----------------------------------------------------------------------------

export type SignOutGuardPhase =
  | "idle" // nothing pending; no dialog needed
  | "confirm" // something unsynced/offline — asking the user to choose
  | "syncing" // "Sync and sign out" in flight
  | "syncFailed"; // sync did not finish (still offline/error) — back to "confirm" with a note

export interface SignOutGuardState {
  phase: SignOutGuardPhase;
}

/**
 * Pure decision, exported for testing: given the sync store's current
 * `status`/`pending`, should sign-out be interrupted with a confirmation?
 *
 * "off" = guest, or Supabase not configured — no account to lose sync with, so
 * sign-out is never gated. "idle" = signed in, everything already pushed.
 * Anything else (syncing, offline, error, conflict) or a nonzero pending count
 * means something in this browser has not been confirmed saved to the account.
 */
export function needsSignOutConfirm(status: SyncStatus, pending: number): boolean {
  if (status === "off") return false;
  return pending > 0 || status !== "idle";
}

/**
 * Wraps a `signOut()` implementation with the unsynced-work check. Returns
 * `state` (drive a dialog off `state.phase`) and the actions a dialog needs.
 *
 * `requestSignOut()` is the one entry point call sites should use in place of
 * calling `signOut()` directly.
 */
export function useSignOutGuard(signOut: () => Promise<void>) {
  const [phase, setPhase] = useState<SignOutGuardPhase>("idle");

  const hasUnsyncedWork = useCallback((): boolean => {
    const { pending, status } = useSyncStore.getState();
    return needsSignOutConfirm(status, pending);
  }, []);

  const requestSignOut = useCallback(() => {
    if (!hasUnsyncedWork()) {
      void signOut();
      return;
    }
    setPhase("confirm");
  }, [hasUnsyncedWork, signOut]);

  const cancel = useCallback(() => setPhase("idle"), []);

  /** "Sync and sign out": push everything outstanding, then only sign out if
   *  that actually cleared the queue. A device that is genuinely offline
   *  cannot be made to sync by asking twice — surface that rather than sign
   *  out anyway, which is the one outcome this whole guard exists to prevent. */
  const syncAndSignOut = useCallback(async () => {
    setPhase("syncing");
    try {
      await syncNow();
    } catch {
      // syncNow/reconcile already sets its own error/offline status; a thrown
      // rejection here is treated the same as "still not synced" below.
    }
    if (hasUnsyncedWork()) {
      setPhase("syncFailed");
      return;
    }
    await signOut();
    setPhase("idle");
  }, [hasUnsyncedWork, signOut]);

  /** "Sign out and keep this device's copy": today's plain sign-out. Nothing
   *  local is touched — see stopSync()'s own comment — so nothing is lost;
   *  it just stops following this account until signed in again. */
  const signOutKeepingLocal = useCallback(async () => {
    await signOut();
    setPhase("idle");
  }, [signOut]);

  return {
    state: { phase } satisfies SignOutGuardState,
    requestSignOut,
    cancel,
    syncAndSignOut,
    signOutKeepingLocal,
  };
}
