// Run: npm run test:security
//
// Short share links (supabase/migrations/0009_share_links.sql). The assertions
// that fail if a code becomes guessable, if the table ever has to hold the code
// itself, or if re-signing a stored link could revive one "Revoke links" killed.

import assert from "node:assert/strict";
import { CODE_LENGTH, generateCode, hashCode, shortCodeSchema } from "./shortLinks";
import { isRevokedBy } from "./revocation";
import { resignGrant, signGrant, verifyGrant } from "@/collab/grant.server";

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

console.log("generateCode");
check("12 characters from [A-Za-z0-9], and the schema accepts it", () => {
  for (let i = 0; i < 200; i++) {
    const c = generateCode();
    assert.equal(c.length, CODE_LENGTH);
    assert.match(c, /^[A-Za-z0-9]{12}$/);
    assert.equal(shortCodeSchema.safeParse(c).success, true);
  }
});
check("no repeats across 20,000 codes", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i++) seen.add(generateCode());
  assert.equal(seen.size, 20_000);
});
check("every character is used, none favoured (no modulo bias)", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 20_000; i++) for (const ch of generateCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  assert.equal(counts.size, 62);
  // 240,000 draws / 62 ≈ 3,871 each. A `byte % 62` bias would push the first
  // eight characters ~25% above the rest; allow ±10%.
  for (const n of counts.values()) assert.ok(n > 3_871 * 0.9 && n < 3_871 * 1.1, `count ${n}`);
});
check("the schema refuses anything else", () => {
  for (const bad of ["", "short", "k7Qm2xPa9Lz", "k7Qm2xPa9Lz4X", "k7Qm2xPa9L-4", "k7Qm2xPa9L z"]) {
    assert.equal(shortCodeSchema.safeParse(bad).success, false, bad);
  }
});

console.log("hashCode");
check("sha256 hex, deterministic, and not the code", () => {
  const c = generateCode();
  assert.match(hashCode(c), /^[0-9a-f]{64}$/);
  assert.equal(hashCode(c), hashCode(c));
  assert.ok(!hashCode(c).includes(c));
});

console.log("resignGrant");
check("re-signing stored claims gives the identical grant", () => {
  const original = signGrant({ room: ROOM, role: "decorate" });
  const g = verifyGrant(original)!;
  const again = resignGrant({ room: g.room, role: g.role, iat: g.iat!, exp: g.exp! });
  assert.equal(again, original);
});
check("iat is kept, so a link revoked before it was opened stays revoked", () => {
  const g = verifyGrant(signGrant({ room: ROOM, role: "build" }))!;
  const cutoff = g.iat! + 1; // "Revoke links" pressed just after this link was minted
  const resolved = verifyGrant(resignGrant({ room: g.room, role: g.role, iat: g.iat!, exp: g.exp! }))!;
  assert.equal(resolved.iat, g.iat);
  assert.equal(isRevokedBy(cutoff, resolved.iat), true);
});
check("exp is kept, so a short link never outlives its grant", () => {
  const past = Date.now() - 1_000;
  assert.equal(verifyGrant(resignGrant({ room: ROOM, role: "view", iat: past - 5_000, exp: past })), null);
});
check("only room, role, iat and exp are signed", () => {
  const extra = { room: ROOM, role: "view" as const, iat: 1, exp: Date.now() + 60_000, admin: true };
  const body = JSON.parse(Buffer.from(resignGrant(extra).split(".")[0], "base64url").toString());
  assert.deepEqual(Object.keys(body).sort(), ["exp", "iat", "role", "room"]);
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
