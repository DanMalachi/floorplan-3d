# Onboarding guides + help: handoff

Written 2026-09-27 at the end of the design session. The next session builds it.
Launch list item 9. Branch `feat/onboarding-help`, worktree `C:\Users\dandu\fp-wt\onboarding`, based on `origin/main` `747866f`. No product code has been written yet.

## 1. The north star (read this first)

**https://claude.ai/artifact/JXAZrzTxJv5JEWcFww7Y5k** is Dan's approved design ("will serve as our north star", 2026-09-27). Read it with the Artifact tool's `read` action. Its source and images are also saved locally in `C:\Users\dandu\done-onboarding-research\north-star-artifact\` (`index.html` + `img/`). The copy text in `index.html` (EN + HE for every guide) is the starting copy for the message files.

Build what the artifact shows. Where the artifact and this doc disagree, the artifact wins on look and copy, and this doc wins on code facts.

## 2. How we got here

- **Round 1** (rejected): a welcome screen plus a generic "tab tour". Dan: the welcome is fine, but must match done.'s UI exactly (the real wordmark with the copper square, Manrope, editor glass). The tab tour "says what's already there". Dropped. Saved as `done-onboarding-research\round1-rejected-mockup.html`.
- **Dan's brief for round 2:** guides tied to steps. After uploading, help with scale (a real measurement or a known one like a door). In Walls: trace the walls, rails make balconies, then doors and windows. In Decorate: how the visual navigator works. The help panel must teach the real camera controls per device. Target user: not technical, "a 50-year-old woman".
- **Method:** two Sonnet agents played first-time users on production with a real Israeli apartment plan. They drove a headless browser over HTTP (`done-onboarding-research\sim\harness.cjs`).
  - Ruth: English, Windows mouse. 3 blockers. Would quit at the first 3D view.
  - Miri: Hebrew, MacBook trackpad only. 4 blockers. Would quit mid-Decorate.
  - Findings, action logs and every screenshot: `done-onboarding-research\sim\{ruth,miri}\` (`findings.jsonl`, `report.md`, `actions.jsonl`, PNGs).
- **What they showed:** tracing mostly works. The 3D camera is the #1 blocker, because a left-drag never moves the view and can grab a wall. Silence reads as broken: a piece placed while zoomed out, or a floor clicked where no room was closed, gives no visible response.

## 3. What to build

Twelve guides, seven struggle hints, and a help panel. The triggers, copy and anchors are all in the artifact. Summary:

| # | Guide | Trigger | Anchors on |
|---|---|---|---|
| 1 | Welcome | First visit, no saved project. Never in live rooms or on `/v/` | modal |
| 2 | Scale: which two points (dimension line or door, both animated) | Plan finished loading (trace step 2) | Scale step in TraceRail |
| 3 | Scale: type the distance | 2 points clicked, distance box empty | distance input |
| 4 | Walls in order: walls, then Rail (balconies, has its own page 2), then Open | Scale applied (step 3) | Wall/Rail/Open tools |
| 5 | Doors and windows (how to spot them on a plan) | Step 4 | Door/Window tools |
| 6 | Check the green before building | Step 6 | Build summary + Generate |
| 7 | Move around in 3D: practice card, ticks turn/zoom/slide as they happen, closes itself | First time the 3D view appears | viewport, bottom centre |
| 8 | Build shortcut picture | After 7, first time in Build | BuildNavigator |
| 9 | Decorate room-by-room navigator (badges 1-2-3) | First Decorate visit | room icons, picture, dock |
| 10 | First piece placed (double-click to fly closer, drag / R / Delete) | First placement | the placed piece |
| 11 | Walk through (arrow keys, look with mouse or trackpad, Esc) | First Walk through, before the pointer locks | centre |
| 12 | Help panel `?` (device-aware controls, guides for this step, other guides, welcome again, contact) | `?` button (new, top bar, pulses until first opened) or pressing `?` | right sheet |

Struggle hints (chip near the cursor, once per session each): two left-drags in 3D that moved nothing · a wall moved by a left-drag the first time · leaving Walls with an unclosed outline · floor or paint clicked where there's no room · a piece placed while far away · a rail or wall drawn over an existing wall · 8 s idle after 2 scale clicks.

Behaviour rules (from the artifact): tied to the step, not the tab · each shows once · a looping gesture animation in every guide · device-aware (mouse or trackpad) · learn by doing · only the welcome dims the screen · everything can be reopened from `?`.

## 4. Verified code facts (file refs as of `747866f`)

- **Modes:** `src/app/[locale]/design/page.tsx` has `ALL_MODES` (trace/build/furnish/view). `AppMode` is in `src/store/useSceneStore.ts:151`. **"Decorate" is `furnish` in code.**
- **Trace steps:** `legacy/src/trace2d/TraceRail.tsx` about lines 580-622 (`traceStep`, `setTraceStep`, 6 steps). Scale auto-advances to step 3 at about line 596. These trace UI files are **ACTIVE and editable** (`docs/LEGACY_PATHS.md:48`), even though they live under `legacy/`.
- **Camera input** (`src/viewport3d/CameraRig.tsx`, **PROTECTED**, read only):
  - Mouse buttons (lines 140-145): left = none, right = orbit, middle = pan, wheel = dolly. Touch: 2 fingers dolly and pan, 3 fingers pan.
  - Wheel classifier (lines 155-230): mouse wheel zooms, trackpad two-finger movement orbits, pinch (ctrlKey) is re-issued as a dolly.
  - Space+left drag = pan (lines 234-290). The trace mode and walkthrough are excluded.
  - Device detection to reuse: `classifyWheelSource` in `src/viewport3d/camera/inputVocabulary.ts:102`. Importing from a protected file is fine; editing it is not.
  - **The practice card (guide 7) must detect gestures WITHOUT editing viewport3d.** Recommended: a new component listening to DOM events on the canvas (right-button drag = turn; wheel classified via `classifyWheel` = zoom or turn; middle-drag or Space+left drag = slide).
- **Keyboard** (camera-rig memory, confirmed by the `editor.viewportKeys` string): WASD/arrows move · `,` `.` orbit · T top · F frame selection · Home frame all · R rotate · Delete · Esc · Ctrl+Z / Ctrl+Y · double-click frames. There's no Home key on Mac laptops (fn+←).
- **Placing furniture:** click a card to arm it, then click the floor (`BottomDock.tsx` `setPlacing`, about line 504). Dragging a card does nothing. Selected-item hint: "drag to move, Delete removes, Esc deselects".
- **Decorate navigator:** the room tabs choose the scene art. Clicking an item in the art sets the hotspot filter (`BottomDock.tsx` `matchesHotspot`, `ROOM_HOTSPOTS` about line 101). The floor hotspot opens Floors.
- **Build navigator:** strings `editor.navigator.*`. Clicking arms a tool; floor or paint jumps to Decorate.
- **Walkthrough:** `src/viewport3d/walkthrough/WalkthroughMode.tsx` (PROTECTED). Its hint at line 727 is hard-coded English.
- **Look and feel:** `src/brand/Wordmark.tsx` (use the real component for the welcome; the copper square appears only there). Editor tokens are in `src/ui/planDock/tokens.ts` (`PD`, `pdGlass`, `pdChip`), the tooltip in `src/ui/planDock/Tooltip.tsx`. **A light theme exists** (`src/ui/planDock/theme.tsx`, `data-pd-theme`), so use PD tokens only, never raw colours.
- **i18n:** next-intl, `messages/en.json` + `messages/he.json`. Suggested namespace `editor.guides.*`. Use RTL logical properties (`insetInlineStart`). The Hebrew UI uses plural imperatives (לחצו, גררו) and `editor.modes` names (שרטוט/בנייה/עיצוב/תצוגה).
- **Mobile:** `src/ui/SmallScreenNotice.tsx` stays as it is. No guides on small screens.

## 5. Bugs found (not part of onboarding, and not built yet)

Verified:
1. `src/ui/planDock/BottomDock.tsx` about line 852: `visibleCustom` filters by hotspot and search but never by `activeCategory`. Bedroom › Beds shows 17 non-bed Custom pieces (rugs, TVs, prints, wardrobe). Both users hit it.
2. `WalkthroughMode.tsx:727` shows English text in `/he`. **Protected: needs Dan's OK plus a `PROTECTED_PATHS.md` Approved Exceptions entry.**
3. Space-pan does nothing while a button has focus: the `CameraRig.tsx` keydown handler returns on `closest('button…')`, and Space then presses the button. Reproduced. **Protected.** A possible unprotected workaround: blur the focused button when the canvas gets a pointerdown (new code in `src/`). Check this with Dan.
4. "Export ground truth (eval)" is visible on production in Trace › Build. It should be dev-only (`devToolsEnabled`).
5. Paint shows internal slugs such as `done-blues-denim-05` under the colour name.

Unconfirmed (the headless browser may have caused them; check in a real browser): a paint click on a wall showing no visible change · Hebrew search showing ◆◆◆ with no results · walk keys not moving · the room count dropping from 2 to 1 mid-trace.

Recommendation given to Dan: fix 1, 4 and 5 (plus a workaround for 3) in a **small separate PR first**. Fix 2 only with his OK.

## 6. Open decisions (ask Dan at the start)

1. A separate bug PR first? (Recommended: yes.)
2. The contact line in Help. There's no feedback channel. (Recommended: the contact email the legal pages use, `src/legal/facts.ts`.)
3. The model home button on the welcome screen. Dan is building the model home, so keep the slot hidden until it exists.

## 7. Suggested build order

1. Guide engine: `src/onboarding/` store (seen flags in `localStorage` `done:guides:v1`, try/catch), the device detector, triggers from the store (`traceStep`, `appMode`, first 3D frame), and suppression in live rooms, `/v/` and small screens.
2. `GuideCard` + anchoring via `data-guide="…"` attributes on the real controls (add them in TraceRail, BottomDock, BuildNavigator, page.tsx). It mirrors in RTL, follows resizes, and uses inline SVG animations that stop under reduced motion.
3. Trace guides (2-6), then the 3D practice card (7), navigators (8-9), placed (10), walk (11), the help panel and `?` (12), then the struggle hints.
4. EN + HE copy from the artifact. Check for MISSING_MESSAGE, **and read the rendered Hebrew text** (see the hebrew-i18n memory).
5. Verify: Playwright at 1440×900 in both languages and both themes, keyboard only, contrast over a bright scene, and mobile 393×852 unchanged.
6. **Rerun the Ruth and Miri simulations** on the preview build with the same plan and tasks, and compare blockers and quit points. Harness notes are in the `usability-sim-harness` memory.
7. One PR. Dan tries the preview. Merge only on his explicit OK, because a merge to main is a production deploy.

## 8. Standing rules that apply here

- Never edit `docs/PROTECTED_PATHS.md` paths without Dan's OK (CLAUDE.md rule 1).
- **Never `git add -A`**, and stage files by name. On Windows PowerShell 5.1, write the commit message to a file and use `git commit -F <file>`.
- Auto mode blocks force-push. Resolve PR conflicts by merging `origin/main` into the branch.
- Any new asset must be free for commercial use (CLAUDE.md rule 8). The guide art is hand-drawn inline SVG, which is fine.
- Screenshots in `done-onboarding-research` contain a third-party apartment plan. **Don't commit them to this repo, which is public.**

## 9. Still open from the launch handoff (not onboarding)

- Dan to run the `retention_runs` query (`docs/DATA_RETENTION.md` §3.1.1) and confirm the first nightly `trigger='cron'` row after 2026-09-27 03:17 UTC.
- Dan's manual production tests for PR #45: the sign-out dialog, old `?g=` links, account delete re-auth, and new `#g=` links.
