# Hebrew / RTL — handoff

**Branch:** `feat/hebrew`, four commits in: `533fd89` (the scaffold),
`485d34e` (Step 1 — locale routing, links, sitemap/robots, hreflang),
`dd03c04` (Step 2 — the locale switcher), `3903114` (Step 3 — the landing page
in Hebrew), `56c19ed` (the small-screen notice) and `b92c6cf` (Step 4 tiers 1
and 2 — the editor mirrored), plus doc commits.
**Not pushed.** `main` is at `142d8d3` (the UI sweep, already live on done.design).

Read this file, then `docs/HEBREW-HANDOFF.md`'s sibling section in
`~/.claude/plans/ill-provide-a-list-breezy-pie.md` ("Wave 2 — Hebrew + RTL")
for the reasoning behind each decision. This file is the state of play; that
one is the argument.

---

## Start here (session of 2026-09-07 → next)

**STEP 5 IS DONE. The editor has no English surface left.** 576 `editor.*` keys,
en/he key sets identical, `tsc` clean, all eight `test:*` suites pass, and a
MISSING_MESSAGE sweep of both locales reports zero. 2026-09-06's work was
committed as `65dc193`; the inspector landed on top of it.

**The next thing is not translation.** What remains on this branch is Dan's two
open decisions (below), a native Hebrew read of the marketing voice, and the
merge/deploy question. Do not go looking for strings.

### Read this before trusting any "already done" claim in this file

**Two files were recorded here as "done as collateral" and were not.**
`ParametricSection.tsx` and `FurnitureSection.tsx` both called
`useTranslations` — which is what made them look finished to a grep and to an
inventory pass — while still rendering `"Width"`, `"Height"`, `"Depth"`,
`"Height off floor"`, `"Replace"`, `"Duplicate"`, `"Delete"` and three help
sentences as literals. Presence of the hook is not evidence of completion.

**And the sweep that missed it reported zero.** A MISSING_MESSAGE sweep only
sees keys that fail to resolve; an untranslated LITERAL resolves to itself and
is invisible to it. The sweep that found these drives `sel3d` through the
dev-only `window.useSceneStore` handle for each pick kind, then asserts on the
rendered inspector text — Latin words that are not units, file formats or
keycaps are the leftovers. **Assert on what is on screen, not on what failed to
resolve.** (`Inspector.tsx` returns null without a selection, which is why a
mode-only sweep can never see this panel at all.)

### Old start-here, kept for the record

**Working tree is DIRTY: ~30 modified files, nothing committed, nothing pushed.**
That is the whole of 2026-09-06's work — Step 4's finish plus most of Step 5.
Commit it before doing anything else. **(Done 2026-09-07 as `65dc193`,
79 files.)**

**Four untracked paths, and they are NOT all the same kind.** Three are
untracked ON PURPOSE and must stay that way: `docs/NAMING.md`,
`docs/NAMING-BRIEF.md`, `public/furniture/blenderkit/opt-ktx2/`. The fourth,
`scripts/i18n/`, is new on 2026-09-06 and SHOULD be committed — it holds the
fragment-merge tool the parallel-worker convention depends on. Never
`git add -A` here; add that one path explicitly.

**Steps 1–4 are DONE. Step 5 is substantially done.** 478 `editor.*` keys,
en/he key sets identical, and a Playwright sweep of all four editor modes in
both locales reports **zero `MISSING_MESSAGE`**. typecheck clean, all five
`test:*` suites pass, lint 49 problems against a 50 baseline with an identical
warning profile.

**START HERE NEXT SESSION: the INSPECTOR is the only English surface left** —
`src/ui/planDock/inspector/`, ~127 strings, the panel that appears when you
select a wall, opening or item. `ParametricSection.tsx` and
`FurnitureSection.tsx` in that folder are already done as collateral from the
parametric work, so the real remainder is `OpeningSection.tsx` (the densest
single file, ~67 strings including six sentence-length `tip:` strings),
`WallSection.tsx`, `RoomSection.tsx`, `FixtureSection.tsx`, `Inspector.tsx`,
`panelKit.tsx`. Also still English: `useSceneStore`'s `importMsg` prose.

### The conventions Step 5 established — follow them, do not invent a second one

**Module-scope label tables carry `labelKey`, resolved at the render site.** A
module cannot call `useTranslations()`. Every such table now keeps its stable
`id` and swaps the word for a key: `ALL_MODES` (design/page.tsx), `WALL_MODES`
/ `ENV_PRESETS` / `WEATHERS` (Viewport.tsx), `DOCK_TABS` / `ROOM_SCENES`
(BottomDock.tsx), `TOOLS` / `OPENING_TYPES` (BuildToolbar.tsx), every
`*_HOTSPOTS` array, and all 21 parametric generators. The precedent is
`NavItem.labelKey` from the marketing nav.

**A worker must NEVER edit `messages/*.json`.** Three parallel workers doing
read-modify-write on one JSON silently drops two of them. Each writes
`{"en": …, "he": …}` to its own fragment file and the leader DEEP-merges. The
merge script (which also diffs the en/he key sets and fails loudly on a
mismatch) is in the repo: `scripts/i18n/merge-fragments.mjs`, which takes the
fragment directory as its one argument.

**Budget for repair work after every parallel worker.** A worker stops at its
file boundary by design, so a rename that crosses files lands half-finished: the
parametric worker renamed `label`→`labelKey` across 21 files and left three
render sites and twelve test assertions broken for the leader to fix. That is
still cheaper than the collisions, but it is not free.

**Tests that assert on WORDS have to resolve keys.** The "no card falls back to
'<generator> · <variant>'" checks became `!p.variantLabelKey` — the fallback is
a set field now, not a "·" inside a string. `softDecor.test.ts` imports
`messages/en.json` through an `EN_LABEL` helper for the one check that reads a
screen size out of the English caption.

**`FurnitureAsset` has `name` AND `nameKey`, and they mean different things.**
`name` is a real product noun (IKEA's "MALM") that must never be translated;
`nameKey` is set only for PARAMETRIC items, whose generic description does
translate. One field meaning both is exactly how a raw key reaches a user's
screen. Render sites prefer `nameKey`.

**Two protected-file exceptions were granted on 2026-09-06 and are logged in
`docs/PROTECTED_PATHS.md`** — one for the four logical-property renames, a
second, separate one for `Viewport.tsx`'s hardcoded TEXT. They were logged
separately on purpose: adding a `useTranslations` import is not a property
rename, and an exception is never widened to a change it does not describe.

**Two things waiting on Dan. Two more are now CLOSED — do not re-raise them:**

- ~~Does the Hebrew landing page read right?~~ **Answered 2026-09-05.** Dan read
  it: the translation is correct, and he is "not sure everything is how I would
  want it to sound" — accepted anyway, explicitly on the grounds that the
  foundations are strong and the wording is changeable later. So the checkpoint
  is PASSED with a standing note: the Hebrew VOICE is provisional and expected
  to be revised. It is cheap to revise — see below — and revising it does not
  touch Steps 4 or 5.
- ~~Push `feat/hebrew` for a Vercel preview?~~ **Declined 2026-09-05**, for now.
  Do not offer it again unprompted.

**Re-voicing the Hebrew is a one-file edit, and that is by design.** All of it
lives in `src/landing/content.he.tsx` (plus `(marketing)/about/content.he.tsx`
for the About prose) as plain prose in a typed object. Change a sentence and you
are done: no key to migrate, no English file to keep in step, and
`satisfies LandingContent` catches anything dropped. The header of each file
records the register and the three judgement calls behind the current wording,
so whoever revises it is arguing with a stated position rather than guessing at
one. **A native Hebrew marketing read before launch is still worth having** —
the copy is faithful and idiomatic, but "faithful" and "the voice Dan wants" are
different bars and only he can close the second.

1. **Should a Hebrew choice be remembered across visits?** Today it is not, and
   that is a consequence of `localeDetection: false`, not an oversight — see
   Step 2 below. The locale lives in the URL, so it survives every click inside
   a session and does not survive typing `done.design` fresh next week. Making
   it sticky means deciding what a returning Hebrew reader gets when a friend
   sends them an English link. Not a default to drift into; Dan's call.

2. **The editor at 390px is badly overlapped in BOTH locales** — a pre-existing
   mobile-layout problem, not RTL, and not part of this work. Worth a decision
   about whether it is in scope before Step 4 makes it look like a new bug.

**Do not re-litigate:** the middleware/proxy question is settled — see Step 1
below. `npm run build` alone does NOT verify i18n routing; read
`src/i18n/README-static.md` before touching any route.

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

### Step 2 — the locale switcher — **DONE**

One hook and two skins, the same split `AccountControl` / `AccountMenu` already
makes: `src/i18n/useLocaleSwitch.ts` does the href arithmetic,
`src/landing/LocaleSwitch.tsx` wears the brand tokens (desktop header beside
Sign in, and a row in the narrow-screen sheet) and
`src/ui/planDock/LocaleSwitch.tsx` wears the glass ones (editor top bar, between
`AccountMenu` and `ThemeToggle`).

It reads **"עברית" / "English"** — the endonym, always in the language it leads
to. `localeName` lives in `routing.ts`, not in the catalogue, precisely so a
translator cannot localise it: the Hebrew build offering "אנגלית" would be
addressing a reader who by definition cannot read that word.

Four things here are not obvious, and three of them are traps:

1. **`<Link href={pathname} locale={target}>` is next-intl's documented switcher
   shape and it is WRONG here.** Setting `locale` also sets `forcePrefix`, so
   English comes out as `/en/faq`, not `/faq`. It works — `src/proxy.ts` 307s it
   to the canonical URL — but it puts a link to a redirect in the header of
   every page, which is the same near-miss `localePath` refuses to make for the
   sitemap. `switchLocaleHref` in `src/i18n/navigation.ts` calls `getPathname`
   *without* `forcePrefix` instead, and the result is rendered with a **plain
   `next/link`** — the locale-aware `Link` would prefix an already-prefixed
   href a second time. Those two files are the only plain-`next/link` call sites
   in the app and both say why.
2. **The query string has to be carried by hand**, because `usePathname()` is
   path-only and this app keeps real state in the query (`?g=` share grants,
   `?perf=1` / `?dpr=1`, `?home=1`). `useSearchParams()` is the obvious hook and
   the wrong one: reading it from a component on a statically-prerendered page
   opts that page out of static rendering, and this sits in the site header. So
   it reads `location.search` through `useSyncExternalStore`, exactly as
   `usePerfEnabled` does and for the reasons written up there. Verified: the
   build still lists every marketing route as `●` prerendered.
3. **`localeCookie: false` is now set in `routing.ts`.** next-intl writes a
   `NEXT_LOCALE` cookie whenever a Link crosses locales, but `resolveLocale`
   only reads it when `localeDetection` is on — so with detection off it was a
   cookie nothing could consult, and the privacy policy says in as many words
   that the only cookies set are Supabase's. Not worth amending a legal page for
   a no-op. The consequence is item 3 in "waiting on Dan" above.
4. **`prefetch={false}` on both.** The header is on screen for every visitor of
   every page; the default would quietly pull the other locale's copy of the
   site for a control most people click once or never.

Also fixed in passing, in the same bar: `ThemeToggle`'s tooltip was
`placement="top"` at `top: 14` inside an `overflow: hidden` `<main>`, so it was
drawn off the edge of the window rather than shown. Both controls now use
`bottom`.

**Not in scope, on purpose:** `/legal/*`, `/account` and `/calibration` render
no header at all, so they have no switcher. They are reached from pages that do,
and the locale rides along.

**Verified** against a production build, in a real browser (Playwright, ~25
assertions): the switcher's href on `/` `/about` `/faq` `/design` and each `/he`
twin resolves to the canonical URL in the other locale with **no `/en/…` hop**;
`?dpr=1`, `?perf=1` and a two-param query survive the switch in both directions;
a real click lands on `/he/faq` with `lang`/`dir` correct and no horizontal
overflow, and clicking back returns to `/faq`; the label renders as "עברית" with
Rubik actually loaded on an English page; in the editor the control is the
topmost element at its own centre (nothing overlaps it); at 390px it is absent
from the collapsed bar and present as a row in the open sheet, both locales, no
overflow. `typecheck` clean; `build` clean, all routes still prerendered; `lint`
unchanged from `main` (50 problems, the one known `TraceOverlay.tsx:224` error),
with zero findings in any new file.

### Step 3 — translate the landing page — **DONE** (the checkpoint)

`/he` is fully Hebrew: homepage, About, FAQ, the hero demo's own chrome, the
account control and the cookie notice. English is unchanged. The editor is still
English and still works, which was the other half of the bar.

**The architecture, and why it is not what this file originally assumed.** The
plan said ~62 strings into the catalogue. That was right about the count and
wrong about the container. Voice-bearing copy now lives in TYPED PER-LOCALE
MODULES — `src/landing/content.{en,he}.tsx` behind `content.ts`, and the same
shape beside `/about` — and only chrome labels go in `messages/*.json`. The
argument is written out in `content.ts`'s header; the short version:

1. **The structure is part of the translation.** A slogan is set AROUND the
   wordmark, and which half a line uses is a Hebrew word-order decision, not a
   constant to fill in. Two of the eight moved slot.
2. **The rationale has to live beside the copy.** These strings carry a
   banned-word list, an honesty rule about what the app does NOT do, and a
   per-answer citation of the code that makes each FAQ answer true. JSON holds
   no comments, so a key table would have stranded all of it — the same reason
   this file already gives for keeping the legal pages out of the catalogue.
3. **Completeness comes free.** Both modules satisfy `LandingContent`, so a
   missing Hebrew string is a COMPILE ERROR. That is strictly stronger than the
   pseudo-locale sweep planned for Step 5, and it costs nothing.

**The line to hold, so this does not become two answers to one question: voice
copy in the modules, chrome labels in the catalogue.**

**The real string count was 124, not 62.** The estimate was exact for the
homepage table and never covered About's prose, the hero demo's ~24 controls, or
the ~20 chrome strings in the header, account menu and cookie notice — all of
which a Hebrew visitor sees on the landing page. Budget accordingly for Step 5.

**`<Brand />` shipped** (`src/brand/Brand.tsx`) — the mark, wrapped in
`direction: ltr; unicode-bidi: isolate`. Every occurrence of the name in running
text goes through it, in BOTH locales: writing `"done."` as a literal in
`content.he.tsx` renders `.done` on the page.

**The Wordmark was flipping too, and worse than predicted.** Its period is an
ELEMENT, not a character, so no text-based check could see it — the hero
rendered a big `.done` on `/he`. `Wordmark` and `WordmarkLockup` now both carry
the isolate. The square's physical `marginLeft` is deliberately NOT flipped: it
positions a glyph inside a lockup that is now guaranteed LTR, so an
inline-start value would be wrong there precisely where it is right elsewhere.

**`fontMono` now ends in Rubik**, and `[locale]/layout.tsx`'s claim that it
needed no Hebrew companion ("every mono use is numeric") is retracted in place.
The plan drawing's room labels are Hebrew words in a mono label beside mono
digits; with no fallback the browser substituted a different face per OS. There
is no Hebrew monospace loaded, so a proportional fallback is the honest floor.

**Two regressions caught and undone while passing through:** `Footer` had been
flipped to a client component to reach `useTranslations` (it ships the whole
footer for strings that never change — it is a server component again, on
`getTranslations`), and `Faq`/`Different` were keyed on their own copy, which
changes with the language; both now carry stable `id`s.

**Page titles are `generateMetadata`** on all three marketing pages, so `/he`
stops serving English ones. `alternatesFor()` is kept on every one.

**Verified** against a production build, both locales, at 1280 and 390: a DOM
sweep of `/he`, `/he/about` and `/he/faq` with every `<details>` forced open
finds ZERO untranslated English once the deliberate Latin is excluded (the mark,
PDF/DXF/DWG/JPG/PNG/CAD, Google, the switcher's own "English", m², ©); `lang`/
`dir` correct; no horizontal overflow at either width; the copper square measured
to the RIGHT of the letters in all three wordmarks on the page; English still
LTR and unchanged. `typecheck` clean, `build` clean with every marketing route
still `●` prerendered, `lint` at the same 50 problems / 1 error as `main`.

**The sweep has one blind spot, worth knowing before trusting it in Step 5:** it
only sees what is IN THE DOM. The hero demo's controls mount only once the
sequence has built a room, so its ~24 labels were never in the sweep's sample —
they were translated from a static audit, not caught by the gate. A pseudo-locale
would find them; the sweep will not.

**Two things about Step 4 that this step already settled**, so do not re-derive
them: `Wordmark.tsx` is DONE (it was listed under Tier 3 as needing the isolate
— it has it), and the `done.` period problem is closed everywhere except any
copy that has not been translated yet.

### Step 4 — editor RTL — **DONE 2026-09-06**

Commit `b92c6cf`. Physical properties are logical properties now:
`left`/`right` → `insetInlineStart`/`insetInlineEnd`, the margin and padding
pairs likewise, `textAlign: "left"|"right"` → `"start"|"end"`. React passes
unknown camelCase style keys straight through, so no shim was needed.

**The real count was ~45 sites, not ~96.** The larger figure counted the whole
repo, including tests, the `parametric/` spatial geometry and the marketing
site. Both tiers are finished across 17 files.

**Measured**, 1440×900, Build mode, `/design` vs `/he/design`: 8 absolutely
positioned chrome boxes, **7 mirror to within 4px, and ZERO new overlaps** (4
overlaps pre-exist in English and are unchanged). The script is ~90 lines and
worth rebuilding rather than reinventing — it pairs boxes across the two locales
by DOM path, asserts `he.x === W - (en.x + en.w)`, and then diffs the set of
overlapping pairs between locales. **That second check is the one that matters:**
half-mirroring is this job's failure mode, and an element still pinned physically
does not look wrong on its own — it looks wrong by landing under a neighbour.

#### THE BLOCKER — **RESOLVED 2026-09-06, kept for the reasoning**

Dan approved option 1. The four sites are now `insetInlineStart`/
`insetInlineEnd`, logged in `docs/PROTECTED_PATHS.md`. The predicted
inspector × WallModeToggle collision is verified gone — and verifying it needed
a real SELECTION, because `Inspector.tsx` returns null without `sel3d`, which
is precisely why the earlier gate run missed it. Measured 1440×900 with a wall
selected: 11 pinned boxes per locale, 10 mirror within 4px, overlap sets
identical (the one that does not mirror is the `2.00 m` dimension label floating
in world space over the selected wall — scene geometry, which must never
mirror). Two traps if you re-run that gate: the editor opens in TRACE with an
empty plan so press `2` for Build first, and do NOT detect a selection by
matching the text "Wall" — that is also a toolbar button and it false-positives;
watch the pinned-box count go 8 → 11 instead.

Original write-up follows.

**Four pieces of editor chrome live inside PROTECTED files** and could not be
mirrored. CLAUDE.md rule 1 says stop and ask Dan, so that is what this is.

| file | element | pinned at |
|---|---|---|
| `src/viewport3d/Viewport.tsx:217` | the **Scene panel** (walkthrough, time of day, weather) | `left:14, top:112` |
| `src/viewport3d/Viewport.tsx:321` | **WallModeToggle** (Full/Cutaway/Top + Ceilings) | `left:14, top:64` |
| `src/viewport3d/Viewport.tsx:367` | **StatusOverlay** (selection + undo pill) | `left:14, bottom:14` |
| `src/viewport3d/walkthrough/WalkthroughMode.tsx:748` | the **FOV slider** | `right:14, top:64` |

`WallModeToggle` is the one box the gate catches: on `/he/design` it stays at
x=14 where the mirror expects x=1178. Screenshot it and you can see it sitting
on the left under a top bar that has moved to the left with it.

**One consequence is certain rather than observed, and it is the reason this
needs deciding rather than deferring.** The inspector is `insetInlineEnd: 14,
top: 64` (`panelKit.tsx`), which in Hebrew resolves to physical `left:14,
top:64` — *identical* coordinates to `WallModeToggle`. So the moment anything is
selected in the Hebrew editor those two draw on top of each other. The gate did
not catch it only because nothing was selected in that run; it is arithmetic,
not a guess. **Reproduce it before designing a fix:** select a wall on
`/he/design` and look at the top-left.

Three ways forward, for Dan to pick:

1. **Approve a protected-file exception** for the four sites above — four
   property renames, no logic touched. There is precedent: the "Approved
   exceptions" section of `docs/PROTECTED_PATHS.md` already lists a 2026-09-04
   `WalkthroughMode.tsx` change signed off before it was made. This is the
   cheapest correct answer, and the argument for it is that these four are UI
   chrome that happens to live in the viewer's file, not viewer code — the
   protection exists for "the working 3D viewer/renderer", which none of them is.
2. **Move them out** into `src/ui/planDock/` as new files and render them from
   `design/page.tsx`. Sanctioned by rule 1 (new files, no edits to protected
   ones) but a much larger diff, and it changes what mounts where in a file the
   walkthrough also uses.
3. **Leave them physical** and accept that the Hebrew editor has its wall-mode
   row, scene panel and status pill on the wrong side, with the inspector
   overlapping the first of them. Cheapest, and visibly wrong.

**Recommendation: option 1.** It is four renames, it is reversible, and it is
the only one of the three that leaves the Hebrew editor correct without
restructuring code the 3D layer depends on.

#### Also worth knowing

- **A pre-existing overlap is now easier to see.** In Build mode the consent
  notice overlaps the Plan Dock navigator, in BOTH locales — the gate confirms
  it is one of the four that pre-exist in English. It is not a Step 4
  regression, but it is more obvious in the Hebrew screenshot, so do not file
  it as one. Fixing it is its own small job.
- Tier 3 was left alone exactly as specified: the seven `left: "50%"` centrings,
  every `textAlign: "center"`, `isoArt.tsx`'s `right` (a field name on a box
  face, not CSS), `parametric/`'s spatial left/right, and the deliberate
  `direction: ltr` isolates in `Brand.tsx` / `Wordmark.tsx`.
- The editor's mobile collision is no longer a Step 4 concern: `SmallScreenNotice`
  (commit `56c19ed`) covers anything under 700px on its short side, so Step 4
  only has to be right from tablet up.
- `ConsentNotice`'s hand-tuned non-collision map **survived the mirror
  unchanged**, because every panel it names is pinned logically too and they all
  cross together. Its comment is rewritten in leading/trailing terms; that is
  the payoff for doing this with logical properties instead of a locale
  conditional.


### Step 5 — editor strings — **DONE 2026-09-07**

The inspector closed it: `editor.opening` (58), `editor.inspector.{wall,room,
fixture,panel}` (27), `editor.import` (3), plus 10 repair keys on
`editor.parametric`. **576 `editor.*` keys, en/he identical.** Three parallel
workers on disjoint file sets, each writing its own fragment, leader-merged —
the convention below, used as written.

Four things the leader had to repair afterwards, all of them the predicted
worker-boundary kind:

- **`src/fixtures/catalog.ts` had no `nameKey`.** Its three names are generic
  descriptions ("Flush ceiling light"), so they translate — the `FurnitureAsset`
  split applies. Added `nameKey` BESIDE `name` rather than swapping, because
  `src/viewport3d/FixtureCatalog.tsx` still renders `name` and lives in the
  protected tree. **Open: the Build-mode fixture picker is therefore still
  English.** Not on the PROTECTED_PATHS list by name, but inside `viewport3d/` —
  ask before editing.
- **`openingDisplayName` returns English words** from `src/render/doorStyle.ts`,
  which the renderer imports and which must not gain `useTranslations`. Added a
  thin `openingDisplayNameKey` sibling; the derivation stays put, only the words
  moved. Add a case to one, add it to the other.
- `ParametricSection.tsx` / `FurnitureSection.tsx` — see the warning at the top
  of this file.
- `importMsg`'s render sites turned out to live in `legacy/src/trace2d/`
  (`TraceRail.tsx`, `TracePanel.tsx`), not under `src/`.

**Still English on purpose:** `commitScene` history labels (dead text —
decision 4); keycap names inside translated sentences (`R`, `Delete` — the
keyboard does not translate); file-format and unit identifiers (PNG, DXF, m,
cm, px, lx, K); IKEA product and colour names; the raw JS error text inside
`editor.import.failed`.

**Still English, and a decision rather than a rule:** the import pipeline's own
prose — `rasterQualityMsg()` in `planImport.ts` and `importDxf()`'s summary —
reaches the user through `importMsg` but is formatted upstream. Translating it
means those functions returning a key + params instead of a string. Also
`useSceneStore.ts:871`'s "DWG needs a local converter" throw, which reaches the
user only through the generic `catch`.

The ~700–850 estimate was high: the editor surface was **478 keys** before the
inspector, 576 after. Two
independent inventory passes landed at ~492 and ~600; the gap was long-form
prose that this doc's own guidance had already carved out to per-locale route
content.

Original write-up follows.

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

**Already run once, 2026-09-04, worth reusing rather than rebuilding.** A
throwaway Playwright script shot `/he`, `/`, `/he/about`, `/he/faq` and both
editors at a 390px phone viewport against `npm start`, and asserted
`scrollWidth <= clientWidth` on each — **no overflow in either direction**, and
`lang`/`dir`/`title` read back correct. Two things that came out of doing it
visually and would not have come out of curl:

- The mirrored header is right (hamburger and Sign in move left, wordmark
  right), and English is byte-identical to what is live.
- **The editor at 390px is badly overlapped — in BOTH locales.** That is a
  pre-existing mobile-layout collision, not RTL, and not part of this work.
  Shoot the English twin before filing any editor layout bug, or you will
  attribute a mobile problem to the translation.

The script lived in the scratchpad and was deleted; it is ~30 lines. Step 2's
larger one (~130 lines, the assertion list quoted above) went the same way. Both
resolve `playwright` by absolute path into this repo's `node_modules`, which is
what lets them live in the scratchpad rather than in the tree — a relative
`require("playwright")` only works from *inside* the repo.

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
