# done.design — pre-launch security, privacy and operational-readiness audit

**Date:** 2026-09-21 · **Audited:** `origin/main` @ `dc59100` (== production release `dc59100`, confirmed
via `/api/health`) · **Worktree/branch:** `fp-wt/security` on `audit/security` (uncommitted, nothing pushed,
nothing deployed) · **Baselines:** OWASP ASVS 5.0 L2, OWASP Top 10:2025.

Method: read every route handler, auth helper, migration, config and collaboration file; ran the code
(unit tests, production build, local `next start`, headless-browser CSP pass); read production
configuration **read-only** (Vercel env *names*, GitHub repo settings, public DNS, plain `GET`s of
public URLs). No intrusive scan was run against production. Nothing was deployed, no secret was
rotated or read, no production data was touched.

> **Legend.** Every claim carries evidence or is labelled **MANUAL** (needs a dashboard / a deployed
> staging environment) or **NOT EXECUTED** (written but could not be run here). Nothing is marked
> complete on assertion.

---

## 0. Closure — first-launch period (2026-09-21)

**Final status: SAFE FOR A FIRST LAUNCH, with the accepted risks below.** The verdict in section 11 was written before the fixes were deployed; this section supersedes it.

Closed and verified: F-01 room-deletion scope, F-02 link revocation (Dan confirmed the two-browser revoke test in production), F-03 public credentialed previews (Deployment Protection on, every secret Production-only), F-04 framework advisories (`npm audit` 0), F-05 monitoring (UptimeRobot alerting to the support address confirmed by Dan; Sentry active, US region, 30-day retention), F-07, F-08, F-10 (CSP enforced), F-11/F-12 (migration 0005 applied and exercised), F-14 (Supabase email sign-up off; verified from Supabase's public auth settings: only `google` enabled), F-15, F-19, F-25, F-29. GitHub secret scanning, push protection and Dependabot are on; CodeQL runs on every PR. Privacy policy (en + he) updated to match. Vercel deployment storage brought under the free-plan limit and retention tightened.

**Accepted risks for the first launch (Dan, 2026-09-21):**

| Risk | Why it is acceptable now | Revisit when |
|---|---|---|
| No database or storage backups (free Supabase) — F-06 | Local-first copies on users' devices; F-29 makes devices re-upload lost projects; users can export | Before paid plans or a user base that cannot lose plans |
| `decorate` share role is not server-enforced — F-09 | Disclosed in the privacy policy; links are chosen by the owner and revocable | Before marketing "decorate" as a safe limited role |
| CSP still allows inline scripts — F-16 | No XSS sink exists; enforced policy still blocks off-site scripts, framing, `<base>`, off-site form posts | When nonces (dynamic rendering) are affordable |
| No CAA / DNSSEC / DMARC — F-22 | Certificates are issued and renewed by Vercel; no mail is sent from the domain | Before sending email from the domain |
| No staging environment, ZAP or load test | Free-tier limits; previews are guest-only | Before scaling up |
| No recent-authentication for account deletion (F-17); sign-out keeps local data (F-18); grant in URL query (F-20); no per-user room-claim cap (F-24) | Low likelihood; mitigations in section 3 | Post-launch backlog |
| Free-plan hard limits instead of spend caps | On free plans a limit pauses the service rather than billing | Before upgrading any plan |
| Legal entity / address / jurisdiction placeholders | Needs Dan and a lawyer; not a security control | Before paid plans (`docs/LEGAL-LAUNCH-CHECKLIST.md`) |

---

## 1. Executive summary

**Recommendation: NOT SAFE TO LAUNCH as deployed today.** With the code changes in this branch
deployed **and** the manual P0 items in §7 closed (F-03, F-05, F-06), it becomes **safe for a limited beta**;
see §11 for what moves it to a full launch.

The application's own authorization design is better than most at this stage: signed grants are
HMAC-SHA256 with constant-time compare and a fail-closed secret; room ownership is a database fact;
all Supabase tables have RLS keyed to `auth.uid()`; the service-role key never reaches the browser;
there are no Server Actions, no server-side fetch of user-supplied URLs, no user-content HTML sinks,
no committed secrets (539 commits scanned), and the paid-AI and process-spawning endpoints are removed
or off in production. The findings are therefore concentrated in four places the design did not cover:

1. **A collaborator's account deletion could destroy the owner's live room** (F-01, P0). Deletion and
   the nightly purge trusted a client-written column. Fixed in code.
2. **Share links could not be revoked** (F-02, P0). Fixed in code (+ a migration and a button).
3. **Public preview deployments run with production credentials** (F-03, P0). Every preview URL is
   reachable without login (verified: HTTP 200) and the service-role key, Liveblocks secret, share-signing
   secret and Supabase URL are all in the **Preview** scope. Manual fix.
4. **Production runs `next@16.2.9` with 1 critical + 3 high advisories** (F-04, P0). Bumped to `16.3.5`
   in code; `npm audit` → 0. Needs a deploy.

Two further **operational** blockers are not code: **no error monitoring or alerting is configured**
(Sentry has no DSN in Vercel; no uptime monitor found) and **there is no evidence of a working backup or
a tested restore** (the runbook exists only on an unmerged branch; nothing has been purchased or
enabled). Both are P0 under the launch-blocker rules and cannot be verified from the repository.

What changed: 13 files of application code, 1 migration, 8 new test/tool files, CI hardening, a
runbook. All of it typechecks, builds, and passes its tests (§6). What it does not do: it does not
protect anything until it is **deployed** and migration `0005` is **applied** (§7).

---

## 2. Architecture and trust-boundary map

```
 Browser (untrusted) ───────────────┬──────────────────────────────────────────────────────┐
  • IndexedDB: projects, plan images │  Next.js 16 App Router on Vercel (Linux, nodejs runtime)
  • localStorage: share grants       │  proxy.ts: Supabase session refresh + next-intl routing
  • cookies: sb-* (Supabase),        │  /api/share            mint grant   (session|grant|owner cookie)  [abuse RL]
    fp_anon, fp_owned_rooms          │  /api/share/revoke     NEW owner-only, service role write         [abuse RL]
                                     │  /api/liveblocks-auth  verify grant → Liveblocks access token     [abuse RL]
   ── direct, RLS-only ───────────►  │  /api/account[/export|/delete|/retention]  session | cron secret, service role
   Supabase REST/Storage/Realtime    │  /api/health           public, booleans only
   (anon key is public by design)    │  /api/dwg2dxf|extract|propose-raster  OFF (LOCAL_TOOLS_ENABLED unset)
                                     └──────────────────────────────────────────────────────┘
   ── websocket ─────────────────►  Liveblocks (Yjs rooms; access token issued by /api/liveblocks-auth)
   ── HTTPS ──────────────────────►  Sentry (dormant: no DSN)   Upstash Redis (rate limits)   Resend (dormant)
```

| Asset | Where | Boundary that protects it |
|---|---|---|
| Floor plans (geometry) | Supabase `project_docs.state`; IndexedDB; Liveblocks room while live | RLS `owner = auth.uid()`; grant/ownership at `/api/liveblocks-auth` |
| Plan images / thumbnails | Supabase Storage `plans`,`thumbs` (private) | Storage policy on first path segment = uid |
| Room ownership | `public.live_rooms` (written only by definer RPC) | RPCs revoked from `anon`/`public` |
| Share capability | Signed grant in `?g=` (+ localStorage) | HMAC-SHA256, `exp`, **`iat` + per-room cut-off (new)** |
| Service-role key | Vercel env | Server-only; imported by 6 server-only files, none `"use client"` |
| Signing / cron / Liveblocks secrets | Vercel env | Never `NEXT_PUBLIC_*`; fail closed when absent |

| Actor | Can do | Must not be able to do |
|---|---|---|
| Guest with `view` link | Read one room | Write; mint above `view`; see any other room |
| Guest/user with `decorate`/`build` link | Write the room's Yjs doc | Touch other rooms; outlive revocation; harm the owner's saved copy |
| Signed-in user | Own rows/files (RLS); claim rooms; delete own account | Affect **another** user's rows, rooms, files |
| Anonymous internet | Public pages, `/api/health` | Anything with a cost, a write, or a secret |
| Cron | Retention sweep (Bearer `CRON_SECRET`) | Be triggered by anyone else |

Entry points reviewed: 13 route handlers (+1 added by this work) (all listed in §3 evidence), 0 Server Actions
(`grep "use server"` → none), 1 proxy, 3 SQL migrations, 3 RPCs, 2 storage buckets, Liveblocks
auth + Yjs documents, share links, file imports (PDF/image/DXF client-side; DWG server-side, off),
scheduled job (1 cron).

---

## 3. Risk register

Severity: **P0** blocks public launch · **P1** fix before launch · **P2** shortly after, with a mitigation ·
**P3** longer-term. Status: **FIXED-IN-BRANCH** (needs deploy) · **MANUAL** · **OPEN** · **ACCEPTED**.

### P0

**F-01 — A collaborator's account deletion (or copy deletion) destroyed the *owner's* live room** · FIXED-IN-BRANCH
*Impact:* cross-user data destruction in normal use, and weaponizable. *Scenario:* Alice shares a plan; Bob
opens the link (`registerSharedProject` tags Bob's local copy with Alice's room id) and, signed in, cloud sync
pushes that id to **Bob's** `projects.live_room_id`. Bob deletes his account → `POST /api/account/delete`
enumerated Bob's rows, took every `live_room_id`, and called Liveblocks `deleteRoom` with the secret key
on each — Alice's room is gone, all connected editors are dropped and their unsaved live edits lost.
The nightly purge did the same 30 days after Bob deleted just his copy. A hostile user needs no
cooperation: `live_room_id` is a client-writable column, so pointing it at any room id they were ever sent
achieves the same. *Evidence (origin/main):* `src/app/api/account/delete/route.ts:168,199` (union of
`projects.live_room_id` → `deleteRoom`); `src/app/api/account/retention/route.ts:177-179`;
`src/store/projectPersistence.ts:724-741` (`registerSharedProject` writes `liveRoomId: roomId`);
`src/store/syncEngine.ts:339` and `src/store/cloudProjects.ts:117` (pushed as `p_live_room_id`).
*Fix:* only rooms present in `live_rooms` with `owner = caller` are deleted; rooms a row merely names are
counted and left alone (`src/lib/api/roomDeletion.ts`, both routes). If the ownership lookup fails the
purge keeps the row and retries. *Proof:* `roomDeletion.test.ts` (8 cases incl. "a hostile row cannot make a
room deletable"). *Also:* the retention summary gains `foreignRooms` so the next dry run shows how many
shared-room references exist. **Not executed against a real database** — see §7 step V-4.

**F-02 — Share links were not revocable** · FIXED-IN-BRANCH (needs migration `0005` + deploy)
*Impact:* a leaked/misdirected `build` link stays valid 30 days; the only remedy was rotating the signing
secret for **every** room. *Evidence:* `src/collab/grant.server.ts:57` (`DEFAULT_TTL_MS = 30 days`), stateless HMAC,
no store; memory note "NO share-link revoke UI exists". *Fix:* grants carry `iat`; `live_rooms.grants_valid_after`
is the per-room cut-off; `/api/liveblocks-auth` and `/api/share` both check it (a revoked grant cannot mint fresh
ones — no laundering through attenuation); owner-only `POST /api/share/revoke` + a **Revoke all links** button
(en + he). Fails closed when the check cannot run; drops (not 403s) a revoked grant so the *owner* holding an old
link is not locked out. *Proof:* `revocation.test.ts` (grant `iat`, cut-off logic, back-dating breaks the signature).
*Limit (honest):* an already-connected collaborator keeps their Liveblocks token until it expires or they reconnect;
immediate removal = delete the room (runbook §3).

**F-03 — Preview deployments are public and hold production credentials** · MANUAL
*Impact:* any branch/PR build (including Dependabot's) and every old preview stay reachable and run against the
production database, storage, Liveblocks and rate-limit store; a vulnerable old commit is a permanent hole.
*Evidence:* `vercel env ls production` shows `SUPABASE_SERVICE_ROLE_KEY`, `LIVEBLOCKS_SECRET_KEY`,
`SHARE_SIGNING_SECRET`, `UPSTASH_REDIS_REST_*`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` scoped **"Preview, Production"**;
`curl https://floorplan-3d-jboqvvmrz-dans-projects7.vercel.app/api/health` → `200 {"environment":"preview",…,"accountDeletion":true}`
(no login wall). The repo is also **public**, so anyone can read exactly what each preview does. *Fix:* §7 V-1, V-2.

**F-04 — Production runs Next.js 16.2.9: 1 critical + 3 high advisories** · FIXED-IN-BRANCH (needs deploy)
*Evidence:* `npm audit` on `origin/main` → critical 1, high 3, moderate 1. Advisories against `next >=16.0.0 <16.3.3`:
two critical RCEs (one Windows-hosted only; one in the image optimizer with AVIF), proxy bypass (Turbopack + single
locale), DoS, SSRF-in-rewrites, cache confusion. *Exploitability, honestly:* Vercel is Linux and runs its own image
optimizer, the app has two locales and its `proxy.ts` performs no authorization, has no Server Actions and no
rewrites — so likely **not directly exploitable here**, but "known critical in the framework" is a launch blocker on
its face and the fix is a minor bump. *Fix:* `next`/`eslint-config-next` → `16.3.5`, `npm audit fix` (fflate,
js-yaml, postcss, sharp) → **0 vulnerabilities**. Verified: typecheck, production build, local `next start`, 9 pages
hydrate in a real browser. **Not verified:** the deployed Vercel runtime (memory: 16.3 changed SSR streaming) — see V-5.

**F-05 — No error monitoring / alerting; no uptime monitor** · MANUAL
*Evidence:* Vercel env has no `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (Sentry is compiled in but dormant); no monitor
found; `docs/PROVISIONING.md` lists none. A failed nightly cron only appears as a bare failure in Vercel. §8.

**F-06 — No usable, tested backup** · MANUAL
*Evidence:* `docs/BACKUPS.md` exists only on the unmerged branch `docs/backups-pitr`; its own header says "nothing here
has been purchased or enabled". No restore test has been performed. Storage objects and Liveblocks are not covered by
Postgres backups at all. §9.

### P1

| ID | Finding | Evidence | Status |
|---|---|---|---|
| F-07 | **Owner cookie was not bound to a person.** `fp_owned_rooms` held bare room ids for a year, so after sign-out (or as another account) the browser kept owner rights whenever the DB could not contradict it | `src/lib/api/rooms.ts:83,128` (origin/main) | FIXED — entries now `<uid>\|<room>`; old cookies fall back to the authoritative DB. Test in `revocation.test.ts` |
| F-08 | **A hostile live-room document reached the owner's editor, local project and cloud copy unchecked.** Anyone with an edit grant can write any Yjs data; `readScene` → `setState` → mirror → sync | `src/collab/CollabRoom.tsx` `project()` (pre-fix); `sceneDoc.ts:readScene` | FIXED — `sceneGuard.ts` bounds counts, size, depth, finiteness, forbidden keys; refused scenes never persist. 15 tests |
| F-09 | **`decorate` is not enforced server-side.** `session.allow(room, role==="view" ? READ : FULL)` — `decorate` and `build` are identical to Liveblocks; the UI promise "Can view + decorate" is client-side only | `src/app/api/liveblocks-auth/route.ts:96` | OPEN — Liveblocks/Yjs cannot express per-subtree permission. **Decision for Dan:** relabel `decorate` as advisory, or drop it, or move to a validate-and-snapshot model. Compensating: revocation (F-02), scene guard (F-08) |
| F-10 | **CSP was Report-Only** (protected nothing) | `next.config.ts:41` `CSP_ENFORCE = false` | FIXED-IN-BRANCH — enforced (env-revertible). Headless run: only Next's inline hydration scripts violate; nothing else. **Interim policy keeps `script-src 'unsafe-inline'`** — see F-16 |
| F-11 | **Storage buckets had no size cap or MIME allow-list** — any account could store arbitrary files (HTML/SVG/exe/huge) at our cost | `0001_projects.sql:170` | FIXED-IN-BRANCH — migration `0005` (plans 50 MiB png/jpeg/webp/gif; thumbs 5 MiB) |
| F-12 | **No per-account quotas** — unbounded project rows and jsonb document size | `0001_projects.sql` | FIXED-IN-BRANCH — migration `0005` triggers: 500 live projects, 16 MiB per document. **Numbers are my defaults — Dan to confirm** |
| F-13 | **GitHub repo is public with secret scanning, push protection and Dependabot alerts all disabled; no review requirement; the one required check (`pytest`) is unsatisfiable for direct pushes; `enforce_admins` off** | `gh api repos/DanMalachi/floorplan-3d` (`security_and_analysis: disabled`), `…/branches/main/protection` | MANUAL — §7 G-1..G-3 |
| F-14 | **Supabase email sign-up may be open.** The anon key is public; if the Email provider is enabled, anyone can `POST /auth/v1/signup` and create accounts without Google | Supabase default; provider settings not readable from the repo | MANUAL — §7 S-2. *Test on staging only* |
| F-15 | **Sentry (when switched on) would have stored working share links** — `?g=` is in every event/breadcrumb URL | `sentry.shared.ts` had no scrubbing | FIXED — `beforeSend`/`beforeBreadcrumb` redact `g`, `code`, tokens, fragments; drop cookies/headers/body/email/IP. 5 tests |
| F-29 | **Sync deleted a device's LAST copy whenever the server lost a project.** Reconcile treated "previously synced and now absent" as "deleted elsewhere" and ran `forgetProject` (erases doc, image, thumbnail). A table wipe, bad migration, restore or empty response would have propagated to every user's device on the next tab focus. Matters most with no backups | `src/store/syncEngine.ts:171` (origin/main) | FIXED — only a server **tombstone** (`deleted_at`) means forget; a vanished row is re-uploaded from the device (self-healing). Unreadable tombstones = decide nothing. `missingRemote.ts`, 6 tests. Cost: a device offline >30 days can resurrect a project deleted elsewhere |
| F-16 | **CSP still allows inline script** (needed by Next's hydration) so it does not yet stop an injected inline `<script>` | doc: `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` | OPEN (P2 after F-10) — nonces force every page dynamic (loses static/CDN caching); alternative is experimental SRI. Product/cost call. No XSS sink exists today (§4 #9) |

### P2

| ID | Finding | Notes / mitigation |
|---|---|---|
| F-17 | No **recent-authentication** for account deletion. Typing your own e-mail is the only step-up | Sign-in is Google-only, so "recent auth" means a Google re-prompt: needs `signInWithOAuth({queryParams:{prompt:"login"}})` + a `last_sign_in_at` window. Mitigated by e-mail confirmation, rate limit (new), CSRF guard (new) |
| F-18 | **Sign-out does not clear this browser's local projects or stored grants** (`useSession.ts:84`). Local-first by design; clearing risks unsynced work | Offer "Sign out and remove this device's copy" after confirming everything synced. Guests also share the browser |
| F-19 | **`*.vercel.app` alias serves the production app** (`floorplan-3d-dans-projects7.vercel.app` → 200) — duplicate hostname | V-3: redirect to `done.design` |
| F-20 | Share grant lives in the **URL query** (`/v/<id>?g=…`): appears in Vercel request logs, browser history | `Referrer-Policy: strict-origin-when-cross-origin` already stops cross-site leaks. Move to the fragment `#g=` (never sent to servers) |
| F-21 | **HSTS is `includeSubDomains; preload`** but subdomains can't be enumerated from here; DNS shows only apex + `www` (Vercel) + mail forwarding | `preload` is inert until submitted at hstspreload.org — **do not submit** until every subdomain is confirmed HTTPS-only; otherwise drop `preload` |
| F-22 | **DNS hygiene:** no CAA, no DNSSEC, no DMARC (public DoH lookups 2026-09-21) | §7 D-1..D-3 |
| F-23 | Liveblocks **public key** var exists in Vercel (`NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`) but nothing in `src/` uses it | Delete it; confirm in the Liveblocks dashboard that rooms default to **private** (`defaultAccesses: []`) — MANUAL, not verifiable from here |
| F-24 | Unbounded **room claims per user** (`claim_live_room`) and per-room presence `name` length | Add a per-owner cap in the RPC; low impact (rate-limited 60/min) |
| F-25 | **Client-side imports have no size/pixel/page caps** (PDF, image, DXF). Self-DoS only — files never leave the user's browser and DWG server conversion is off in prod | Add a file-size + pixel cap at the top of `importPlanFile`; pdf.js is current (6.1.x); set `isEvalSupported:false`. `legacy/` is read-only by house rule so the guard belongs in the store |
| F-26 | **Restore rolls `projects.rev` backwards** and can make clients overwrite or wipe local copies (memory item [32]) | Documented in the BACKUPS runbook; fix before first real restore |
| F-27 | After account deletion/ban, an already-issued Supabase JWT still satisfies RLS on the user's own (now deleted) rows ≤ 1 h | Server routes re-verify via `getUser()`. Nothing left to read after deletion |
| F-28 | **Liveblocks token TTL / already-open sessions survive revocation** | Documented (runbook §3) |

### P3

`/api/health` publishes which integrations are configured and the 7-char commit (fine for a monitor; consider a
secret-gated verbose mode) · wildcard `Access-Control-Allow-Origin: *` is added by Vercel to prerendered public
pages only (never API routes; credentials can't accompany it) · `@anthropic-ai/sdk` is an unused-in-prod
dependency (`roomReason.ts` is unwired; no key deployed) — remove when convenient · presence `color` strings are
attacker-controlled but only reach `meshBasicMaterial`/inline style objects (no injection) · JWT/`getUser()`
semantics noted in F-27 · lint is red on `main` for 7 pre-existing errors unrelated to this work
(`docs/design/**/*.js`, `TraceOverlay.tsx`, `homeColours.ts`) so `nextjs-ci` cannot currently gate.

---

## 4. Launch-blocker checklist

| # | Blocker | Result | Evidence |
|---|---|---|---|
| 1 | Cross-user data access / IDOR | **FAIL → fixed in branch** | Reads/writes: PASS on review (RLS §5). Destructive: F-01 (fixed). Executable RLS test written, **NOT EXECUTED** |
| 2 | Missing server-side authz on a sensitive endpoint | **PASS** | All 13 routes read; each of share/liveblocks-auth/revoke/account/*/retention authorizes server-side; dev + local-tool routes 404/503 in prod (smoke test) |
| 3 | Incorrect/absent RLS or storage policies | **PASS on review / MANUAL to prove** | `0001`/`0002` policies keyed to `auth.uid()`; `anon` granted nothing; `supabase/tests/rls_audit.sql` **NOT EXECUTED** |
| 4 | Service-role key / secrets exposed to browser | **PASS** | No `NEXT_PUBLIC_` secret (only URL + anon key + flags); `admin.ts` `assertServer()`; importers = 6 server-only files, none `"use client"`; source maps → 403; history scan clean |
| 5 | Forgeable / non-revocable privileged share access | **Forgeable: PASS. Non-revocable: FAIL → fixed in branch** | HMAC-SHA256 + `timingSafeEqual`, production fails closed without a secret (`grant.server.ts`); F-02 |
| 6 | Unauthorized collaboration-room access | **PASS w/ caveat** | No grant + not owner → 403 (smoke); forged grant → 403; **caveat F-09** (`decorate` = `build` server-side) |
| 7 | Unbounded paid API / file-processing endpoints | **PASS** | No Anthropic route (deleted), no `ANTHROPIC_API_KEY` in Vercel; `cost`-class limits fail closed; process-spawning routes need `LOCAL_TOOLS_ENABLED` (unset) |
| 8 | Unsafe parsing of attacker-controlled uploads | **PASS server-side / P2 client-side** | No server parser reachable in prod; imports parse in the user's own browser (F-25) |
| 9 | Stored XSS | **PASS on review** | Only 8 `dangerouslySetInnerHTML`, all static strings/tokens; React escapes names/titles; **not dynamically tested** |
| 10 | Production connected to an unprotected preview | **FAIL** | F-03 |
| 11 | No usable backup / tested recovery | **FAIL (MANUAL)** | F-06 |
| 12 | Known exploitable critical/high dependency | **FAIL → fixed in branch** | F-04; `npm audit` = 0 after |
| 13 | Sensitive data via logs / monitoring / public storage / caches / source maps | **PASS w/ P2** | Logs carry uid+route only (`log.ts`); buckets private; `/api` + `/auth` now `no-store`; maps 403; F-15 scrubber; F-20 grant-in-URL |
| 14 | Account deletion leaves accessible data | **PASS** | Tested end-to-end 2026-08-25 (memory); five verified stages; F-01 no longer over-deletes. Backups retention caveat (§9) |
| 15 | No monitoring for critical failures / cost abuse | **FAIL (MANUAL)** | F-05 |

Open **P0** items: **#10, #11, #15** (manual) + **F-01, F-02, F-04 need a deploy** (and `0005` applied).

---

## 5. What was verified as sound (so it need not be re-audited)

* **RLS/tenancy:** `projects`/`project_docs` — one `for all … using/with check (owner = auth.uid())` policy each;
  `push_project` is `security invoker` (RLS applies, `auth.uid()` on every predicate); `live_rooms` read-only to
  clients, writes only via `claim_live_room` (definer, revoked from `public`/`anon`, `search_path` pinned, atomic
  `on conflict do nothing`); storage policy binds the first path segment to `auth.uid()`; all buckets private.
* **Sessions/OAuth:** `@supabase/ssr` cookies via `proxy.ts`; PKCE code exchange in `/auth/callback`; `next` is
  path-only and prepended with our own origin (open redirect not exploitable; smoke-tested with `//evil`, `/\evil`,
  `https://`, `javascript:`); provider error text is never rendered (fixed code only).
* **Body handling:** every JSON route goes through `readJson` (content-length gate + counting read + zod +
  unknown-field rejection on the new route); multipart requires a declared length.
* **Rate limiting:** Upstash REST (durable), `cost` class fails closed in production, identity = user id else IP
  from `x-forwarded-for` (Vercel-set; a client cannot spoof it past the edge). `/api/health` confirms it is configured.
* **HTTP:** HTTP→HTTPS 308; HSTS 2 yr; nosniff; `X-Frame-Options: DENY`; `Referrer-Policy`; `Permissions-Policy`;
  no `X-Powered-By` on Vercel; API CORS: none configured (same-origin only).
* **Secrets:** none in tracked files or history (regex scan of all 539 commits for Anthropic/Supabase/Liveblocks/
  Vercel-Blob/Resend/GitHub/AWS/private-key/JWT patterns — *pattern-based; enable GitHub secret scanning to
  cover unknown formats*).
* **SSRF:** no server code fetches a user-influenced URL (`fetch(` audit: Upstash, Resend — both fixed hosts).
* **Injection/traversal:** no SQL string building (supabase-js/RPC only); `dev-gt` route resolves and re-checks its
  path and is dead in production; spawners use `shell:false` with array args and are off.

---

## 6. Code changes made and tests added

Uncommitted in worktree `C:\Users\dandu\fp-wt\security` (branch `audit/security`). **No `git add -A` was used; nothing
committed, pushed or deployed.**

| Change | Files |
|---|---|
| F-01 owned-rooms-only deletion | `src/lib/api/roomDeletion.ts` (new), `account/delete/route.ts`, `account/retention/route.ts` |
| F-02 revocation | `collab/grant.server.ts` (`iat`), `lib/api/revocation.ts` (new), `api/share/route.ts`, `api/liveblocks-auth/route.ts`, `api/share/revoke/route.ts` (new), `collab/share.ts`, `collab/CollabRoom.tsx`, `messages/{en,he}.json` (3 keys each, parity 887/887), migration `0005` |
| F-04 deps | `package.json`, `package-lock.json` (next 16.3.5, eslint-config-next 16.3.5, audit fix) |
| F-07 cookie binding | `lib/api/roomPolicy.ts`, `lib/api/rooms.ts` |
| F-08 scene guard | `collab/sceneGuard.ts` (new), `collab/CollabRoom.tsx` |
| F-10 CSP + headers | `next.config.ts` (enforced CSP, COOP, `no-store` for `/api` + `/auth`, `poweredByHeader:false`) |
| F-11/12 storage + quotas | migration `0005` |
| F-15 Sentry scrubbing | `sentry.shared.ts` |
| CSRF (defence in depth) | `lib/api/csrf.ts` (new); applied to `/api/share`, `/api/liveblocks-auth`, `/api/share/revoke`, `/api/account/delete` (replaces an inline check that threw on `Origin: null`) |
| Cost/abuse | rate limits on `/api/account/delete` (5/h) and `/api/account/export` (6/h) |
| Info leaks | `/api/account`, `/api/account/export` no longer return DB error text |
| Disclosure | `public/.well-known/security.txt` |
| CI | actions pinned to commit SHAs, `permissions: contents: read`, `npm run test:security` step, new `codeql.yml` |
| Tooling | `scripts/security/smoke.mjs`, `scripts/security/csp-audit.mjs`, `supabase/tests/rls_audit.sql` |
| Docs | this file, `docs/INCIDENT_RESPONSE.md` |

**Test results (all run 2026-09-21 in this worktree):**

| Suite | Result |
|---|---|
| `npm run test:security` (roomDeletion 8, csrf 10, revocation 11, sentryScrub 5, sceneGuard 15, existing apisec + rooms) | **all pass** |
| `test:persist` 46, `test:import`, `test:pseudo` | pass |
| `tsc --noEmit` | 0 errors |
| ESLint on every file I touched | 0 errors (repo total 7 pre-existing errors, none mine) |
| `npm run build` on `next@16.3.5` | success (`/api/share/revoke` registered) |
| `npm audit` | **0 vulnerabilities** (was 1 critical, 3 high, 1 moderate) |
| `scripts/security/smoke.mjs` against local `next start` (production mode, dummy secrets) | **all 25 checks pass** — found and fixed the `X-Powered-By` header |
| `scripts/security/csp-audit.mjs` (headless Chromium, 9 pages) | only violation class = inline hydration scripts; enforced policy: `/design`, `/`, `/he/design`, `/legal/*` hydrate, canvas renders, no console errors; `/v/<id>` shows the expected 403 without a grant |
| Route ritual (unprefixed `/design`, `/legal/*`, `/he/design`, `/robots.txt`, `/sitemap.xml`) | 200; marketing routes 307 to the editor **only because `NEXT_PUBLIC_LANDING_ENABLED` was unset locally** |

**Required tests not covered, and why:**

| Required test | Status |
|---|---|
| RLS for anon + each role, cross-user read/write/delete | Script written (`rls_audit.sql`), **NOT EXECUTED** — needs a staging Supabase project |
| Backup restoration | **NOT DONE** — §9 |
| Rate-limit enforcement/bypass | Logic unchanged and pre-existing; **NOT re-tested against Upstash**. Smoke test cannot exceed limits without a durable backend |
| Logout/session revocation | **MANUAL** (needs real Supabase sessions) — steps in §7 V-4 |
| Account deletion + retention cleanup end-to-end | Pre-existing end-to-end proof (2026-08-25); **the F-01 change is unit-tested only** — re-run the retention dry run (V-4) |
| Provider failure / timeout | Behaviour reviewed (rate-limit fails closed for `cost`, revocation fails closed, health degrades); **not fault-injected** |
| Oversized/malformed image/PDF/plan/GLB | Client-side import has no caps (F-25); no server parser is reachable |
| Stored/reflected XSS payload run | Not run dynamically; review only |
| ZAP baseline, load test | **NOT RUN** — no isolated staging exists (F-03: today's "previews" are production-connected) |

---

## 7. Manual actions (dashboards). Exact steps, in priority order

I did **not** perform any of these. Values are never invented; where a value is needed, it says where to get it.

### Vercel
* **V-1 (P0) Protect previews.** Project → Settings → **Deployment Protection** → *Vercel Authentication* →
  **All Deployments** (or *Standard Protection*, which spares only Production). Verify (expect **401**, not 200):
  `curl -s -o /dev/null -w "%{http_code}\n" https://floorplan-3d-jboqvvmrz-dans-projects7.vercel.app/api/health`
* **V-2 (P0) Split preview from production.** Create a **staging** Supabase project and a **development**
  Liveblocks project. Settings → Environment Variables → for each of `SUPABASE_SERVICE_ROLE_KEY`,
  `LIVEBLOCKS_SECRET_KEY`, `SHARE_SIGNING_SECRET`, `UPSTASH_REDIS_REST_URL/TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`: **untick Preview** on the production entry, then add a Preview-only entry with
  the staging values (generate a new `SHARE_SIGNING_SECRET`: `openssl rand -base64 48`). **Do not give Preview a
  service-role key at all** unless a staging test needs it. Env changes affect *new* builds only — old preview
  deployments keep the values they were built with, which is why V-1 (protect **all**) matters, and why deleting
  stale previews (`vercel ls` → `vercel rm <url>`) is worthwhile. Rotating `SUPABASE_SERVICE_ROLE_KEY` and
  `LIVEBLOCKS_SECRET_KEY` afterwards is the only way to fully retire the old previews' access — recommended, needs your OK.
* **V-3 (P2) One hostname.** Settings → Domains → make `done.design` primary and set
  `floorplan-3d-dans-projects7.vercel.app` to **Redirect** to it.
* **V-5 (P0 gate) Verify the deploy.** Deploy this branch to a *protected* preview first; check `/api/health`
  `ok:true`, sign in, open the editor, create a share link, join it in a second browser, revoke, confirm the
  old link is refused. Then promote. Keep the previous production deployment ready (*Promote to Production* is the rollback).
* **V-6 Monitoring & cost.** Sentry: create a project, set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` (Production),
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (build-time), leave `SENTRY_TRACES_SAMPLE_RATE` unset (=0),
  add issue alerts (§8). Vercel → Settings → Billing → **Spend Management** cap. Vercel Firewall → add a
  rate-limit rule on `/api/*` in **Log** mode for a day, then enforce; enable Bot Protection in log mode first.
  Cron: Settings → Cron Jobs → failure notifications on `/api/account/retention`.

### Supabase
* **S-1 (P0) Apply `supabase/migrations/0005_security_hardening.sql`** — staging first, then production, **before**
  deploying the code (the code tolerates the column being absent but revocation does nothing until it exists).
  Verify with the three `select`s at the bottom of the file.
* **S-2 (P1) Close email sign-up.** Authentication → Sign In / Providers: **disable Email**, disable
  *Anonymous sign-ins*; keep Google only. Verify on **staging only**:
  `curl -s -X POST "$STAGING_URL/auth/v1/signup" -H "apikey: $STAGING_ANON" -H "content-type: application/json" -d '{"email":"probe@example.invalid","password":"Probe-12345-x"}'`
  → expect "Email signups are disabled".
* **S-3 (P1) Redirect allow-list.** Authentication → URL Configuration: Site URL `https://done.design`; Redirect URLs =
  exactly `https://done.design/auth/callback` (and the staging equivalent on staging). **No `*.vercel.app` wildcard.**
* **S-4 (P0) Backups + restore test.** See §9.
* **S-5** Organization → **enforce MFA** for members; turn on the **spend cap**; Database → Reports → alert on
  disk/egress; Logs → alert on auth failure spikes.
* **S-6 (P1) Run `supabase/tests/rls_audit.sql`** in the staging SQL editor; expect `ALL RLS CHECKS PASSED`.

### Liveblocks
* **L-1** Delete `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` from Vercel (unused); in the Liveblocks dashboard confirm no
  public-key access. **L-2** Verify rooms are private: with the secret key, `GET https://api.liveblocks.io/v2/rooms/<id>`
  → `"defaultAccesses": []`. **L-3** MFA on the account; usage alert at 50/80 % of plan.

### GitHub (`DanMalachi/floorplan-3d`, currently **public**)
* **G-1** Settings → Advanced Security: enable **Dependabot alerts**, **Dependabot security updates**,
  **Secret scanning**, **Push protection**. CLI: `gh api -X PUT repos/DanMalachi/floorplan-3d/vulnerability-alerts` then
  `gh api -X PATCH repos/DanMalachi/floorplan-3d -F "security_and_analysis[secret_scanning][status]=enabled" -F "security_and_analysis[secret_scanning_push_protection][status]=enabled" -F "security_and_analysis[dependabot_security_updates][status]=enabled"`
* **G-2** Branch protection for `main`: require the `Lint, typecheck, build` and `npm audit (high+)` checks; resolve
  the standing `pytest` rule (open task in your notes) — it currently only ever "bypasses". Consider `enforce_admins`.
* **G-3** Confirm 2FA on the GitHub account; Settings → Actions → restrict to selected actions, default token read-only.
* **G-4** Decide deliberately whether a commercial product's source stays public. It is not a security control either way,
  but everything in this report was readable by anyone.

### DNS / registrar (Namecheap)
* **D-1** 2FA on the registrar account, **domain lock** on, auto-renew on, recovery contacts current, change alerts on.
* **D-2** Add **CAA**: `0 issue "letsencrypt.org"` (+ `0 iodef "mailto:done.design.app@gmail.com"`); after adding, confirm
  Vercel still issues/renews (Domains page shows a valid cert). Enable **DNSSEC** if the DNS host supports it.
* **D-3** DMARC: `_dmarc TXT "v=DMARC1; p=none; rua=mailto:done.design.app@gmail.com"`, tighten once mail is in use.
* **D-4** Before *ever* submitting to hstspreload.org, list every subdomain and confirm each serves HTTPS.

---

## 8. Monitoring and incident-response readiness

| Capability | State | Evidence |
|---|---|---|
| Health endpoint | **Present** | `/api/health` → 200, booleans only, `no-store` |
| Uptime monitor | **Absent** | none found — MANUAL (`INCIDENT_RESPONSE.md` §8) |
| Error tracking | **Dormant** — no DSN | `vercel env ls production` has no Sentry vars; scrubbing added |
| Structured security logs | **Partial** | `log.ts` JSON lines for request/exception/account-delete stages; **no** auth-failure/permission-denied metric; grants/emails/plan content never logged |
| Alerts (error rate, 401/403/429 spikes, cron failure, cost, backup) | **None configured** | §8 of the runbook lists thresholds |
| Runbook | **Written, not rehearsed** | `docs/INCIDENT_RESPONSE.md` (containment, rollback, revocation, secret rotation table, evidence, notification) |
| Disclosure channel | **Added** | `/.well-known/security.txt` (Contact = existing support address; expires 2027-09-21) |
| Secret inventory + owners | **Written** | runbook §4 |

## 9. Backup and restore

**Decision (Dan, 2026-09-21): no paid Supabase backups for the first launch — RISK ACCEPTED, not resolved.** The free plan has no backups, so a database or storage loss cannot be restored. Compensating controls today: the app is local-first (each signed-in browser keeps its own copy of its projects and images), F-29's fix makes devices **re-upload** a project the server lost instead of deleting it, users can export their data from the account page, and account deletion is separate. What this does NOT cover: guests' data (never on the server), a user with a single device that is wiped, live-room history, and anything that was only ever on the server. **RPO = unbounded, RTO = n/a until a plan with backups is bought.** Revisit before any paid tier or any user base that cannot afford to lose plans; the cheapest upgrade is Supabase Pro daily backups.

**Result of verification: no backup was enabled; no restore was performed.**
State on file: `docs/BACKUPS.md` (unmerged branch `docs/backups-pitr`, 555 lines) is a *decision* runbook — plan/PITR
not chosen or bought. Coverage gap it documents and I confirmed applies: Postgres backups do **not** contain Storage
bytes (`plans`, `thumbs`) or Liveblocks rooms; the client's IndexedDB copy is outside any restore. **To close (MANUAL):**
merge that runbook; pick a plan with daily backups (PITR recommended); do one restore into a *new* Supabase project;
check row counts for `projects`/`project_docs`/`live_rooms`, spot-check 3 plan images, sign in as a test user, confirm
the `rev` regression behaviour (F-26); write the measured RPO/RTO into the runbook. Until then: **RPO/RTO undefined.**
Retention caveat: backups contain deleted accounts until they age out — state the backup retention period in the
privacy policy (flag for counsel; not a legal conclusion).

## 10. Deferred risks and compensating controls

| Deferred | Compensating control today |
|---|---|
| F-09 `decorate` not server-enforced | Links are capabilities the owner chooses to send; revocation (F-02); scene guard (F-08); owner's saved copy is only overwritten by a valid scene |
| F-16 inline-script CSP | No XSS sink exists (§4 #9); React escaping; enforced CSP still blocks off-site script hosts, framing, `<base>`, off-site form posts |
| F-17 recent-auth for deletion | E-mail confirmation + rate limit + CSRF guard + SameSite=Lax cookies |
| F-18 sign-out keeps local data | Local-first by design; shared-computer users should use a private window |
| F-25 no import caps | Self-DoS only; nothing server-side parses uploads |
| Privacy/legal | Placeholders remain in the legal pages (entity, address, jurisdiction) — **needs Dan + a lawyer**; not assessed here |
| Load / capacity | **NOT MEASURED.** No staging exists to test against |

## 11. Final recommendation

**Not safe to launch as deployed.** Reaching **Safe for limited beta** requires, in this order:
1. V-1 + V-2 (protect and split previews) — the only finding that is exposure *today*.
2. S-1, then deploy this branch through a protected preview (V-5) and promote; re-run the retention dry run
   (`curl.exe -H "Authorization: Bearer $CRON_SECRET" "https://done.design/api/account/retention?dryRun=1"`) and read
   `foreignRooms`.
3. V-6 monitoring (uptime + Sentry + cron alert) and S-4 backups **with a completed restore test**.
4. G-1 (secret scanning, Dependabot alerts).

**Full launch** additionally wants: S-2/S-3/S-6, staging + ZAP baseline + a load test, a decision on F-09, DNS hygiene
(D-1..D-3), the runbook rehearsed once, and the legal placeholders closed by Dan and counsel.
