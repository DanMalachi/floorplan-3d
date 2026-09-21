// Run: npm run test:security
//
// Share-link revocation (SECURITY_AUDIT.md F-02) and the owner-cookie binding
// (F-05). These are the assertions that fail if a withdrawn link ever works again,
// or if owner rights ever survive a change of person at the same browser.

import assert from "node:assert/strict";
import { isRevokedBy } from "./revocation";
import { ownedCookieEntry } from "./roomPolicy";
import { signGrant, verifyGrant, signBlob, verifyBlob } from "@/collab/grant.server";

process.env.SHARE_SIGNING_SECRET = "test-secret-not-a-real-one-0123456789abcdef";
delete process.env.LIVEBLOCKS_SECRET_KEY;

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

const ROOM = "floorplan-7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d";

console.log("isRevokedBy");
check("a room that was never revoked revokes nothing", () => {
  assert.equal(isRevokedBy(null, 123), false);
  assert.equal(isRevokedBy(0, 123), false);
  assert.equal(isRevokedBy(0, undefined), false);
});
check("a grant minted before the cut-off is revoked", () => {
  assert.equal(isRevokedBy(2_000, 1_999), true);
});
check("a grant minted at or after the cut-off survives", () => {
  assert.equal(isRevokedBy(2_000, 2_000), false);
  assert.equal(isRevokedBy(2_000, 5_000), false);
});
check("a legacy grant with no iat is treated as minted at 0, so any revocation covers it", () => {
  assert.equal(isRevokedBy(2_000, undefined), true);
});

console.log("grants carry iat");
check("signGrant stamps iat, and it survives a verify round-trip", () => {
  const before = Date.now();
  const g = verifyGrant(signGrant({ room: ROOM, role: "view" }));
  assert.ok(g);
  assert.ok((g.iat ?? 0) >= before && (g.iat ?? 0) <= Date.now());
});
check("the end-to-end rule: revoke, then only a NEWLY minted link works", () => {
  const old = verifyGrant(signGrant({ room: ROOM, role: "build" }));
  const cutoff = Date.now() + 5; // the owner presses revoke
  const fresh = { iat: cutoff + 1 };
  assert.equal(isRevokedBy(cutoff, old?.iat), true);
  assert.equal(isRevokedBy(cutoff, fresh.iat), false);
});
check("a non-numeric iat is rejected outright", () => {
  const body = Buffer.from(JSON.stringify({ room: ROOM, role: "view", exp: Date.now() + 1e6, iat: "0" })).toString("base64url");
  // Sign with the real key so ONLY the shape check can refuse it.
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const sig = crypto.createHmac("sha256", process.env.SHARE_SIGNING_SECRET!).update(body).digest("base64url");
  assert.equal(verifyGrant(`${body}.${sig}`), null);
});
check("editing iat in a signed grant breaks the signature (cannot back-date past a revocation)", () => {
  const g = signGrant({ room: ROOM, role: "view" });
  const [body, sig] = g.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  payload.iat = 0;
  const forged = Buffer.from(JSON.stringify(payload)).toString("base64url");
  assert.equal(verifyGrant(`${forged}.${sig}`), null);
});

console.log("owner cookie binding");
check("an entry names the claiming account, so it does not match another user or a guest", () => {
  const mine = ownedCookieEntry("user-a", ROOM);
  assert.notEqual(mine, ownedCookieEntry("user-b", ROOM));
  assert.notEqual(mine, ownedCookieEntry(null, ROOM));
});
check("a legacy bare-room entry matches no account", () => {
  for (const who of ["user-a", null]) assert.notEqual(ROOM, ownedCookieEntry(who, ROOM));
});
check("the cookie still round-trips and cannot be replayed as a grant", () => {
  const cookie = signBlob("owned-rooms", [ownedCookieEntry("user-a", ROOM)], 60_000);
  assert.deepEqual(verifyBlob<string[]>("owned-rooms", cookie), [ownedCookieEntry("user-a", ROOM)]);
  assert.equal(verifyGrant(cookie), null);
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
