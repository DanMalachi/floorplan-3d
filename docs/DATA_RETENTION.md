# Data retention and deletion

What this product stores, where it lives, how long it stays, and how it is erased.

**This file describes the code as it exists, not an aspiration.** Every claim below
is anchored to a file you can open. The privacy policy is written from this
document, so if you change a retention window, a bucket, or a deletion step, change
it here in the same edit — a policy that overstates what the code does is the
failure mode this file exists to prevent.

Last verified against the code: 2026-08-23.

---

## 1. Two independent stores

The product works signed-out. That is not a degraded mode, and it changes where
data lives:

| | **Guest (signed out)** | **Signed in (Google)** |
|---|---|---|
| Plans | This browser's IndexedDB only | IndexedDB **and** the user's Supabase rows |
| Plan images | This browser only | Also uploaded to private storage |
| Reachable by us | No | Yes, scoped by RLS to the owner |

A guest's plans never reach a server. There is nothing for us to retain, disclose,
or delete on their behalf — and nothing we could produce in response to an access
request, because we cannot see it.

---

## 2. What is stored, where

### 2.1 Server-side (Supabase), only for signed-in users

Schema: `supabase/migrations/0001_projects.sql`.

| Location | Contents | Personal data? |
|---|---|---|
| `auth.users` | Supabase account row: user id, email address, Google provider id, sign-up and last-sign-in timestamps, and the profile fields Google returns (name, avatar URL) in `user_metadata` | Yes — identity |
| `public.projects` | One row per plan: id, owner, plan name, timestamps, revision counter, storage paths, live-room id, `deleted_at` tombstone | Plan names are user-authored and can be identifying ("Flat 4, Ben Yehuda St") |
| `public.project_docs` | One row per plan: the full geometry as JSON (`state`) — walls, rooms, openings, stairs, furniture | Yes — a floor plan of someone's home |
| `public.live_rooms` | Who claimed a live collaboration room: room id, owner, created-at (migration `0002_live_rooms.sql`) | Links a user id to a room id |
| Storage bucket `plans` (private) | The imported plan image, at `<user id>/<project id>.<ext>` | Yes — often a scan of an architectural drawing with an address on it |
| Storage bucket `thumbs` (private) | A small JPEG of the 3D view, at `<user id>/<project id>.jpg` | Yes, same reason |

Access control is Postgres row-level security, not application code: every policy
is `owner = auth.uid()`, and the storage policies check that the first path segment
equals the caller's user id. Both buckets are private — there are no public URLs.

### 2.2 In the user's own browser

One IndexedDB database, `floorplan3d`, one object store, `kv`
(`src/store/idb.ts`):

| Key | Contents |
|---|---|
| `projects:manifest` | The gallery cards: id, name, timestamps, revision + sync bookkeeping |
| `projects:currentId` | Which plan reopens |
| `project:<id>` | One plan's geometry (image-free) |
| `image:<id>` | The imported plan image, as a data URL |
| `thumb:<id>` | The gallery thumbnail, as a data URL |
| `live:ownerRooms` | `{ roomId: projectId }` for rooms this browser owns |
| `project:current` | Legacy single-plan save, migrated away on first load |

`localStorage` and `sessionStorage` hold display preferences and one navigation
hand-off, no plan content of lasting value: `planDock:theme`,
`planDock:dockHeight2`, `furniture:hostHeights1`, `live:left`, and
`golive-seed:<roomId>` (cleared when the room consumes it).

Browser storage has **no expiry**. It persists until the user deletes their
account (§4), deletes the individual plan, or clears site data in their browser.
We cannot expire it remotely, and a client-side timer would be worthless anyway —
it would only run for people who still open the app.

### 2.3 Third parties (processors)

| Processor | What reaches it | Retention |
|---|---|---|
| **Supabase** | Everything in §2.1 | As described in this document |
| **Liveblocks** | The live scene document (Yjs) for any plan taken live, in room `floorplan-<id>`. Presence carries the collaborator's display name and avatar URL | Held by Liveblocks until the room is deleted. Account deletion deletes the owner's rooms (§4) |
| **Anthropic** | Optional room-naming only (`/api/classify-rooms`): plan image crops plus room descriptors, sent at the moment of the request. We store no copy of the response beyond the plan itself | Governed by Anthropic's API retention, not by us |
| **Vercel** | Hosting and request logs | Vercel's platform defaults; we write no application log containing plan content |

Share links carry a signed HMAC grant with a **30-day expiry**
(`src/collab/grant.server.ts`). They are stateless — there is no database record
of a share to delete, and an expired link simply stops verifying.

---

## 3. Retention windows

| Data | Window | Enforced by |
|---|---|---|
| Active plan (row, document, image, thumbnail) | Kept while the account exists and the plan is not deleted | — |
| A plan the user deleted | Tombstoned immediately (`deleted_at`), hard-deleted with its files — and its Liveblocks room, if it had gone live — after **30 days** | Retention sweep, pass A |
| An unreferenced file in `plans`/`thumbs` | Deleted once it is older than **48 hours** | Retention sweep, pass B |
| Files under a user id with no auth user | Deleted once older than 48 hours | Retention sweep, pass B |
| Share-link grants | Expire 30 days after minting | Signature check, no storage |
| Browser storage | No expiry — see §2.2 | — |

Both windows are environment variables: `RETENTION_PURGE_DAYS` (default 30) and
`RETENTION_ORPHAN_GRACE_HOURS` (default 48).

**Why a deleted plan is not erased instantly.** `deleted_at` is how the user's
*other* devices find out the plan is gone; deleting the row outright would let a
second device that had not synced yet push the plan straight back. The 30-day
tombstone is the propagation window. It is a retention decision, and it is why a
purge job is needed at all.

**Why orphans exist.** `syncEngine.pushOne()` uploads the plan image *before*
writing the row that references it. If the push then fails or hits a revision
conflict, the file is already in the bucket with nothing pointing at it. Re-importing
a JPEG over a PNG has the same effect on the old path. Without pass B those files
would sit in the bucket for ever. The 48-hour grace exists so a file uploaded
moments before its row is never mistaken for an orphan.

### 3.1 What the sweep does

`src/app/api/account/retention/route.ts`, run once a day by a server-side cron.

- **Pass A — purge.** Projects with `deleted_at` older than the window: files
  first (found by `<owner>/` prefix, not from the row's columns, because those
  can be stale), then the Liveblocks room if the plan had gone live, then the
  row. If the files or the room fail to delete, the row is **kept** for the next
  run rather than deleted — a row deleted ahead of its files would strand them
  with no record of who they belonged to, and a room outliving its plan would
  leave a full copy of it live on a third party indefinitely.
- **Pass B — orphan sweep.** Walks both buckets by user folder. A file is deleted
  only if it is past the grace period **and** no live project row references it,
  or its owner has no `auth.users` row at all.

Safety rails, because it deletes data nobody is watching:

- `?dryRun=1` reports exactly what it would delete and deletes nothing.
- A bucket whose listing errors is **skipped entirely**. "I could not read it" is
  never evaluated as "it is empty".
- A file whose age is unknown is left alone.
- A hard cap of 5,000 deletions per run bounds the blast radius of a bug; hitting
  it is reported and the next run continues.
- The route refuses to run unless `CRON_SECRET` is set and matches the caller's
  `Authorization: Bearer` header.

### 3.2 Known gap: dormant accounts

There is **no inactivity-based deletion**. An account whose owner never returns
keeps its plans indefinitely. Implementing one responsibly needs a warning email
before erasure, and this product sends no email at all today — deleting a dormant
user's home plans with no notice would be worse than keeping them. If a dormancy
policy is adopted later, it needs an email channel first. This gap is stated here
so the privacy policy does not claim a window that does not exist.

---

## 4. Deleting an account

UI at `/account` (`src/app/account/page.tsx`), route at
`src/app/api/account/delete/route.ts`.

The confirmation requires the user to **type their own email address**. A single
click cannot produce that string, and neither can a mis-fired request. The page
lists the consequences before the input, including the two the user may not
expect: guest plans in that browser are destroyed too, and share links they have
sent will stop working.

### 4.1 Order, and why

1. **Identify the caller from the session cookie.** The user id is never taken
   from the request body — if it were, any signed-in user could delete another.
2. **Enumerate before deleting.** Storage is listed by `<uid>/` prefix rather than
   reconstructed from `plan_image_path`, so a file whose row push failed is still
   found.
3. **Delete Liveblocks rooms.** First, because a live room is reachable by anyone
   holding a share link and a collaborator's client could otherwise keep writing
   to it — or mirror a project row back after we drop it. Room ids come from
   **both** `projects.live_room_id` and `public.live_rooms`: a room the user
   claimed whose project row was since deleted appears only in the latter, and
   would otherwise survive as an orphaned live copy of their scene.
4. **Delete storage objects, then re-list to verify.** `remove()` returning no
   error is not proof; the empty re-listing is.
5. **Delete `project_docs`, then `projects`, then `live_rooms`**, and verify the
   project row count is zero. `live_rooms` cascades from `auth.users` anyway, but
   only if step 6 succeeds — deleting it here means a failure at the last step
   still leaves no record of which rooms this user owned.
6. **Delete the `auth.users` row — last.**

The auth user goes last because deleting it strands anything left behind: the
remaining paths are named after a user id that no longer resolves to anyone, and
the user can no longer sign in to retry. Leaving the account alive on a partial
failure keeps the operation retryable.

### 4.2 Partial failure

**A partial deletion is never reported as success.** Each stage returns
`{stage, ok, detail}`; the route returns `ok: true` only if every stage passed,
and returns HTTP 500 with the failing stage and a list of what survived otherwise.

The client refuses to wipe the browser or sign the user out unless the server
reported complete success — clearing local data after a partial failure would
destroy the user's last copy of plans still sitting on the server, and sign them
out of the account they need in order to retry. Every stage is idempotent, so
retrying is safe and skips what already succeeded.

### 4.3 Local data

On verified success the browser's entire `kv` store is cleared
(`wipeLocalData()` in `src/store/projectPersistence.ts`), then the page reloads.
The whole store is cleared rather than walking the manifest, because a
`project:<id>` whose card was already dropped would survive a key-by-key pass —
a deletion guarantee cannot rest on the index being complete. This includes
**guest plans made before signing in**, which is correct for an erasure request
and is stated in the confirmation UI.

### 4.4 What deletion does NOT reach

Stated plainly here because the UI states it to the user:

- **A collaborator's copy.** Opening a share link calls `registerSharedProject()`,
  which writes a full copy of the plan into that person's own IndexedDB — and if
  they are signed in, their sync engine pushes it to rows owned by *their* user
  id. Under RLS we have no access to those rows and no ownership link back to
  them. That copy is now their data, subject to their own deletion request.
- **Other browsers.** Deletion clears the browser it was performed in. Another
  device that had synced the plans keeps its local copies until it is signed in
  again and reconciles, or its site data is cleared.
- Anything a collaborator exported, downloaded, or screenshotted.
- Provider-side backups and logs at Supabase, Liveblocks, Anthropic, and Vercel,
  which age out on those providers' schedules.

---

## 5. Exporting data (access and portability)

`GET /api/account/export` (`src/app/api/account/export/route.ts`), offered on
`/account` as "Export my data". Returns one self-contained JSON file: profile
fields, every project row, every project document, and the plan images and
thumbnails inlined as base64 — not links. Signed URLs that expire in an hour are
a pointer to your data, not a copy of it.

The route deliberately uses the **caller's own session client**, not the
service-role key: RLS then scopes every query in Postgres, so the route
physically cannot read another account even if a filter were mistyped. It streams
project by project, so peak memory is roughly one image rather than the whole
archive.

Guest plans that never left the browser are not in the file, and the file says so
in its own `notes` field.

---

## 6. The service-role key

Account deletion and the retention sweep need `SUPABASE_SERVICE_ROLE_KEY`. It is
not "a stronger API key" — it is a JWT that makes Postgres run statements with
**RLS bypassed entirely**, so every `owner = auth.uid()` policy becomes a no-op.
Anyone holding it can read or delete every account's plans.

It is read in exactly one file, `src/lib/supabase/admin.ts`, and kept off the
client by three independent barriers:

1. The variable name has no `NEXT_PUBLIC_` prefix, so Next never inlines it into a
   browser bundle — a mistaken client import compiles to `undefined` rather than
   carrying the value across.
2. `assertServer()` throws if a browser ever evaluates the module, so the mistake
   fails loudly in development instead of shipping quietly.
3. Only route handlers under `src/app/api/account/`, all pinned to
   `runtime = "nodejs"`, import it.

The rule that keeps those true: **nothing under `src/ui`, `src/store`, or any file
carrying `"use client"` may import `src/lib/supabase/admin.ts`.**

If the key is unset, the deletion route returns 503 and `/account` hides the
delete button with an explanation, rather than performing the half of the
deletion it can and reporting success.

---

## 7. Operator checklist

To make everything in this document true in a deployment:

1. Set `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project settings → API keys →
   `service_role`) as a **server-side** environment variable. Never as
   `NEXT_PUBLIC_*`.
2. Set `CRON_SECRET` to a long random string (`openssl rand -base64 32`). The
   retention endpoint refuses to run without it.
3. Deploy. `vercel.json` registers the daily cron at 03:17 UTC hitting
   `/api/account/retention`; Vercel attaches `Authorization: Bearer $CRON_SECRET`
   automatically. Confirm it appears under **Project → Settings → Cron Jobs**.
4. **Before the first live run**, call the endpoint with `?dryRun=1` and read
   `wouldDelete`. Do this again after changing either retention window.
5. Optionally set `RETENTION_PURGE_DAYS` / `RETENTION_ORPHAN_GRACE_HOURS`, and
   update §3 of this file if you do.

No database migration is required: the sweep and the deletion route act through
the existing schema with the service role, which bypasses RLS.
