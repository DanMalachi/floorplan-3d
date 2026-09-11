# Accessibility

Status: **first real audit, partially remediated.** Commercial must-have #22.

This is not a conformance claim. Nothing here was tested with a screen reader,
with a keyboard in a running browser, or with any automated auditor. See
[Not verified](#not-verified) — read that section before quoting anything in
this file.

The work is split deliberately:

- **Applied** — fixes that a sighted user cannot see. Names, roles, states,
  keyboard reach, focus handling, landmarks.
- **Proposed** — anything that changes how the app *looks*. Contrast, spacing,
  focus-ring styling. Measured and written down here, not applied. Dan rules on
  these.

That split exists because this product's visual design is not up for
negotiation as a side effect of an accessibility pass.

---

## What was audited

Surface by surface, by reading the components — not by grepping for one
pattern.

| Surface | Files |
| --- | --- |
| App shell: mode switcher, project bar, Go live, theme toggle | `src/app/page.tsx`, `src/ui/planDock/theme.tsx` |
| Decorate dock: item grid, palettes, search, resize, tabs | `src/ui/planDock/BottomDock.tsx` |
| Illustrated room / house navigators | `src/ui/planDock/isoArt.tsx`, `BuildHouseScene.tsx`, `BuildNavigator.tsx`, the eleven `*Scene.tsx` |
| Build toolbar | `src/ui/planDock/BuildToolbar.tsx` |
| Inspector (wall, opening, furniture, parametric, fixture, room) | `src/ui/planDock/inspector/**` |
| Transient feedback: toasts, camera offer, eyedropper | `src/ui/planDock/toast.tsx`, `cameraOffer.tsx`, `src/decorate/EyedropperController.tsx` |
| Projects gallery | `src/ui/ProjectsOverlay.tsx` |
| Account control + popover | `src/ui/AccountMenu.tsx` |
| Cookie notice | `src/ui/consent/ConsentNotice.tsx` |
| Live room: presence, share popover, role links | `src/collab/CollabRoom.tsx` |
| Account / data page | `src/app/account/page.tsx` |
| Legal pages | `src/app/legal/**` |
| Document shell | `src/app/layout.tsx`, `src/app/globals.css` |
| 3D viewport chrome | `src/viewport3d/**` — **read only, frozen**, see [The 3D canvas](#the-3d-canvas) |

Not remediated, deliberately: `/calibration` and `src/dev/GtLab.tsx`. Both are
internal harnesses, neither is linked from the product. Findings are listed
under [Known gaps](#known-gaps) rather than fixed, to keep this diff
reviewable.

---

## Findings, ranked by how much they cost a real user

Ranked by impact, not by how easy they were to find.

### 1. Two hundred controls with no accessible name — APPLIED

The Paint and Floors palettes are bare `<button>`s whose entire content is a
background colour or a background image. No text, no icon, no `alt`. A screen
reader had nothing to announce but "button", roughly two hundred times. The
colour code and English name were already sitting in `title`, which is a
last-resort fallback that several assistive technologies ignore and which
never appears for a touch user at all.

Same shape, smaller blast radius: `PdSwatch` in the inspector (wall face
paint, furniture finishes, artwork, window frame colour) took `title` as an
*optional* prop — so the call sites that passed none had no name whatsoever.

Fixed by giving each swatch a real `aria-label` and reporting selection with
`aria-pressed` instead of an accent border alone.

### 2. Every icon-only control was announced as "button" — APPLIED

`Tooltip` renders its label as a **sibling** node that only exists on hover.
It therefore never became the wrapped control's accessible name, and never
appeared for a keyboard user at all. Everything wrapped in it was anonymous:
the eleven room tabs, the four dock section tabs, the eyedropper, the four
Build tools.

`Tooltip` now clones its child and stamps the label on as `aria-label` when
the call site has not set one, and marks its own bubble `aria-hidden` so the
text is not announced twice. One change, every call site fixed, no call site
touched.

### 3. The Projects gallery was unusable without a pointer — APPLIED

This is the only route to any saved plan, and each card was a `<div>` with an
`onClick`: not focusable, no role, no key handler. A keyboard user could not
open a project at all.

The overlay itself covers the entire editor but was a plain `<div>`: no
`dialog` role, no `aria-modal`, focus left wherever it was in the editor
underneath, and Tab walked straight out of the gallery into chrome the user
cannot see or reach.

Fixed: cards are `role="button"` with `tabIndex` and Enter/Space (they cannot
be real `<button>`s — they contain their own delete and rename buttons and a
rename input, and nesting interactive content inside a button is invalid). The
overlay is a labelled modal dialog that moves focus in on open, keeps Tab
inside while open, and returns focus to the trigger on close. Delete, rename
and close now say what they act on instead of being announced as an emoji.

### 4. The illustrated navigators were pointer-only — APPLIED

Both the Decorate room scenes and the Build house cutaway build their hotspots
from `HitArea`, which carried `role="button"` but no `tabIndex` and no key
handler — a button that claims to be a button and cannot be reached or
operated. Its accessible name was the raw hotspot id (`"stove"`, `"doors"`),
while the readable label (`"Stove & oven"`, `"Doors — drop on a wall"`) existed
only inside an SVG bubble drawn on hover.

Fixed: focusable, Enter/Space, the human label passed through as the name,
`aria-pressed` for the armed hotspot, and `onFocus`/`onBlur` wired to the same
handlers as hover so the outline and label bubble appear for keyboard focus
too.

> **Dan — one thing to look at.** These hotspots are now focusable, so the
> browser draws its default focus ring around the `<g>` when tabbed to. That is
> visible *only* while keyboard-focused, and it is the same default ring every
> button in the app already gets. If you dislike how it sits inside the
> illustration, the fix is a styled `:focus-visible` outline, which is a visual
> decision and therefore yours — see [Proposed](#proposed-not-applied) P4.

### 5. The app's whole feedback channel was silent — APPLIED

`pdToast` is how this product confirms and refuses: "Wall tool armed",
"Duplicated", "Gap too small for a door", "Jumped to Decorate · Floors",
"Pick a replacement in the Furniture tab". The host rendered the message and
removed it 2.2 seconds later with no announcement, so a non-sighted user got no
confirmation *and no rejection message*.

`role="status"` now on: the toast host, the camera offer chip, the armed-brush
line in the dock, the Build tool hint pills, the eyedropper pill, the
project save/sync status, the live-room head count, and the "your account has
been deleted" line (which is the only confirmation that exists before the page
reloads itself 1.5s later).

### 6. Selected state was carried by colour alone, everywhere — APPLIED

Every chip, tab, tool and swatch in this app signals "I am the active one"
with an accent tint and nothing else. That is invisible to a screen reader and
marginal for anyone with low colour discrimination.

`aria-pressed` added across: the mode switcher, dock section tabs, room tabs,
category filters, item and custom cards, paint and floor swatches, the
eyedropper, Build tools, opening types, and every toggle row in the wall,
opening and parametric inspectors.

### 7. The account-deletion field had no label — APPLIED

The single most consequential input in the product — type your email to
confirm irreversible erasure — had only a `placeholder`, which vanishes on the
first keystroke. It now has an `aria-label` and is wired by `aria-describedby`
to the "Type *your email* to confirm" line above it.

### 8. Popovers did not say they were popovers — APPLIED

The account popover and the share popover gave no indication that their
trigger opens something, or whether it is currently open. Both triggers now
carry `aria-expanded`. The share popover also had no Escape handler, unlike
every other dismissible surface in the app; it has one now, and returns focus
to its trigger.

Deliberate call: `aria-haspopup="true"`, **not** `"menu"`, and the panels are
`role="group"`, not `role="menu"`. `role="menu"` promises arrow-key navigation
and a roving tabindex that neither popover implements. A promise the widget
then breaks is worse than no promise. Making them real menus is future work,
listed under [Known gaps](#known-gaps).

### 9. Structure and landmarks — APPLIED

- `/account` section headings were styled `<div>`s: the page had exactly one
  heading and no outline to skim. Now real `<h2>`, with every default heading
  style overridden so nothing moves.
- `/account` and `/legal` had no `<main>`. Both do now.
- The mode switchers on `/` and in the live room are `<nav aria-label="Editor
  mode">`.
- Panels that appear and disappear (inspector, navigators, dock groups) are
  named regions and groups, so they are findable rather than being an
  unannounced wall of controls.
- `<html lang="en">` was already correct in `src/app/layout.tsx`.

### 10. Decorative glyphs read aloud before the meaning — APPLIED

`◈ Go live`, `▚`, `●`, `☀`/`☾`, `🗑`, `✎`, `▱`, `×`, `↷ Swing`, `▉ Wall`,
`🚪 Door`, `⏎`. Screen readers announce these by their Unicode names
("black diamond with white centre", "white sun with rays") ahead of the words
that carry the meaning — and where the glyph was the button's *only* content,
it *was* the name.

Every one is now inside an `aria-hidden` span, in exactly the same position,
rendering exactly the same pixels. Where the glyph was the only content, the
control gained a real `aria-label`.

### 11. Reduced motion — APPLIED

`globals.css` already honoured `prefers-reduced-motion` for the one pulsing
`.fp-armed` glow. It now also damps the chrome's CSS transitions and any future
keyframe animation under the same query. This only ever applies to someone who
has asked their operating system for less motion; the default look is
untouched.

**This does not cover the motion that actually matters.** See
[The 3D canvas](#the-3d-canvas).

---

## Proposed — not applied

These change how the app looks. They are measured, not guessed. **None of them
is in the branch.**

Contrast ratios computed from the tokens in `src/ui/tokens.ts` and
`src/ui/planDock/tokens.ts`, converting OKLCH to sRGB and alpha-compositing the
glass over its backdrop. For reference: WCAG's commonly-cited thresholds are
4.5:1 for body text, 3:1 for large text (≥18.66px bold or ≥24px) and for
non-text UI boundaries.

### P1 — The glass panels have no fixed contrast at all (structural)

This is the biggest visual finding and it is not a token tweak.

`pdGlass` is `oklch(0.2 0.014 260 / 0.38)` — **38% opaque** — and it floats over
a live WebGL render. Light theme is worse: `oklch(0.99 0.006 90 / 0.6)`, 60%.
So the text contrast inside every dock, inspector and toolbar is a function of
whatever the camera happens to be pointing at.

Measured, same tokens, three backdrops:

| Backdrop behind the glass | Theme | primary | secondary | tertiary | accentText |
| --- | --- | --- | --- | --- | --- |
| Dark interior `#141416` | dark | 15.82 | 7.38 | 3.77 | 9.07 |
| Mid grey `#808080` | dark | 6.21 | **2.90** | **1.48** | **3.56** |
| Bright sky `#e8f0fb` | dark | **2.36** | **1.10** | **1.78** | **1.35** |
| Dark interior `#141416` | light | 6.55 | **3.20** | **1.62** | **3.27** |
| Mid grey `#808080` | light | 10.57 | 5.17 | **2.62** | 5.27 |
| Bright sky `#e8f0fb` | light | 16.11 | 7.88 | 3.99 | 8.03 |

Point a Full-view camera at a daylight sky in the default dark theme and the
dock's *primary* text sits at 2.36:1 and its secondary text at 1.10:1 —
effectively invisible, for everyone, not only for users with a
disability. Dan will have seen this and read it as "the glass looks great over
the model"; it is the same effect.

Options, in increasing order of visual cost:

- **P1a** Raise glass opacity: `0.38 → ~0.62` dark, `0.60 → ~0.80` light. Keeps
  the recipe, loses some of the "read the scene through it" quality Dan
  specifically asked for.
- **P1b** Keep the opacity, add a `text-shadow` or a small opaque plate behind
  text runs only. Preserves the glass, costs a little crispness.
- **P1c** Make opacity adaptive — darken the glass when the scene behind is
  bright. Best-looking, most work, and needs a scene-luminance sample.
- **P1d** Accept it, and add an opt-in "solid panels" toggle beside the existing
  light/dark switch.

Recommendation: **P1d plus P1a as the default**, but this is squarely Dan's
call.

### P2 — Tertiary text is under 4.5:1 even in the best case

Even on the friendliest backdrop, `PD.textTertiary` `oklch(0.55 0.014 90)`
reaches only **3.77:1**, and `T.textFaint` `#66666e` reaches **3.15:1** on
`T.panelBg` and **3.26:1** on `T.bg`. These carry real content — the sync
status line, timestamps in the gallery, evidence rows in the room inspector,
unit suffixes, the "N items" counter — not decoration.

| Token | Current | Ratio (best case) | Suggested | Ratio at suggestion |
| --- | --- | --- | --- | --- |
| `PD.textTertiary` | `oklch(0.55 0.014 90)` | 3.77 | `oklch(0.63 0.014 90)` | ≈ 5.1 |
| `T.textFaint` | `#66666e` | 3.15 | `#8a8a93` | ≈ 5.0 |
| light `--pd-text-tertiary` | `oklch(0.58 0.014 70)` | 3.99 | `oklch(0.50 0.014 70)` | ≈ 5.6 |

These are one-line token changes; every consumer picks them up through the CSS
variables. They will make the faint text visibly less faint, which is the
entire point and also the entire objection.

### P3 — White on the accent is 3.65:1

`Go live` is `#fff` on `PD.accent` `oklch(0.62 0.15 258)` → **3.68:1**. The
Trace/View chip is `#fff` on `T.accent` `#0a84ff` → **3.65:1**. Both are below
4.5:1 for their size (13px, 600 weight). Darkening the accent to about
`oklch(0.55 0.15 258)` / `#0066d6` reaches ≈ 4.6:1 without changing the hue
family.

### P4 — There is no focus-visible style anywhere

The app relies entirely on the browser's default focus ring, and two places
suppress even that: `field()` in `src/ui/tokens.ts` sets `outline: "none"`, as
does the dock's search input and the account-deletion input. A keyboard user
typing into those fields gets **no** indication of where they are.

A single `:focus-visible` rule — a 2px ring in the accent colour at a 2px
offset — would fix focus visibility across the whole app and is the highest
value-per-pixel change on this list. It is proposed rather than applied because
a focus ring is a visual language decision, and because removing the existing
`outline: none` changes those three fields' appearance while focused.

### P5 — Single-character keyboard shortcuts cannot be turned off

`1`–`4` switch modes, `E` arms the eyedropper, `R` rotates, from anywhere that
is not a text input (`src/app/page.tsx`, and the handlers in the frozen
viewport). Users of speech-input software trigger these by talking. The
recognised remedies are a remap/disable preference, or only firing them while
the relevant component has focus. Both are product decisions, so neither is in
this branch.

### P6 — Hit-target sizes

Several controls are below the commonly-cited 24×24 CSS px minimum: the variant
dots on an item card are 9×9, `PdSwatch` defaults to 20×20 and is called at 16
in `VariantSwatchRow`, the dock's search-close button is 22×22, and the resize
handle's visible grip is 32×3. Enlarging any of them changes the layout, so
they are listed, not touched.

---

## The 3D canvas

`src/viewport3d/**` is frozen by `docs/PROTECTED_PATHS.md` and CLAUDE.md rule 1.
Nothing in it was edited. It was read, and here is the honest position.

**What is genuinely hard, and mostly unsolved anywhere in the industry.** The
model is drawn to a `<canvas>`. There is no DOM, so there are no nodes for
assistive technology to read, and no way to Tab "into" a wall. Selection,
dragging, rotation, wall drawing, opening placement and the first-person
walkthrough are all pointer gestures against a raycast into a 3D scene. There
is no honest DOM equivalent to hand to a screen reader, and I am not going to
pretend a fix exists. A blind user cannot design a floor plan in this viewport.
Saying otherwise would be worse than saying nothing.

The realistic ceiling — not attempted here, and each is a real project — is:

1. An off-screen live-region description of the scene, regenerated on change
   ("Kitchen, 12.4 m², 2 doors, 1 window; sofa at …"). Reaches *comprehension*,
   not editing.
2. A keyboard selection cycle over `scene.walls` / `openings` / `furniture` with
   arrow-key nudge and a spoken readout. This is the one that would actually
   make the editor operable, and it is a substantial feature, not an audit fix.
3. A non-visual "read the plan" mode built on the Building Knowledge Layer that
   `src/lib/rooms/` already populates.

**What was observed but not changed** (all in frozen files; each needs Dan's
sign-off before anyone touches it):

- `Viewport.tsx` — the canvas wrapper is `tabIndex={0}` with
  `outline: "none"` and a `keydown` handler. So it *is* focusable, has no
  accessible name or role, and shows nothing when focused. Adding
  `role="application"` with an `aria-label` and a described keyboard contract
  would be the single cheapest improvement in the whole product.
- `Viewport.tsx` `ScenePanel` — the time-of-day `<input type="range">` has no
  label; the `☀️`/`🌙` beside it is its only indication. `WallModeToggle`'s
  Full/Cutaway/Top chips and the Ceiling toggle have no `aria-pressed`. The
  walkthrough button's label carries a `🚶`.
- `Viewport.tsx` `StatusOverlay` — selection and undo state, not a live region.
- `FixtureCatalog.tsx`, `StairInspector.tsx` — DOM panels living inside
  `src/viewport3d/`. They are not R3F scene code, but the task's freeze covers
  the whole directory, so they were left alone. Both have the same
  name-and-state gaps the rest of the inspector had before this pass.
- `walkthrough/WalkthroughMode.tsx` — pointer lock. A browser refuses pointer
  lock to synthetic input, so this cannot be automated-tested either (see the
  `browser-verify-3d-app` note).

**Reduced motion.** The camera moves, walkthrough, rain and time-of-day are
driven by `requestAnimationFrame` inside the frozen layer. No CSS media query
reaches them. Honouring `prefers-reduced-motion` for the parts of this product
that actually move requires reading the media query in JS inside
`src/viewport3d/`, which is frozen. The CSS rule added in `globals.css` covers
the chrome only, and it would be dishonest to describe it as more than that.

**The reachable win, and it was taken.** Everything *around* the canvas — the
dock, the navigators, the inspector, the toolbars, the gallery, the share and
account flows — is DOM, and all of it is now nameable, keyboard-reachable and
state-reporting. That is the part that was fixable, and it is fixed.

---

## Known gaps

Real, found, not fixed. Roughly in priority order.

1. **Nested interactive content on item cards.** `ItemCard` is a `<button>`
   that contains variant dots which are themselves `role="button"`. Valid HTML
   (a `<span>` inside a `<button>`), invalid ARIA (nested interactive). The
   dots are now focusable and operable, which is strictly better than before,
   but the real fix is turning the card into a `<div>` wrapper with a separate
   primary button, and that risks the card's layout. Deferred deliberately.
2. **The inspector does not take focus when a selection changes.** Selecting a
   wall in the viewport makes a whole panel appear top-right with no
   announcement. It is now a named region, so it is *findable*; it is not
   *announced*. A live region naming the new selection, or moving focus into
   the panel, would close this — both change interaction behaviour, so both
   want Dan's opinion.
3. **The dock's section row is a tab set pretending to be toggle buttons.**
   `aria-pressed` is honest and correct, but `role="tablist"` / `role="tab"` /
   `role="tabpanel"` with arrow-key navigation is the right pattern. It needs a
   roving tabindex, which is a rewrite of the row rather than an attribute.
4. **The popovers are not real menus.** See finding 8.
5. **No skip link — deliberately.** Considered and rejected rather than
   cargo-culted: the legal nav is three links, and the editor has no focusable
   "main content" to skip *to* (the canvas is a single focus stop). A skip link
   here would be a visible-on-focus element that saves nobody any tabbing.
   Worth revisiting if the editor ever grows a real nav bar.
6. **`/calibration` and `src/dev/GtLab.tsx`.** Internal harnesses, not linked
   from the product, not remediated. Calibration is in reasonable shape
   already — its buttons have visible text and its checkboxes have wrapping
   `<label>`s — but its mode/hour/wall-mode chip rows lack `aria-pressed`.
   GtLab's dialog has the same missing dialog semantics the Projects gallery
   had before this pass.
7. **The `Copy` button in the share popover** changes its own label to `Copied`
   and does not announce it.
8. **`ProjectsOverlay`'s focus trap is a hand-rolled Tab handler.** It works for
   this dialog's contents but is not a general solution (no `inert` on the
   background, no shadow-DOM traversal). A single shared dialog primitive would
   be better than a second copy of this.
9. **No automated auditing in CI.** See below.

---

## How to re-audit

Nothing below was run for this pass. It is what the next person should do.

**Automated, needs a browser (a separate decision — deliberately not installed
here, there was no budget for a browser-driven run):**

```
npm i -D @axe-core/cli
npx axe http://localhost:3000/ http://localhost:3000/account \
        http://localhost:3000/legal/privacy --exit
```

`axe` finds roughly a third of real issues and finds none of the ones that
matter most here — it cannot tell you that the toast is silent, that the
gallery cards are unreachable, or that the glass has no fixed contrast.

**Static, no browser, could go in CI today:**

```
npm i -D eslint-plugin-jsx-a11y
```

and enable it in `eslint.config.mjs`. It would have caught findings 3, 4 and
part of 10 mechanically. It reports on JSX only, so it sees nothing inside the
canvas. Adding it will raise the warning count on first run; that is a
conversation to have before turning it on, since the current gate is "do not
raise the warning count".

**By hand, and this is the part that actually matters:**

1. Unplug the mouse. Reach every control in Build and in Decorate. Open a
   project from the gallery, rename it, delete it, share it, and sign out —
   without touching a pointer.
2. Turn on NVDA (Windows) or VoiceOver (macOS, Cmd-F5). Arm a paint colour and
   listen for the toast. Select a wall and see whether you can tell what is
   selected.
3. Set the OS to "reduce motion" and confirm the chrome settles. Note what the
   3D view still does.
4. Point the camera at bright sky in dark theme and read the dock. That is P1,
   and it needs no tooling at all.

**Verification for this branch**

```
$ npm run typecheck
> tsc --noEmit
(clean)

$ npm run lint
✖ 37 problems (0 errors, 37 warnings)
```

0 errors, and 37 warnings — identical to the pre-change baseline on `544427d`.

```
$ npm run build
✓ Compiled successfully in 16.6s
  Finished TypeScript in 21.7s
✓ Generating static pages using 11 workers (18/18)
```

`npm run build` needs `LIVEBLOCKS_SECRET_KEY` set to something starting with
`sk_` to get past page-data collection for `/api/liveblocks-auth`. That is an
environment gap in a fresh worktree, not a code change — the real key lives in
the main checkout's `.env.local`. A throwaway value was used for the build
check; no production service was contacted.

---

## Not verified

Everything in the "Applied" list is reasoned from the code and from the HTML
and ARIA specifications. None of it was observed working.

Specifically **not** done:

- **No screen reader was used.** Not NVDA, not JAWS, not VoiceOver, not
  Narrator. Every claim about what is or is not announced is a prediction from
  the accessible-name and live-region rules, not an observation.
- **No keyboard testing in a live browser.** Tab order, the Projects focus
  trap, the SVG hotspot focus ring, `role="separator"` arrow keys on the dock
  resize handle, and Escape-then-restore-focus in the share popover are all
  *unrun*. `tabindex` on an SVG `<g>` in particular is well supported in
  Chrome and Firefox and has a patchy history in Safari — that one is a genuine
  risk and wants checking on a Mac.
- **No automated auditor was run.** No axe, no Lighthouse, no
  `eslint-plugin-jsx-a11y`. No dependency was added for this work; the
  dependency count is unchanged.
- **No visual regression check.** Every change was chosen to be
  render-identical and reviewed line by line for that, but nobody has compared
  two screenshots. The changes that could conceivably move a pixel, and are
  therefore worth a glance: the glyph-into-`<span>` splits in `page.tsx`,
  `theme.tsx`, `BuildToolbar.tsx`, `WallSection.tsx` and `OpeningSection.tsx`;
  `<div>`→`<nav>`/`<section>`/`<main>`; `<label>`→`<div>` in `PdStepper` and
  the "Match run below" row; and `<span>`→`<h2>` for the Projects title and the
  `/account` section labels. In every case the replacement element's defaults
  are overridden by the same explicit inline styles.
- **No conformance claim, at any level.** Conformance cannot be established
  without assistive-technology testing. This document says what was checked and
  how it was checked. It does not say the product conforms to anything.
- **No contrast measurement in a browser.** The ratios in P1–P3 were computed
  from the token values by OKLCH→sRGB conversion and alpha compositing. They
  are arithmetic on the source of truth, not eyedropper readings off a
  screenshot, and the compositing model ignores `backdrop-filter: blur()`,
  which will shift the effective backdrop somewhat.
