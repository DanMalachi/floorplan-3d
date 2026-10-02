# Nightstands handoff (for a fresh session making nightstands 2 to 10)

Written 2026-10-02. Nightstand 1 (white two-drawer) is DONE, approved by Dan in the real editor, promoted. Do 2 to 10 with the
`done-furniture-factory` skill (Route C, procedural Blender). Read `references/lessons-learned.md` sections 7h, 7i, 7j first.

## State

- Worktree: `C:\Users\dandu\fp-wt\nightstands`, branch `feat/nightstands` (off `origin/main` 45daf5a). NOTHING IS COMMITTED. A push to
  `main` is a production deploy: do not push without Dan. Stage by explicit path only (never `git add -A`).
- `node_modules` in the worktree is a junction to `C:\Users\dandu\floorplan-3d\node_modules` (do not delete the target).
- Dev server for review: `npx next dev -p 3140` in the worktree (may need restarting; log `.dev3140.log`, untracked, do not commit).
  Another Claude session (dandu-d9) uses port 3123 and the main tree `C:\Users\dandu\floorplan-3d` on branch `wip/kitchen-editor`:
  never touch them. Pick 3140 or higher. Dan reviews at `http://localhost:3140/dev/furniture` AND in the real editor.
- Promoted asset 1: `factory:white-two-drawer-nightstand`, sha256 `67b112c73e50b4efb1646516ef2a44114acdc94ae892296bc30e0d94c84d477d`,
  0.500 x 0.409 x 0.550 m, files `public/furniture/factory/white-two-drawer-nightstand.{glb,png}`, candidate
  `assets/furniture/bedroom/white-two-drawer-nightstand/r001`. Uncommitted changes to commit when Dan asks:
  `data/furniture-factory.catalog.json`, `docs/DATA_RIGHTS.md` (one row), `public/furniture/factory/ATTRIBUTION.json`, the two public files,
  the candidate RECORDS (brief/sources/rights/review/extra_views json, `build_nightstand.py`, `exports/audit.json`; NOT `exports/*.glb`,
  `renders`, `inputs`), and the skill edits under `.agents/skills/done-furniture-factory/` plus this file.
  `git checkout data/furniture-review.decisions.json` before staging: the dev page rewrites it on every visit.
- Skill is synced to `~/.claude/skills/done-furniture-factory/` (build scripts import `furniture_lib` from THERE; re-sync after any
  library edit: `rm -rf ~/.claude/skills/done-furniture-factory && cp -r <repo>/.agents/skills/done-furniture-factory ~/.claude/skills/`).

## Working recipe (about 6 tool calls per nightstand when it goes well)

1. `node .agents/skills/done-furniture-factory/scripts/new-candidate.mjs --root assets/furniture --family bedroom --asset <slug> --revision 1 --category Storage`
2. Copy `scripts/blender/examples/white_two_drawer_nightstand.py` to `<cand>/build_nightstand.py`, change ONLY the design blocks. Keep:
   one variable per junction, flat shading on rigid parts (smooth only round parts), plain colour materials where finish is paint/lacquer,
   `OUT` absolute path, centre then export.
3. Build + audit + publish + shot: `node .agents/skills/done-furniture-factory/scripts/iterate.mjs --candidate <cand> --worktree C:/Users/dandu/fp-wt/nightstands --id factory-<slug>-r001 --name "<Catalog Name>" --stem <slug>_r001 --category Storage --rooms bedroom --kind nightstand --script build_nightstand.py --port 3140 --views front,left`
   (dev-publish now writes a dev catalog entry into the worktree; `app-shot` waits 15 s, it is slow because the page loads about 120 models).
4. Self-review (lessons section 5) from the app shots; show Dan the dev-page item number and the known weak spots. Dan checks it in the
   real editor. Remember: the dev viewer shows diamond-shaped shadow banding on large flat light-coloured vertical faces. It is NOT the
   asset (lessons 7j.1). Do not re-texture because of it.
5. After approval: thumbnail with `render-views.py -- <glb> <cand>/renders/blender --thumb <cand>/renders/thumb.png --samples 24` (Windows paths with `C:/`),
   fill `brief.json` and `sources.json` (`materialSources` list for any CC0 map used), `git checkout` the dev catalog entry
   (`git checkout data/furniture-factory.catalog.json` only if nothing else of yours is in it; otherwise delete just the dev entry) and delete
   `public/furniture/factory/<slug>_r001.glb`, then `promote-candidate.mjs --repo . --candidate <cand> --slug <slug> --name "<Name>" --kind nightstand --tags "nightstand,bedside table" --category Storage --subtitle "<...>" --rooms bedroom --approved-on <date>`.
   Check `git diff -U0 docs/DATA_RIGHTS.md | grep '^[-+]|'` shows ONE added row per asset. Run `npx vitest run src/furniture/factoryCatalog.test.ts` (prints ok lines).
6. Dan asked: make ONE, let him check, then the next. Show each (or at most 2 in parallel like the console pair) before moving on.

Naming: catalog names must contain a word that hits a hotspot (`nightstand` or `side table`); `--kind nightstand` covers it.
Dimensions: nightstand footprint 0.40 to 0.55 wide, 0.35 to 0.45 deep, 0.45 to 0.62 high. Front is -Y in Blender, origin centred X/Y, base at 0.

## The nine references (folder `C:\Users\dandu\Documents\Codex\2026-10-02\referenced-chatgpt-conversation-this-is-an\outputs\nightstand-reference-images\`)

ALL are retailer photos, so rights class = INSPIRATION ONLY (list borrowed vocabulary vs changed in `brief.json`; the model must not be a near-copy;
no brand names; source URLs are in `Sources.txt` for the record only). Nothing from them is an input. Each asset gets its own catalog name and
slug, not the retailer's. Part table first (lessons 7g.1), state assumptions with each draft.

| # | File | Design to build (original take) | Materials | Watch out |
|---|---|---|---|---|
| 1 | 01 white simple 2-drawer | DONE | | |
| 2 | 02 natural oak 2-drawer | Tapered square legs splayed slightly, slim apron rails between drawers, top with softly rounded edge, small oak edge pulls (wood tab handles). Open-frame look: drawers sit between legs with a visible mid rail. | oak veneer: measure `oak_veneer_02..04`/`white_oak_veneer` first (lessons 7h.6), grain vertical on legs, horizontal on fronts, end grain material | one surface = one member; sequence-matched grain across the two fronts |
| 3 | 03 fluted light oak | Rounded-corner case (large edge radii like the walnut console shell), fluted (vertical reeded) drawer fronts, no legs (plinth), integrated top that wraps. | pale oak/ash veneer | Reeds are GEOMETRY (about 8 mm pitch, 3 mm deep half-round) not a normal map; budget triangles per front; seam between drawers a real reveal |
| 4 | 04 dark walnut | Boxy walnut-veneer case with open top rail look, long black bar pulls, four tall slim tapered round black metal legs, drawers flush. | walnut veneer tint recipe (lessons 7h.6: `walnut_veneer` x `[0.64,0.53,0.52]`), matte black metal legs | Legs are metal (satin black, not mirror); front face of body is coplanar with the drawer fronts |
| 5 | 05 brushed steel | Open-front folded sheet-metal box: top with a shallow raised lip tray, two side panels and back, open cubby below, no drawer, sits on the floor. | brushed stainless/bronze metal | A pure conductor renders BLACK in the viewer (lessons 7g.6): `metal_material` then Metallic about 0.7, roughness 0.35+, check in app. Sheet thickness about 2.5 mm, visible fold radius; the open cubby needs a real back and floor |
| 6 | 06 matte black wood | Black ash-veneer case, deep top, two drawers each with an integral top-edge finger-pull ledge, short splayed (flared) block legs. | matte black wood: plain charcoal `#2e2f32` roughness 0.84 spec 0.22 (lessons 7i.5) | Do NOT use a generated normal map on black (renders pure black); legs splay outward, check the contact chain |
| 7 | 07 wood and cane | Single-door cabinet (not drawers) with woven cane/rattan panel inset in a solid frame, small carved pull recess at the top, four straight legs, light mango/ash finish. | light wood, cane weave | Cane = REAL GEOMETRY like the mesh bays (lessons 7i.3): diamond/octagonal weave is harder than orthogonal; start with an orthogonal 7 mm woven grid in two layers, matte backing panel behind. This is the riskiest of the nine |
| 8 | 08 mid-century walnut | Rounded-corner walnut case, two drawers with a half-moon finger scoop cut in each top edge, four short splayed tapered legs. | walnut veneer | Scoop = boolean cut, not texture; bullnose body recipe lessons 7i.9; grain continuity |
| 9 | 09 modern chrome frame | Glossy white lacquer case with two flush drawers and a single wide rectangular chrome plate handle straddling the drawer split, mounted on a chrome open rectangular-tube frame. | white lacquer (clearcoat plain colour), chrome | Chrome needs the metallic 0.72 trick; gloss will show the viewer banding more, say so; handle is hardware (no per-instance variation) |
| 10 | 10 natural wood drawer and shelf | One top drawer with a turned wood knob over an open shelf cubby (real back panel and floor), solid-wood plank sides, shaped bracket-foot base with an arched cut-out apron, thick overhanging top with rounded front edge. | pale unfinished hardwood (e.g. rubberwood/poplar): measure CC0 candidates | Visible glued-plank look is a texture matter: one member per side, bigger tile; arched apron = prism cutout |

Diversity: across the ten, vary materials (paint, oak x2, walnut x2, black, steel, cane, lacquer+chrome, raw wood), leg type (post, tapered,
metal pin, splay, plinth, bracket foot, none) and handle type; do not build ten white boxes.

## Material rules to remember (all in lessons-learned)

- Painted/lacquered/black = PLAIN colour (7j.2). Real wood = measure the CC0 map first (mean roughness, normal std, tile ratio) and check the thumbnail.
- Judge colour in the app viewer; it lifts light and saturates walnut. Metals need an app check in the first draft.
- Flush means coplanar; reveals 2 to 3 mm; no recessed 1 mm steps (7h.1).
- Footprint = audited bounds (knobs and overhangs included). Never rebuild an approved file before promoting: the hash changes (7g.9).
- Commit nothing and push nothing unless Dan says so. Update lessons-learned.md after each asset with only what is universal.

## Open items for Dan

- Nothing blocking. Decide later whether to commit `feat/nightstands` and open a PR (a merge to `main` ships to production).
- The shadow banding on flat light vertical faces lives in the protected shadow settings (`src/render/contract.ts` `SHADOW.normalBias`,
  `Environment3d.tsx`). Leave it unless Dan wants a bias experiment; it only showed in the dev viewer, not in his editor.
