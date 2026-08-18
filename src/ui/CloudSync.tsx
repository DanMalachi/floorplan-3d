"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth/useSession";
import { whenProjectsReady } from "@/store/projectPersistence";
import { startSync, stopSync } from "@/store/syncEngine";

// -----------------------------------------------------------------------------
// Headless: turns cloud sync on while someone is signed in, and off when they
// aren't. Mounted once in the editor.
//
// Waits for the local gallery to finish loading first — sync's whole job is to
// compare the two sides, and comparing against a manifest that hasn't been read
// yet would look like "this account has projects that this device doesn't" and
// re-download everything.
// -----------------------------------------------------------------------------

export function CloudSync() {
  const { user } = useSession();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      stopSync();
      return;
    }
    let cancelled = false;
    void (async () => {
      await whenProjectsReady();
      if (!cancelled) await startSync(userId);
    })();
    return () => {
      cancelled = true;
      stopSync();
    };
  }, [userId]);

  return null;
}
