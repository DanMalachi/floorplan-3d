# Launch handoff — what is done, what is left, in order

Written 2026-09-21. Source of truth for findings and evidence: `SECURITY_AUDIT.md`.
Runbook for incidents and secret rotation: `docs/INCIDENT_RESPONSE.md`.
PR: https://github.com/DanMalachi/floorplan-3d/pull/33 (branch `audit/security`, worktree `C:\Users\dandu\fp-wt\security`).

**Verdict today: still NOT safe to launch.** The code fixes are written and tested but **not on
production**; three operational blockers need accounts/decisions only Dan has.

## Done (verified)

| Item | Evidence |
|---|---|
| Code fixes F-01 (room deletion scope), F-02 (link revocation), F-04 (next 16.3.5, audit 0), F-07, F-08, F-10 (CSP enforced), F-11/12 (migration), F-15, F-25 (import caps), CSRF guard, rate limits, no-store, security.txt | PR #33, commits `566ce3e`, `0000ca9`; `npm run test:security` all pass; tsc/eslint 0 errors; build ok; smoke 25/25 |
| Migration `0005` | Dan ran it in Supabase 2026-09-21. **Not independently verified** — run the three `select`s at the bottom of the file and confirm |
| **F-03 closed**: previews were public + held prod secrets | Deployment Protection set to `all_except_custom_domains` (preview + `*.vercel.app` URLs now 302 to login; `done.design` still 200). Every secret (service role, Liveblocks, share signing, Upstash, Supabase URL/anon) is now **Production-only** (`vercel env ls`) |
| **F-19 closed**: `*.vercel.app` alias served prod | Same protection setting (alias now 302) |
| GitHub: secret scanning, push protection, Dependabot alerts + security updates | `gh api repos/DanMalachi/floorplan-3d` → all `enabled` |
| Lint red on main | 0 errors on the branch, so the required lint step can gate |

## Left, in this order

### 1. Merge and deploy the code (approval needed at the merge step)
1. Wait for PR #33 checks (`gh pr checks 33`): `Lint, typecheck, build`, `npm audit (high+)`, `Analyze`, `pytest`.
   The `pytest` job is the old extraction pipeline; the required-check rule for it is the open task in
   `git-branch-layout` memory (it only ever "bypasses").
2. The PR's Vercel preview is **guest-only now** (no Supabase/Liveblocks in Preview) — it can only prove the app boots,
   headers and routes. Real share/revoke testing needs a **staging Supabase + Liveblocks dev project** (item 5) or a
   production canary. Do not put production secrets back into Preview.
3. Merging to `main` **is a production deploy**. Before merging, confirm migration 0005 with the `select`s.
4. After the deploy, in this order:
   * `curl https://done.design/api/health` → `ok:true`, **every `checks.*` true**. This also proves the API-edited
     env targets kept their values (Vercel shows sensitive values as empty, so a deploy is the only test).
     If any is false → *Promote to Production* the previous deployment (instant rollback), then re-enter that value.
   * Sign in with Google → open editor → Go live → open the link in a second browser (guest) → Share →
     **Revoke all links** → reload the guest tab → it must be refused (403 "invalid/revoked").
   * Retention dry run, read `foreignRooms` and `wouldDelete`:
     `curl.exe -H "Authorization: Bearer $CRON_SECRET" "https://done.design/api/account/retention?dryRun=1"`
     (use `done.design`, **not** the `*.vercel.app` alias, which is now behind login).
   * **Watch the next 03:17 UTC cron** (Vercel → Cron Jobs). Deployment Protection is set to spare custom domains, and
     Vercel documents cron as unaffected, but this has not been observed on this project. If it fails with 401/403,
     switch the project's `ssoProtection.deploymentType` to `"preview"` (previews only; `vercel api` PATCH as in
     this session's history, or Settings → Deployment Protection) and re-check. Previews stay closed either way.
   * Browser check of the **enforced CSP** on the real site (open DevTools console on `/design`, load a furniture model,
     open a walkthrough, sign in). Any "Refused to …" line means add that host to `next.config.ts`, or set build env
     `CSP_REPORT_ONLY=1` and redeploy to revert.

### 2. Monitoring and alerts (Dan — none exist today) — P0
Sentry project → set `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` (Production), `SENTRY_ORG`, `SENTRY_PROJECT`,
`SENTRY_AUTH_TOKEN` (build). UptimeRobot/Better Stack on `https://done.design/api/health`. Vercel cron failure
notification. Spend caps on Vercel, Supabase, Liveblocks, Upstash. Thresholds: `INCIDENT_RESPONSE.md` §8.
Then trigger one deliberate 500 on the preview and confirm the alert arrives.

### 3. Backups and a real restore test — DEFERRED BY DECISION (2026-09-21), risk accepted for first launch
Dan chose not to pay for Supabase backups yet. Compensating controls and their limits: `SECURITY_AUDIT.md` §9 and F-29
(devices now re-upload a project the server lost). Revisit before paid tiers. When ready: merge `docs/backups-pitr` (`docs/BACKUPS.md`), choose a Supabase plan with daily backups (PITR recommended), restore
into a **new** project, check row counts and 3 plan images, sign in as a test user, record measured RPO/RTO.
Note the client-`rev` regression (F-26) before the first real restore.

### 4. Supabase auth settings (Dan, 5 minutes) — P1
Disable the **Email** provider and Anonymous sign-ins (Google only); Redirect URLs exactly
`https://done.design/auth/callback` (no `*.vercel.app` wildcard — the alias is protected now anyway); enforce MFA for
org members; spend cap.

### 5. Staging (needed for ZAP, load test, RLS test, safe previews)
Create a staging Supabase project + Liveblocks dev project, add their values as **Preview-only** env entries, apply
migrations 0001, 0002, 0004, 0005, run `supabase/tests/rls_audit.sql` (expect `ALL RLS CHECKS PASSED`), then:
`docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t <protected staging url>` (needs a Vercel
protection-bypass token for a protected URL) and one load test.

### 6. Decisions and hygiene
* **`decorate` role is not server-enforced** (F-09): relabel, drop, or redesign.
* Confirm the quota numbers in `0005` (500 projects, 16 MiB/doc, 50 MiB/5 MiB buckets).
* DNS: CAA `0 issue "letsencrypt.org"`, DNSSEC, DMARC; registrar 2FA + domain lock. **Do not submit to hstspreload.org**
  until every subdomain is confirmed HTTPS-only.
* Liveblocks: delete unused `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`; confirm rooms default private.
* Branch protection on `main`: require the lint/audit checks; resolve the `pytest` rule.
* Optional but recommended: rotate `SUPABASE_SERVICE_ROLE_KEY` and `LIVEBLOCKS_SECRET_KEY` (they lived in public
  previews' Preview scope for weeks; old preview deployments keep their build-time copies). Procedure:
  `INCIDENT_RESPONSE.md` §4. Old previews are now behind login, so this is defence in depth, not an emergency.
* Legal placeholders (entity, address, jurisdiction) need Dan + a lawyer.
* P2s not done: recent-auth for account deletion (F-17), sign-out keeps local data (F-18), grant in URL query (F-20),
  per-user room-claim cap (F-24).

## Gate to "safe for limited beta"
Item 1 (deployed and checks pass — done, incl. the F-29 sync fix once merged) and item 2 (monitoring). Backups are a documented, accepted risk for first launch. **Full launch**: add 4, 5, the `decorate` decision, DNS, legal.
