# Hebrew / RTL — handoff

**Branch:** `feat/hebrew`, two commits in: `533fd89` (the scaffold) and
`485d34e` (Step 1 — locale routing, links, sitemap/robots, hreflang).
**Not pushed.** `main` is at `142d8d3` (the UI sweep, already live on done.design).

Read this file, then `docs/HEBREW-HANDOFF.md`'s sibling section in
`~/.claude/plans/ill-provide-a-list-breezy-pie.md` ("Wave 2 — Hebrew + RTL")
for the reasoning behind each decision. This file is the state of play; that
one is the argument.

---

## Dan's decisions — do not re-open these

| | |
|---|---|
| Architecture | next-intl, `[locale]` segment. **Approved.** |
| Order | **Landing page first, then the editor.** |
| IKEA product names, brand names, item names | **Stay native. Never translated.** |
| Everything else | Gets translated. |
| The `done.` wordmark | **Stays Latin** in the Hebrew build. Everything around it translates. |

---

## What is already done (commit `533fd89`)

Infrastructure only. **No UI strings are extracted yet.** Every English URL
renders exactly as before; `/he` renders the same English UI with `dir="rtl"`
and Hebrew metadata. That checkpoint is deliberate — it keeps the translation
work incremental instead of one unreviewable diff.

- `next-intl@4.14.2` installed (supports Next 16 / React 19).
- `src/i18n/routing.ts` — locales `["en","he"]`, `localePrefix: "as-needed"`,
  `localeDetection: false`, plus `dirOf(locale)`.
- `src/i18n/request.ts` — per-request message loading with a **deep** merge of
  English underneath Hebrew.
- ~~`middleware.ts` — new file; there was no middleware before, so nothing
  competes with it (Supabase auth runs through `@supabase/ssr` in server
  components and route handlers).~~ **Wrong on both counts — corrected in
  Step 1 below.** There WAS already a middleware: `src/proxy.ts` (Next 16
  renamed the convention), refreshing the Supabase session on every request.
  Next allows exactly one, so the two now compose inside `src/proxy.ts`.
- `next.config.ts` — `withNextIntl` applied **inside** `withSentryConfig`.
- Every user-facing route moved under `src/app/[locale]/`. `api/`, `auth/`,
  `robots.ts`, `sitemap.ts`, `globals.css` stayed at the root.
- `src/app/layout.tsx` is now a pass-through; `src/app/[locale]/layout.tsx`
  carries `<html lang dir>`, the fonts, metadata, `hreflang`, and the provider.
- **Rubik** added beside Manrope and IBM Plex Mono, and appended to the font
  stacks in `src/brand/tokens.ts` and `src/ui/planDock/tokens.ts`.
- `messages/en.json` + `messages/he.json` — only `meta` and `locale` so far.

~~**Verified working:** `/` `lang="en" dir="ltr"` · `/he` `lang="he" dir="rtl"` ·
`/design` `/he/design` `/faq` `/he/faq` all 200 · production build passes with
both locales prerendered · Hebrew `<title>` renders.~~

**That verification did not hold**, and the way it failed is worth knowing:
against a production build (`npm run build && npm start`) every *unprefixed*
English route returned 404 — `/design` and `/faq` included — while their `/he/`
twins returned 200. The build itself passes and still lists those routes as
prerendered, so nothing short of serving them shows it. Fixed in Step 1; the
curl loop that catches it is at the bottom of `src/i18n/README-static.md`. **Do
not sign off an i18n change on `npm run build` alone.**

### Three things in the scaffold worth understanding before you change them

1. **`localePrefix: "as-needed"` is not a style choice.** done.design is live
   and its share links (`/v/<id>?g=…`) are already out in people's messages.
   Moving English to `/en/…` breaks every one of them on deploy. English keeps
   every URL byte-for-byte.
2. **The message merge must stay deep.** A shallow `{...en, ...he}` replaces a
   namespace wholesale the moment Hebrew declares it — three translated
   inspector keys would take the other thirty-seven away. Half-translated is
   the normal state here for as long as the editor catalogue is being filled
   in. Untranslated keys must render English, never a key path.
3. **Rubik is appended, not switched.** The browser falls through per
   *character*: Latin finds Manrope, Hebrew finds no Manrope glyph and lands on
   Rubik. There is no locale conditional anywhere and there should not be one.

---

## Next up, in order

### Step 1 — the route move's breaks — **DONE**

Three, not two: the audit turned up a third that made the other two moot.

**The one that was not on the list: locale routing never ran at all.**
`middleware.ts` sat at the repo root, but this project keeps `app` under
`src/`, and Next 16 renamed the convention to `proxy`. So the file was ignored
twice over — no warning at build or start — and with nothing to rewrite the
unprefixed English URLs, **every English route 404'd in a production build**
while every `/he/…` route returned 200. (`npm run build` passes cleanly; the
routes still show as prerendered. Only serving them shows it.) Two further
faults were hiding underneath: its matcher wrote "has a dot" as `"\."` inside a
plain string, which JavaScript collapses to `"."` — turning the clause into
"any path at all" and excluding every route — and it did not exempt
`/auth/callback`, so the Google OAuth return would have been rewritten to
`/en/auth/callback` and 404'd the moment the file did start working.

The scaffold's claim that "there was no middleware before" was the root of it.
`src/proxy.ts` has been the middleware since the Google sign-in work; it
refreshes the Supabase session on every request. Next runs exactly one, so the
two now compose there, Supabase first — its `setAll` writes refreshed tokens
into `request.cookies`, and next-intl copies `request.headers` onto the
forwarded request, so this request's render sees the new token rather than the
expired one. Read the header comment in `src/proxy.ts` before changing either
half.

**The locale-stripping redirect.** `(marketing)/layout.tsx` and
`legal/page.tsx` now use next-intl's `redirect`, which takes the target locale
explicitly so it cannot silently drop the prefix. Verified: `/he/legal` → 
`/he/legal/privacy`, `/legal` → `/legal/privacy`.

**`sitemap.ts` and `robots.ts`** emit both locales, each entry naming the other.

**The hreflang map was NOT already correct.** It lived in `[locale]/layout.tsx`,
and layout metadata is inherited by every route below it — so `/about` told
crawlers its Hebrew twin was the Hebrew *home page*. Google drops a pairing
that does not point back, so one map there breaks the whole set rather than one
route. Each page now declares its own via `alternatesFor()` in
`src/i18n/alternates.ts`, which the sitemap reads too, so the two cannot drift.
`/design` got a `layout.tsx` purely to carry its map (its page is `"use client"`
and cannot export metadata).

**The link audit.** Every internal `<Link>` and `redirect` moved to
`src/i18n/navigation.ts`. Three navigations must NOT be client-side and keep a
plain `<a>` / `window.location`, prefixing by hand with `localePath` /
`hardNavHref`: `ProjectsOverlay`'s "back to site" (a full document load is what
flushes the debounced autosave — see its comment), and the two live-room
handoffs in `src/collab/`. There is no `useRouter` anywhere in the app.

**One rule this uncovered, written up in `src/i18n/README-static.md`:** every
server layout and page under `[locale]` must call `setRequestLocale`. Skipping
it makes next-intl read the locale from a request header, which throws
"changed from static to dynamic at runtime" and **500s** — but only on the
unprefixed English routes, and only when served, never at build. Read that file
before adding a route.

**Verified**, production build, both locales: `/` `/about` `/faq` `/design`
`/account` `/calibration` `/legal/privacy` `/legal/terms` all 200; `/legal`
307s to privacy within its locale; `/v/<id>?g=…` still resolves unprefixed;
`/en/*` 307s to the unprefixed canonical, so there is no duplicate URL; every
internal href on `/he` carries the prefix and every one on `/` is unchanged;
`lang`/`dir` correct; hreflang per page correct. `typecheck` clean, `build`
clean, `lint` unchanged from `main` (the one known `TraceOverlay.tsx:224`
error).

### Step 2 — the locale switcher

None exists yet. Copy the shape of `src/ui/planDock/theme.tsx` — it is the
working precedent for a persisted user preference applied to
`document.documentElement`. Strings are already in the catalogue under
`locale.*`. It needs to appear on both the marketing header and in the editor.

### Step 3 — translate the landing page (**this is the checkpoint Dan asked for**)

`src/landing/content.ts` (226 lines) is already the single home for marketing
copy — `SLOGANS`×8, `HERO`×6, `HOW_IT_WORKS`, `DIFFERENT`, `FAQ_INTRO`,
`FAQ`×10, `CTA_BAND`, plus `src/landing/nav.ts` (3 nav + 3 footer labels). That
is ~62 strings and it is the whole job for this step. Then the five sections
(`Hero`, `HowItWorks`, `Different`, `Faq`, `CtaBand`), `about/page.tsx` and
`faq/page.tsx`.

**Stop here and show Dan.** The bar: landing fully Hebrew and correctly laid
out, editor still English and still working.

### Step 4 — editor RTL (~96 directional properties)

Sort every one into a tier before touching it.

**Tier 1 — mechanical.** `left`→`insetInlineStart`, `right`→`insetInlineEnd`,
`marginLeft`→`marginInlineStart`, `paddingLeft`→`paddingInlineStart` (+ the
`right`/`End` mirrors), `textAlign: "left"|"right"`→`"start"|"end"`. React
passes unknown camelCase style keys straight through, so no shim is needed.
Covers most of it, including `inspector/panelKit.tsx`'s `right: 14` (the anchor
for **all nine** inspector sections) and `BottomDock`'s three
`marginLeft: "auto"` right-push spacers.

**Tier 2 — needs design, not a codemod.**
- `src/ui/consent/ConsentNotice.tsx` — its header comment documents a
  **hand-tuned** non-collision map against `panelKit`'s `right:14/top:64` and
  `BottomDock`'s `left:16/bottom:16`. Mirroring invalidates that whole
  analysis; the notice lands where the navigator now is. Re-derive it.
- `src/app/[locale]/design/page.tsx` — the conditional `right: showTrace ? 14 : 132`.
  The property swap is mechanical, but the trace panel it dodges flips too, so
  the *number* needs re-checking.
- `src/ui/AccountMenu.tsx` — dropdown pinned `right: 0` must flip to stay on
  screen.
- `src/collab/CollabRoom.tsx` — avatar stack `marginLeft: -6`; the negative
  overlap is what makes the pile read in one direction.

**Tier 3 — must NOT be touched.**
- `src/viewport3d/CameraDoubleClickRig.tsx:45` — `(e.clientX - rect.left)/rect.width`
  is **NDC maths for a raycast**, not layout. Correct in both directions.
  "Fixing" it breaks click-to-focus.
- The seven `translateX(-50%)` centrings — direction-agnostic.
- `src/landing/TraceOverlay.tsx` — **a mirrored floorplan is a different
  floorplan.** The drawing stays LTR in its own `HERO_BOUNDS` projection; only
  its `<text>` labels take Hebrew.
- **`src/brand/Wordmark.tsx`** — it renders `done` plus a copper square offset
  by `marginLeft: "0.055em"`. Inside an RTL paragraph, bidi will move that
  square to the wrong side of the word. Wrap the mark in
  `direction: "ltr"; unicodeBidi: "isolate"` and **leave the physical
  `marginLeft` alone** — it positions a glyph inside a Latin lockup, not a page.

### Step 5 — editor strings (~700–850 keys)

Namespaces mirroring the UI: `nav`, `hero`, `howItWorks`, `different`, `faq`,
`cta`, `dock`, `inspector`, `toolbar`, `trace`, `account`, `toast`, `undo`.

**The proper-noun boundary, made enforceable.** IKEA and brand names stay
native by staying **out of the catalogue entirely** — they are already data in
`src/furniture/catalog.ts` (390 IKEA + 75 BlenderKit) and render raw. Add a
test asserting no key exists under a `furniture.items.*` prefix so nobody can
quietly add one. But draw the line deliberately: `src/parametric/*.ts` display
names ("Alcove bath", "Chimney hood" — ~122 of them) are **generic
descriptions, not product names**, and they *should* translate.

**Long-form prose is not message keys.** Privacy (1,480 w), account (1,518 w),
terms (813 w), about (645 w) — ~4,700 words. Keying these per paragraph is a
trap: legal text is translated as a *document*, by a person, and per-paragraph
keys make it impossible to restructure a clause. Use per-locale route content
(`content.en.tsx` / `content.he.tsx`) beside each page instead.

**`useSceneStore` (~29 strings) is not React** and cannot call
`useTranslations`. Store a message **key** on the undo entry / toast and
translate at the render site. The wave-1 sweep already moved in this direction:
`importStatus` is now a field and the glyph is chosen at the render site, so
that pattern is established — follow it.

Also convert the locale-implicit format calls to explicit `Intl` with the
active locale: `account/page.tsx:163`, `ProjectsOverlay.tsx:31`,
`inspector/FurnitureSection.tsx:24` (already prefixes `₪`),
`calibration/page.tsx:484,501`. An English UI on a Hebrew-locale machine
already shows Hebrew dates today.

`legacy/src/trace2d/` (57 strings) is **editable** — rule-2 exception logged in
`docs/LEGACY_PATHS.md`. Presentation only.

---

## Verification

- **Pseudo-locale.** Add a dev-only `en-XA` that brackets every string and pads
  it ~40%. It exposes unextracted strings and truncation instantly and is far
  cheaper than eyeballing 900 keys. Best single tool for this job — build it
  before Step 5, not after.
- **Overflow assertion.** Playwright, each route at both directions, assert
  `document.documentElement.scrollWidth <= clientWidth`.
- **Mirror assertion.** For the pinned panels (inspector, navigator, consent
  notice, account menu) assert their bounding boxes swap sides between `/` and
  `/he`. That is the check that the codemod actually worked.
- **Font assertion.** `document.fonts.check("800 16px Rubik")` plus a computed
  style on a Hebrew node, so a silent fall-through to Segoe UI fails rather
  than ships.
- Re-run the wave-1 gates: `rg '[\x{1F000}-\x{1FAFF}]'` over `src/` +
  `legacy/src/trace2d/` must stay at **zero**; translation must not reintroduce
  emoji.
- `npm run typecheck`, `npm run lint`, `npm run build`. There is **no**
  `npm test` — tests are individual `test:*` scripts.

**Known pre-existing lint error, not yours:** `src/landing/TraceOverlay.tsx:224`
`react-hooks/refs`. Byte-identical to `main`.

---

## Deploy

`main` **is** production — a `git push origin main` is a Vercel deploy, and it
bypasses a `pytest` required status check that has never been satisfiable for
direct pushes (separate open task). Work on `feat/hebrew`; let Dan push.

**Never `git add -A` at the repo root** — three paths are untracked on purpose:
`docs/NAMING.md`, `docs/NAMING-BRIEF.md`,
`public/furniture/blenderkit/opt-ktx2/`.

**Windows note:** `git mv` on `src/app/**` fails with "Permission denied" while
the dev server is running — it holds file handles. Stop it before moving routes.
