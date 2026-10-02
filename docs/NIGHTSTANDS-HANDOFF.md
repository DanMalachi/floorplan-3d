# Nightstands handoff (for a fresh session making nightstands 7 to 10)

**STATUS (2026-10-02 evening): ALL TEN DONE.** #7 `cane-door-nightstand` (866d5cdf), #8 `mid-century-walnut-nightstand` (0be4d776),
#9 `white-lacquer-chrome-nightstand` (bc2881a5), #10 `natural-wood-shelf-nightstand` (193e92a4) approved by Dan and promoted; lessons 7m and 7n;
all ten shipped to `main` on Dan's instruction. The rest of this file is history.

Updated 2026-10-02. Nightstands 1 to 6 are DONE: approved by Dan and promoted (white two-drawer, natural oak, fluted oak, dark walnut,
brushed steel, matte black). Do 7 to 10 with the `done-furniture-factory` skill (Route C, procedural Blender). Read `references/lessons-learned.md` sections 7h, 7i, 7j
and 7k first (7k = what the four parallel drafts taught: metals judged in the real editor, finer brushed grain, oak map choice, fluted reeds, shell traps).

## State

- Worktree: `C:\Users\dandu\fp-wt\nightstands`, branch `feat/nightstands` (off `origin/main` 45daf5a). Commit `36ba406` holds nightstand 1. Assets 2 to 6 are
  promoted but NOT COMMITTED. A push to `main` is a production deploy: do not push without Dan. Stage by explicit path only (never `git add -A`).
- `node_modules` in the worktree is a junction to `C:\Users\dandu\floorplan-3d\node_modules` (do not delete the target).
- Dev server for review: `npx next dev -p 3140` in the worktree (it was running at last check; log `.dev3140.log`, untracked, do not commit). Another Claude
  session (dandu-d9) uses port 3123 and the main tree `C:\Users\dandu\floorplan-3d` on branch `wip/kitchen-editor`: never touch them. Pick 3140 or higher.
  Dan reviews at `http://localhost:3140/dev/furniture` AND in the real editor. Metals MUST be checked in the real editor (`/design?hero=1`), see lessons 7k.2.
- Promoted so far (catalog ids `factory:<slug>`, files `public/furniture/factory/<slug>.{glb,png}`, candidates `assets/furniture/bedroom/<slug>/r001`):
  `white-two-drawer-nightstand` (committed), `natural-oak-two-drawer-nightstand` (a7115723...), `fluted-oak-two-drawer-nightstand` (f3442c22...),
  `dark-walnut-two-drawer-nightstand` (9ef39257...), `brushed-steel-open-nightstand` (e0d7285b...), `black-two-drawer-nightstand` (2cfc8184..., plain `#494848` rough 0.95 spec 0.10: NOT `#2e2f32` (too dark in viewer) and NOT blue/warm-tinted).
- Uncommitted, to commit when Dan asks: `data/furniture-factory.catalog.json`, `docs/DATA_RIGHTS.md` (4 new rows), `public/furniture/factory/` (8 new files + ATTRIBUTION.json),
  the candidate RECORDS (brief/sources/rights/review/extra_views json, `build_nightstand.py`, `exports/audit.json`; NOT `exports/*.glb`, `renders`, `inputs`),
  the skill edits under `.agents/skills/done-furniture-factory/` (lessons 7k, SKILL.md pointer, 4 new examples, `dev-publish.mjs` newline fix) and this file.
  `git checkout data/furniture-review.decisions.json` before staging: the dev page rewrites it on every visit. Untracked logs (`.dev3140.log`, `.iter3.log`, `.ns4.log`) are not to be committed.
- Skill is synced to `~/.claude/skills/done-furniture-factory/` (build scripts import `furniture_lib` from THERE; re-sync after any library edit:
  `rm -rf ~/.claude/skills/done-furniture-factory && cp -r <repo>/.agents/skills/done-furniture-factory ~/.claude/skills/`).
- Examples to copy from `scripts/blender/examples/`: `white_two_drawer_nightstand.py` (paint), `natural_oak_nightstand.py` (oak, tapered splayed legs, nickel bar pulls),
  `fluted_oak_nightstand.py` (rounded shell + geometry reeds), `dark_walnut_nightstand.py` (walnut tint, metal tapered legs, bar pulls), `brushed_steel_nightstand.py` (folded sheet metal).

## Working recipe

Dan now reviews a BATCH: build several drafts in parallel with forks (own candidate folder each, same worktree, port 3140), he answers per asset, reworks go back to the
same fork. Promote in the main session, one asset at a time. Doing 6 to 9 in parallel and 10 after is fine; do #7 (cane) alone or with one other, it is the riskiest.

1. `node .agents/skills/done-furniture-factory/scripts/new-candidate.mjs --root assets/furniture --family bedroom --asset <slug> --revision 1 --category Storage`
2. Copy the closest example to `<cand>/build_nightstand.py`, change ONLY the design blocks. Keep: one variable per junction, flat shading on rigid parts (smooth only round parts),
   plain colour materials where finish is paint/lacquer, `OUT` absolute path, centre then export. Write files with the Write/Edit tool (not heredocs); compare the GLB sha256 after every rebuild.
3. Build + audit + publish + shot: `node .agents/skills/done-furniture-factory/scripts/iterate.mjs --candidate <cand> --worktree C:/Users/dandu/fp-wt/nightstands --id factory-<slug>-r001 --name "<Catalog Name>" --stem <slug>_r001 --category Storage --rooms bedroom --kind nightstand --script build_nightstand.py --port 3140 --views front,left`
   (`app-shot` waits 15 s; if the shot is black re-run `app-shot.mjs` alone; default clip crops tall pieces, use `--clip`). After every publish verify your dev entry is still in
   `data/furniture-factory.catalog.json` (siblings can clobber it).
4. Self-review (lessons section 5) from the app shots; give Dan the dev-page search name and the known weak spots. The dev viewer shows diamond shadow banding on large flat light vertical faces and
   sawtooth on narrow reveals (7j.1): NOT the asset. Metals and black: check in the real editor, the dev viewer renders them near-black.
5. After approval (do NOT rebuild; the hash must stay): thumbnail with `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P .agents/skills/done-furniture-factory/scripts/blender/render-views.py -- <glb> <cand>/renders/blender --thumb <cand>/renders/thumb.png --samples 24` (absolute `C:/` paths),
   fill `brief.json` (inspiration-only reference, borrowed vs changed) and `sources.json` (`materialSources` for any CC0 map, `[]` for plain/self-authored), delete ONLY that asset's dev entry from the catalog JSON
   and its `public/furniture/factory/<slug>_r001.glb`, then `promote-candidate.mjs --repo . --candidate <cand> --slug <slug> --name "<Name>" --kind nightstand --tags "nightstand,bedside table,<material>" --category Storage --subtitle "<...>" --rooms bedroom --approved-on <date>`.
   Check `git diff -U0 docs/DATA_RIGHTS.md | grep -c '^+|'` rises by exactly ONE per asset. Run `npx vitest run src/furniture/factoryCatalog.test.ts` and read the ok lines (the suite "fails" with "No test suite found": it is a script).
6. Update `lessons-learned.md` after each asset with only what is universal, then re-sync the skill copy.

Naming: catalog names must contain a word that hits a hotspot (`nightstand` or `side table`); `--kind nightstand` covers it.
Dimensions: footprint 0.40 to 0.55 wide, 0.35 to 0.45 deep, 0.45 to 0.62 high. Front is -Y in Blender, origin centred X/Y, base at 0. Pulls on standoffs count toward depth (7k.9).

## The references still to build (folder `C:\Users\dandu\Documents\Codex\2026-10-02\referenced-chatgpt-conversation-this-is-an\outputs\nightstand-reference-images\`)

ALL are retailer photos, so rights class = INSPIRATION ONLY (list borrowed vocabulary vs changed in `brief.json`; the model must not be a near-copy;
no brand names; source URLs are in `Sources.txt` for the record only). Nothing from them is an input. Each asset gets its own catalog name and
slug, not the retailer's. Part table first (lessons 7g.1), state assumptions with each draft.

| # | File | Design to build (original take) | Materials | Watch out |
|---|---|---|---|---|
| 7 | 07 wood and cane | Single-door cabinet (not drawers) with woven cane/rattan panel inset in a solid frame, small carved pull recess at the top, four straight legs, light mango/ash finish. | light wood (use the oak lessons 7k.7: pick by close zoom, full 2k, no downscale), cane weave | Cane = REAL GEOMETRY like the mesh bays (lessons 7i.3): diamond/octagonal weave is harder than orthogonal; start with an orthogonal 7 mm woven grid in two layers, matte backing panel behind. This is the riskiest of the five |
| 8 | 08 mid-century walnut | Rounded-corner walnut case, two drawers with a half-moon finger scoop cut in each top edge, four short splayed tapered legs. | walnut veneer: use the APPROVED brown tint (desaturate 55 percent, x `[0.78,0.66,0.55]`, 7k.6) | Scoop = boolean cut, not texture; bullnose body recipe lessons 7i.9 (and `fluted_oak_nightstand.py` for the rounded shell); grain continuity; keep it visibly different from #4 (rounded, splayed legs, scoops) |
| 9 | 09 modern chrome frame | Glossy white lacquer case with two flush drawers and a single wide rectangular chrome plate handle straddling the drawer split, mounted on a chrome open rectangular-tube frame. | white lacquer (clearcoat plain colour), chrome | Chrome: use the app's metal values and CHECK IN THE REAL EDITOR next to the fridge (7k.2), metalness lower for hardware; gloss will show viewer banding more, say so; handle is hardware (no per-instance variation); frame tubes closed, no see-through |
| 10 | 10 natural wood drawer and shelf | One top drawer with a turned wood knob over an open shelf cubby (real back panel and floor), solid-wood plank sides, shaped bracket-foot base with an arched cut-out apron, thick overhanging top with rounded front edge. | pale unfinished hardwood (e.g. rubberwood/poplar): measure CC0 candidates AND zoom-check the fronts (7k.7) | Visible glued-plank look is a texture matter: one member per side, bigger tile; arched apron = prism cutout; do not make the top clumsy (7k.9: about 18 mm, 12 mm overhang) |

Done (do not redo): 6 matte black (finger-ledge drawers, splayed block legs), 1 white two-drawer, 2 natural oak (tapered splayed legs, nickel bar pulls), 3 fluted oak (geometry reeds, plinth), 4 dark walnut (black bar pulls, tapered metal legs), 5 brushed steel (one folded sheet, no tray).

Diversity: across the ten, vary materials, leg type and handle type; do not build ten similar boxes. The remaining set already differs: black, cane, walnut 2, lacquer+chrome, raw wood.

## Material rules to remember (all in lessons-learned)

- Painted/lacquered/black = PLAIN colour (7j.2). Real wood = measure the CC0 map first (mean roughness, normal std, tile ratio), zoom-check, full-res (7k.7), and check the thumbnail.
- Judge colour in the app viewer; it lifts light and saturates walnut/red. Metals and black: real editor only (7k.2).
- Brushed/fine metal grain: sub-mm, tiny amplitude, one direction (7k.3). Never JPEG-export a generated map before saving it to PNG (7k.5).
- Flush means coplanar; reveals 2 to 3 mm; no recessed 1 mm steps (7h.1).
- Footprint = audited bounds (knobs and overhangs included). Never rebuild an approved file before promoting: the hash changes (7g.9).
- Commit nothing and push nothing unless Dan says so.

## Open items for Dan

- Nothing blocking. Decide whether to commit `feat/nightstands` and open a PR (a merge to `main` ships to production). It now holds 4 uncommitted promoted assets.
- The shadow banding on flat light vertical faces lives in the protected shadow settings (`src/render/contract.ts` `SHADOW.normalBias`,
  `Environment3d.tsx`). Leave it unless Dan wants a bias experiment; it only showed in the dev viewer, not in his editor.
- The headless real-editor render of metals came out dark for both the fridge and the nightstand; Dan sees a bright fridge. Brushed steel was approved on his screen, so treat his editor as the judge.

## Thumbnails (changed 2026-10-02)

The Blender thumb (AgX) washed out wood and metal, Dan rejected it. Use `scripts/thumb-app.mjs` (app-viewer render of the dev page, background removed by diffing with/without the piece; needs the asset on the dev page, port 3140; hard-coded worktree path) for wood, paint and black. Metals read near-black there: use `render-views.py --thumb ... --standard --normal-boost 3` (about 256 samples). Copy the result to BOTH `public/furniture/factory/<slug>.png` and `<cand>/renders/thumb.png` before `promote-candidate.mjs`. Nightstand 1 (white) still has the old AgX thumb.
