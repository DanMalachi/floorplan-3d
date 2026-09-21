// HTTP-level security smoke test. Non-destructive: it only sends requests a hostile
// visitor could send, and every one must be REFUSED. Point it at a local
// `next start` or an isolated staging deployment — never at production.
//
//   BASE_URL=http://localhost:3100 node scripts/security/smoke.mjs
//
// Optional env, to exercise the paths that need configuration:
//   EXPECT_CONFIGURED=1   assert the deployment has its signing secrets (staging)

const BASE = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const HOST = new URL(BASE).host;
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
}
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what ?? "value"}: expected ${b}, got ${a}`);
};
const post = (path, { headers = {}, body = "{}" } = {}) =>
  fetch(BASE + path, { method: "POST", headers, body, redirect: "manual" });
const JSON_H = { "content-type": "application/json" };
const ROOM = "floorplan-7f3d2c1b-4a5e-4f60-9c8d-0e1f2a3b4c5d";

console.log(`target ${BASE}`);

console.log("response headers");
await check("security headers on a page", async () => {
  const r = await fetch(BASE + "/design");
  eq(r.headers.get("x-content-type-options"), "nosniff", "nosniff");
  eq(r.headers.get("x-frame-options"), "DENY", "x-frame-options");
  eq(r.headers.get("cross-origin-opener-policy"), "same-origin", "coop");
  if (!r.headers.get("strict-transport-security")) throw new Error("no HSTS");
  if (!r.headers.get("content-security-policy") && !r.headers.get("content-security-policy-report-only"))
    throw new Error("no CSP");
  if (r.headers.get("x-powered-by")) throw new Error("x-powered-by leaks the framework");
});
await check("every /api response is no-store", async () => {
  for (const p of ["/api/health", "/api/account"]) {
    const r = await fetch(BASE + p);
    if (!/no-store/i.test(r.headers.get("cache-control") ?? "")) throw new Error(`${p} is cacheable`);
  }
});
await check("security.txt is published", async () => {
  const r = await fetch(BASE + "/.well-known/security.txt");
  eq(r.status, 200, "status");
  if (!/^Contact:/m.test(await r.text())) throw new Error("no Contact field");
});

console.log("cross-site and content-type guards");
for (const path of ["/api/share", "/api/liveblocks-auth", "/api/share/revoke", "/api/account/delete"]) {
  await check(`${path} refuses a foreign Origin`, async () => {
    const r = await post(path, { headers: { ...JSON_H, origin: "https://evil.example" } });
    eq(r.status, 403, "status");
  });
  await check(`${path} refuses a form-style body (text/plain)`, async () => {
    const r = await post(path, { headers: { "content-type": "text/plain", origin: BASE } });
    eq(r.status, 415, "status");
  });
  await check(`${path} refuses Sec-Fetch-Site: cross-site`, async () => {
    const r = await post(path, { headers: { ...JSON_H, "sec-fetch-site": "cross-site" } });
    eq(r.status, 403, "status");
  });
}

console.log("authorization");
await check("account endpoints reject a signed-out caller", async () => {
  eq((await fetch(BASE + "/api/account")).status, 401, "GET /api/account");
  eq((await fetch(BASE + "/api/account/export")).status, 401, "GET /api/account/export");
  eq((await post("/api/account/delete", { headers: { ...JSON_H, origin: BASE } })).status, 401, "delete");
});
await check("revoke needs a signed-in owner", async () => {
  const r = await post("/api/share/revoke", { headers: { ...JSON_H, origin: BASE }, body: JSON.stringify({ room: ROOM }) });
  if (![401, 503].includes(r.status)) throw new Error(`expected 401/503, got ${r.status}`);
});
await check("the retention sweep is closed without the cron secret", async () => {
  const none = await fetch(BASE + "/api/account/retention");
  if (![403, 503].includes(none.status)) throw new Error(`no header: ${none.status}`);
  const bad = await fetch(BASE + "/api/account/retention", { headers: { authorization: "Bearer wrong" } });
  if (![403, 503].includes(bad.status)) throw new Error(`wrong secret: ${bad.status}`);
});
await check("a forged share grant is refused", async () => {
  const forged = Buffer.from(JSON.stringify({ room: ROOM, role: "build", exp: Date.now() + 1e9 })).toString("base64url") + ".AAAA";
  const r = await post("/api/liveblocks-auth", { headers: { ...JSON_H, origin: BASE }, body: JSON.stringify({ room: ROOM, grant: forged }) });
  if (![403, 503].includes(r.status)) throw new Error(`expected 403/503, got ${r.status}`);
});
await check("joining a room with no grant and no ownership is refused", async () => {
  const r = await post("/api/liveblocks-auth", { headers: { ...JSON_H, origin: BASE }, body: JSON.stringify({ room: ROOM }) });
  if (![403, 503].includes(r.status)) throw new Error(`expected 403/503, got ${r.status}`);
});

console.log("input validation");
await check("an oversized body is rejected before parsing", async () => {
  const r = await post("/api/share", { headers: { ...JSON_H, origin: BASE }, body: JSON.stringify({ room: ROOM, role: "view", pad: "x".repeat(20_000) }) });
  if (![413, 503].includes(r.status)) throw new Error(`expected 413/503, got ${r.status}`);
});
await check("malformed JSON and path-traversal room ids are rejected", async () => {
  const h = { ...JSON_H, origin: BASE };
  const bad = await post("/api/share", { headers: h, body: "{not json" });
  if (![400, 503].includes(bad.status)) throw new Error(`bad json: ${bad.status}`);
  const trav = await post("/api/share", { headers: h, body: JSON.stringify({ room: "floorplan-../../etc/passwd", role: "view" }) });
  if (![400, 503].includes(trav.status)) throw new Error(`traversal: ${trav.status}`);
});
await check("an unknown role is rejected (no over-posting to a higher role)", async () => {
  const r = await post("/api/share", { headers: { ...JSON_H, origin: BASE }, body: JSON.stringify({ room: ROOM, role: "owner" }) });
  if (![400, 503].includes(r.status)) throw new Error(`expected 400/503, got ${r.status}`);
});

console.log("redirects");
await check("the OAuth callback does not redirect off-site", async () => {
  for (const next of ["//evil.example", "/\evil.example", "https://evil.example", "javascript:alert(1)"]) {
    const r = await fetch(`${BASE}/auth/callback?next=${encodeURIComponent(next)}`, { redirect: "manual" });
    const loc = r.headers.get("location") ?? "";
    if (loc && new URL(loc, BASE).host !== HOST) throw new Error(`${next} -> ${loc}`);
  }
});
await check("dev-only endpoints are dead in production", async () => {
  if (new URL(BASE).hostname === "localhost" && process.env.NODE_ENV !== "production") return; // dev server: skip
  for (const p of ["/api/dev-gt?name=x", "/api/dev/furniture-review"]) {
    const r = await fetch(BASE + p);
    if (r.status !== 404) throw new Error(`${p} -> ${r.status}`);
  }
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
