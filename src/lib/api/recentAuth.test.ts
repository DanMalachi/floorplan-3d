// Run: npm run test:security (or `npx tsx src/lib/api/recentAuth.test.ts`)
//
// F-17: account deletion must require a RECENT sign-in, enforced server-side —
// not merely a UI hint. These assertions are the contract `isRecentlyAuthenticated`
// makes with /api/account/delete: everything that isn't a fresh, parseable,
// non-future timestamp fails closed.

import assert from "node:assert/strict";
import { isRecentlyAuthenticated, RECENT_AUTH_WINDOW_MS } from "./recentAuth";

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

const NOW = 1_800_000_000_000; // fixed instant so the tests don't depend on wall clock

console.log("isRecentlyAuthenticated");
check("a sign-in one second ago is recent", () => {
  assert.equal(isRecentlyAuthenticated(new Date(NOW - 1000).toISOString(), NOW), true);
});
check("a sign-in exactly at the window edge is still recent", () => {
  assert.equal(isRecentlyAuthenticated(new Date(NOW - RECENT_AUTH_WINDOW_MS).toISOString(), NOW), true);
});
check("THE GATE: a sign-in just past the window is not recent", () => {
  assert.equal(isRecentlyAuthenticated(new Date(NOW - RECENT_AUTH_WINDOW_MS - 1).toISOString(), NOW), false);
});
check("an hour-old session (the ordinary long-lived case) is not recent", () => {
  assert.equal(isRecentlyAuthenticated(new Date(NOW - 60 * 60 * 1000).toISOString(), NOW), false);
});
check("FAIL CLOSED: missing last_sign_in_at is never treated as recent", () => {
  assert.equal(isRecentlyAuthenticated(null, NOW), false);
  assert.equal(isRecentlyAuthenticated(undefined, NOW), false);
});
check("FAIL CLOSED: an unparseable value is not recent", () => {
  assert.equal(isRecentlyAuthenticated("not-a-date", NOW), false);
  assert.equal(isRecentlyAuthenticated("", NOW), false);
});
check("FAIL CLOSED: a timestamp in the future is not recent either", () => {
  // Defensive: a clock skew or a forged value ahead of "now" must not read as
  // fresher than a real recent sign-in would.
  assert.equal(isRecentlyAuthenticated(new Date(NOW + 60_000).toISOString(), NOW), false);
});

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
