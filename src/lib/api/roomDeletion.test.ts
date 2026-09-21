// Run: npm run test:security
//
// Regression tests for the cross-user room-deletion hole (SECURITY_AUDIT.md F-01):
// account deletion and the retention purge used to hand every `projects.live_room_id`
// on the caller's rows to Liveblocks `deleteRoom` with the service key. That column
// is client-written and also carries the room of every plan SHARED WITH the user, so
// a collaborator deleting their account destroyed the owner's live room.

import assert from "node:assert/strict";
import { partitionRoomsForDeletion, isOwnedRoom } from "./roomDeletion";

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

const MINE = "7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d";
const THEIRS = "aaaaaaaa-1111-4222-8333-444444444444";

console.log("partitionRoomsForDeletion");
check("a room only a project row names (a shared plan) is NEVER deletable", () => {
  const p = partitionRoomsForDeletion([THEIRS], []);
  assert.deepEqual(p.deletable, []);
  assert.deepEqual(p.foreign, [`floorplan-${THEIRS}`]);
});
check("a claimed room is deletable, in canonical form", () => {
  const p = partitionRoomsForDeletion([], [`floorplan-${MINE}`]);
  assert.deepEqual(p.deletable, [`floorplan-${MINE}`]);
  assert.deepEqual(p.foreign, []);
});
check("raw project spelling + prefixed claim spelling collapse to ONE owned room", () => {
  const p = partitionRoomsForDeletion([MINE], [`floorplan-${MINE}`]);
  assert.deepEqual(p.deletable, [`floorplan-${MINE}`]);
  assert.deepEqual(p.foreign, []);
});
check("own room + a collaborator copy: only the owned one is deletable", () => {
  const p = partitionRoomsForDeletion([MINE, THEIRS], [`floorplan-${MINE}`]);
  assert.deepEqual(p.deletable, [`floorplan-${MINE}`]);
  assert.deepEqual(p.foreign, [`floorplan-${THEIRS}`]);
});
check("a hostile row pointing at an arbitrary string cannot make it deletable", () => {
  const p = partitionRoomsForDeletion(["floorplan-victim-room-1234", "../../x", ""], []);
  assert.deepEqual(p.deletable, []);
});
check("null / undefined / empty entries are ignored", () => {
  const p = partitionRoomsForDeletion([null, undefined, ""], [null, undefined, ""]);
  assert.deepEqual(p, { deletable: [], foreign: [] });
});

console.log("isOwnedRoom");
check("matches across the raw and prefixed spellings", () => {
  assert.equal(isOwnedRoom(MINE, [`floorplan-${MINE}`]), true);
  assert.equal(isOwnedRoom(`floorplan-${MINE}`, [`floorplan-${MINE}`]), true);
});
check("does not match a different room", () => {
  assert.equal(isOwnedRoom(THEIRS, [`floorplan-${MINE}`]), false);
  assert.equal(isOwnedRoom(THEIRS, []), false);
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
