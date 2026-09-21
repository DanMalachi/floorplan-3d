// Run: npm run test:security
//
// A project that vanishes from the server WITHOUT a tombstone must never be
// deleted locally (SECURITY_AUDIT.md F-29): with no backups, the device copy is
// the only copy left.

import assert from "node:assert/strict";
import { decideMissingRemote } from "./missingRemote";

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

const none = new Set<string>();

console.log("decideMissingRemote");
check("never-synced local work is claimed, not deleted", () => {
  assert.equal(decideMissingRemote({ id: "a" }, none), "claim");
});
check("THE BUG: synced before, row gone, no tombstone -> re-upload, NEVER forget", () => {
  assert.equal(decideMissingRemote({ id: "a", remoteRev: 7 }, none), "reupload");
});
check("an empty server (total loss) re-uploads every previously synced project", () => {
  for (const id of ["a", "b", "c"]) assert.equal(decideMissingRemote({ id, remoteRev: 3 }, none), "reupload");
});
check("a recorded deletion (tombstone) is honoured: forget locally", () => {
  assert.equal(decideMissingRemote({ id: "a", remoteRev: 7 }, new Set(["a"])), "forget");
});
check("a tombstone for a different project does not delete this one", () => {
  assert.equal(decideMissingRemote({ id: "a", remoteRev: 7 }, new Set(["b"])), "reupload");
});
check("remoteRev 0 counts as previously synced", () => {
  assert.equal(decideMissingRemote({ id: "a", remoteRev: 0 }, none), "reupload");
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
