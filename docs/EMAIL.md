# Transactional email

This product sent no email at all until this was added. Everything below is
transactional/legal — account receipts and legal-notice mail — not marketing.
There is no mailing list, no newsletter, and no unsubscribe link, because
these messages are the kind CAN-SPAM and equivalent regimes exempt as
transactional (a receipt for an action the recipient just took, or a notice
about a legal document that governs their account) rather than promotional.
If marketing email is ever added later, it needs its own opt-out mechanism —
do not reuse this path for it.

Code lives in `src/lib/email/`. Read `src/lib/email/index.ts` first — it is
short and has the actual contract in its comments.

---

## What it sends, and when

| Template | File | Trigger | Wired in? |
|---|---|---|---|
| Account-deletion receipt | `templates/accountDeletionReceipt.ts` | Every stage of `POST /api/account/delete` succeeded — deletion is fully complete and verified | Yes — `src/app/api/account/delete/route.ts` |
| Data-export notice | `templates/dataExportNotice.ts` | `GET /api/account/export` was called for a signed-in account and the query that starts the export succeeded | Yes — `src/app/api/account/export/route.ts` |
| Policy change notice | `templates/policyChangeNotice.ts` | A material change to `/legal/privacy` or `/legal/terms` | **No** — there is no policy-versioning mechanism in this codebase yet to hang an automatic trigger on. Call it by hand (see below) until one exists. |

A few things worth knowing about the two wired-in sends:

- **Neither can block, delay, or roll back the action it rides on.** Both
  routes call `sendEmailAfterResponse()`, which schedules the send with
  Next's `after()` — it runs once the HTTP response has already gone out, and
  a failure there is caught and logged, never thrown back into the route.
  This matters most for deletion: it is permanent, and the user's action
  winning over their receipt is the whole point of the design. See the "6.
  receipt email" comment block at the end of `delete/route.ts` and the
  comment above the `sendEmailAfterResponse` call in `export/route.ts`.
- **The export notice is a security/audit notice, not a "your file is
  ready" link.** `GET /api/account/export` streams the export straight back
  to the request that asked for it — there's no async job and nothing to poll
  — so the email exists to tell the account owner "an export of your data was
  generated," in case it wasn't them asking. It carries no attachment and no
  link to the data itself.
- **Both are skipped (not retried, not queued) if the account has no email
  on file**, which Supabase/Google sign-in should never produce in practice,
  but the routes check `user.email` before scheduling either send.

### The policy-change notice, run by hand

There's no CLI wrapper yet. From a script or a one-off Node REPL with the
production env vars loaded (see below), something like:

```ts
import { sendEmail } from "@/lib/email";
import { policyChangeNoticeEmail } from "@/lib/email/templates";

await sendEmail(
  policyChangeNoticeEmail({
    to: "user@example.com",
    document: "privacy", // or "terms"
    summary: "We now note that plan images are processed by our hosting provider's CDN.",
    effectiveDate: new Date("2026-09-01"),
  }),
  { template: "policy-change-notice", userId: null },
);
```

You'd loop this over every account's email — there is no bulk-send helper
here on purpose: sending a real notice to every user is a decision Dan makes
deliberately, not something a script should make easy to fire by accident.

---

## Env vars

All optional. With none set, `sendEmail()` is a dormant no-op — logged, never
thrown, no network call, no Resend account needed to run or develop this app.
This mirrors how Sentry behaves with no DSN (`sentry.shared.ts`).

| Var | Required for sending | Notes |
|---|---|---|
| `RESEND_API_KEY` | Yes | Server-only secret. Resend dashboard → API Keys. Never `NEXT_PUBLIC_`. |
| `EMAIL_FROM` | Yes | The verified sender, e.g. `Floorplan → 3D <noreply@yourdomain.com>`. Must be on a domain you've verified in Resend (see below) — Resend rejects sends from an unverified domain. |
| `EMAIL_REPLY_TO` | No | Omitted from the send entirely when unset; the provider's default reply behavior applies. |

`RESEND_API_KEY` and `EMAIL_FROM` are both required together —
`emailConfigured` (`src/lib/email/config.ts`) is `Boolean(RESEND_API_KEY &&
EMAIL_FROM)`. Setting only one still leaves email dormant.

Two more vars this module reads but doesn't own: `NEXT_PUBLIC_SITE_URL` and
`VERCEL_URL`, used only to build the footer link and the policy-notice URL
(`templates/shared.ts`'s `siteUrl()`). If neither is set, templates omit the
link rather than print a placeholder into a real email — they already exist
in this repo for `robots.ts`/`sitemap.ts`, nothing new to set here.

---

## Provisioning a Resend account + verified sending domain

1. Create a free account at **resend.com**.
2. **Domains → Add Domain.** Enter the domain you want to send from (e.g.
   `yourdomain.com`, or a subdomain like `mail.yourdomain.com` if you'd rather
   keep sending reputation separate from your main domain).
3. Resend gives you DNS records to add — an **SPF** (TXT) record, one or more
   **DKIM** (CNAME) records, and usually a **DMARC** (TXT) record. Add all of
   them at your DNS provider. Verification is usually minutes, occasionally
   up to 48 hours for DNS propagation.
4. Once the domain shows **Verified** in the Resend dashboard, create an API
   key (**API Keys → Create API Key**). Sending-only permission is enough;
   this app never reads mail or manages domains at runtime.
5. Set `RESEND_API_KEY` and `EMAIL_FROM` (using an address on the verified
   domain) in Vercel → Project → Settings → Environment Variables, for
   Production (and Preview, if you want to test from preview deploys).

**Before a domain is verified**, Resend still lets you send from
`onboarding@resend.dev`, but only to the email address on your own Resend
account — useful for confirming the integration end-to-end (see next
section) before DNS is set up, not usable for real users.

**If you skip this section entirely:** exactly like Sentry with no DSN, the
app runs fine. `sendEmail()` logs `skipped:not-configured` and returns
`{ ok: false, reason: "not-configured" }`; the deletion and export routes
never see or care about that value.

---

## How to verify it works

Do this against a **throwaway Resend account and a throwaway/dev Supabase
project — never production, and never a real account.** Dan is running
account-deletion tests against prod separately; this module must not be
exercised there by anyone other than him, deliberately, later.

1. Set `RESEND_API_KEY` and `EMAIL_FROM` in `.env.local` (or your dev
   environment). For a first check before DNS is verified, use
   `EMAIL_FROM=onboarding@resend.dev` and set the throwaway Resend account's
   own email as the test recipient.
2. Run the dev server against a dev/throwaway Supabase project, sign in with
   a throwaway Google account, create a plan.
3. Trigger `GET /api/account/export` (the "Export my data" control on
   `/account`). Check:
   - The download completes normally — the export must succeed exactly as it
     did before this change, whether or not email is configured.
   - The server log for a line with `"route":"email:data-export-notice"`. A
     configured, successful send logs `"status":200` with no `reason`; find
     it by grepping stdout/Vercel logs for `email:`.
   - The Resend dashboard → **Logs**, for the same send.
   - The test inbox, for the notice itself. Confirm the plain-text part reads
     sensibly on its own — most clients render `text`, not `html`, when
     previewing.
4. Trigger account deletion (type-your-email confirmation, on the throwaway
   account only). Check the same three places for
   `email:account-deletion-receipt`, and confirm **the deletion's own success
   response is unaffected by whether the email send succeeds** — the easiest
   way to see this is to temporarily set `RESEND_API_KEY` to a garbage value,
   run deletion again on another throwaway account, and confirm deletion
   still reports full success while the log line for
   `email:account-deletion-receipt` shows a non-200 status/reason.
5. To see the rendered HTML without waiting on a real send, call the
   template functions directly (`accountDeletionReceiptEmail(...)`,
   `dataExportNoticeEmail(...)`) from a scratch script and write the
   `.html`/`.text` fields to a file.

There is no automated test for this module in this change — see UNVERIFIED
below.

---

## Design notes

- **Swappable provider.** `EmailProvider` (`src/lib/email/types.ts`) is the
  whole contract: `send(message) => Promise<{ ok, id?, reason? }>`. Resend
  (`resend.ts`) is the only adapter today and is a default, not a commitment
  — swapping providers means writing one more file implementing
  `EmailProvider` and pointing `sendEmail()` in `index.ts` at it.
- **No npm dependency added.** The Resend adapter is one `fetch` call against
  Resend's REST API (`POST https://api.resend.com/emails`), deliberately, so
  this work doesn't touch `package.json`/the lockfile while another branch is
  rewriting them.
- **Logging never includes the email body, the recipient address, or the API
  key** — only a template name, HTTP-style status, timing, and a short
  reason string (`"not-configured"`, `"resend 422"`, `"network: timed out"`,
  etc.), through the existing `src/lib/api/log.ts`. Consistent with that
  file's own rule: never log what a user drew, or here, what a user's email
  contains.
- **Plain text stands alone.** Every template returns a `text` body that is a
  complete message on its own, not "see the HTML version" — many clients
  block or strip HTML.

---

## What I'd add to `docs/PROVISIONING.md` and `src/app/api/health/route.ts`

Both files are off-limits in this worktree (other branches would conflict on
them), so this is a note for whoever merges next, not a diff:

**`docs/PROVISIONING.md`** — a new numbered step, roughly:

> **N. Optional: turn on transactional email.** Neither required — the app
> runs fine without it, deletion and export just send no receipt/notice.
> Create a Resend account, verify a sending domain (SPF/DKIM), and set
> `RESEND_API_KEY` + `EMAIL_FROM` in Vercel. See `docs/EMAIL.md`.

Modeled on how that file already introduces the optional Sentry/uptime step
(step 9).

**`src/app/api/health/route.ts`** — one more boolean in the `checks` object,
non-fatal like `liveblocks`/`rateLimiting` (must not affect the `ok` the
probe returns — email degrades gracefully, it doesn't break anything):

```ts
email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
```

---

## UNVERIFIED

No `npm install`, `typecheck`, `lint`, `build`, or test run was possible in
this worktree — it deliberately has no `node_modules` while the lockfile is
being rewritten on another branch. Nothing below has been run:

- **TypeScript correctness** of every new file and both route edits —
  written conservatively (explicit types, no `any`), but not compiler-checked.
- **The `after()` import from `next/server`.** It's documented as a stable
  API since Next 15.1 and this repo is on Next 16.2.9 per `package.json`, so
  it should resolve, but that import was never actually compiled or run. If
  it turns out not to be available, the fallback is to replace the body of
  `sendEmailAfterResponse()` in `src/lib/email/index.ts` with a direct
  `await sendEmail(message, options)` called from each route before its
  `return` — `sendEmail()` itself is already safe to call unawaited or
  awaited, since it never throws.
- **No real email was sent.** No Resend account was created or signed up
  for, and no request was made to `api.resend.com` — this module has never
  actually talked to the provider it's written against.
- **No lint/format pass** — style was matched by eye against neighboring
  files (`src/lib/api/log.ts`, `sentry.shared.ts`, the account routes), not
  verified by the repo's `eslint.config.mjs`.
- **The `Response.json`/stream ordering in `export/route.ts`** — scheduling
  the notice email right after the initial `projects` query (before the
  stream starts) rather than after the stream finishes was a deliberate
  design choice explained in the route's new comment, but the actual
  behavior of `after()` alongside a `ReadableStream`-backed `Response` in
  this Next version was not exercised.
