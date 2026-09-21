// Run: npm run test:security
//
// A share link is a capability in the URL; an error report must never store a
// working one (SECURITY_AUDIT.md F-08).

import assert from "node:assert/strict";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubUrl, scrubEvent } from "../../../sentry.shared";

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

console.log("scrubUrl");
check("redacts a share grant but keeps the room path", () => {
  const out = scrubUrl("https://done.design/v/abc-123?g=eyJyb29tIjoieCJ9.sig&utm=1");
  assert.ok(out && !out.includes("eyJyb29t") && out.includes("/v/abc-123"));
  assert.match(out!, /g=%5Bredacted%5D/);
  assert.match(out!, /utm=1/);
});
check("redacts an OAuth code and drops the fragment entirely", () => {
  const out = scrubUrl("/auth/callback?code=SECRETCODE#access_token=zzz");
  assert.ok(out && !out.includes("SECRETCODE") && !out.includes("access_token") && !out.includes("#"));
});
check("is case-insensitive on the parameter name", () => {
  assert.ok(!scrubUrl("/x?Token=abc")!.includes("abc"));
});
check("leaves a clean URL alone", () => {
  assert.equal(scrubUrl("https://done.design/design"), "https://done.design/design");
  assert.equal(scrubUrl(undefined), undefined);
});

console.log("scrubEvent");
check("removes cookies, headers, body, email and IP; scrubs url and breadcrumbs", () => {
  const ev = {
    type: undefined,
    request: {
      url: "https://done.design/v/r?g=GRANT",
      query_string: "g=GRANT&x=1",
      cookies: { sb: "session" },
      headers: { authorization: "Bearer x" },
      data: { plan: "geometry" },
    },
    user: { id: "u1", email: "a@b.c", ip_address: "1.2.3.4" },
    breadcrumbs: [{ category: "navigation", data: { from: "/v/r?g=GRANT", to: "/design" } }],
  } as unknown as ErrorEvent;
  const out = scrubEvent(ev);
  const json = JSON.stringify(out);
  assert.ok(!json.includes("GRANT") && !json.includes("session") && !json.includes("Bearer"));
  assert.ok(!json.includes("geometry") && !json.includes("a@b.c") && !json.includes("1.2.3.4"));
  assert.deepEqual(out.user, { id: "u1" });
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
