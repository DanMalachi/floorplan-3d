# Postgres backup and restore

What backs this product up, what a restore actually does, what it does **not**
touch, and the sharp edge a restore creates for clients that have already
synced. Written to be followed by Dan, under pressure, during a real incident.

**This is a decision-and-restore runbook, not a decision already made.**
Sections 3–4 lay out the Supabase options and their cost so Dan can pick one;
nothing here has been purchased or enabled. Every number in §3 is cited
against Supabase's own docs, fetched 2026-08-24. Where a number could not be
confirmed, it is marked **NOT VERIFIED** rather than estimated.

---

## 1. What state exists, and where

| State | Lives in | Covered by a Postgres backup/PITR? |
|---|---|---|
| `auth.users`, `public.projects`, `public.project_docs`, `public.live_rooms` | Supabase Postgres | **Yes** — this is exactly what a backup/PITR restores |
| Imported plan image bytes | Supabase Storage bucket `plans` (private, `<user id>/<project id>.<ext>`) | **No** — see §2.1 |
| Gallery thumbnail bytes | Supabase Storage bucket `thumbs` (same path shape) | **No** — see §2.1 |
| Furniture/model catalog (glb files, thumbnails) | Vercel Blob, populated by `scripts/ikea/*` and `scripts/blenderkit/*` (`npm run ikea:upload`, `bk:*`) | **No, and not applicable** — see §2.2 |
| Live collaborative scene (Yjs doc) for a project that's "gone live" | Liveblocks, room `floorplan-<id>` | **No** — see §2.3 |
| A signed-in user's own copy of their plans | This browser's IndexedDB (`floorplan3d` / `kv`, `src/store/idb.ts`) | **No, and never was** — a client-side store, restore-blind by nature. See §2.4 and §6.4 for how a *server* restore can nonetheless destroy this |
| A guest's plans (never signed in) | IndexedDB only, same store | **No** — this data never reaches Supabase at all (`docs/DATA_RETENTION.md` §1) |

Schema reference: `supabase/migrations/0001_projects.sql`,
`supabase/migrations/0002_live_rooms.sql`.

---

## 2. The gap: what a Postgres backup does NOT cover

### 2.1 Supabase Storage (`plans`, `thumbs`) — metadata restores, bytes don't

Supabase's own docs are explicit about this:

> "Database backups do not include objects you store via the Storage API, as
> the database only includes metadata about these objects. Restoring an old
> backup does not restore objects you deleted after that backup."
> — [Database Backups](https://supabase.com/docs/guides/platform/backups)

Concretely, in this schema: `projects.plan_image_path` and `projects.thumb_path`
are **columns in the table that gets restored**. The actual file bytes at
those paths live in Supabase's object storage backend, which a Postgres
backup/PITR never touches. Two failure modes follow directly from how this
app writes storage paths (`src/store/cloudProjects.ts`, `upload()`):

- **Restored row, missing file.** If a file was deleted after the backup (the
  retention sweep's orphan pass, or the user deleting the plan) and you then
  restore Postgres to before that deletion, the restored row points at a path
  that no longer has a file behind it. The plan image / thumbnail comes back
  broken.
- **Restored row, wrong file.** Uploads use `upsert: true` at a path keyed only
  by `<user id>/<project id>.<ext>` — **not** by revision. There is no
  versioning. If the image was replaced after the backup point (re-imported a
  newer scan, a new thumbnail render), restoring Postgres brings back the OLD
  row and the OLD geometry, but the file at that path is whatever is
  *currently* there — the newest one. The restored project can show a
  thumbnail that doesn't match the geometry it was restored to.

Neither failure is loud. There is no error; the row and the file both "work,"
they just no longer describe the same moment. This needs a manual audit after
any restore (§6.5), not an automated fix.

### 2.2 Vercel Blob (furniture catalog) — out of scope by design

`@vercel/blob` (`package.json`) is used only at build/catalog time —
`npm run ikea:upload` and the `bk:*` scripts (`scripts/ikea/upload-blob.ts`,
`scripts/blenderkit/*`) push the shared furniture/model catalog there. It
holds no per-user data and nothing a Postgres backup would ever need to
reach. If it were lost, recovery is "re-run the catalog build scripts from
their source data," not a database concern. Mentioned here only to close the
loop — it is intentionally absent from the rest of this document.

### 2.3 Liveblocks (live rooms) — a separate provider, mirrored INTO Postgres, not FROM it

Per `docs/DATA_RETENTION.md` §2.3 and the live-projects model: once a project
"goes live," the Liveblocks room's Yjs document is the *source of truth* for
that scene, and the owner's browser continuously mirrors it back into their
local project and, from there, up to Postgres via the normal sync path
(`src/collab/CollabRoom.tsx`, `scheduleProjectMirror(...)`, called from the
room's `project()` callback on every remote change).

This means the relationship only runs one direction: Postgres receives a
mirror of the live room; a Postgres restore has **zero effect on the room
itself**. If a project was live at the time of the incident:

- The Liveblocks room keeps whatever content it had, completely undisturbed
  by the restore.
- The restored `project_docs.state` reflects an earlier moment.
- The instant the owner's browser reconnects to that room (or is already
  open), the mirror-and-push path pushes the room's current content back into
  Postgres — which, per §6.4, may go through as a normal write and silently
  overwrite the very state you just restored.

### 2.4 Client IndexedDB — not backed up, and actively at risk from a restore

IndexedDB was never part of the backup story — it's per-browser and this repo
has no mechanism to back it up remotely (by design; see
`docs/DATA_RETENTION.md` §2.2, "we cannot expire it remotely"). What's new
here is the other direction: **a Postgres restore can cause a client to
destroy its own IndexedDB copy**, or silently undo the restore. That is the
subject of §6.4 — it is the sharp edge this whole document exists to flag.

---

## 3. Supabase plan requirements (verified 2026-08-24)

| Plan | Base price | Daily backups | PITR |
|---|---|---|---|
| Free | from $0/mo | **Not included.** Docs recommend `supabase db dump` for free-tier users (§9) | Not available |
| Pro | from $25/mo | **7 days** retention, included | Available as paid add-on (below) |
| Team | from $599/mo | **14 days** retention, included | Available as paid add-on (below) |
| Enterprise | custom | Up to 30 days, custom | Available as paid add-on, custom retention beyond 28 days |

Sources: [Database Backups](https://supabase.com/docs/guides/platform/backups),
[Supabase Pricing](https://supabase.com/pricing).

**PITR (point-in-time recovery)** — an add-on on top of Pro/Team/Enterprise,
priced by retention window, billed hourly:

| Retention | Rate | Approx. monthly |
|---|---|---|
| 7 days | $0.137/hr | ~$100/mo |
| 14 days | $0.274/hr | ~$200/mo |
| 28 days | $0.55/hr | ~$400/mo |

Source: [Manage PITR usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery).
Cross-checked against [Database Backups](https://supabase.com/docs/guides/platform/backups),
which states the same $100/$200/$400 figures.

Additional confirmed requirements/behavior for PITR:

- Requires **at least the Small compute add-on**, separately priced at
  approximately **$15/mo** (source:
  [Compute add-ons](https://supabase.com/docs/guides/platform/compute-add-ons) —
  this page gives the Small compute price but does not itself state the PITR
  requirement; the requirement is stated on the backups/PITR pages above).
- Enabling PITR **replaces** daily backups on that project — Supabase does not
  run both ("PITR provides finer granularity than Daily Backups, so running
  both is unnecessary").
- WAL is archived roughly every two minutes (sooner under load), which is
  where the "up to seconds of granularity, worst case ~2 minutes" recovery
  point comes from (widely repeated in Supabase's own materials; treat as
  reliable but see NOT VERIFIED note below).
- The PITR add-on is **not** covered by any spend cap — it bills regardless.

**NOT VERIFIED** (checked, could not confirm from Supabase's own docs — do not
quote these to justify a purchase without re-checking at decision time):

- Exact restore duration. Supabase states only that "downtime depends on the
  size of the database — the larger it is, the longer the downtime will be,"
  with no benchmark figures.
- The precise "~2 minute" WAL archive interval as an SLA-backed number — it
  appears consistently in search results and third-party summaries of
  Supabase's docs, but I could not load the exact paragraph stating it as a
  guarantee (vs. a typical figure) from an official page directly. Treat the
  worst-case RPO for PITR as "a few minutes," not as a hard number.
- Whether pricing differs by region or has changed since this check. Re-verify
  at [supabase.com/pricing](https://supabase.com/pricing) before buying.

---

## 4. The decision (Dan's call, not run yet)

Nothing below is enabled. This is what it costs, laid out so the choice is a
five-minute read, not a research project the day something breaks.

| Option | Monthly cost | RPO ceiling | What it buys |
|---|---|---|---|
| **Do nothing** (current state) | $0 | Unbounded — no backup exists today | Nothing. If Postgres is lost or corrupted, everything in §1's "covered" row is gone. |
| **Pro plan, daily backups only** | $25/mo | Up to ~24h (one backup/day) | A once-a-day safety net. Cheapest real answer. |
| **Pro plan + 7-day PITR** | $25 + ~$100 + ~$15 (compute) ≈ **$140/mo** | A few minutes | Restore to almost any moment in the last 7 days. |
| **Team plan + 7-day PITR** | $599 + ~$100 + ~$15 ≈ **$714/mo** | A few minutes | Only worth it if Team's other features (14-day daily backups as fallback, seat/support tier) are independently wanted — PITR pricing itself doesn't change on Team. |

My read: for a single-operator product at this stage, **Pro plan + 7-day
PITR (~$140/mo)** is the smallest purchase that gives a real RPO, and daily
backups get switched off automatically once PITR is on (§3) so you're not
paying for both. If $140/mo is too much right now, **Pro alone ($25/mo)**
still beats the current $0/no-backup state by a wide margin and costs less
than a fifth as much. Either is a defensible choice; doing nothing is the one
option this document argues against, given account deletion and the
retention sweep are both now live in prod and a bad row-level bug or a fat-
fingered `service_role` query has no undo today.

**This is a recommendation, not a decision.** Dan buys, enables, and owns the
Supabase billing change — nothing in this task touched the dashboard.

---

## 5. Enable steps (for whenever Dan decides to buy)

1. Supabase dashboard → upgrade the project to **Pro** (Settings → Billing),
   if not already on it.
2. Daily backups need no further action once on Pro — they start
   automatically. Find them at **Database → Backups**
   (`/project/_/database/backups/scheduled`).
3. For PITR: **Database → Backups → Point in Time**
   (`/project/_/database/backups/pitr`) → enable → choose retention (7/14/28
   days). The dashboard will prompt for the Small compute add-on if the
   project isn't already on it.
4. Confirm on the invoice/usage page that PITR is billing as expected before
   walking away from it.

---

## 6. Restore procedure

### 6.1 Before you click restore — freeze sync

This step exists because of §6.4. Do it **before** starting the restore, not
after.

The app has no maintenance-mode flag, but it doesn't need one: cloud sync is
already designed as an optional layer — with no Supabase URL/anon key
configured, the app runs guest-only, straight to IndexedDB, exactly as
documented in `src/lib/supabase/client.ts` ("Guests are a supported way to use
this product, not a degraded one"). That's the lever:

1. In Vercel → Project → Settings → Environment Variables, note the current
   values of `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   then temporarily clear or invalidate them (e.g. blank them out) for
   Production.
2. Redeploy. Every client that loads the app from this point gets
   `supabaseConfigured = false` — no reconcile, no push, no pull runs against
   the account layer at all. Anyone with an already-open tab keeps running
   against the old bundle in memory until they reload, so this is a strong
   reduction in exposure, not an absolute guarantee for tabs left open through
   the whole window.
3. Do the restore (§6.2–6.4).
4. Do the reconciliation pass (§6.5) with sync still frozen.
5. Restore the env vars and redeploy to turn sync back on.

If the incident is time-critical and this two-redeploy dance is too slow,
the fallback is accepting the exposure in §6.4 and doing the reconciliation
pass reactively instead of preventively — slower to trust, but real backups
beat none.

### 6.2 What breaks during restore

- **The project is inaccessible for the duration.** Supabase: "The project is
  inaccessible during this process, so plan for downtime beforehand." No
  published duration estimate exists (§3, NOT VERIFIED) — budget more time
  for a bigger database.
- Custom role passwords are not preserved by daily-backup restores. Not
  applicable here — this schema uses only the built-in `anon`/`authenticated`/
  `service_role` roles, no custom roles.
- Subscriptions/replication slots must be dropped before and recreated after,
  per Supabase's own restore docs. Not applicable — this project uses neither.
- Storage objects are unaffected either way (§2.1) — restoring doesn't delete
  or roll back files, it just changes what the database *thinks* is at each
  path.

### 6.3 Dashboard restore path

- Daily backups: **Database → Backups → Scheduled backups**, pick a backup,
  restore.
- PITR: **Database → Backups → Point in Time**, pick a timestamp, restore.
- CLI/logical-backup restore (only relevant if you're working from a
  `pg_dump`/`supabase db dump` file rather than a dashboard-managed backup):
  `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql
  --file schema.sql --command 'SET session_replication_role = replica'
  --file data.sql --dbname <connection string>` — see §9 for how those files
  are produced. This path is documented for completeness; the dashboard path
  is simpler and is what a Pro/PITR restore actually uses.

### 6.4 The sharp edge: the rev counter runs backward

**This is the part of the doc that exists specifically to be read before you
restore anything.**

`public.projects.rev` is the server's compare-and-swap counter
(`supabase/migrations/0001_projects.sql`, `push_project()`). The client never
trusts wall-clock time for ordering — it trusts this counter, and the whole
design assumes the counter only ever moves forward (`src/store/syncEngine.ts`,
top-of-file comment: "Ordering is settled by the server's `rev` counter,
never by clocks"). A restore breaks that assumption directly: it moves the
counter **backward**, and nothing in the client code was written expecting
that to happen.

Walk through `reconcileInner()` (`src/store/syncEngine.ts:141-185`), which
runs on sign-in, tab focus, and reconnect, for a project the client already
has a local, synced copy of:

**Case A — the project row still exists after restore, just at an older
`rev`.** The client compares its own unedited copy: `localAhead = rev >
syncedRev` is false (nothing changed locally), and `remoteAhead = r.rev >
remoteRev` is also false, because the restored server `rev` is now *lower*
than what the client already knew. Neither branch fires. The code falls
through to the last `else if` (line 181) and just quietly patches the local
`remoteRev` down to match the server's rolled-back value. **It does not
re-pull the older document** — the client's IndexedDB still holds the newer
content it had before the restore.

The danger surfaces on the next edit. `pushOne()`
(`src/store/syncEngine.ts:303-360`) builds its request with `expectedRev:
meta.remoteRev ?? 0` (line 332) — which is now the restored, lower value. That
matches the server's actual current `rev` (because the server really is at
that value post-restore), so the compare-and-swap **succeeds**, and the
client's newer content overwrites whatever the restore just put there. **A
device that had already synced past the restore point will silently undo the
restore for that project, the next time it pushes anything** — no error, no
conflict, no "(from another device)" copy. This can happen from an edit as
small as opening the project (some flows write on open) or from the
Liveblocks mirror path in §2.3 if the project was live.

**Case B — the project row no longer exists after restore** (it was created,
or first synced, after the backup's as-of point). `listRemote()` filters
`deleted_at is null` and simply won't return it. In `reconcileInner`, the
local card `m` has no matching `r`. Since `m.remoteRev !== undefined` (it had
been synced before), the code takes the *deleted-on-another-device* branch and
calls `forgetProject(m.id)` (line 171) — which deletes the manifest entry, the
document, the image, and the thumbnail from IndexedDB
(`src/store/projectPersistence.ts:613-621`). **This is real, permanent,
client-side data loss caused entirely by the server restore**, for a project
the user never touched and has every reason to think is safe. The one
mitigating detail: `forgetProject` refuses to touch whichever project is
currently open in that tab (`if (id === currentId) return;`), so the project
being actively viewed is spared — every other gallery card synced after the
backup point is not.

**Net effect:** a Postgres restore is invisible to already-open clients, and
the sync engine's own conflict detection — built entirely around "the
server's counter only goes up" — has no code path for "the server's counter
went down." It either quietly resurrects the very state you just restored
(Case A) or quietly deletes a user's only remaining copy of work the restore
made the server forget about (Case B). Freezing sync before you restore
(§6.1) is the only real defense; there is no code fix to ship here without
touching the protected sync path, and this task is documentation-only.

### 6.5 Post-restore reconciliation checklist

Do this with sync still frozen (§6.1):

1. **Identify what moved.** If you can, capture `select id, owner, rev,
   updated_at from public.projects order by updated_at desc` both just before
   restoring and just after, so you know exactly which rows rolled back and by
   how much rev.
2. **Identify Case B candidates.** Any project row with `created_at` or first
   `updated_at` after the backup's as-of timestamp is a project that will
   vanish from `listRemote()` post-restore — and will be silently deleted from
   every non-open client's IndexedDB the moment sync unfreezes (§6.4, Case B).
   If you can reach the affected user before unfreezing, ask them not to open
   the app (or to export via `/api/account/export` first if their server copy
   is still intact enough to be worth exporting — that route reads current
   Postgres state, so it's only useful if the row still exists).
3. **Audit storage references** (§2.1). For rows that came back, spot-check
   whether `plan_image_path`/`thumb_path` still resolve, and whether the image
   you get back actually matches the restored geometry's vintage. There is no
   tool for this today — a manual sample, or a short one-off script against
   the `service_role` client, is the only option.
4. **Check any project that was live** (§2.3). Its Liveblocks room may hold
   content newer than what you just restored to. Decide per-project whether
   that's acceptable (the mirror will push it back into Postgres once sync
   resumes) or whether the room itself needs to be deleted/reset — that's a
   Liveblocks-side action, not covered by this doc.
5. **Unfreeze sync** (§6.1 step 5) only once 1–4 are done or accepted.
6. **Watch `/api/health` and Sentry** (if configured, `docs/PROVISIONING.md`
   §9) for the first hour after unfreezing — this is exactly the window where
   Case A silent-overwrites and Case B silent-deletes happen, as clients
   reconnect.

---

## 7. RPO / RTO — targets, not measurements

These are goals this document is setting for the product, not numbers
Supabase guarantees (see §3's NOT VERIFIED notes for what Supabase itself
will and won't commit to).

- **RPO target:** ≤ 24 hours on the Pro-plan daily-backup baseline; ≤ 15
  minutes if PITR is purchased. (Supabase's own PITR granularity is finer than
  this — the 15-minute figure is a deliberately conservative target given the
  NOT VERIFIED note on the exact WAL interval.)
- **RTO target:** ≤ 4 hours from "we've decided to restore" to "the
  reconciliation checklist in §6.5 is complete and sync is unfrozen." This is
  dominated by human steps (freezing sync, the manual storage/Liveblocks
  audit), not by Supabase's own restore time, which is unmeasured (§3).

Neither target has been tested end-to-end. §8 is how to test it without
touching production.

---

## 8. Restore drill — run this on a throwaway project, not prod

1. Create a new, empty Supabase project (free tier is fine for this drill —
   PITR/daily-backup mechanics can be exercised on a paid throwaway project
   only if you're specifically drilling those; the free-tier `pg_dump` drill
   below needs no paid plan at all).
2. Apply both migrations (`supabase/migrations/0001_projects.sql`,
   `0002_live_rooms.sql`) to it.
3. Create a throwaway `auth.users` row (sign up a real disposable email
   through that project's own auth), then insert 2-3 fake `projects` +
   `project_docs` rows via the SQL editor, with a fake `plan_image_path`
   pointing at a small file you actually upload to that project's `plans`
   bucket.
4. Note the current `rev` values.
5. Take a backup (or, if on Pro, wait for PITR to have a few minutes of WAL,
   or just take a manual on-demand backup if the dashboard offers one).
6. Make a further change: bump one row's `rev` (simulate a "later edit") and
   delete the file behind another row's `plan_image_path` (simulate the
   retention sweep running after the backup point).
7. Restore to the point captured in step 5.
8. Verify, and record actual results next to the targets in §7:
   - Did the restored `rev` values match what you noted in step 4?
   - Does the row whose file you deleted in step 6 now point at a 404?
   - How long did the restore actually take, end to end? (This is the number
     Supabase won't publish — measure it yourself once, here.)
9. Optional but valuable: point a real local client (a second browser
   profile) at this throwaway project, sign it in, let it sync the fake
   projects, *then* do steps 6-7, then bring that client back online and
   watch §6.4 happen for real — confirm whether it's Case A (silent
   overwrite) or Case B (silent delete) for each row, matching the prediction
   in §6.4.
10. Tear down the throwaway project when done.

---

## 9. Free-tier stopgap: a `pg_dump` logical backup

If Dan decides not to buy Pro/PITR yet (§4), this is the manual alternative
Supabase itself recommends for Free-tier projects: "regularly export their
data using the Supabase CLI `db dump` command."

**Verified this session, on this machine:** `pg_dump`, `psql`, and the
`supabase` CLI are **not installed** (`pg_dump --version` → command not
found; `which psql` → not found; `supabase --version` → command not found).
Supabase's own CLI-based backup docs separately instruct "Install Postgres
and psql" as a prerequisite even when using their CLI wrapper — the CLI does
not bundle its own `pg_dump`. **This is why no script ships with this task**
(see note at the end of this section) — a script calling a binary that isn't
on Dan's PATH would fail on first run with a confusing error instead of a
useful one.

### 9.1 Get the connection string

Supabase dashboard → your project → **Connect** button (top of the project
page) → copy either the **Session pooler** or **Direct connection** URI.
Either works for `pg_dump`; the direct connection is simpler for a one-off
dump. It looks like:

```
postgresql://postgres.<project-ref>:<password>@db.<project-ref>.supabase.co:5432/postgres
```

The password is the database password (Settings → Database), not the
`service_role` API key — different secret, same sensitivity class. Treat it
the same way `docs/DATA_RETENTION.md` §6 treats `SUPABASE_SERVICE_ROLE_KEY`:
never in a committed file, never in a synced folder.

### 9.2 Install the tools (one-time)

Either:
- Install PostgreSQL client tools only (not the full server) — the
  official installer at postgresql.org, or on Windows,
  `winget install PostgreSQL.PostgreSQL.17` (installs the server too; a
  client-only package may be available from the same vendor — check before
  running). **NOT VERIFIED**: the exact winget package name/behavior — check
  at install time rather than trusting this line blindly.
- Or install the Supabase CLI (`supabase` command) per
  [its docs](https://supabase.com/docs/guides/local-development/cli/getting-started)
  — note this still expects `psql` to be present for the restore side per
  §9.4.

### 9.3 Take the dump

Simplest form, one file, easy to store and inspect:

```bash
pg_dump "postgresql://postgres.<project-ref>:<password>@db.<project-ref>.supabase.co:5432/postgres" \
  --schema=public -F c -f floorplan3d-backup-$(date +%Y%m%d).backup
```

`--schema=public` skips Supabase-managed internal schemas (`auth`, `storage`
metadata tables, etc.) and dumps only this app's own tables
(`projects`, `project_docs`, `live_rooms`) — the actual product data. `-F c`
is the compressed custom format, restorable with `pg_restore`.

Supabase's own recommended three-file split (roles/schema/data, using
`supabase db dump`) is more thorough (captures schema separately from data,
handles roles) — use it instead if the CLI is already installed:

```bash
supabase db dump --db-url "<connection string>" -f roles.sql --role-only
supabase db dump --db-url "<connection string>" -f schema.sql
supabase db dump --db-url "<connection string>" -f data.sql --use-copy --data-only
```

Source: [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

### 9.4 Restoring from a `pg_dump`/`db dump` file

Single-file custom format: `pg_restore --dbname "<connection string>"
floorplan3d-backup-YYYYMMDD.backup`.

Three-file split: `psql --single-transaction --variable ON_ERROR_STOP=1
--file roles.sql --file schema.sql --command 'SET session_replication_role =
replica' --file data.sql --dbname "<connection string>"` (per §6.3).

Either way, this restore has the **exact same rev-rollback consequences**
described in §6.4 — freeze sync first (§6.1), and this dump also does not
capture Storage bucket bytes (§2.1) or anything outside Postgres (§2).

### 9.5 Where the dump file goes — and does not go

- **Never in this repo.** `.gitignore` already excludes `.env*` but a
  `.backup`/`.sql` dump is not covered by any existing rule — don't add one
  either; just never put the file under the repo tree at all.
- **Never in a synced folder** — no Dropbox/OneDrive/Google Drive/iCloud
  Drive path. Those sync automatically and silently, and a floor-plan dump
  contains real addresses and photos of someone's home
  (`docs/DATA_RETENTION.md` §2.1) — the same sensitivity class the service
  role key gets treated with.
- **Do:** an external drive kept offline, or a dedicated, access-controlled
  cloud storage bucket (e.g. a private Vercel Blob path separate from the
  furniture catalog, or a private S3/Backblaze bucket) that isn't a general
  file-sync folder. Delete old dumps on a schedule — a stale dump full of
  personal data sitting somewhere forever is its own liability, mirroring why
  `docs/DATA_RETENTION.md` has retention windows at all.

### 9.6 Why no script ships with this task

The task allowed an optional `scripts/backup/` dump script "if it can be
written without new dependencies... If pg_dump is not a safe assumption on
Dan's machine, say so and keep it documentation-only." `pg_dump` is
confirmed absent from this machine right now, so this stays
documentation-only rather than shipping something that fails the moment it's
run. If the tooling in §9.2 gets installed, a thin wrapper script (checking
for `pg_dump` on PATH, refusing to run without an explicit connection-string
env var, refusing to write into the repo directory) would be a reasonable
follow-up — worth asking for once the prerequisite is actually in place.

---

## 10. Operator checklist

To make everything above real:

1. Read §4, decide, and buy (or don't) — Dan's action, costs money.
2. If buying: follow §5, then confirm on the Supabase invoice page that
   billing matches §3's numbers.
3. Run the restore drill (§8) once, on a throwaway project, regardless of
   which option is chosen — it's what turns §7's targets from a guess into a
   measurement, and it's the only way to see §6.4 happen without risking real
   user data.
4. Set up the free-tier stopgap (§9) as a floor, even if Pro/PITR is
   purchased — it costs nothing but a few minutes a month and survives a
   Supabase-side billing lapse or account issue that a Supabase-hosted backup
   wouldn't.
5. Once a plan is chosen, `docs/PROVISIONING.md` and `src/app/api/health/route.ts`
   should get a step/check pointing at this document — deliberately not edited
   here, since other in-flight branches own those two files. See the commit
   message and task report for the exact addition proposed.
