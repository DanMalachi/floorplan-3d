# Provisioning — do this before the next deploy

Everything in the 2026-08-23 security work is written, pushed, and building, but
**none of it is live**. Several routes now fail *closed*: if a secret is missing
they refuse to run rather than run insecurely. That is deliberate, and it means
**deploying before finishing this list is worse than not deploying at all.**

Work top to bottom. Steps 1–5 are required. Steps 6–8 are verification.

---

## 1. Apply the database migrations

Supabase dashboard → **SQL Editor**. Paste the whole contents of each file → Run,
in this order:

1. `supabase/migrations/0002_live_rooms.sql` — creates the `live_rooms` table that
   records who owns a shared room.
   **If you skip it:** share links stop working entirely — the server can no longer
   tell a room's owner from a stranger, so it refuses everyone.
2. `supabase/migrations/0004_service_role_grants.sql` — gives `service_role` the
   table privileges it was never granted. RLS bypass is not table permission.
   **If you skip it:** the nightly retention sweep and "delete my account" both
   fail `permission denied for table projects`. Deletion fails safe rather than
   half-finishing, but neither feature works, and the Privacy Policy promises both.

Applying the second one **re-arms account deletion for real** — it has never yet
run successfully against the database. Test it on a throwaway Google account
first; see step 8.

---

## 2. Set `SHARE_SIGNING_SECRET`

This signs share links so nobody can forge one. Generate a random value:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Vercel → Project → Settings → **Environment Variables** → add it for Production.

**If you skip it:** in production, minting a share link returns an error. (It used
to silently fall back to a secret written in the source code, which anyone could
read and use to forge an "edit everything" link. That fallback is gone.)

---

## 3. Set `SUPABASE_SERVICE_ROLE_KEY`

Supabase dashboard → Settings → **API** → copy the `service_role` key.
Add it in Vercel as above.

> **Treat this like a password.** It bypasses every access rule in the database.
> It must only ever live in Vercel's environment variables — never in a file you
> commit, never anywhere with `NEXT_PUBLIC` in the name.

**If you skip it:** the "delete my account" button stays hidden and deletion is
unavailable. Nothing breaks; the feature just isn't offered.

---

## 4. Set `CRON_SECRET`

Generate another random value the same way as step 2. This stops strangers from
triggering the nightly cleanup job.

**If you skip it:** the retention sweep refuses to run.

---

## 5. Set up Upstash (rate limiting)

Create a free Redis database at upstash.com, then copy its two REST values into
Vercel: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

**If you skip it:** rate limiting falls back to per-server counting, which barely
works on Vercel because each visitor may hit a different server. Not fatal, but
it is the difference between real protection and the appearance of it.

---

## 6. Deploy, then claim your existing live rooms

Deploy. Then **open every live project you already have, once, while signed in.**

Older rooms have short IDs (8 characters) from before this change. Until you open
one, nobody is recorded as its owner, and someone who guesses the ID could claim
it. Opening it registers you as the owner and closes that window.

New rooms use full-length IDs and are not guessable.

---

## 7. Dry-run the cleanup

The nightly sweep deletes old files. Run it in preview mode with `?dryRun=1`,
which reports what it *would* delete and deletes nothing.

**This is not a gate you open.** Once step 4 set `CRON_SECRET`, the sweep is
scheduled in `vercel.json` and runs by itself at 03:17 every night. The dry run
tells you what it has been doing, not whether to allow it.

**You cannot do this in a browser** — the route requires an `Authorization`
header, so a browser visit returns 403. Use curl, and on Windows write
`curl.exe` explicitly: in PowerShell, bare `curl` is an alias for
`Invoke-WebRequest`, whose `-H` expects a hashtable and will reject the command.

```
curl.exe -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://YOUR-PROD-URL/api/account/retention?dryRun=1"
```

**Read the body, not the status code.** The route returns HTTP 500 whenever
anything went wrong *as well as* when it crashed, and puts the explanation in the
response body either way. `Invoke-RestMethod` and `fetch` both throw on a non-2xx
status and discard that body — which is exactly the diagnosis you need. `curl.exe`
prints it regardless.

What to look at, in order:

| Field | What it means |
|---|---|
| `skipped` | Things it could not read. **Not empty means do not trust any other number here** — it means "I could not look", not "there is nothing there". |
| `wouldDelete` | The actual list. This is the bit to read. |
| `capped: true` | It hit the 5,000-item limit. Something is probably wrong. |
| `purged` / `orphans` | The counts. Meaningless if `skipped` is non-empty. |

**Green light:** `ok: true`, `skipped` empty, and nothing in the list you recognise
as a live project. **Stop and ask:** anything you recognise, a non-empty `skipped`,
`capped: true`, or counts in the thousands.

If `skipped` reports `permission denied for table projects`, migration
`0004_service_role_grants.sql` from step 1 has not been applied.

---

## 8. Test account deletion on a throwaway account

Sign in with a Google account you do not care about, make a project, then delete
it through Avatar → Your data.

**Never test this on your own account.** Deletion is permanent and there is no
undo. None of this code has ever run against the real database.

---

## 9. Optional: turn on error tracking and uptime alerts

Neither is required — the app runs fine without both.

**Errors (Sentry).** Create a free project at sentry.io, copy its DSN, and add it
in Vercel as `NEXT_PUBLIC_SENTRY_DSN`. Until you do, error tracking is completely
dormant: no account, no network calls, no cost. Session replay and performance
tracing are deliberately off — replay would record the user's floor plan.

**Uptime.** Point any monitor (UptimeRobot, Better Stack, Vercel's own checks) at:

```
https://<your-domain>/api/health
```

It returns 200 when the app is configured and serving, 503 when something
essential is missing, and a small report of which pieces are set — booleans only,
never secret values. Alert on non-200.

You can open that URL right now to see exactly which steps above are still
outstanding on any deployment.

---

## Not required, but worth knowing

- `LOCAL_TOOLS_ENABLED`, `PYTHON_EXE`, `ODA_CONVERTER_EXE` — only needed on your
  own machine, and only if you want DWG import back. Leave unset in production;
  the converter is a desktop program that cannot exist there anyway.
- `ANTHROPIC_API_KEY` — the app no longer uses it. Only the by-hand evaluation
  scripts do. It does not need to be set in production.
- `CLASSIFY_MAX_BODY_BYTES` — left over from the retired AI routes; harmless.
