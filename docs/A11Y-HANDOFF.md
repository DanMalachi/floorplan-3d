# Accessibility gaps: handoff

Written 2026-09-29. Launch list item 10. Branch `feat/a11y-gaps`, worktree
`C:\Users\dandu\fp-wt\a11y`, based on `origin/main` `f55422e` (onboarding live).

## STATUS 2026-09-29 (second session): §3-9 BUILT, one PR, not merged

| # | State |
|---|-------|
| 1 | English name filled ("Dan Malachi", `LEGAL_FACTS.accessibilityContactEn`). **Hebrew spelling still needed from Dan** (`accessibilityContactHe`, shows a placeholder until then). Phone: email only for now, question stays on the lawyer list |
| 2 | Script below (§2) ready. **Dan runs it** |
| 3 | DONE: card not live, title announced once; cards 9 Tabs in (were up to 100); focus returns to `?`; hints/eyedropper/brush lines announced; eyedropper + "Replacing" translated |
| 4 | DONE (Dan approved toggle + exception 2026-09-29): Help panel switch; `CameraKeyboardRig.tsx` exception logged |
| 5 | DONE (Dan chose the hidden status line): "Wall · 2.00 m selected" |
| 6 | MEASURED: all pass 2.5.8 by size or spacing except two Decorate navigator hotspots (Wall art, Clock). **Dan: grow them or leave** (drawn art, and 2.5.8 is outside IS 5568) |
| 7 | DONE: dock sections are a real tablist |
| 8 | DONE: `src/ui/a11y/useModal.ts` for all four modals (+ `inert`); account/share are plain disclosures |
| 9 | DONE: `npm run test:a11y` in nextjs-ci (24 states); jsx-a11y warnings (48 → 61, 0 errors). **The first CI run on the PR is the real test** that `/design` renders from CI's build |
| 10 | NOT STARTED. Waiting on Dan's yes after the plain-English explanation. Add: the Walkthrough FOV slider has no label and reads English on /he |
| 11 | Post-launch, unchanged |

The full record, with how each was verified, is the "Gaps pass, 2026-09-29"
section of `docs/ACCESSIBILITY.md`. The statement (he + en) dropped the two
gaps that closed (single-key shortcuts; unannounced selection and popovers)
and says what was added.

## 0. START HERE (original plan)

**Read first:** `docs/ACCESSIBILITY.md` (the full audit record, 646 lines — the
"Known gaps", "The 3D canvas" and "Not verified" sections matter most) and
`docs/PROTECTED_PATHS.md` (anything under `src/viewport3d/**` needs Dan's
approval and a logged exception before it is touched — CLAUDE.md rule 1).

**Where things stand.** Three passes shipped on 2026-09-18/19 (`c300d8d` and
`fix/a11y-compliance`): names/roles/states across the DOM chrome, glass contrast
fixed and measured in rendered pixels, focus ring everywhere, canvas is
`role="application"` with a spoken key list, camera flights jump under reduced
motion, statement live at `/legal/accessibility` (he binding + en), axe WCAG
2.0/2.1 A+AA clean on every public route and the three editor modes. Israeli
reg. 35 = IS 5568 = WCAG 2.0 AA plus a published statement.

**What is still open**, grouped by who can close it. Section numbers below.

| # | Gap | Who | Size |
|---|-----|-----|------|
| 1 | Statement: coordinator name + phone are placeholders | Dan | 5 min |
| 2 | No screen-reader test has ever been done | Dan (with a script from Claude) | 30 min |
| 3 | New onboarding UI (welcome, guide cards, help panel, nudges) never audited | Claude | small |
| 4 | Single-key shortcuts cannot be turned off (P5, WCAG 2.1.4) | Dan decides, Claude builds | small |
| 5 | Inspector not announced on selection (Known gap 2) | Dan decides, Claude builds | small |
| 6 | Hit targets under 24px (P6) | Claude, Dan looks | small |
| 7 | Dock section row should be a real tablist (Known gap 3) | Claude | medium |
| 8 | Popovers aren't real menus; hand-rolled focus traps (Known gaps 4, 8) | Claude | medium |
| 9 | No a11y check in CI | Claude | small |
| 10 | Protected 3D layer: reduced motion for walk/rain/time-of-day, FixtureCatalog + StairInspector have zero `aria-*`, walkthrough hint English on /he | Dan approves, Claude builds | medium |
| 11 | Keyboard alternative for 3D editing (WCAG 2.1.1) | Dan decides scope | large, a feature |

**Recommended order:** 1 + 2 (Dan, in parallel) → 3 → 4 → 5 → 9 → 6 → 7/8 →
10 → 11 later. Items 3-9 are one PR; 10 is its own PR (protected paths); 11 is
post-launch unless Dan wants it now. After every change, update the statement's
"What is not yet accessible" list (he + en) so it never claims less or more than
is true.

## 1. Statement placeholders (Dan)

`src/legal/content/accessibility.{he,en}.tsx` lines ~135-142:
`Accessibility contact: <Placeholder>name</Placeholder>` and
`Phone: <Placeholder>phone number</Placeholder>` with a `<Verify>` asking
whether a phone is required in addition to email. Dan supplies the name (can be
himself) and decides phone yes/no — the phone question goes on the lawyer list
(`docs/LEGAL-LAUNCH-CHECKLIST.md`). Claude fills them in, removes the
`<Verify>` once answered.

## 2. Screen-reader test (Dan)

**The script.** Windows: install NVDA (free, nvaccess.org), start it
(Ctrl+Alt+N), open `done.design/he/design` in Chrome once this PR ships
(before that, the PR's preview link). Mac: VoiceOver is Cmd+F5. For each step,
write down roughly what you heard:

1. Fresh visitor, the welcome opens. Do you hear its title and the "Upload my
   floor plan" button? Press Tab a few times: does it stay in the welcome?
2. Esc. Where are you now (what does it say)?
3. Press `?` (or Tab to the help button, Enter). Does it say "Help, dialog"?
4. Tab to "Single-key shortcuts". Does it say "switch, on"? Space: "off"?
   Turn it back on.
5. Esc. Are you back on the help button?
6. Press 3 (Decorate). Tab to the dock's section tabs. Does it say "tab,
   selected, 1 of 4"? Do the arrow keys read the next tab?
7. Paint tab, pick a colour. Do you hear anything when it's picked?
8. Press 2 (Build) and click a wall with the mouse. Do you hear "Wall · … m
   selected"?
9. Open the projects gallery (top left). Does it say it's a dialog? Esc: back
   on the gallery button?
10. Upload a plan. When the "How big is your plan?" card appears, do you hear
    "Tip: How big is your plan?"?

Paste the notes to Claude: they go into ACCESSIBILITY.md as a dated section,
and decide whether the statement's "not tested with screen readers" line can
change.

**Original note:**

Claude cannot drive NVDA/VoiceOver. Every "announced" claim in ACCESSIBILITY.md
is a prediction from the ARIA rules. Write Dan a 10-step script (like the
ship-check list for onboarding), run once with NVDA (free, Windows) or Narrator,
and once with VoiceOver on the Mac if he has one:
open the gallery → open a plan → Tab to the Decorate dock → pick a paint colour
(listen for the toast) → select a wall (can you tell what's selected?) → open
help (`?`) → close with Esc (focus returns?) → share popover → Copy (hear
"Copied"?) → sign out dialog. Record what was heard in ACCESSIBILITY.md under a
new dated section. Then the statement's "not tested with screen readers" line
can change.

## 3. Onboarding UI audit (Claude, do first)

Shipped 2026-09-29 (PR #54), after the last a11y pass. What's there:
- `WelcomeGuide.tsx`: `role="dialog"` `aria-modal="true"`, focuses primary
  button, hand-rolled Tab wrap (one of four copies of this pattern — see §8).
- `GuideCard.tsx:217`: `role="dialog"` `aria-modal="false"` **plus**
  `aria-live="polite"`. Check this: a live region on a whole dialog may read the
  full card on every tick change (the camera guide updates ticks live). Probably
  want the card unlived and a separate small `role="status"` for the tick/progress
  line. Cards are deliberately never focus-stealing and reachable only at the end
  of Tab order — decide whether that meets 2.4.3 or needs a "jump to tip"
  shortcut (the help panel lists guides, which may be enough).
- `HelpPanel.tsx`: `role="dialog"` non-modal, focuses close button, `?` key
  toggles it — another single-key shortcut, see §4.
- `Nudges.tsx`: `role="status"` chips, auto-dismiss. Check they don't vanish
  before a screen reader finishes (timing, 2.2.1).
- Demos (`demos.tsx`) are SVG loops, `role="img"` when labelled, stop under
  reduced motion (verify).
Method: axe + scripted Tab walk (the 2026-09-18 pass pattern, headless
Chromium, `next start`) on a fresh visitor in en/he, dark/light: welcome, a
trace card, the camera card, help panel open, a nudge. Fix, re-run, zero
violations.

## 4. Single-key shortcuts (P5, WCAG 2.1.4, level A)

`1`-`4` modes, `E` eyedropper, `R` rotate, and now `?` help, fire from anywhere
that isn't a text input. Speech-input users trigger them by talking. 2.1.4 is
**level A**, so it's inside the IS 5568 requirement. Remedy options: a way to
turn them off, remap, or only fire while the relevant component has focus.
**Recommendation:** a "Single-key shortcuts" on/off toggle in the help panel
(it now exists and already lists shortcuts — natural home), default on,
persisted in `localStorage`. Handlers in `src/app/[locale]/design/page.tsx` are
editable; `R` and others inside `src/viewport3d/**` are protected — they'd read
the same flag, which needs Dan's exception. Ask Dan to approve the toggle.

## 5. Inspector not announced (Known gap 2)

Selecting a wall/item opens the inspector top-right silently. Options: (a) a
visually hidden `role="status"` that says "Wall selected, 3.20 m" (non-intrusive,
**recommended**), or (b) move focus into the panel (disrupts pointer users).
Inspector lives in `src/ui/planDock/inspector/**` (editable). Needs Dan's OK on
(a) vs (b) — it changes interaction behaviour.

## 6. Hit targets (P6)

`PdSwatch` default 20×20 and 16 in `VariantSwatchRow`, dock search-close 22×22,
resize-handle grip 32×3. WCAG 2.5.8 (24px) is 2.2 AA — not in IS 5568 (2.0), so
this is quality, not compliance. Grow the hit area with padding / a transparent
pad, not the visible size, where possible; screenshot before/after for Dan.

## 7. Dock section row → tablist (Known gap 3)

`BottomDock.tsx` section tabs use `aria-pressed`. Correct pattern:
`role="tablist"`/`tab`/`tabpanel`, roving `tabIndex`, arrow keys (mirrored in
RTL), Home/End. Rewrite of the row, not the panels. Same check for the room tab
row.

## 8. Popovers + dialog primitive (Known gaps 4, 8)

Four modal dialogs now exist (`ProjectsOverlay`, `WelcomeGuide`,
`SignOutConfirmDialog`, `SmallScreenNotice`), each with its own focus handling. Build one shared
`Dialog` primitive (focus in on open, Tab trap, Esc, focus return, `inert` on
the background) and move all four onto it. Account/share popovers: decide
menu (`role="menu"` + arrow keys) vs disclosure (button + `aria-expanded` +
plain links/buttons). Disclosure is simpler and correct for mixed content —
**recommended**.

## 9. CI

Two cheap guards so this doesn't regress:
- `eslint-plugin-jsx-a11y` in `eslint.config.mjs` (recommended set, as
  warnings first). Current lint gate is "don't raise the warning count" — run
  it, report the new count to Dan before enabling, fix or baseline.
- An axe script (`@axe-core/playwright`; `playwright` is already a devDep) over
  `/`, `/he`, `/design`, `/he/design`, `/legal/accessibility`, run in
  `nextjs-ci` against `next start`. Fails on any WCAG 2.0 A/AA violation. New
  dependency → log in `docs/DATA_RIGHTS.md` (axe-core is MPL-2.0: commercial OK,
  dev-only, not shipped to browsers).

## 10. Protected 3D layer (separate PR, needs Dan's exception first)

All in `src/viewport3d/**`. Ask Dan, log each exception in
`docs/PROTECTED_PATHS.md`, then:
- Reduced motion: walkthrough head-bob/auto-moves, rain, time-of-day animation
  ignore `prefers-reduced-motion`. `src/viewport3d/reducedMotion.ts` already
  exists (camera flights use it) — reuse it. The statement lists this gap; drop
  it from the statement once done.
- `FixtureCatalog.tsx` and `StairInspector.tsx`: DOM panels with **zero**
  `aria-*`. Same name/`aria-pressed` treatment the rest of the inspector got.
- Walkthrough hint hard-coded English (`walkthrough/WalkthroughMode.tsx` ~727,
  found by the sims) — 3.1.2 language of parts on /he.
- Check `WallModeToggle` Full/Cutaway/Top chips and Ceiling toggle for
  `aria-pressed` (ACCESSIBILITY.md said missing; unverified since).

## 11. Keyboard alternative for 3D editing (WCAG 2.1.1, level A)

The one real compliance gap: walls, selection, drag, rotate and walkthrough are
pointer-only. The statement discloses it and offers help on request ("write to
us"). Whether a disclosed gap is enough for a soft launch is a question for the
lawyer session (add it to the list). The realistic path (ACCESSIBILITY.md "The 3D canvas"):
a keyboard selection cycle over walls/openings/furniture (Tab/arrows), arrow-key
nudge and `R` rotate, with a spoken readout via the §5 status line. A
substantial feature touching the protected layer. **Recommendation:** scope it
with Dan after launch; do §5 now since it's the readout this would reuse.

## Working notes

- Verify in a real production build (`next start`), headless Chromium 1440×900,
  en + he, dark + light. Read rendered Hebrew text; a missing-key sweep is not
  enough. Pattern: the `browser-verify-3d-app` memory and scratchpad scripts
  from the onboarding session (Playwright must be required from inside a
  worktree that has `node_modules`).
- The worktree has no `node_modules` or `.env.local` yet: `npm ci`, and copy
  `.env.local` from the main checkout (it's gitignored; delete it when done).
  `npm run build` needs `LIVEBLOCKS_SECRET_KEY` starting with `sk_`.
- One PR for §3-9, never merge without Dan; merges to main are production
  deploys and the auto-mode classifier blocks `gh pr merge`, so Dan merges.
- Messages JSON has duplicate keys: never re-serialise `messages/*.json`,
  insert text.
- Keep ACCESSIBILITY.md the record: every fix gets a row in a new dated
  section with how it was verified, and NOT VERIFIED where it wasn't.
