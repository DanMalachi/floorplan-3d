// Run: npm run test:apisec
//
// Covers the two rules that stood between a view link and someone else's home
// design, plus the signing they rest on. These are the assertions that should fail
// loudly if anyone ever "simplifies" the share route back to what it was.

import assert from "node:assert/strict";
import { canAttenuateTo, isUnguessableRoom, isValidRoom, ROLE_RANK } from "./roomPolicy";
import { signGrant, verifyGrant, signBlob, verifyBlob } from "@/collab/grant.server";

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

console.log("room id shape");
check("accepts a legacy 8-character room", () => {
  assert.equal(isValidRoom("floorplan-1a2b3c4d"), true);
});
check("accepts a full-UUID room", () => {
  assert.equal(isValidRoom("floorplan-7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d"), true);
});
check("rejects path and injection shapes", () => {
  for (const bad of [
    "floorplan-../../etc/passwd",
    "floorplan-a",
    "not-a-room",
    "floorplan-" + "x".repeat(200),
    "floorplan-a b",
    "",
  ]) {
    assert.equal(isValidRoom(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});
check("only a full UUID counts as unguessable", () => {
  assert.equal(isUnguessableRoom("floorplan-7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d"), true);
  assert.equal(isUnguessableRoom("floorplan-1a2b3c4d"), false);
});

console.log("role attenuation");
check("a role may mint itself and below", () => {
  assert.equal(canAttenuateTo("build", "view"), true);
  assert.equal(canAttenuateTo("build", "decorate"), true);
  assert.equal(canAttenuateTo("build", "build"), true);
  assert.equal(canAttenuateTo("decorate", "view"), true);
  assert.equal(canAttenuateTo("view", "view"), true);
});
check("THE ESCALATION: a role may never mint above itself", () => {
  assert.equal(canAttenuateTo("view", "build"), false);
  assert.equal(canAttenuateTo("view", "decorate"), false);
  assert.equal(canAttenuateTo("decorate", "build"), false);
});
check("build is the top rank", () => {
  assert.equal(Math.max(...Object.values(ROLE_RANK)), ROLE_RANK.build);
});

console.log("grant signing");
process.env.SHARE_SIGNING_SECRET = "test-secret-not-a-real-key";
const room = "floorplan-7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d";

check("a signed grant round-trips", () => {
  const g = verifyGrant(signGrant({ room, role: "decorate" }));
  assert.equal(g?.room, room);
  assert.equal(g?.role, "decorate");
});
check("editing the payload to upgrade the role is rejected", () => {
  const grant = signGrant({ room, role: "view" });
  const [body, sig] = grant.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  payload.role = "build";
  const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
  assert.equal(verifyGrant(forged), null);
});
check("a grant signed with another key is rejected", () => {
  const grant = signGrant({ room, role: "build" });
  process.env.SHARE_SIGNING_SECRET = "a-different-secret";
  assert.equal(verifyGrant(grant), null);
  process.env.SHARE_SIGNING_SECRET = "test-secret-not-a-real-key";
});
check("an expired grant is rejected", () => {
  assert.equal(verifyGrant(signGrant({ room, role: "build", ttlMs: -1000 })), null);
});
check("an owner cookie cannot be replayed as a grant, or vice versa", () => {
  const cookie = signBlob("owned-rooms", [room], 60_000);
  assert.equal(verifyGrant(cookie), null);
  assert.equal(verifyBlob("some-other-tag", cookie), null);
  assert.deepEqual(verifyBlob<string[]>("owned-rooms", cookie), [room]);
});
check("an owner cookie with a tampered room list is rejected", () => {
  const cookie = signBlob("owned-rooms", ["floorplan-1a2b3c4d"], 60_000);
  const [, sig] = cookie.split(".");
  const forged = `${Buffer.from(JSON.stringify({ t: "owned-rooms", v: [room], exp: Date.now() + 60_000 })).toString("base64url")}.${sig}`;
  assert.equal(verifyBlob("owned-rooms", forged), null);
});

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
