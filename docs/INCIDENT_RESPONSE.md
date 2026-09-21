# Incident response and secret rotation

Written 2026-09-21 as part of the pre-launch audit (`SECURITY_AUDIT.md`). Meant to be
followed under pressure by Dan, alone. **Nothing here has been rehearsed yet** — the
first item on the "before launch" list is to do one dry run of §3 (revoke a share
link) and §5 (rotate `CRON_SECRET`) on staging.

Reporting contact: `done.design.app@gmail.com` (published in `/.well-known/security.txt`).

---

## 1. First ten minutes — contain, don't investigate

| Symptom | Containment (in this order) |
|---|---|
| A share link went to the wrong person / leaked | Editor → Share → **Revoke all links** (needs migration 0005). Then send the new link to the right people. |
| Someone is editing or deleting a room they should not | Revoke links (above). If they are still connected, delete the room: Liveblocks dashboard → Rooms → the room → Delete. The owner's project survives in their browser and Supabase; the room is re-seeded on next "Go live". |
| Service-role key, Liveblocks secret, or any server secret exposed | §4 rotation table — rotate the ONE secret first, redeploy, then look at logs. |
| Data of one user visible to another | Roll back to the last known good production deployment (§2), then stop and preserve logs (§6) before investigating. |
| Cost spike (Supabase egress, Liveblocks MAU, Vercel functions) | Vercel → Firewall → add a rate-limit / deny rule for the offending path or IP; if it is Liveblocks, delete `LIVEBLOCKS_SECRET_KEY` from Production and redeploy (guests and sharing fail closed with 503 — solo editing still works). |
| Retention sweep or account deletion misbehaving | Vercel → Settings → Cron Jobs → disable `/api/account/retention`. Deletion is user-initiated; to stop it, remove `SUPABASE_SERVICE_ROLE_KEY` from Production and redeploy (the route answers 503 and does nothing). |
| Site down | Vercel status page, then Supabase status, then Liveblocks status. `curl https://done.design/api/health` — `checks.*` tells you which dependency is unconfigured. |

## 2. Roll back a deployment

Vercel → Project → Deployments → pick the last good **Production** deployment → ⋯ →
**Promote to Production**. Takes seconds and does not touch the database. A bad
**migration** is different: migrations here are forward-only; every one carries its own
"ROLLBACK (forward-recovery)" block in its header (see `0005_security_hardening.sql`).

## 3. Revoke share access

* One room, all links: the **Revoke all links** button (owner only) or
  `POST /api/share/revoke {"room":"floorplan-<id>"}` with the owner's session.
* Effect: every grant minted before now fails at `/api/liveblocks-auth` and cannot mint new
  grants at `/api/share`. **A collaborator already connected keeps their Liveblocks token
  until it expires or they reconnect** — for immediate removal, delete the room in the
  Liveblocks dashboard.
* Every room at once (secret compromise): rotate `SHARE_SIGNING_SECRET` (§4). All links and
  all owner cookies stop verifying. Owners re-enter through the database check.

## 4. Secrets: what exists, who owns it, how to rotate

All secrets live only in Vercel environment variables. Nothing is in git (history scanned
2026-09-21, 539 commits, no matches). Owner of every row is Dan.

| Secret | Where it comes from | Blast radius if leaked | Rotate by |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys | **Total**: bypasses every RLS policy on every account | Supabase → API keys → rotate/regenerate the service key → update Vercel (Production only) → redeploy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | Public by design; only RLS protects data | Same page; needed only if RLS was found broken and you want to invalidate old client copies |
| `LIVEBLOCKS_SECRET_KEY` | Liveblocks dashboard → API keys | Anyone can mint access to ANY room and delete rooms | Liveblocks → regenerate secret → Vercel → redeploy. Also invalidates share links **if** `SHARE_SIGNING_SECRET` is unset (it falls back to this key) |
| `SHARE_SIGNING_SECRET` | You generate it: `openssl rand -base64 48` | Anyone can forge a `build` grant for any room | Generate a new one → Vercel → redeploy. Every existing link and owner cookie stops verifying — that is the point after a compromise. (While `LIVEBLOCKS_SECRET_KEY` is also set, grants signed with it still verify as a legacy key; after a suspected forgery, rotate that too, or remove the legacy fallback in `grant.server.ts`.) |
| `CRON_SECRET` | You generate it | Anyone can trigger the retention sweep (deletes data) | New value → Vercel (Production) → redeploy. Vercel Cron picks it up on the next run |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console | Rate limits can be reset; cost routes fail closed without it | Upstash → rotate token → Vercel → redeploy |
| `RESEND_API_KEY` (when enabled) | Resend dashboard | Send mail as the domain | Resend → revoke key → new key → Vercel |
| `SENTRY_AUTH_TOKEN` / DSN (when enabled) | Sentry | Source-map upload / event spoofing | Sentry → revoke token |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` | Vercel Blob | Overwrite the furniture catalog | Vercel → Storage → Blob → rotate token |

After ANY rotation: redeploy, then `curl https://done.design/api/health` and confirm
`ok:true` and every `checks.*` true.

Never paste a secret into chat, a ticket, or a commit. If one was, treat it as leaked and rotate.

## 5. Sessions and accounts

* One user: Supabase → Authentication → Users → the user → **Sign out** / Ban. Server routes
  re-verify with Supabase on every call (`getUser()`), so a banned user loses `/api/*` access
  immediately; their existing JWT still satisfies RLS reads on their **own** rows for up to
  one hour (its expiry).
* Everyone: Supabase → Authentication → rotate the JWT secret. **This signs out all users and
  invalidates the anon and service keys** — plan to update both in Vercel and redeploy.

## 6. Preserve evidence, then notify

1. Before changing anything else: Vercel → Logs → export the window (they expire); Supabase →
   Logs → export; Liveblocks → Rooms activity. Note request IDs and timestamps.
2. Structured log lines are JSON (`kind: request | exception`, `route`, `status`, `userId`,
   `reason`) — filter on `route:"account/delete"` etc. They never contain plan content, emails
   or grants.
3. If personal data of real users was exposed: **stop and consult counsel the same day** — this
   product serves Israeli and EU users, and notification deadlines (72 hours under GDPR) run from
   awareness, not from the end of your investigation. This document does not decide that for you.
4. Tell affected users plainly: what happened, what data, what you did, what they should do.

## 7. After

Write down: timeline, root cause, what detection would have caught it sooner, what changes. Put the
fix and a regression test in the same PR. Add the class of bug to `SECURITY_AUDIT.md`.

---

## 8. Alerts that must exist before launch (none are configured today)

| Signal | Where | Threshold to start with |
|---|---|---|
| `/api/health` non-200 or `ok:false` | UptimeRobot / Better Stack (free) | 2 consecutive failures, every 1–5 min |
| Server error rate | Sentry (needs `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` set) | > 5 events / 10 min |
| Cron failure (`/api/account/retention`) | Vercel → Cron Jobs → failure notification; plus Sentry | any failure |
| 401/403/429 spikes | Vercel Logs alert or Sentry issue alert on `reason` | 10× baseline |
| Spend | Supabase spend cap ON, Liveblocks + Vercel + Upstash usage alerts, Anthropic n/a (no key deployed) | 50 % / 80 % of plan |
| Backup status | Supabase → Database → Backups (daily) / PITR | any missed backup |

Test the alert path once: trigger a deliberate 500 on staging and confirm the email arrives.
