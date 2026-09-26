// Run: npm run test:security (or `npx tsx src/lib/auth/signOutGuard.test.ts`)
//
// F-18: sign-out must not leave unsynced work behind without saying so. This
// is the pure decision `useSignOutGuard` gates on — every SyncStatus paired
// with every "does it matter" pending count.

import assert from "node:assert/strict";
import { needsSignOutConfirm } from "./signOutGuard";
import type { SyncStatus } from "@/store/useSyncStore";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message}`);
  }
}

console.log("needsSignOutConfirm");
check("a guest (no account) is never interrupted, regardless of pending", () => {
  assert.equal(needsSignOutConfirm("off", 0), false);
  assert.equal(needsSignOutConfirm("off", 3), false);
});
check("signed in, everything pushed: no interruption", () => {
  assert.equal(needsSignOutConfirm("idle", 0), false);
});
check("THE GATE: idle status but a nonzero pending count still confirms", () => {
  // Guards against a status that hasn't caught up with a just-queued edit.
  assert.equal(needsSignOutConfirm("idle", 1), true);
});
check("mid-sync: confirms even with pending 0 (a push could be in flight)", () => {
  assert.equal(needsSignOutConfirm("syncing", 0), true);
});
check("offline with queued work: confirms", () => {
  assert.equal(needsSignOutConfirm("offline", 2), true);
});
check("a stuck error state: confirms even if the count reads 0", () => {
  assert.equal(needsSignOutConfirm("error", 0), true);
});
check("a kept-both conflict: confirms — the user has not looked at it yet", () => {
  assert.equal(needsSignOutConfirm("conflict", 0), true);
});
check("every non-'off' non-'idle' SyncStatus confirms at pending 0", () => {
  const statuses: SyncStatus[] = ["syncing", "offline", "error", "conflict"];
  for (const s of statuses) {
    assert.equal(needsSignOutConfirm(s, 0), true, `status ${s} should confirm`);
  }
});

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
