# Abuse / takedown runbook

What happens when someone reports a plan, a share link, a live room, or an
uploaded image as infringing, abusive, or otherwise reportable — and exactly
what Dan does about it.

Companion to `docs/DATA_RETENTION.md` (what is stored, where, and for how
long) and `docs/PROVISIONING.md` (what must be set for a deployment to work).
This file does not repeat either — it only covers the report → triage → action
path.

**Status: UNVERIFIED.** Everything here was written against the code, but the
migration has never been applied to any Supabase project and the admin script
has never been run — see "Before you touch anything" below.

---

## 0. The shape of it

```
reporter (no account needed)
   │  fills in /report
   ▼
POST /api/abuse-report  (unauthenticated, rate-limited hard, fail-closed)
   │  service-role insert — RLS blocks every other path to this table
   ▼
public.abuse_reports   (readable only by the service role)
   │
   ▼
Dan, locally: npx tsx --env-file=.env.local scripts/abuse-admin.ts <command>
   │  list → show → correlate to a project/room/asset → act → set-status
   ▼
share link / live room disabled, or asset removed, or report dismissed
```

Files involved:

| Piece | File |
|---|---|
| Table | `supabase/migrations/0003_abuse_reports.sql` |
| Report route | `src/app/api/abuse-report/route.ts` |
| Report page | `src/app/report/page.tsx` (served at `/report`) |
| Admin CLI | `scripts/abuse-admin.ts` |
| Shared validation | `abuseTargetKindSchema` / `abuseReasonSchema` in `src/lib/api/schemas.ts` |

There is **no admin app route** for any of this, on purpose — see §5.

---

## 1. Before you touch anything

This whole workstream was built without `node_modules` (a concurrent branch
was rewriting the lockfile) and without ever connecting to a real Supabase
project. Before relying on it in production:

1. Read `supabase/migrations/0003_abuse_reports.sql` end to end.
2. Apply it the same way `docs/PROVISIONING.md` §1 describes for
   `0002_live_rooms.sql`: Supabase dashboard → SQL Editor → paste → Run.
3. Confirm `select * from public.abuse_reports limit 1;` runs (empty result is
   fine) and that `select * from public.abuse_reports;` **fails with a
   permission error when run as `anon` or `authenticated`** — that failure is
   the point, not a bug. It should only succeed via the SQL editor (which runs
   as the Postgres owner) or the service role.
4. Submit one test report through `/report` on a preview deployment (not
   production) and confirm it lands in the table.
5. Run `scripts/abuse-admin.ts list` and `show <id>` against that same test
   report before trusting the script against anything real.

## 2. How a report gets in

`/report` is a plain page, no sign-in, reachable from a link Dan pastes into
the legal pages (§8). It posts JSON to `/api/abuse-report`, which:

- requires no authentication (`optionalUser()` — used only to key rate limits
  more precisely for a signed-in caller, never to gate the request);
- validates with zod (`targetKind`, `targetId`, `reason`, `detail`, optional
  `reporterContact`);
- rate-limits **hard**: 5 requests per 10 minutes per caller (IP, or account
  if signed in), plus a system-wide ceiling of 200/hour. Classed `"cost"` in
  `rateLimit.ts` terms, not `"abuse"` — in production, if the Upstash backend
  isn't reachable, the route returns 503 rather than falling back to
  per-instance memory limiting. This is the one unauthenticated endpoint in
  the app that needs no prior state to call, so it gets the stricter of the
  two limiter behaviors on purpose. If you'd rather the form stay up (degraded
  limiting) than go dark when Upstash blips, that's a one-word change
  (`kind: "cost"` → `"abuse"`) in `src/app/api/abuse-report/route.ts` — a
  judgment call left to Dan;
- writes with the **service-role client**, never the caller's own session —
  this is what makes it safe for the database to grant the `anon`/
  `authenticated` roles nothing at all on `abuse_reports` (§4);
- **never checks whether the reported id exists.** It doesn't query
  `projects`, `live_rooms`, or storage at all. Doing so would let a caller use
  this endpoint to binary-search ids into existence — the same reasoning
  `roomPolicy.ts`/`rooms.ts` already apply to share grants;
- returns the same neutral acknowledgement (`{ ok: true, message: "Report
  received. Thank you." }`) whether or not the target is real, whether or not
  the report is a duplicate, and whether or not it's obvious nonsense. The
  filtering happens on Dan's side, not the caller's.

A hidden honeypot field (`website`) on the form silently drops bot submissions
without writing a row — see the comment in `src/app/report/page.tsx`. It is
not a substitute for the rate limit, just a second, cheap layer.

## 3. Looking up a report

Everything below runs from the repo root, once, with the same environment
variables the app's own service-role routes need
(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — see
`docs/PROVISIONING.md` §3 for where to get them; add `LIVEBLOCKS_SECRET_KEY`
for anything that touches a live room). Node 20.6+'s `--env-file` avoids
adding a `dotenv` dependency:

```
npx tsx --env-file=.env.local scripts/abuse-admin.ts list
npx tsx --env-file=.env.local scripts/abuse-admin.ts show <report-id>
```

`list` shows open + in-review reports, newest first (`list all` for every
status). `show <id>` prints the full row, and — because the same command
already knows how — attempts to correlate it: if `target_kind` is `project`
and `target_id` looks like a UUID, or if `target_id` contains a
`floorplan-<id>` room reference anywhere (including inside a full share URL
someone pasted), it prints the matching project/room lookup underneath. This
is best-effort, not authoritative — the reporter typed `target_id` by hand, so
always sanity-check what comes back against the report's free-text `detail`
before acting on it.

Treat running this script as equivalent to holding
`SUPABASE_SERVICE_ROLE_KEY` directly, because that's what it does — see the
script's own docblock and `src/lib/supabase/admin.ts`.

## 4. Why there's no admin route, and why RLS is "deny everyone"

`abuse_reports` has row-level security enabled with **zero policies** for
`anon` or `authenticated`, and the migration explicitly revokes all grants
from both roles. Two deliberate consequences:

- **The public can't read reports.** There's no owner column this could
  reasonably be scoped to — reports are about other people (the uploader,
  sometimes a stranger's private information) or the reporter themself, and
  the one thing worse than "no one can read this" is "the person it's about
  can read it."
- **The public can't write around the rate limiter either.** If `anon` had an
  INSERT policy, a caller could skip `/api/abuse-report` entirely and POST
  straight at Supabase's REST API (PostgREST) — same table, no rate limit, no
  honeypot, no validation beyond the check constraints. Zero grants means the
  app's own route is the *only* door.

That second point is also why there's no `/api/admin/...` route for Dan to
list or action reports from a browser: building one safely needs an admin
auth model (who's allowed to call it, and how do they prove it) that this app
does not have yet. Bolting service-role access onto a route with no auth check
would be strictly worse than the current state. `scripts/abuse-admin.ts` gets
the same access the honest way — Dan's own machine, Dan's own copy of the
service-role key, no network-facing surface at all.

## 5. Finding the target

Once `show <report-id>` (or `find-room` / `find-project`) points you at a
project or room, look at what's actually there before acting:

```
npx tsx --env-file=.env.local scripts/abuse-admin.ts find-project <project-id>
npx tsx --env-file=.env.local scripts/abuse-admin.ts find-room <room-or-share-url>
```

`find-project` prints the project row (name, timestamps, `deleted_at`,
`plan_image_path`, `thumb_path`, `live_room_id`) and resolves the owner's
email via `auth.admin.getUserById`. `find-room` resolves a `floorplan-<id>`
room — paste the whole share URL
(`https://…/v/floorplan-xxxx?g=…`) and it extracts the id — against
`public.live_rooms` (who claimed it) and `public.projects` (which project, if
any, currently has `live_room_id` set to it).

To actually **see** the reported content (the plan image, or the 3D scene),
open the Supabase dashboard:

- **Table editor** → `projects` / `project_docs` for the row's data. Reading
  `project_docs.state` is reading someone's floor plan geometry directly —
  treat it the way `docs/DATA_RETENTION.md` treats it: it's personal data,
  handle it no more than the report requires.
- **Storage** → `plans` / `thumbs` buckets, path `<owner-uid>/<project-id>.<ext>`
  (from `plan_image_path`/`thumb_path` on the project row, or just browse the
  owner's folder). Both buckets are private — there is no public URL to open;
  view the file from inside the dashboard's storage browser.
- **Liveblocks dashboard** (liveblocks.io) → the room by its `floorplan-<id>`
  name, if you need to see live collaborators or the current Yjs document
  rather than the last-synced Supabase copy.

## 6. Disabling a share link / a live room

**Read this before promising a reporter "the link is dead" — the mechanism is
not what it sounds like.** Share links are stateless: `POST /api/share` mints
an HMAC-signed grant (`src/collab/grant.server.ts`) with a 30-day expiry
baked in at mint time. There is **no database row for a share grant** — it is
not stored anywhere, so there is nothing to delete to revoke *one specific
link*. The grant stays valid, cryptographically, until it expires on its own.

What Dan can actually do, in order of how surgical it is:

1. **Kill the room (the normal case).** A share link is only useful because it
   opens a live room — kill the room and the link opens nothing, regardless of
   whether its grant would still verify:

   ```
   npx tsx --env-file=.env.local scripts/abuse-admin.ts disable-room <room-or-share-url>
   npx tsx --env-file=.env.local scripts/abuse-admin.ts disable-room <room-or-share-url> --yes
   ```

   Run it once without `--yes` first — it prints what it found (the
   `live_rooms` claim, the project that references the room) without changing
   anything. With `--yes` it: deletes the Liveblocks room (the live Yjs
   document — anyone still holding the link can no longer join or see live
   content), clears `live_room_id` on any project row pointing at it (so the
   owner's next "Go live" mints a fresh room instead of resurrecting this
   one), and clears the `public.live_rooms` claim. **This does not touch the
   owner's saved plan** — `projects`/`project_docs` and the plan image/thumbnail
   are untouched; only the live collaboration session is removed. If the
   report is about the plan's *content* (not just the fact that it's live),
   also do §7.

2. **Rotate `SHARE_SIGNING_SECRET` (the blunt instrument).** This invalidates
   *every* share link in circulation, for every project, immediately —
   `verifyGrant()` in `src/collab/grant.server.ts` checks the current secret
   plus one legacy fallback, and rotating drops the oldest one out of that
   window. Only reach for this if a single room isn't enough (e.g. the report
   implies the signing secret itself leaked). Generate a new value the same
   way `docs/PROVISIONING.md` §2 describes, set it in Vercel, redeploy. Every
   user with an open share link — not just the reported one — will need a new
   one minted.

There is currently no way to revoke a single share link without either of the
above. If that granularity turns out to matter often, the real fix is to make
grants stateful (a `share_grants` table checked on every verify) — a schema
change, out of scope here, and something to raise with Dan rather than bolt on
quietly.

## 7. Removing an uploaded asset

For a plan image or thumbnail in the private `plans`/`thumbs` buckets:

```
npx tsx --env-file=.env.local scripts/abuse-admin.ts remove-asset plans <uid>/<project-id>.<ext>
npx tsx --env-file=.env.local scripts/abuse-admin.ts remove-asset plans <uid>/<project-id>.<ext> --yes
```

Get the exact path from `find-project`'s `plan_image_path`/`thumb_path`
output, or by browsing the owner's folder in the Storage dashboard. Same
dry-run-by-default shape as `disable-room`; `--yes` deletes and then
**re-lists the bucket to confirm the object is actually gone**, the same
"don't trust `remove()`'s success, verify by re-listing" discipline
`src/app/api/account/delete/route.ts` uses.

**This is permanent — there is no backup to restore from**, same as every
other deletion path in this app (`docs/DATA_RETENTION.md` §4).

**Follow-up the script does not do for you:** deleting the storage object
leaves the project row's `plan_image_path`/`thumb_path` pointing at a file
that no longer exists, which the app will render as a broken image the next
time the owner opens that plan. If that's an acceptable (or even desired —
the plan *was* the problem) outcome, stop there. If you want the project to
degrade cleanly instead, blank the column via the Supabase SQL editor:

```sql
update public.projects
   set plan_image_path = null   -- or thumb_path, or both
 where id = '<project-id>';
```

This is deliberately a manual SQL step, not another script flag — it's rare
enough, and consequential enough (it changes what the owner sees of their own
plan) that it shouldn't be one flag away from `remove-asset`.

## 8. What Dan cannot do yet (say this plainly, don't paper over it)

- **No single-user "delete this account" for an admin.**
  `/api/account/delete` only accepts the caller's own session — there is no
  service-role path to fully purge one specific user's account the way a
  self-service deletion does. For content severe enough to warrant that
  (repeat infringement, clearly illegal content), the real sequence is the one
  `docs/DATA_RETENTION.md` §4.1 documents for self-deletion — live rooms,
  then storage (enumerate, delete, re-list to verify), then
  `project_docs`/`projects`/`live_rooms`, then the auth user, in that order —
  run by hand against the specific `owner` uid via the SQL editor and the
  Storage dashboard, or by extending `scripts/abuse-admin.ts` with a command
  that does exactly that sequence before you rely on it. Do not skip steps or
  reorder them; the ordering in §4.1 exists so a partial failure never strands
  data with no owner pointing at it.
- **No automatic retention/expiry on `abuse_reports` itself.** Unlike
  projects and orphaned files (`docs/DATA_RETENTION.md` §3), nothing purges
  old reports. They accumulate until someone deletes them. A reasonable future
  policy — purge `dismissed`/`actioned` reports after some window, keep `open`
  ones indefinitely — would slot into the existing
  `/api/account/retention` cron pattern, but that is **not implemented**;
  don't describe it as implemented anywhere Dan-facing (a legal page
  included) until it is.
- **No automated acknowledgement email.** `src/app/api/abuse-report/route.ts`
  has a `TODO(email)` marking where a "we got your report" email belongs,
  once `src/lib/email/` (owned by a separate branch) exists. Until then, §9's
  templates are sent by hand, only when `reporterContact` was given.

## 9. What to send the reporter, and what to send the uploader

No email is sent automatically (§8). When Dan follows up by hand, using the
`reporter_contact` on the report row (if any) or the project owner's email
(`find-project`'s output):

**To the reporter**, after triage — keep it as neutral as the form's own
acknowledgement; do not confirm what action was taken against another
person's account:

> Thanks for your report. We've reviewed it and taken appropriate action. For
> privacy reasons we don't share details about actions taken on another
> user's account. If you have follow-up information, reply to this email.

**To the uploader**, only when content was actually removed or a room
disabled — say what happened and why, without naming the reporter (the
report is not theirs to see, symmetrically to §4):

> We received a report about [a plan / a shared link / a live room] on your
> Floorplan → 3D account and, after review, [removed the image /
> disabled the shared link] because [reason category, in plain language —
> e.g. "it appeared to reproduce copyrighted architectural drawings"]. Your
> plan itself has not been deleted. If you believe this was a mistake, reply
> to this email.

Adjust the bracketed parts to the actual `reason`/`target_kind` and to what
§6/§7 actually did. Keep a copy of what was sent — there is nowhere in the
schema that logs it (another reason not to overstate what's automated).

## 10. Legal-page wording

Dan should paste this into `src/app/legal/privacy/page.tsx` and
`src/app/legal/terms/page.tsx` by hand — this workstream does not edit those
files (another branch owns them). Suggested placement: near the end, as its
own section.

```
## Reporting abuse or infringing content

If you believe a plan, a shared link, a live collaboration room, or an
uploaded image on this Service infringes your copyright or other rights,
exposes someone's private information, or otherwise violates our policies,
report it at [/report](/report). You do not need an account to file a report,
and providing contact information is optional. We review every report and
may remove content, disable a shared link, or take other action in response.
```

Adjust the wording to match the surrounding document's voice (both legal
pages currently carry a `DraftBanner` — see `src/app/legal/legalKit.tsx` —
marking them as not-yet-lawyer-reviewed; this section should get the same
treatment until the whole page is signed off).

## 11. Retention of reports

Current, actual state (not aspirational — see §8): `abuse_reports` rows are
kept **indefinitely**. Nothing purges them. If Dan wants a retention window,
the honest options are (a) delete rows by hand periodically via the SQL
editor once resolved, or (b) build a real sweep pass modeled on
`src/app/api/account/retention/route.ts`. Neither is done here.
