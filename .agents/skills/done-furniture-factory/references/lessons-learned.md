# Lessons learned and one-shot preflight

Source: the first asset this skill shipped, an oak platform bed (`factory:oak-platform-bed`, candidates r001 to r003,
2026-09-19/20). It took **three revisions plus two in-revision repairs** to reach owner approval. Every one of those
revisions was caused by something that was knowable from the reference *before modelling started*. This file turns each
into a rule. It is deliberately not bed-specific: the same failure classes hit any furniture (sofas, tables, wardrobes,
lamps, chairs, decor).

Read this before you write the brief. Re-read the failure catalog before you show anything to the user.

## 1. What actually got the result (keep doing these)

| Practice | Why it paid off |
|---|---|
| **Stop on rights before spending anything.** The user's reference was a search-result photo with a room, props and unknown source. The skill's rights gate flagged it, the user chose "inspiration only", and the design stayed original. | Zero rework later; nothing had to be pulled from the catalog. Ask at intake, never after the model exists. |
| **Deterministic build script, not interactive Blender.** One `build.py` regenerates the whole GLB (seeded RNG). | A revision costs seconds of editing plus ~1 to 2 minutes of run time. Feedback like "make the headboard one slab" was a 10-line edit. |
| **Immutable revisions (`r001`, `r002`, `r003`) with the audit, sources, rights and review JSON per revision.** | The user could compare old and new in the same viewer; nothing was lost when a direction failed. |
| **Render the exported GLB, never the Blender source, with a fixed auto-framed view set.** | Same cameras and lights every revision, so differences are real, and exporter surprises (material, UV, normals) are caught. |
| **Draft renders at 10 to 14 samples (~1 min), full set at 40 (~4 to 5 min) only for the review package.** | Iteration speed. Nobody needs a clean render to spot a floating pillow. |
| **Real-scale PBR from CC0 (Poly Haven) with world-scale UVs and a separate end-grain material.** | Wood read as wood at room distance and in close-up; the user never complained about the frame. |
| **Physics for soft goods (Blender cloth: gravity, collision, pressure), modelling for structured goods.** | Draped duvet and stuffed pillows looked real where every formula-based attempt read as lens-shaped blobs. Firm foam pillows were faster and better as modelled slabs. |
| **Look at the model in the app's own viewer on the first draft.** | Colour is warmer, lighting differs, and the viewer normalises the footprint. Blender-only review hides all three. |
| **One question at a time, with a recommendation, only for real forks** (rights lane, route, install). | Kept momentum; the user answered in seconds. |

## 2. What cost revisions, and the rule that prevents each

1. **The reference showed a *dressed* piece (bedding, cushions, throw) and the brief modelled the bare frame.**
   Two of three revisions were "add the bedding". *Rule:* decompose the reference into a parts list at intake:
   structure, upholstery, soft goods, accessories, staging. Decide **dressed or bare** explicitly in the brief
   (default: dressed if the reference is dressed; furniture sells on its styling). Never ship a bare mattress on a hero bed.
2. **Soft goods were the weakest, most-revised part.** *Rule:* classify every part into a softness class *before*
   choosing a technique (table below). Do not "try a formula and see".
3. **A single visual surface was built from several members with the same texture tile.** Five headboard boards each showed
   the same grain figure; shadows in the reveals made the repeat obvious. *Rule:* **one visible surface = one member**
   unless the real product has real, wide, differently-figured pieces. If you want a reveal, make it real (gap, back
   panel behind it so no light leaks) and give every member a different UV offset and, ideally, a different crop.
4. **Texture tile size vs part size was never checked.** *Rule:* for each surface, part size divided by real-world tile
   size. Above ~1.0 the figure repeats; above ~2.0 it is visible in raking light. Use a bigger tile, mirror-free
   larger sample, or split the UV per face with different offsets.
5. **Footprint changed after soft goods were added** (duvet drape widened the bounds). The app normalises a model so its
   larger footprint side equals the catalog value, so a stale footprint silently shrinks the whole piece. *Rule:*
   footprint = the audited GLB bounds (X and Z), recorded after the last geometry change.
6. **Two pillow formulas were wrong for reasons unrelated to design** (a grid-size misread produced a flat flange; a
   volume-mode pressure of 0 produced a deflated sack). *Rule:* when a procedural shape looks wrong, print numbers
   (bounds, thickness) before iterating on the look. See the failure catalog.
7. **A folded double-layer duvet edge in a cloth sim exploded** (self-collision on coincident layers). *Rule:* never
   simulate a fold from an initial double layer. Simulate one layer and *model* the fold/cuff as geometry.
8. **First draft was shown before the self-review.** *Rule:* run the self-review (section 5) yourself; only show the user
   a candidate you would not reject on sight.

## 3. Softness classes (pick per part, up front)

| Class | Examples | Technique | Notes |
|---|---|---|---|
| Rigid, machined | frames, legs, panels, shelves, doors | `member()` boxes with real thickness, 2-3 mm bevels | One surface = one member. Distinct end grain. |
| Structured foam / upholstery | firm (visco) pillows, seat cushions, mattresses, headboard pads | `rounded_box()` slab, radius 3 to 5 cm, subtle contour (dip at centre, lift at ends), piping if the product has it | Fast, predictable, reads as a product. Do not simulate. |
| Draped textile | duvets, throws, tablecloths, curtains, runners | Cloth sim: one flat sheet, high collision friction, moderate bending, then `crease()` + `finish_cloth()` thickness | Overhang ~12 cm, mass per vertex, sequential frames. |
| Stuffed, loose | scatter cushions, bean bags, poufs, stuffed toys | Cloth sim with pressure (`inflate_setup`), start flat, sealed two-layer bag | Pressure must be > 0. Expect corner creases; that *is* realism. |
| Tufted / channelled | Chesterfield, quilted headboards | Model the pattern as displacement grid or explicit buttons + sim only the fabric between | Budget triangles early. |
| Hard organic | ceramics, lamps shades, plant pots | Lathe/spin profile curves, or route A (image-to-3D) | Do not fake with boxes. |

## 4. One-shot preflight (fill this in before the first build)

Write it into `brief.json` (or a `spec-sheet` block in it). If any line is unresolved, resolve it; do not build around it.

1. **Reference intake:** rights class (own / cleared / inspiration-only). Inspiration-only means: list what is borrowed
   as *vocabulary* (style words, material, proportions class) and what is deliberately *changed* (silhouette details,
   joinery, panel layout). The candidate must not be a near-copy.
2. **Dressed state:** bare / dressed / staged. If dressed, list each accessory as its own part with its softness class.
3. **Part list with dimensions** (metres) and the *governing* dimensions (bed: mattress size; table: seating count;
   sofa: seat height and depth; wardrobe: door width). Everything else derives from them.
4. **Material list:** per part, the material, the real-world tile size, grain direction, the source URL (CC0) and any
   derivative needed (end grain, tint). Check the tile ratio rule from section 2.4.
5. **Silhouette-defining negative spaces** (legs, under-bed, open shelves) and the minimum clearance to keep open.
6. **Footprint and origin plan:** bounds including overhangs; origin centred in X/Z, base at Y=0, front +Z.
7. **Budgets:** triangles (hero furniture 50k to 100k is fine; the bed shipped at 51k), file size (aim < 8 MB; the bed went
   12.6 MB to 7.9 MB by downscaling: hero surface 2k, other maps 512 to 1k, JPEG q85), primitive count (keep < ~100).
8. **Review plan:** the fixed auto-framed set, plus one hand-authored construction close-up (`--views extra.json`), plus
   the in-app viewer.

## 5. Self-review before the user sees anything (about 5 minutes)

Render three views at draft quality: three-quarter, a close-up of the softest part, and the underside/contact view. Then
answer each honestly:

- Does it look like a product someone would buy, or like a blockout with textures?
- Any visible repeat of texture (compare two neighbouring parts / panels)?
- Any light leaking through gaps or reveals? Any floating or interpenetrating parts?
- Are soft goods plausible (pillow ends rounded not pointed, cloth resting on, not through, the piece)?
- Are proportions right against the governing dimension (measure with the audit, not by eye)?
- Do the audited bounds equal what the catalog footprint will say?
- **Silhouette check (sofa 6 lesson):** render `profile` and `side_low` (extra_views.json); does any seam, tuft or fold make the outline lobed or bulged? Divots displace inward only.
- **Macro check:** one close-up at 0.3 m. Grain visible and soft (not cobblestone), stitches visible, no cracks at seam ends, no repeat between neighbouring parts?
- **Map check:** print mean roughness and normal std of every material map; matte clay is roughness above 0.55 with normal std below 0.03.

Fix everything you would reject, then load it in the app viewer, then show it. Report known weak spots to the user
up front instead of waiting for them to find them.

## 6. Failure catalog (symptom, cause, fix)

| Symptom | Cause | Fix |
|---|---|---|
| Grain figure repeats across neighbouring parts, obvious in shadow | Several members share a tile with similar offsets | One member per visible surface; bigger tile; distinct offsets |
| Thin bright lines between panels/boards | Light passes through reveals | Back panel behind reveals, or remove the reveal |
| Renders / exports land in `C:\` | Relative path under `blender -b` | Always `os.path.abspath(...)` |
| `bmesh.ops.create_grid(size=s)` is twice as big as expected | `size` is the **half-extent** | Scale accordingly; print bounds |
| Pillow has flat "wings" or pointed ends | Grid/size mismatch or a boxy superellipse mapping | Fix the scale first; then raise the superellipse exponent for rounder ends; or use `rounded_box` |
| Stuffed pillow stays a flat sack | `use_pressure_volume=True` with `uniform_pressure_force=0` | Set pressure > 0 (about 5 to 6) and target volume ~0.03 to 0.04 m3 for a bed pillow |
| Duvet slides off and pools on the floor | Low collision friction, too much overhang, soft bending | Friction ~25, overhang ~12 cm, `bending_stiffness` ~1.2, air damping ~2.5 |
| Cloth explodes / crumples | Self-collision on coincident layers (folded edge); floor collider under a big overhang | Simulate a single layer; model folds as geometry; keep the floor collider only as a safety net and remove it before export |
| Mesh looks paper-thin | Sim'd sheet has zero thickness | `finish_cloth(thickness=0.02)` |
| Sheet turns invisible in the app | Flipped normals (glTF is single-sided) after mirroring/folding | `reverse_faces` / recalc normals, then verify in the app |
| App shows a placeholder box | Asset id is not in `CATALOG_BY_ID` (the renderer resolves through it) | Register the entry (catalog or dev registration) before viewing |
| Piece shrinks in the app | Catalog footprint differs from GLB bounds; the viewer scales the larger side to the footprint | Set footprint from the final audit bounds |
| Colour differs from the render | Different tone mapping and lighting in the app | Judge colour in the app viewer, not only in Blender |
| `audit-glb.mjs` refuses to write | The audit file is write-once (`wx`) | Move the stale audit aside (`audit.superseded-<sha8>.json`), re-run |
| Blender not found | Not installed | `winget install BlenderFoundation.Blender` (UAC prompt; the user must accept). Path: `C:\Program Files\Blender Foundation\Blender <ver>\blender.exe` |
| Localhost dev server dead mid-review | It was another session's process | Check the listener's command line; restart it the same way and say so |

## 7. What would make the next asset a one-shot (status and backlog)

Done in this pass:
- `scripts/blender/furniture_lib.py`: tested helpers for members, PBR materials, derived maps, rounded slabs, cloth,
  creases, export. Tested on a bed and a table with a draped runner.
- `scripts/blender/render-views.py`: any-size auto-framed review set, transparent catalog thumbnail, custom views.
- `references/promotion.md`: the exact steps and files to ship an approved candidate.
- A worked example: `scripts/blender/examples/oak_platform_bed.py`.

Still open (highest value first):
1. ~~**`promote-candidate.mjs`**~~ DONE 2026-09-20 (see promotion.md): one command that copies the GLB, renders the thumbnail, appends the catalog JSON entry with
   the footprint read from the audit, writes `ATTRIBUTION.json` and the `DATA_RIGHTS.md` row, and flips `rights.json` /
   `review.json` bound to the hash. Today this is ~6 manual edits.
2. **Automatic defect checks in `audit-glb.mjs`:** UV tile ratio per member, bounds asymmetry, flipped-normal count,
   gap detection (rays through reveals), texture-bytes-per-role budget. Each failure in section 6 is machine-detectable.
3. **Dev review page that lists candidates without editing app code:** read `assets/furniture/**/review.json` (status
   pending) and load the GLBs directly, so a candidate shows up in `/dev/furniture` with no manual registration.
4. **A candidate `spec-sheet` schema** validated by `new-candidate.mjs` (sections of section 4), so an unresolved preflight
   line blocks the build instead of surfacing as a revision.
5. **Room-context render:** drop the GLB into a real Done room (walls, floor, normal lighting) as part of the standard
   set; the gate requires it and it is not automated yet.
6. **Shared texture library:** the CC0 Poly Haven maps used (oak, cotton) belong in a pooled folder so candidates do not
   each copy 16 MB.
7. **Soft-goods presets per product family** (partly done: puff/piping/tinted_fabric exist now; still open: duvet, throw, curtain) (duvet, throw, cushion, curtain) as named functions in the library once two
   more assets have validated the numbers.

## 7b. Second asset: block-arm sofa (2026-09-20) - what it added

Built in ~14 min wall clock, 3 builds (12 s each), ONE material correction. Rules that fell out of it:

1. **Pick the fabric by weave scale FIRST.** Terlenka (fine crepe) looked like vinyl on a sofa at any zoom; the fix was
   swapping to Poly Haven `rough_linen` (visible crosshatch). A 1k downscale of a fine weave erases it: keep hero fabric at
   2k, normal strength 1.8 to 2.4. Render ONE close-up of the chosen fabric on ONE cushion before building the rest.
2. **Parametric = script arguments + factor-only colour**, not runtime deformation. `build_sofa.py -- --width --depth --height --color`
   regenerates the whole piece in 12 s; colour is a `baseColorFactor` on a luminance-normalised texture (`tinted_fabric`), so
   weave and normal are identical across colour variants and the app can retint at runtime. Offline size variants beat
   scaling: legs, piping and arm pads keep their real size.
3. **Piping and seams are the cheapest realism win for upholstery** (`piping()`, `puff()`): a plain rounded slab reads as a
   blockout; welts plus a crown read as a product. Build them first, not as a repair.
4. **A part that pokes above a neighbour (back frame above the arm line) shows only from the three-quarter view;** that draft
   is the review that finds it.
5. Nominal size vs audited size differ by 0.5 to 1 percent (pads, crowns, piping). Footprint = audit, and say so.
6. Tool traps met: `render-views.py --thumb` exits after the thumbnail unless you pass `--and-set`; no system
   Python on this machine (use Node or Blender's Python for scripted edits); do not put backticks inside a double-quoted
   shell string when writing docs (write via the Write/Edit tool); a dev server may not be running (start
   `npx next dev -p <port>` in the worktree, page is `/dev/furniture`).

Efficiency notes for this run are in `references/efficiency.md`.

## 7c. Third asset: flare-arm sofa (2026-09-20) - fixing a shipped asset's weak spots in the next one

Built in one session in about 20 tool calls, first build approved. It closed the three weak spots the owner accepted on the
previous sofa. Universal rules that fell out of it (apply to any upholstered or textile-covered piece):

1. **Carry the previous asset's accepted weak spots into the next brief as explicit requirements.** Write them in
   `avoid` and `mustKeep`, and verify each against a render before showing the piece. An accepted weak spot that is not
   in the brief comes back.
2. **Judge surface texture at room distance FIRST.** A surface that looks rich in a close-up can be a flat colour from
   3 m. Pick the material from a thumbnail-scale comparison of the candidates in the same distance and light as the
   review views; then look at one close-up only to confirm it is not ugly up close. Never fake scale by enlarging the tile.
3. **Choose a material by its visual identity, not by its name or tag.** A catalog tag or title (for example a name
   suggesting a weave type) can be a completely different pattern. Look at the preview of every shortlist item before
   downloading maps; one thumbnail check per candidate costs seconds.
4. **Where two parts of a piece meet, make them one form unless the real product shows a seam.** A separate cap or pad
   stacked on a body reads as a different object. Build the body as one rounded solid and shape it (shear, taper, lean,
   crown) instead of stacking pieces. A shear keeps thickness constant, which a real leaning panel also does.
5. **Detail budget goes where the eye lands from normal viewing distance:** silhouette and lean, edge radius, seams and
   welts, then softness (crown, belly, front bulge on cushions). Extra parts (scatter cushions, tufting) are separate
   parts with their own technique: decide dressed or bare in the brief and record the omission instead of half-doing it.
6. **A sized family reuses the previous script.** Copy the last approved build script, change only the design-defining
   blocks, and keep helpers in the library. This cut the cost from 80 tool calls to about 20.
7. **Tool traps:** Node on Windows cannot read `/c/...` paths (use `C:/...`); Bash and Node see different roots.
   Copy the shared views file into a new candidate before rendering with `--views`. `render-views.py --only` takes a
   comma list of view names.
8. **Never put backticks inside a double-quoted shell string or heredoc with expansion** (they run as commands and the text
   silently disappears). Write docs with the Write/Edit tool or a quoted heredoc.

Open (not yet fixed, present in this asset): small-part textures downscaled to 512 px look soft in close-ups (legs, trims);
dark gaps where a cushion meets an adjacent panel at the top edge; no dedicated seam line on the largest smooth panel.

## 7d. Fourth asset: plain block-arm sofa (2026-09-20) - corner quality and the triangle budget

Built in about 25 tool calls; approved with one owner-found weak spot ("corners look unbaked, needs more triangles"). Rules:

1. **Corner roundness is the first thing a close look judges on upholstery.** `rounded_box` with the old default of 4 bevel
   segments reads faceted at arm tops and cushion corners. Use `seg=8` for hero upholstery, and a bevel radius of 3.5 cm or
   more on arms and frames (a 2 cm radius reads as a chamfer even with many segments: raise the radius before the segment count).
2. **`sub` cuts multiply the bevel rings, so triangles explode.** seg 8 with sub 3 to 4 everywhere gave 157k triangles;
   seg 8 with sub 1 on flat parts (base, back frame), 2 on arms, 3 only on shaped cushions (the ones `puff` bends) gave 91k
   with the same corner quality. Budget by part: flat parts need bevel rings, not interior cuts.
3. **Render the corner close-up of the OLD GLB with the same camera before the repair** (`--only close_corner`, output to a
   scratch dir) and compare side by side. It takes 20 s and proves the repair worked.
4. **Cylindrical legs** are `bmesh.ops.create_cone(cap_ends=True, segments=28, radius1=bottom, radius2=top, depth=1)`,
   then stretch z and shear x/y by height for splay. Radius 3.0 to 4.0 cm reads as a real leg; 2.5 cm reads as a pin.
5. **Coarse fabric recipe that worked:** Poly Haven `hessian_380` (tile 0.274 m), luminance-normalised via `tinted_fabric`,
   normal strength 2.8, colour `#d8cab2`. The owner judged the weave good at both zoom levels. Look at the shortlist's
   thumbnails first (`cdn.polyhaven.com/asset_img/thumbs/<id>.png?width=256`); pick by weave scale, not name.
6. **Scaffolding a candidate by copying the previous one** (brief/review/rights/sources JSON) leaves stale approvals in
   `review.json`/`rights.json`. Reset status, hash and material sources immediately (do it in the same command as the copy).
7. **Approval order:** if the owner approves and names a fix in the same message, do the fix, re-hash, promote the NEW hash,
   and say the hash changed. Never promote the pre-fix hash.
8. **Tool traps:** a global `sed` on a trailing argument also hits calls that share the pattern (piping got `seg=8` and crashed);
   grep the result before running. `audit-glb.mjs --json` refuses to overwrite: `rm` the old audit first. A full 11-view render
   at 24 samples exceeds the 120 s tool limit: run it with `run_in_background`. The library edit must be copied to
   `~/.claude/skills/...` before a build, because build scripts import from there, not from the repo copy.
9. **Parametric means build arguments, not a runtime control.** `--width --depth --height --color` regenerate the GLB in
   about 12 s; the app catalog holds one default size and one colour. Say this plainly when asked.

## 7e. Fifth asset: tufted sage sofa (2026-09-20) - model the physics, not the look

Rejected once, approved after round 2 (5 builds in round 1, 3 in round 2). The rejection was not about polish: the first
version reproduced how tufting LOOKS (raised cells, grooves between them) instead of what it IS. The owner's words: "abs
under the skin; in real life the buttons hold the fabric in tension and make divots around the buttons". Rules:

1. **Write the mechanism in one sentence before modelling any feature, then model the mechanism.** Tufting = padding held
   down by buttons, so: one padded dome, a conical divot at each button, faint radial pull-folds. Piping = a welt cord under
   a seam. A rolled arm = a stuffed cylinder wrapped in cloth. A pattern that looks right from the reference photo but has
   the wrong cause cannot be tuned into shape: four builds of groove depth and exponents produced a better-looking wrong
   answer. If a tuning loop passes two builds, stop and re-derive the mechanism.
2. **Apply the real-world physics of the MATERIAL, including how it takes light.** Pick the light response per material
   (table below), then the geometry. A fabric that is only "a colour plus a normal map" reads as generic cloth.
3. **Pile fabrics (velvet, velour, felt, suede, brushed cotton) need a sheen lobe.** Fibres stand up and scatter light at
   grazing angles, so the surface brightens toward silhouettes and changes shade with view direction, but from room distance
   it still reads as flat matte colour. Use `pile_sheen(mat, weight, roughness)` in the library (Principled sheen, exports as
   `KHR_materials_sheen`, which the app viewer renders). Weight 1.0 read as gloss to the owner; 0.3 to 0.5 with roughness
   about 0.4 is right. Keep specular low (level about 0.12). Judge it in the app viewer.
4. **Read the reference for what the piece STANDS ON before designing legs.** The reference sofa sat on a 4 cm oak base frame
   with legs splaying from its corners; round 1 used loose legs and a thin rail, which the owner called "not normal". List
   the contact chain in the brief: floor, leg, base/plinth, body, arm. Every junction is a design decision.
5. **Derive flush junctions from one shared variable, not two constants.** The arm underside outline defines the oak base
   outline (`FX = W/2 - FLARE - FT/2`, `FY = arm_depth/2 - FT/2`); an arm that overhangs its base by 2 cm reads as unfinished.
   Rest a part directly on its neighbour (no 5 mm "safety" gap). After moving legs, re-check the bounds: splayed legs at the
   corners changed the depth from 0.918 to 0.962 m until they were pulled inboard.
6. **Fabric divots: sample density decides whether the mechanism shows.** A divot of sigma 5 cm needs about 1.5 to 2 cm mesh
   spacing (96 by 40 cuts on a 1.7 by 0.6 m panel, about 8k triangles per face). Axis-wise subdivision (long edges only,
   grouped by axis, `subdivide_edges(use_grid_fill=True)` three times) gives that on ONE face without exploding the rest.
   Place each button at the analytic surface height, not a guessed one: an undersampled pit buries the button.
7. **Tool traps:** a new library helper must be added to `__all__` in `furniture_lib.py` and the skill re-synced to
   `~/.claude/skills` before a build can import it (`NameError` otherwise); `promote-candidate.mjs` reads
   `<candidate>/exports/audit.json`, so audit into `exports/` from the start; a background full render started before the
   last geometry change is stale, restart it after; approval with fixes means re-hash and promote the NEW hash.

### Material light-response cheat sheet (choose before modelling)

| Material | What real light does | Model it as |
|---|---|---|
| Velvet, velour, felt, suede, brushed pile | Fibres scatter at grazing angles: rim brightening, shade shifts with view, matte face-on | `pile_sheen` 0.3 to 0.5, spec level about 0.12, roughness high |
| Woven linen, hessian, tweed | Diffuse, weave shows in the normal map, no rim glow | Normal strength 1.8 to 2.8, spec 0.2, NO sheen |
| Bouclé, teddy, terry | Loops self-shadow; darker in the crevices, soft fuzz rim | Strong normal + mild sheen 0.2 |
| Leather | Broad low specular, sharp highlights on crease ridges, colour depth, tone varies at random across the hide | Own grain maps (make_leather_maps.py): roughness mean 0.47, normal std 0.075, spec 0.55, no sheen; tone = world-noise vertex colour; stitches modelled. A smooth CC0 leather sample (rough 0.6, normal std 0.02) renders as clay |
| Polished nickel or chrome legs | Conductor, mirror-like: reads only when it reflects something varied. The app viewer environment is dark, so a pure mirror renders BLACK (verified sofa 7) | `metal_material("nickel", "#e0e1e4", 0.34)` then Metallic 0.72; always check in the app viewer |
| Oiled or veneered wood | Grain-following soft highlight, darker end grain | Roughness map from the scan, separate end-grain material |
| Lacquer, glazed ceramic | Clear, sharp reflection over a diffuse base | Clearcoat 0.6 to 1.0 |
| Brushed or raw metal | Conductor: no diffuse, tinted reflection, stretched highlights | Metallic 1, roughness 0.3 to 0.5 |
| Glass, water | Transmission plus Fresnel | Transmission 1, IOR 1.45 to 1.5 |

## 7f. Sixth asset: beige leather sofa (2026-09-20) - four rounds, four different root causes

r001 rejected (clay, jagged seam, dough-like pinch), r002 "alright, needs fixing" (abs, checkerboard), r003 "material good, abs not
fixed", r004 approved. Every rejection was physics or material, never polish, and every one was visible in a view I had not
rendered. Rules:

1. **Measure a CC0 sample's maps before you pick it.** Load the roughness and normal maps and print mean/std. Poly Haven's leather
   category is smooth satin: `leather_white` has mean roughness 0.615 and normal std 0.024, so it can only render as matte clay
   (playdough). Real grain needs roughness mean about 0.45 to 0.5 with crevices duller than cell tops, and normal std of at
   least about 0.07 at 2k. If no CC0 sample has that, author the maps: `scripts/blender/make_leather_maps.py` (tileable Worley
   pebble grain + micro-grain + faint crease net, 10 s, own work so rights are clean). Softness of the relief matters: 0.35 mm
   depth read as cobblestone in a macro; 0.17 mm with soft crevices reads as leather.
2. **A feature that dents must never push anything out.** A seam, button or fold is a divot: the leather is pulled INWARD from a
   clean outline. r002 and r003 modelled "two pillows meeting at a seam" (chambers closing to zero at the seam) and then "one dome
   with the seam subtracted"; both still displaced the front face outward by 4 to 5 cm, so the silhouette grew a lobe above the
   seam ("abs"). r004: front face flat (1 cm crown at most), seam = `y += pull` only (`DIV 0.03`, power-law V `(1+(dz/0.019)^2)^-1.5`,
   tapered over 3.5 cm at the cushion ends). Check: no vertex moves outward in the seam function.
3. **Judge the SILHOUETTE, not only the front.** Front and three-quarter hid the lobe; the owner saw it from a low side angle in the
   app. Always render `profile` (side, camera on the X axis) and a `side_low` view (camera at seat height looking along the back
   cushions) in `extra_views.json` and read them before showing anything. Cushion outlines in profile should look like one soft
   rounded block.
3b. **Cross-check the outline of every stuffed part against what you subtracted or added.** If it grew or shrank by more than
   1 cm in the profile relative to the block you started from, the shaping function is doing something you did not intend.
4. **A seam is a stitch: model the thread.** Real stitches on the real surface: BVH raycast onto the final shaped cushion
   (`surface`, `stitch_row_along_x`, `stitch_row_around`), one 8-triangle lens per stitch (`stitch_mesh`, 8.5 mm long, pitch 12.5 mm,
   half sunk), two rows 7.5 mm either side of the seam, thread 0.58 x the hide colour and matte (0.72 was invisible). 1100
   stitches cost 9k triangles. Raycast BEFORE `place_mesh`, then move stitches with their cushion using the same `bz`.
5. **Sharp features need edge loops, not more subdivision.** Cut the cushion with `cushion_mesh(..., {0: xs, 2: graded(...)})`
   (bisect_plane loops: 13 mm across, 3 mm within 3 cm of the seam, 20 mm elsewhere). Blanket subdivision (45 cuts + sub 3) gave
   198k triangles and still broke the line; loops gave a clean V at 112k. Order matters: mark the flat front-face vertex indices
   BEFORE `puff` (puff moves them), then deform, and window every displacement to zero (`smoothstep(edge/0.06)`) at the flat-face
   boundary, otherwise the mesh tears (a wrinkle fan left un-windowed cracked the seam end).
6. **A low-frequency pattern in a TILED map repeats and reads as a checkerboard.** The 3 to 8 cm mottling I baked into the 25 cm
   tile lined up on every cushion. Rule: tiled maps are stationary (grain only). Large-scale light/dark tone that must look
   random is a vertex colour driven by WORLD-space noise (`tone_setup(mat)` after `tinted_fabric`, `tone_apply(mat)` after the final
   centring; Blender exports it as COLOR_0 when a Color Attribute node feeds the base colour, and the app loads GLB materials
   as-is). Also `randomise_uv(ob)` on every leather part so identical grain never aligns between parts. Amplitudes that worked:
   0.115 / 0.06 / 0.02 at 7 / 19 / 47 cycles per metre (subtle but present; raise the first for more contrast).
7. **Tool traps:** `tinted_fabric` caches `<name>_grey.png` in the materials folder, so a changed diffuse is silently ignored until
   you delete that file (one render used the old scan's diffuse). The audit reports the plain-colour thread as "missing PBR
   maps"; promotion still works, say so in the report. Bash quoting: long Python/JS with backticks, `!` or nested quotes inside
   `node -e "..."` fails with "unexpected EOF"; write the block with the file tool and `cat >>` it. After a `sed` edit the Write
   tool demands a fresh Read of the file. Copying a big function between scripts: prefer moving it into `furniture_lib.py` and
   re-running the build to prove the same bounds and triangle count (done here: 1128 stitches, 111,824 triangles, identical).

Preflight addition (4th question, after the three in 7e): **What does each feature do to the OUTLINE?** Answer "nothing"
unless the reference shows a lobe. A seam, tuft or fold changes the surface inward and leaves the silhouette clean.

### Leather recipe (verified numbers)

`tinted_fabric("leather", grain_diff, grain_rough, grain_nor, colour, MAT, normal_strength=1.0, spec=0.55)`, tile 0.25 m, no sheen.
Colour `#cdb794` (beige). Arm: 0.16 thick, radius 0.068, crown 0.014, flare 0.09, slope 0.05. Seat cushion: 0.17 thick, radius 0.05,
crown 0.03, corner gather wrinkles 2.6 mm (8 lobes, r 10 cm, windowed). Back cushion: 0.17 thick, leaned 9 degrees, radius 0.065,
seam at 60 percent of the height, DIV 0.030. Legs 0.17 tall splay 0.06 on a leather base box, back panel 0.09 thick behind the
cushions. Result: 112k triangles, 5.3 MB, 2.077 x 0.92 x 0.822 m. Example: `scripts/blender/examples/beige_leather_sofa.py`.

## 7g. Seventh asset: multi-part sectional sofa (2026-09-20) - variation, intake, and viewer-only defects

Approved after three rounds (draft, four owner points, two owner points). None of the rounds was about modelling difficulty: one was an
unverified assumption about the reference, one was uniform repetition, two were defects that only show in the app viewer or after
buttons/seams were placed by formula. Rules (universal, not sofa-specific):

1. **Inventory every part's features from the reference AT INTAKE, and never inherit them from a handoff or notes.** The handoff
   said "chaise top is also button-tufted"; the reference (150 px thumbnail) only showed tufted backs, and the owner's first message was
   "no divots in the seating". Write a part table (part, plain / tufted / piped / stitched / hardware), look at the reference at the
   largest size available, and where it is ambiguous say "I assumed X" next to the draft (one line) so the owner corrects it once.
2. **Identical repeated features read as CG.** Soft goods (tufts, welts, wrinkles, cushion crowns) must differ per instance: depth
   x0.6 to 1.3, width x0.8 to 1.3, an elliptical stretch at a random angle, fold strength and phase, a few mm of position drift, and a
   per-cushion wear factor (the most sat-against unit is the most worn; lower buttons pull harder). `tufted_slab(..., vary=True)` does
   this by default. Rigid hardware (handles, hinges, screws, legs) does NOT vary: only vary what use or material would change.
3. **Attach parts to the FINAL mesh, never to the formula that shaped it.** An undersampled pit is shallower than its analytic
   height, so a button placed at the analytic height is buried (four buttons vanished). `tufted_slab` now raycasts each button onto
   the built mesh (BVH, `surface()`), pushes it 1.5 mm proud, and returns those positions. The same rule applies to stitches, handles
   on a curved door, or anything that sits on displaced geometry.
4. **Deterministic randomness: never `hash(str)`.** Python randomises string hashes per process, so a "seeded" build changed every
   run. Seed from `sum(ord(c) * (i + 3) for i, c in enumerate(name))` or crc32.
5. **"Flat at room distance": fix it with large-scale tone, not with fine-scale contrast.** In order of value: (a) pick the albedo
   about 15 percent darker than the reference thumbnail (the app viewer lifts light surfaces), (b) `tone_setup` / `tone_apply` at low
   amplitude (0.10 / 0.06 / 0.025) so patches differ across cushions, (c) `randomise_uv` per part, (d) real seams (welts). Raising the
   normal strength from 2.4 to 3.0 to "get more weave" made the app viewer alias the weave into a moire; keep it at 2.4 to 2.8 and
   judge the app view, not the Blender render.
6. **The app viewer's environment is dark: a pure conductor renders BLACK.** Polished nickel or chrome legs (metallic 1, roughness
   0.22) were black in the app while bright in Blender. What worked: `metal_material("nickel", "#e0e1e4", 0.34)` then Metallic 0.72.
   Any metal part needs an app-viewer check in the FIRST draft (`scripts/app-shot.mjs`, or `iterate.mjs`).
7. **A welt ring must follow the surface, in the right place.** On a rounded block the seam belongs where the shoulder starts (about
   2.5 to 3 cm below the top edge for a 3.5 cm radius; 5 cm read "too low" to the owner). A ring that crosses a displaced (tufted or
   dished) region shows as a slit: keep rings on the undisplaced part or leave them out (the back cushions got no top welt).
8. **Modular pieces (sectionals, corner units): one variable per junction, and build modules as separate parts.** A chaise that is
   flush with the arm's outer face is `arm thickness + seat unit` wide; a real sectional has a visible seam where the chaise joins
   the run, so two parts with a seam are correct and cheaper than one clever L-shaped mesh. The catalog footprint is the bounding
   rectangle (the empty corner is inside it; the app has no L-shaped collision). Mirroring a build (`--chaise-side right`) is
   `Matrix.Scale(-1, 4, (1, 0, 0))` on every mesh plus `flip_normals()`.
9. **Rebuilding an approved script changes the sha256 even when geometry is identical** (verified: same bounds and triangle count,
   different hash: the glTF export is not byte-deterministic). So: promote the exact file the owner saw, never rebuild between
   approval and promotion, and when validating a refactor (moving helpers into the library) compare bounds and triangle count to a
   scratch output, not the hash, and never overwrite `exports/` or `audit.json` of an approved candidate (`iterate.mjs --stem test`).
10. **Tool traps found this session:** (a) a Bash `cd` moves the working directory of later calls too: use `( cd x && ... )` or
   absolute paths; (b) `audit-glb.mjs` needs the repo's node_modules, so run it from the repo root (the skill copy in `~/.claude`
   cannot resolve `@gltf-transform/core`); (c) a multi-heredoc Bash command with an odd quote fails as a whole ("unexpected EOF")
   and runs nothing: write files with the Write tool; (d) `sed` then Edit needs a fresh Read; prefer one Edit over a sed chain;
   (e) after `cd` the printed working directory shows where later relative paths resolve; (f) check custom camera views against
   handedness after centring (glTF front is Blender -Y, a left-hand chaise is at -X): a "rear" view put at +Y and -X showed the
   left side, not the back.

Preflight addition (5th question, before the four in 7e/7f): **What does the reference actually show for each part?** Part table
first, features second, and state the assumptions with the draft.

## 7h. Eighth asset: walnut TV console (2026-09-20) - rigid cabinetry, one owner point, two build traps

First rigid case-good after the bed. Draft was accepted in one round with ONE owner point (doors looked like they sit ON the body). About 25 tool calls
to the draft, of which 3 were build failures of my own making (below). Example: `examples/walnut_tv_console.py`; helpers `rounded_rect_pts`, `prism`,
`weighted_normals` are now in `furniture_lib.py`.

1. **A flush door means coplanar with the frame, not "1 mm behind".** I recessed the doors 1 mm for a "real" step. The app viewer (shadow maps, tone
   mapping) exaggerates any sub-2 mm step into a raised panel with a shadow band: the owner read it as "doors sit over the body, no cutout". The
   Blender render looked correct, which is why it was not caught. Rule: door face level with the frame face, reveal 2 mm, front-edge bevel under 1 mm.
   The reveal is the only feature. Any 1 to 2 mm step on a rigid part must be judged zoomed in the app viewer, not in Blender.
2. **Zoom the app viewer to check millimetre features.** `app-shot.mjs` only crops a fixed camera. A 3-line Playwright wheel zoom works: move the mouse to the
   target, `mouse.wheel(0, -300)` TWO ticks (5 ticks lands inside the wood). Use it before showing any reveal, seam or bevel.
3. **Case-good construction that worked (copy it):** solid shell = one `bmesh` cube + `bevel(offset=R, segments=8)`; door pocket = boolean DIFFERENCE with an
   EXACT solver against a `prism()` cutter (the solid pocket floor is the back panel, so no light leaks and no interior is needed for closed doors);
   doors = separate `prism()` bodies, outer corners rounded by the pocket radius minus the gap, inner corners sharp (`rl`/`rr` = 0 gives ONE vertex);
   slab legs = `member(grain=2)` (vertical grain, end grain only on the hidden top/bottom). One variable per junction: `LEG_H`, `POCKET_DEPTH`, `GAP`.
4. **Rebuild traps, all mine:** (a) a script that does not call `reset_scene()` exports Blender's default cube (BOUNDS came back 2 x 2 x 2: check bounds
   first, always); (b) bevelling a door outline whose arc chords are shorter than the bevel offset produces a torn diagonal hole: arcs with `seg=5` and
   offset 0.0008 to 0.001; (c) large flat faces next to bevels show diagonal shading streaks: `weighted_normals()` fixes it.
5. **Veneer wrap: unroll the profile.** For grain that must run along the length and around a rounded edge, compute UV u as arc length around the rounded
   cross-section (front flat, arc, top flat, arc, back...), v = x along the grain; plain per-face planar UVs break the figure at 45 degrees on every
   bevel. End caps use planar (y, z) UVs. Give the shell and doors ONE shared UV offset and the grain is sequence-matched across them, as on real
   veneered doors (`walnut_tv_console.py`, `unroll`, `wood_uv`).
6. **Colour: the app viewer renders walnut about 15 to 25 percent more saturated and darker than Blender.** Tint a mid-tone CC0 veneer by a per-channel
   multiplier close to grey ([0.64, 0.53, 0.52] on `walnut_veneer`) instead of picking a dark set: `dark_wood` is deep red but its normal std is 0.003 and
   reads flat; `walnut_veneer` (rough 0.58, real cathedral figure, 1.8 m tile) darkens well. `oak_veneer_01` is too bold for calm modern oak: try
   `oak_veneer_02..04` or `white_oak_veneer` next time (measure first).
7. **One catalog asset per wood, not a colour switch.** The wood is a build argument (`--wood walnut|oak`); promote each wood as its own factory asset.
8. **Sizes that worked:** 1.80 x 0.42 x 0.50, legs 0.14, shell radius 4.5 cm, frame 6 cm at the ends, 3 cm top, 2.6 cm bottom, 3 equal doors, slab legs
   3.5 cm x 34 cm inset 24 cm. 1,500 triangles, 0.4 MB: rigid case-goods are nearly free, so spend calls on reveals, radii, grain and colour.

## 7i. Ninth and tenth assets: black travertine console + walnut mesh console (2026-09-20) - two cabinets in parallel

Built side by side in one session (about 35 tool calls for both, 3 owner-visible rounds total). Both approved after ONE owner message: the black body was too glossy and "sealed";
the mesh bays were "not glass, black metal mesh" (the 390 px reference could not tell). Examples: `examples/black_travertine_console.py`, `examples/walnut_mesh_console.py`.

1. **Two candidates in parallel work:** `new-candidate` both, one script each, run both `iterate.mjs` at once (one backgrounded). The dev page registers both (verify with a grep of `FurnitureReview.tsx`).
   Zoom shots (`app-shot`-style Playwright wheel) are slow (about 60 s each under swiftshader): batch two zooms per browser session and never run them in the foreground with a second
   command behind them (the 120 s tool timeout backgrounds the whole call).
2. **Low-resolution reference: state the ambiguous material as a question in the draft note.** "Dark smoked glass" was my reading of a 390 px thumbnail; it was mesh. When a dark panel
   could be glass, mesh, perforated metal or fabric, name the assumption first and offer the alternatives in one line.
3. **Woven mesh = real geometry, not an alpha texture.** The exporter is set to JPEG so an RGBA grid texture loses its alpha, and a transparent grid moires anyway. Vertical wires in front, horizontal
   wires 1.5 wire-widths behind, one bmesh of `create_cube(matrix=...)` bars (own verts per cube, hard edges), 9 mm pitch and 1.8 mm wire = about 1,000 triangles per bay, ends tucked 4 mm behind the frame.
   Put a mid-dark matte panel a few mm behind it (not pure black) so the grid reads by contrast; the wire is satin steel (metallic 0.55), not a pure conductor.
4. **Glass in the app viewer is an alpha material only.** `plain(...alpha<1)` with `surface_render_method = "BLENDED"` exports as alphaMode BLEND and looks dark navy (it reflects the blue environment);
   raise base colour to about `#4a4d50` and drop specular to 0.30 to get grey. Two bright hot dots remain: expected.
5. **"Sealed black" = glossy plastic look.** Fix with material, not geometry: matte charcoal (`#2e2f32`, roughness 0.84, spec 0.22), a slightly larger edge bevel (2.2 mm) so edges catch light.
   DO NOT use a generated grain normal map on the frame: with planar UVs it rendered pure black plus grey borders in the viewer. Plain matte colour is enough.
6. **Desaturate before tinting a CC0 set.** Raw travertine (cream-yellow) x a warm multiply went orange-brown. `g + (c - g) * 0.45`, then a small multiply (`[1.16, 1.09, 1.06]`), gave taupe.
   Walnut: `g + (c - g) * 0.5` then `[1.16, 1.04, 0.95]` is natural and light; the earlier `[0.85, 0.72, 0.66]` was too red. Iterate the colour in the app viewer, 2 to 3 builds.
7. **Top slab + body: overlap, do not butt.** A body top coplanar with the slab underside showed a dashed shadow line. The body runs 2 mm into the slab, the slab is a separate overhanging object,
   and the pocket top sits 20 mm below the slab so a real top rail exists.
8. **Round tapered legs:** slice both ends by planes (flat on floor, flush under the body) along the leg axis; caps get their own verts so smoothing cannot bleed. Blade legs: eight verts per face duplicated
   (own verts per face) so hard edges survive the forced smooth export.
9. **Bullnose body:** extrude a rounded-rectangle PLAN (`rounded_rect_pts` used as x, y) then bevel top/bottom loops (arc chords must exceed the offset); dominant-normal planar UVs with V along x keep grain
   continuous on the front and fine on the arcs.
10. **Promotion can rename the asset.** `promote-candidate.mjs --slug` may differ from the candidate folder (the "glass" console became `walnut-mesh-tv-console` after the owner corrected the material).
    Keep the folder, note it in the handoff, and make sure the dev-page name (`iterate.mjs --name`) and `brief.json` describe the FINAL design; fill `brief.json` and `sources.json` (CC0 URL, files, derivatives, tile size)
    BEFORE promoting, because the promote step copies them into `ATTRIBUTION.json` and the DATA_RIGHTS row.
11. **Node cannot see Git Bash `/tmp`.** A heredoc written to `/tmp/x` is invisible to `node -e` (it resolves `C:\tmp`): pass `$(cygpath -m /tmp/x)` or write into the scratchpad with an absolute Windows path.
    The same applies to Blender (`-b` resolves relative and `/tmp` paths against `C:\`): always hand it `C:/...` absolute paths.
12. **Committing factory work in a shared tree.** The working tree usually also holds other sessions' edits (kitchen editor, i18n, parametric). Stage by explicit path: `.agents/`, `data/furniture-factory.catalog.json`,
    `public/furniture/factory/`, the factory rows of `docs/DATA_RIGHTS.md`, the factory wiring in `src/furniture/catalog.ts`, the handoff, and per-candidate RECORDS only
    (`brief|sources|rights|review|extra_views.json`, `build_*.py`, `exports/audit.json`). Never stage `assets/**/exports|renders|inputs` (about 600 MB) or `__pycache__`; `git diff --cached --stat` before committing.
    Diff `docs/PROTECTED_PATHS.md` / `catalog.ts` first: only take hunks that are the factory's.
13. **A stale `.git/index.lock` (0 bytes, a day old, no git process) blocks every `git add`** with dozens of identical fatal lines. Check `tasklist //FI "IMAGENAME eq git.exe"` and the lock's age, then delete it; do not loop `git add`.
14. **Push the BRANCH, never `main`, unless the owner says so:** `git push origin main` is a production deploy. Factory work lives on `codex/furniture-addition`.

## 8. The one-shot recipe (condensed)

1. Intake: rights class, borrowed vs changed, dressed state. Ask the user only for real forks.
2. Preflight sheet (section 4). Install Blender if missing.
3. `new-candidate.mjs`, then a `build.py` that imports `furniture_lib`. Rigid parts first, then structured soft goods, then
   simulated soft goods, then export.
4. Audit; fix bounds/centring; draft renders; self-review (section 5); fix; in-app check.
5. Full render set once; final report with weak spots stated; user verdict bound to the SHA-256.
6. On approval: `references/promotion.md`.

## 9. Efficiency backlog from the sofa run (highest value first)

See references/efficiency.md.
