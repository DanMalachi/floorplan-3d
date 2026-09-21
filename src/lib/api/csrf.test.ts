// Run: npm run test:security

import assert from "node:assert/strict";
import { rejectCrossSiteWrite } from "./csrf";

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

const req = (headers: Record<string, string>) =>
  new Request("https://done.design/api/share", { method: "POST", headers });

console.log("rejectCrossSiteWrite");
check("same-origin JSON request passes", () => {
  assert.equal(
    rejectCrossSiteWrite(req({ host: "done.design", origin: "https://done.design", "content-type": "application/json" })),
    null,
  );
});
check("a foreign Origin is refused with 403", () => {
  const r = rejectCrossSiteWrite(req({ host: "done.design", origin: "https://evil.example", "content-type": "application/json" }));
  assert.equal(r?.status, 403);
});
check("Origin: null (sandboxed iframe / file://) is refused", () => {
  const r = rejectCrossSiteWrite(req({ host: "done.design", origin: "null", "content-type": "application/json" }));
  assert.equal(r?.status, 403);
});
check("a lookalike host that merely starts with ours is refused", () => {
  const r = rejectCrossSiteWrite(req({ host: "done.design", origin: "https://done.design.evil.example", "content-type": "application/json" }));
  assert.equal(r?.status, 403);
});
check("Sec-Fetch-Site: cross-site is refused even with no Origin", () => {
  const r = rejectCrossSiteWrite(req({ host: "done.design", "sec-fetch-site": "cross-site", "content-type": "application/json" }));
  assert.equal(r?.status, 403);
});
check("Sec-Fetch-Site: same-site (a sibling subdomain) is refused", () => {
  const r = rejectCrossSiteWrite(req({ host: "done.design", "sec-fetch-site": "same-site", "content-type": "application/json" }));
  assert.equal(r?.status, 403);
});
check("a form-style content type is refused with 415", () => {
  const r = rejectCrossSiteWrite(req({ host: "done.design", origin: "https://done.design", "content-type": "text/plain" }));
  assert.equal(r?.status, 415);
});
check("a missing content type is refused with 415", () => {
  const r = rejectCrossSiteWrite(req({ host: "done.design", origin: "https://done.design" }));
  assert.equal(r?.status, 415);
});
check("x-forwarded-host wins over host behind a proxy", () => {
  assert.equal(
    rejectCrossSiteWrite(
      req({ host: "internal", "x-forwarded-host": "done.design", origin: "https://done.design", "content-type": "application/json" }),
    ),
    null,
  );
});
check("requireJson:false skips only the content-type rule", () => {
  assert.equal(rejectCrossSiteWrite(req({ host: "done.design", origin: "https://done.design" }), { requireJson: false }), null);
  assert.equal(
    rejectCrossSiteWrite(req({ host: "done.design", origin: "https://evil.example" }), { requireJson: false })?.status,
    403,
  );
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
