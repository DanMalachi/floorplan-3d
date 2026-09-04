# Hebrew / RTL — handoff

**Branch:** `feat/hebrew`, one commit in: `533fd89` — the scaffold.
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
- `middleware.ts` — new file; there was no middleware before, so nothing
  competes with it (Supabase auth runs through `@supabase/ssr` in server
  components and route handlers).
- `next.config.ts` — `withNextIntl` applied **inside** `withSentryConfig`.
- Every user-facing route moved under `src/app/[locale]/`. `api/`, `auth/`,
  `robots.ts`, `sitemap.ts`, `globals.css` stayed at the root.
- `src/app/layout.tsx` is now a pass-through; `src/app/[locale]/layout.tsx`
  carries `<html lang dir>`, the fonts, metadata, `hreflang`, and the provider.
- **Rubik** added beside Manrope and IBM Plex Mono, and appended to the font
  stacks in `src/brand/tokens.ts` and `src/ui/planDock/tokens.ts`.
- `messages/en.json` + `messages/he.json` — only `meta` and `locale` so far.

**Verified working:** `/` `lang="en" dir="ltr"` · `/he` `lang="he" dir="rtl"` ·
`/design` `/he/design` `/faq` `/he/faq` all 200 · production build passes with
both locales prerendered · Hebrew `<title>` renders.

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

### Step 1 — two known breaks from the route move (do these first)

- **`src/app/[locale]/(marketing)/layout.tsx:33`** — `redirect("/design")`
  behind the `landingEnabled` flag. This now **strips the locale**: a visitor
  on `/he` with the flag off lands on English `/design`. Use next-intl's
  navigation `redirect` (from a `createNavigation(routing)` helper) so it keeps
  the prefix.
- **`src/app/sitemap.ts` and `robots.ts`** — still emit English-only URLs. They
  need `/he` entries and per-locale `alternates`. The `hreflang` map in
  `[locale]/layout.tsx` is already correct; the sitemap has to agree with it.

Also audit every internal `<Link href>` / `router.push` / `redirect` in the app
for the same locale-stripping bug. next-intl's `createNavigation` wrappers are
the fix; a bare `next/link` loses the prefix.

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
