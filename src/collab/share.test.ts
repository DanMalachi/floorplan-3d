// Run: npm run test:rooms
//
// One rule, and it is a deletion-safety rule: the same live room is spelled two
// ways in the database — `projects.live_room_id` keeps the RAW share id that
// "Go live" minted, `live_rooms.room_id` (and Liveblocks itself) keep the
// `floorplan-` prefixed form. The account-deletion and retention paths read from
// BOTH tables, so anything they delete or match on has to be canonicalised first.
// Getting this wrong is silent — Liveblocks answers 404 for a room name it has
// never seen, which every caller here reads as "already deleted" — so the scene
// survives an erasure the user was told had completed. These assertions are the
// only thing standing between that bug and a repeat of it.

import assert from "node:assert/strict";
import { canonicalRoom, lbRoom } from "./share";

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

const RAW = "7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d"; // as stored in projects.live_room_id
const PREFIXED = "floorplan-7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d"; // as stored in live_rooms.room_id

console.log("canonicalRoom");
check("prefixes a raw share id (the projects.live_room_id shape)", () => {
  assert.equal(canonicalRoom(RAW), PREFIXED);
  assert.equal(canonicalRoom(RAW), lbRoom(RAW));
});
check("is a no-op on an already-prefixed id (the live_rooms.room_id shape)", () => {
  assert.equal(canonicalRoom(PREFIXED), PREFIXED);
});
check("THE BUG: both spellings of one room converge, so a union de-dupes to one", () => {
  assert.equal(canonicalRoom(RAW), canonicalRoom(PREFIXED));
  assert.equal(new Set([RAW, PREFIXED].map(canonicalRoom)).size, 1);
});
check("is idempotent — applying it twice never double-prefixes", () => {
  assert.equal(canonicalRoom(canonicalRoom(RAW)), PREFIXED);
  assert.equal(canonicalRoom(canonicalRoom(canonicalRoom(RAW))), PREFIXED);
});
check("handles the legacy 8-character rooms that predate full UUIDs", () => {
  assert.equal(canonicalRoom("1a2b3c4d"), "floorplan-1a2b3c4d");
  assert.equal(canonicalRoom("floorplan-1a2b3c4d"), "floorplan-1a2b3c4d");
});
check("passes an array through .map() unbound — how the delete route calls it", () => {
  // The union in /api/account/delete maps the function reference itself, so it
  // must not depend on `this` and must ignore .map's index/array arguments.
  assert.deepEqual([RAW, PREFIXED, "1a2b3c4d"].map(canonicalRoom), [
    PREFIXED,
    PREFIXED,
    "floorplan-1a2b3c4d",
  ]);
});

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
