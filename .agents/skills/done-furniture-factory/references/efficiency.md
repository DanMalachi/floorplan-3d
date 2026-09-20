# Efficiency: cheapest route to bed-level quality

Measured on the block-arm sofa (Sonnet 5, single main agent, no subagents, ~17 min wall clock, ~80 tool calls, 44k output tokens, 6.2M cache-read tokens): see the run report the
user received. What mattered, in order:

1. **The expensive thing is tokens spent re-reading context, not modelling.** ~97% of tokens were cache reads of the
   conversation. Fewer, larger tool calls (batch reads, one build+audit+render command) beat many small ones.
2. **Images cost the most per call.** Read renders at draft size, only the 3 to 5 that answer a question. Do not read the
   whole 11-view set unless it is the final review package.
3. **Do the material/scale check before geometry** (one cushion, one close-up), not after the full model.
4. **Keep the design inside library helpers.** Every helper that lives in `furniture_lib.py` is code the model does not have
   to write (output tokens) or debug (tool calls). The sofa needed only two new helper groups (piping/puff/tinted fabric).
5. **Model choice:** Route C is deterministic Python authoring plus visual judgement. A mid-tier model at medium effort is
   enough for the build; spend the strong model/high effort only on the visual verdict of the first draft. No subagents
   needed: a fresh agent would re-derive the skill context (cold start) and cost more than the 12 s builds it would save.
6. **Never re-render what did not change.** Full set = ~2 min at 24 samples; draft = ~20 s. Use `--only`.

## Session hygiene
- One asset (or one sofa) per fresh session is cheaper than a long one: every tool call re-reads the whole conversation, and
  images stay in context. The sofa run reached ~6M cache-read tokens in 80 calls. A new session re-reads only the skill (~40k)
  plus the handoff. Keep the handoff in the repo (docs/FURNITURE-FACTORY-HANDOFF.md) and the memory index.
- Sofa family playbook (arm/leg/back styles, texture choices, known fixes): references/sofa-playbook.md.

## Open items
- `sofa()` generator in the library with arm/leg/back style enums (template today: examples/block_arm_sofa.py).
- Shared texture pool (the sofa copied ~40 MB of maps again).
- A spec-sheet schema validated by new-candidate.mjs so preflight cannot be skipped.
- ~~In-app viewer check as one command~~ DONE 2026-09-20: `scripts/app-shot.mjs`, and `scripts/iterate.mjs` chains build + audit + dev publish + screenshot.

## Measured: third asset (flare-arm sofa)
- ~20 tool calls, first build approved, by starting from the handoff doc + copying the previous build script. The run still
  re-reads the whole conversation on each call, so after an approval the cheapest next step is a fresh session with a short handoff.
- Cheapest material pick: one thumbnail per shortlisted texture (seconds), then download maps for the winner only.

## Measured: fourth asset (plain block-arm sofa)
- ~25 tool calls to approval plus one repair round. Time sinks: a full 11-view render exceeds the 120 s tool limit (use run_in_background); a global sed broke a call; an audit file that already exists blocks re-audit. A before/after close-up of the same camera settled the corner repair in two images.

## Revisits: what to take from the previous round and what not (measured on the tufted sage sofa, 2026-09-20)

Round 1 cost 5 builds and one rejection; round 2 (owner feedback, 3 points) cost 3 builds and ended in approval.

Take from the previous round (free):
- The build script, whole. Change only the blocks the feedback names; keep every accepted block untouched.
- The candidate folder, material maps, `extra_views.json` (add one view per disputed feature), the dev-page registration
  (overwrite the GLB in the worktree `public/furniture/factory/`, no code edit), the audit and thumbnail commands.
- Accepted design decisions (fabric, colour, proportions, arm shape). Do not reopen them "while you are in there".

Do NOT take from the previous round:
- The parameters of a rejected mechanism. When the owner says a feature looks like the wrong thing (abs, chocolate bar), the
  mechanism is wrong; delete that function and write the physical one. Tuning constants of a wrong model wasted 4 builds.
- Approvals, hashes, `review.json` and `rights.json` values, and any background render started before the last change.
- The old renders as evidence: re-render only the views that answer the feedback (one close-up per disputed point, plus one
  overview), never the full set until the last build.

Revisit procedure (about 10 calls):
1. Turn each owner sentence into a physical statement and a check ("buttons pull fabric in" = divots visible in the close-up;
   "arms not flush with the base" = one shared outline variable, verify in the leg close-up).
2. Batch ALL feedback items into ONE edit and ONE build; run the draft close-ups; look at 2 to 3 images.
3. Check bounds before the render (a leg or trim change can grow the footprint).
4. Audit into `exports/audit.json`, thumbnail with `--thumb ... --and-set`, promote with the NEW hash, then start the full
   render set in the background once.
5. Write the lesson while the render runs, sync the skill copy, update the handoff.

Front-load next time (would have saved round 1): before the first build, read the reference for (a) what the piece stands on,
(b) the mechanism of every surface feature, (c) the material's light response (lessons-learned 7e table). Those three
questions cover all three rejections.

## Measured: sixth asset (beige leather sofa, 2026-09-20): four rounds

r001 rejected, r002 needs fixing, r003 material good but silhouette not fixed, r004 approved. Cheapest prevention, in order: (1) print the map statistics of a CC0 sample before choosing it (saved round 1: clay); (2) render `profile` + `side_low` views in the FIRST draft (saved rounds 3 and 4: the owner reviews from a low side angle in the app); (3) keep tiled maps stationary and put random tone in vertex colours (saved round 2); (4) answer the outline question in preflight. Reuse: `examples/beige_leather_sofa.py` + library helpers (`cushion_mesh`, `stitch_*`, `tone_*`) make a stitched, dense cushion about 60 lines of build code; the leather maps take 10 s and are copied per candidate. A revisit build takes about 8 s, so the cost of a round is the image reads: read 2 to 3 images per round.

## Measured: seventh asset (grey chaise sectional, 2026-09-20): why it took a few minutes longer, and what was fixed

The sectional had about twice the parts of a 3-seat sofa (53 nodes vs about 25: 3 tufted backs, 4 seat units, 2 arms, back panel, 2 bases,
7 legs, 9 welts, 18 buttons) and needed three rounds. Where the extra time went, from the run itself:

| Cost | What happened | Fix now in the skill |
|---|---|---|
| Layout deliberation | Long up-front reasoning about how a chaise, arm and seat unit meet (which part is flush with what) | Sofa playbook has the solved sectional layout (unit widths, chaise width = arm + unit, y positions) |
| Round 1 owner feedback (4 points) | (1) tufted seats came from a handoff description, not the reference; (2) identical divots; (3) flat fabric; (4) seams | Lessons 7g rules 1, 2, 5, 7; `vary=True` default; part-inventory table at intake |
| Round 2 owner feedback (2 points) | Buttons buried by an undersampled pit; welt too low | Lessons 7g rules 3, 7; button raycast is inside `tufted_slab` |
| Plumbing typed by hand every round | build, rm audit, audit, cp GLB to the worktree, edit footprint, write a Playwright script (rewritten 3 times), run it: about 8 calls per round | `scripts/iterate.mjs`: one call does build + audit + dev-page publish + app screenshot |
| App-viewer surprises found late | black nickel legs, dark fabric, moire from normal strength 3.0: 2 extra build+look cycles | Run `iterate.mjs` on the FIRST draft; lessons 7g rules 5 and 6 give the values |
| Helper authored from scratch | `tufted_slab`, `button`, grid layout re-written and debugged inline (about 100 lines, the button bug) | Now in `furniture_lib.py`; the example builds with 4 lines of tuft code |
| Tool traps (about 6 calls) | cd side effects, audit cannot resolve node_modules from the skill dir, a failed heredoc, sed then Edit re-read, hash() seeding, mis-aimed camera | Listed in lessons 7g rule 10 |

Cheapest protocol for the next asset, in order:
1. Intake: part table from the reference (features per part), then the five preflight answers. Say the assumptions with the draft.
2. Build from the closest example script; tuft/stitch/seam/metal helpers come from the library.
3. `iterate.mjs` for every round (draft included) and read only `app_front` plus the two or three renders that answer a question
   (`profile`, `side_low`, one close-up). Do not read the full 11-view set until the final package.
4. Batch ALL owner feedback into one edit (one Edit call, not a sed chain) and one `iterate.mjs` run.
5. After approval do NOT rebuild (the hash changes). Thumbnail, audit the file already in `exports/`, promote, start the full render
   set in the background, then write the lessons while it runs.
6. Session hygiene is unchanged: one asset per fresh session.

## Measured: eighth asset (walnut TV console, 2026-09-20): rigid case-good, one owner point

About 25 tool calls to an accepted draft, one owner correction, then approve + promote. Cost centres: material choice (3 CC0 sets downloaded and measured, 1 wood
map check), three build failures that a preflight line would have caught (missing `reset_scene()` = default cube in the export, bevel bigger than arc chords, flat-face
shading streaks; all fixed in the library/example now), and one round for the door step that only the app viewer shows (lessons 7h rule 1).

| Cost | Fix now in the skill |
|---|---|
| Door recess judged in Blender, wrong in the app | Doors flush with the frame; zoom the app viewer (7h rule 2) |
| Default cube exported | Check `BOUNDS` from `iterate.mjs` before any image; `reset_scene()` is the first line after the options |
| Door/pocket helpers written inline | `rounded_rect_pts`, `prism`, `weighted_normals` in `furniture_lib.py`; `examples/walnut_tv_console.py` is the template |
| Wood UVs on rounded edges | `unroll()` + `wood_uv()` in the example |
Protocol for the next cabinet: part table, `new-candidate`, copy `walnut_tv_console.py`, `iterate.mjs --category Storage`, read `app_front` + one door close-up
+ one zoomed app shot, batch the owner's notes into one edit.

## Ninth and tenth assets: two TV cabinets in one session (2026-09-20)

About 35 tool calls for BOTH to approval (about 17 each), two owner notes in one message. The template (`walnut_tv_console.py`) plus `iterate.mjs --category Storage` made a first draft one call each.
Cost centres: stone colour (2 builds), a wrong material reading of a 390 px reference (glass vs mesh), a black finish that read glossy, one bad generated-normal experiment (reverted), and slow zoom shots.

| Cost | Fix now in the skill |
|---|---|
| Dark panel misread as glass | State ambiguous material assumptions with the draft (lessons 7i rule 2); mesh is real geometry (rule 3) |
| Black body "sealed" | Matte charcoal, roughness 0.84, no generated normal map (rule 5) |
| CC0 stone went orange | Desaturate first, then multiply (rule 6) |
| Two builds waiting on each other | Run both `iterate.mjs` in parallel, one backgrounded (rule 1) |
