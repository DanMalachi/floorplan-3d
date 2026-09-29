# Onboarding guides + help: handoff

Written 2026-09-27 at the end of the design session. The next session builds it.
Launch list item 9. Branch `feat/onboarding-help`, worktree `C:\Users\dandu\fp-wt\onboarding`, based on `origin/main` `747866f`.

## 0. START HERE: status and next step (updated 2026-09-27, end of the engine session)

**Done:** step 1 of §7, the guide engine, commit `cd02d95` (pushed; no PR yet, the plan is one PR at the end). `node_modules` is installed in this worktree.

**Dan's decisions (all of §6 is closed):**
1. The bugs went into a separate PR first: **#47** (`fix/sim-bugs`, worktree `fp-wt/sim-bugs`), open and not merged. It waits for Dan to try Space+drag in a real browser. It touches `src/app/[locale]/design/page.tsx` too (a `SpacePanFocusGuard` import plus a `data-viewport-host` attribute), so expect a small conflict there. Resolve it by merging `origin/main` into this branch, never by rebasing (auto mode blocks force-push).
2. Help contact line: use the contact email the legal pages use (`src/legal/facts.ts`).
3. Existing beta users: no welcome if they already have a plan, but step guides show to them once. The model-home button on the welcome stays hidden until Dan's model home exists.

**What the engine gives you** (`src/onboarding/`, read these first, they're short):
- `guides.ts`: the 11 `GuideId`s (`welcome scale scale2 walls openings build camera buildnav decnav placed walk`), `GUIDE_STAGE` for the help panel, and `GUIDE_PRIORITY` (array order).
- `triggers.ts`: `guidesFor(prev, next)` is pure. It uses state rules (the store drops guides already seen). `placed` is the only edge rule: exactly +1 furniture in `furnish`, same project. `wantsWelcome()` means at most 1 project, no plan image, no traced points, and no live room. (The first project is created automatically and starts from `sampleScene`, which is why "no project" or "no walls" can't be the test.)
- `guideStore.ts`: a vanilla zustand store. `guideStore()` is the singleton and `useGuides(selector)` the hook. Actions are `request`, `dismiss` (marks the guide seen and opens the next), `replay(id)` (for help), `setDevice(device, "guess"|"input"|"user")`, and `setEnabled`. Storage key: `localStorage` `done:guides:v1` = `{seen, device?}`. Only a device the person picked is persisted.
- `device.ts`: `InputDevice = "mouse"|"trackpad"`, `guessDevice` (Mac means trackpad), and `deviceFromWheel` (pinch means trackpad, otherwise it defers to the camera's `classifyWheelSource`).
- `GuideHost.tsx`: mounted once at the end of the design page as `<GuideHost ready={guidesReady} />`. `guidesReady` flips after `initProjectPersistence()`, and never on the `?hero` or `?gt=` dev hatches. It turns guides off on small screens (`MIN_SHORT_SIDE`, now exported from `SmallScreenNotice.tsx`) and when `liveRoomId` is set. `/v/` rooms render `CollabRoom` and never mount it. It renders `GUIDE_VIEWS[active]` with `{ onDone }`.
- `views.tsx`: `GUIDE_VIEWS` is **empty**. A guide is only ever queued if it has an entry here. **Registering a card is what switches its guide on.**
- Tests: `npm run test:onboarding` runs 33 checks, also in CI (`nextjs-ci.yml`). Add checks there as you add logic.

**UPDATE 2026-09-27, guide-card session: guides 1-6 are DONE** (welcome + the five trace guides), headless-verified at 1440×900 in en/he × dark/light (rendered Hebrew read, zero console errors, Esc, auto-close, reduced motion). What landed:
- `GuideCard.tsx` (card, ring, tip, `GuideText`/`GuideSteps`/`GuideOptions`/`GuideDemo`/`GuideFoot`/`GuideButton`, `richTags` for `<b>`/`<chip>`), `place.ts` (pure placement, tested), `demos.tsx` (SVG loops + `GUIDE_CSS`), `traceGuides.tsx`, `WelcomeGuide.tsx`; all six registered in `views.tsx`.
- Anchors in `TraceRail.tsx`: `trace-rail-panel`, `trace-step-<n>` (every step body), `trace-scale-distance`, `trace-wall-tools`, `trace-rail`, `trace-opening-tools`. Trace cards use `clearOf="trace-rail-panel"` so they sit beside the rail, not over its controls.
- Engine change: a trace guide opened by its trigger closes itself when the person moves past its step (`outgrown()` in triggers.ts, `activeSource` in the store); `scale` and `scale2` are now exclusive (0-1 points vs 2). A guide replayed from help never auto-closes.
- Copy is under `editor.guides.*`; control names are passed in from `editor.trace.tools.*` etc. as ICU args, so a guide always names a chip exactly as the rail does. The JSON files contain duplicate keys, so **never re-serialise them** (a `JSON.stringify` round trip silently drops keys); insert text.
- Headless verify script: scratchpad `verify-guides.mjs` pattern (fresh context → welcome → `setInputFiles` on the welcome's input → click plan points clear of the card, mirrored for he).
- Known limits: the card is reachable by Tab only at the end of the page's tab order (it never steals focus, by design); the welcome still mentions the `?` button, which lands with guide 12 in this same PR.

Dan approved the card look in a real browser (2026-09-27).

**UPDATE 2026-09-27, second pass: guides 7-12 + three struggle hints are DONE.** All 11 guides and the help panel are registered.
- Guide 7 `CameraGuide` (`threeDGuides.tsx`): practice card, ticks turn/zoom/slide live, closes itself 1.4 s after 3/3, Skip. Gestures come from `gestures.ts` `watchCameraMoves`: window-capture DOM listeners on the viewport canvas, classified with the camera's own `classifyWheel`, **trusted events only** (CameraRig re-dispatches every pinch as a synthetic plain wheel). No viewport3d edits.
- 8 `BuildNavGuide` (anchor `build-navigator`), 9 `DecNavGuide` (numbered rings on `dec-rooms`/`dec-scene`/`dec-shelf`, card above `dec-navigator`), 10 `PlacedGuide` (points at the last plain click on the canvas, `trackViewportClicks`), 11 `WalkGuide` ("Click to start walking" calls `requestPointerLock` on the canvas inside the click, which Walkthrough picks up through `pointerlockchange`; the card also closes on any lock).
- 12 `HelpPanel.tsx`: `?` in the top bar (page.tsx cluster), `?` key (not while the welcome modal is up), pulses until first opened (`helpOpened` persisted). Device-aware controls, guides for this step, other steps (`showGuide` switches mode/trace step, then replays), welcome again, contact = `mailto:` `LEGAL_FACTS.contactEmail`. Help state is read with `useSyncExternalStore` + a server snapshot, because the button is server-rendered and the store only exists in the browser.
- `Nudges.tsx`: two useless left-drags in 3D → "right-drag to turn" (device-aware); a left-drag that moved a wall → "Ctrl+Z / ⌘Z puts it back" + turn hint; 8 s idle after two scale clicks → chip beside the rail at the distance box. Once per session each, never while a card or help is up.
- **Not built (decided):** "unclosed outline on leaving Walls" and "floor/paint clicked where there's no room" need loop geometry (the only analyser is in `legacy/src/lib/loops`); the build guide's "check the green" covers the first. "Piece placed far away" is covered by the placed card's double-click line. "Rail drawn over an existing wall" was not attempted.
- `GuideCard` now takes `anchor` | `point` | `park`, `sides`, extra `rings` with badges, `aside`, `media`. New helpers: `ControlRow`, `DeviceSwitch`, `Keycap`.
- Verified headless (en-dark + he-light, some en-light/he-dark): every card's rendered text in both languages, the camera card ticking from real Playwright wheel/right/middle input, help open/Esc/focus return/replay/pulse persistence, both nudges firing, 1-6 regression, phone size unchanged. **Guide 10 could not be triggered by a real placement headless** (the item never lands); it was shown via a temporary debug replay and then the hook was removed. Dan should place a piece for real.

**Step 6 DONE 2026-09-27 (sims rerun locally, on this branch + PR #47 merged in a throwaway local branch):** focused on the six old failure points, 34 + 30 harness calls (vs ~220 + 143 last round). Ruth (EN, mouse): no quit point; scale, closing a room, 3D camera and help all pass. BUT she clicked the Build tab instead of trace step 6 and landed in an EMPTY scene (import clears it until Generate) → fixed with `NotBuiltNotice` + no 3D guides on an empty scene + shelving (not seeing) step guides when leaving Trace. Miri (HE, trackpad-only): no quit point; camera card ticked all three trackpad moves, beds found, walk card clear, help clear. Friction: her placement click hit the roof (Decorate opens Full + ceilings) → decnav card now says "Can't see the floor? Choose Cutaway or Top"; placing stays armed so she placed two → placed card now leads with "Esc stops adding more". All fixed in `c290c11`.

**2026-09-27 last change (Dan's call, committed LOCALLY, NOT PUSHED — Dan said hold the push until the next session):** Decorate now opens in Cutaway (`setAppMode` on arrival in `furnish`; a view picked inside Decorate is kept), and starting Walk through forces Full + ceilings on (`setWalkthroughActive(true)`). Store only, no viewport3d edits; tested in `test:onboarding` ("view defaults"). Not browser-verified yet: look at the camera move when Decorate switches to Cutaway.

**Next: push this branch (on Dan's OK), then open the ONE PR.** Remember bug PR #47 touches page.tsx too (conflict is only the import lines). Remember bug PR #47 touches page.tsx too.

**Original plan for this session (kept for reference): step 2 of §7, then step 3's trace guides.**
1. `GuideCard` (new, `src/onboarding/GuideCard.tsx`): a glass card built from PD tokens only (`PD`, `pdGlass`, `pdChip` in `src/ui/planDock/tokens.ts`; a light theme exists, so no raw colours). It needs a pointer tip, a kicker/title/body/foot layout like the artifact's `.card`, and `Got it`/`Next`/`Back`/`Skip`. Anchor it to `[data-guide="<name>"]` using `getBoundingClientRect` plus resize/scroll observers, and flip it to the other side in RTL (`dir` on `<html>`). A ring highlights the anchor, and there's no dimming (only the welcome dims). It needs to be non-blocking: the card is focusable and `aria-live="polite"`-ish, Esc closes it, and clicks outside keep working. Inline SVG gesture loops must stop under `prefers-reduced-motion`.
2. `data-guide` anchors (attributes only, no logic changes). `legacy/src/trace2d/TraceRail.tsx` is **active and editable** (see `docs/LEGACY_PATHS.md:48`):
   - Scale step: `stepBody` `case 2:` at about line 757; the distance `<input value={distance}>` at about line 796.
   - Wall/Rail/Open chips: `DrawTools` at about lines 350-375 (`pickWall("wall"|"rail"|"portal")`). Anchor the chip row.
   - Door/Window: `case 4:` at about line 839, `<DrawTools tools={["door","window"]} />`.
   - Build summary and Generate: `case 6:` at about line 921, `PrimaryButton` at about line 941.
   - The step list is `steps.map` at about line 986 (`StepHeader`).
   - Later guides: `BuildNavigator.tsx` (`BuildNavigator`), `BottomDock.tsx` (`NavigatorPanel` at about line 423, room icons, item shelf), and the mode tabs in page.tsx (`ALL_MODES` at about line 206).
3. Welcome (guide 1): a modal with the real `Wordmark` from `src/brand/Wordmark.tsx`. Buttons: "Upload my floor plan" (opens the import, same as TraceRail's file input `fileRef`; find a store or DOM route, and don't duplicate import logic) and "I'll look around first". The model-home button stays hidden.
4. Trace guides 2-6 (`scale`, `scale2`, `walls` with its 2-page Rail page, `openings`, `build`). "Back to Walls" on `build` calls `setTraceStep(3)`. Copy comes from the artifact: EN+HE for every string is in `C:\Users\dandu\done-onboarding-research\north-star-artifact\index.html` (the `GUIDES` array at about lines 427-650). Put it under `editor.guides.*` in `messages/en.json` and `messages/he.json`. Hebrew uses plural imperatives. The `scale` note switches on `device`.
5. Verify each guide in headless Playwright at 1440×900, in EN and HE, dark and light. **Read the rendered Hebrew text**; no `MISSING_MESSAGE` is not enough. Starting points: the scratchpad pattern in the `browser-verify-3d-app` memory, and a fresh browser context (a fresh visitor gets the welcome). Uploading a plan in headless: `page.setInputFiles` on the trace file input with a plan from `done-onboarding-research\sim\` (don't commit it; it's a third-party plan). A useful trick from the engine session: temporarily register a debug view in `GUIDE_VIEWS` to watch the queue, then delete it before committing.

**Don't:** edit `src/viewport3d/**` (protected, and imports from it are fine), `git add -A`, commit anything from `done-onboarding-research`, or merge without Dan. On PS 5.1, write commit messages to a file and use `git commit -F`.

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

1. **DONE `cd02d95`.** Guide engine: `src/onboarding/` store (seen flags in `localStorage` `done:guides:v1`, try/catch), the device detector, triggers from the store (`traceStep`, `appMode`, first 3D frame), and suppression in live rooms, `/v/` and small screens.
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
