# Handoff: live parametric factory pieces — remaining work (V3-2, V3-3)

Written 2026-09-23 at the end of the session that built V3-0 and V3-1. The spec is
`docs/parametric-furniture.md` → **"v3 Revision"** — read it first, then this file.

## Where things stand
- Worktree `C:\Users\dandu\fp-wt\parametric-factory`, branch `feat/parametric-factory`
  (off `origin/main` 584e191). **Not pushed.** A push to `main` is a production deploy;
  merging this is Dan's call (PR when he asks).
- `cb82a88` V3-0: parity fixtures for all 7 pieces + WebP texture tiles
  (`public/furniture/factory/tex/`, `manifest.json`).
- `c699ce6` V3-1: `sofaBlockArm` pilot. **Dan approved it 2026-09-23 ("works great").**
- `0ca8f03` V3-2 prep: real min/max fixtures for the 5 sofas (ranges Dan-approved
  2026-09-23 — see the table's per-piece limits in each generator's `dimLimits`).
- V3-2 — all 5 sofas ported, every one: parity at min/default/max, Blender side-by-side
  renders match, editor-verified (dock card, inspector, live resize + recolour).
  `30b20f1` flare-arm + plain-block (one shared builder) · `d466c94` tufted velvet ·
  `82049f6` leather (+ perf: GPU ToneMaterial, lazy raycaster, indexed finish) ·
  `e518862` chaise sectional (CPython-exact button jitter via `pyRandom`).
  Dan 2026-09-23: tufted min W 1.70 approved, chaise W 2.30–2.85 confirmed, rest good;
  chaise length ate into the run → fixed `e72e202` (GeneratorDef.reconcile: footprint follows the
  chaise, run keeps its depth, item back stays on the wall). **Awaiting Dan's re-check.**
  **Next: V3-3 Astra bed alone** (ask Dan its W/D range first — see table).
- Out of scope, do not touch: the oak platform bed (Codex-made, not approved), the Codex
  WIP generic `bed.ts` in the dev-main worktree.

## NEXT SESSION: V3-3 Astra bed — start here
V3-2 is DONE and approved (Dan 2026-09-23, after the chaise-length fix `e72e202`). Tree is clean.

**Dan's bed brief (2026-09-23, his words: "smallest double size should be 140X190, biggest can be
king or even bigger. i want both of them to come in single bed size with one pillow starting at
90X190, 120+ should get two pillows"):**
- Sizes are MATTRESS sizes (W × L, cm). Range: single 90×190 up to king or bigger. 140×190 is the
  smallest double. Inspector dims stay the OUTER footprint: frame = mattress + the script's own
  margins. Measure them from the script (default frame 1.75×2.18 around a 1.60×2.00 mattress).
- Pillows: mattress width < 120 → ONE centred pillow; ≥ 120 → two. Count is a function of width,
  not a separate control.
- **ANSWERED 2026-09-23:** "both" = Astra + the **oak platform bed** (`factory:oak-platform-bed`).
  Dan reversed the 2026-09-22 exclusion: the oak bed is now IN scope, same size range + pillow rule.
  Order: Astra first, then oak.
- **Max mattress = 200×200** (Dan 2026-09-23). Range 90×190 → 200×200. Show renders before porting.
- **Astra Blender variant BUILT 2026-09-23** (awaiting Dan's look): `floorplan-3d-refs/parametric-factory/
  upholstered-queen-bed/v3-3/build-bed-v33.py` (copy; original untouched). Changes vs original: (1) mattress
  W < 1.20 → one centred pillow (cx 0, yaw −1); (2) two-pillow width = min(0.705, 2·|cx| − 0.005) so 120–139
  mattresses don't overlap/overhang (first 120 render did) — default 160 is byte-identical logic; (3) render
  engine `BLENDER_EEVEE` (NEXT crashes on 5.2). Frame = mattress + 0.15 W / + 0.18 D, so inspector frame
  range W 1.05–2.15, D 2.08–2.18. GLBs + renders per size in `v3-3/m090x190 … m200x200/`; sheet
  `v3-3/astra-v33-sizes-sheet.png`. Pre-existing (also in shipped default): small dash marks on the duvet's
  front-left drape — cosmetic, not from resizing.
- **Dan approved the sizes sheet; V3-3a Astra PORTED 2026-09-23** (`bedUpholstered`,
  `src/parametric/factory/bedUpholstered.ts`). Parity: every part ≤5mm at min / below_switch (1.34) /
  at_switch (1.35) / default / max, tris == Blender (127,892 one pillow, 143,396 two), warm rebuild ~43ms
  (tighter than the sofas; `finish` over 143k tris dominates). Default fixture unchanged = V3-3 script
  reproduces the shipped bed exactly. Editor-verified (dock card replaces the baked one, W/D + colour only,
  single → 1 pillow, max, recolour). Tint: the grey tile is normalised to 0.72 but the script's weave
  averages 0.935, so upholstery meshes carry `userData.tintGain` = (0.935/0.72)^2.2 (ParametricModel
  multiplies it in); measured linear base colour vs baked GLB within 2–8% per channel (45% dark without).
  Inspector now hides Height when `dimLimits.h` is fixed (also hides cooktop's 0.8cm).
- **V3-3b oak platform bed PORTED 2026-09-23** (`bedOakPlatform`, `src/parametric/factory/bedOakPlatform.ts`).
  Dan skipped the sizes sheet ("no need for the renders … go on"). Variant script + a COPY of r003's
  inputs/materials: `floorplan-3d-refs/parametric-factory/oak-platform-bed/v3-3/` (changes: pillow rule —
  one `pillow_C` under a 1.20 m mattress, two pillows fit their halves; cuff droop starts 0.26 m in from
  the cuff's end instead of a fixed 0.55). Frame W 1.02–2.12, D 2.02–2.12 (mattress + 0.12), h 1.04 fixed.
  - **The duvet is a 110-frame cloth SIM in the script** → the port drapes it analytically (same 83×74 grid,
    UVs, crease, solidify), fitted to the sim's cross-sections. Parity: 34 parts ≤5mm; `duvet_sim` ≤24mm
    (the sim itself leans ~33mm side to side; the drape is symmetric) — `tol` hook in factory.test.ts.
    Rebuild ~12ms.
  - **Script quirk kept on purpose:** `bake_xform` reads a stale `matrix_world`, so the cuff's
    `location.y` and piping_bottom's −1cm never apply — the approved bed's cuff sits MID-bed (the band in
    the approved side render). Port reproduces what shipped.
  - **Duvet tone:** the 2026-09-22 parametric rework swapped the approved greige duvet for grey-tile ×
    #cdba96, ~45% darker than the approved GLB. Port default `#f3dabb` × tintGain 1.25 = approved linear
    base colour within 0.5%. Oak/cotton match within 1%. The r003 script in `floorplan-3d` still has the dark
    default (uncommitted there) — tell Dan if a rebuild from it is ever planned.
  - New tiles: `tex/terlenka` (grey, tinted), `tex/cotton-offwhite`, `tex/cotton-white` (maps from terlenka
    via the new `maps` field). geom: `solidifyGrid`, `tubePath`, `vertexUV`, `noise3`, `finish({centre:false})`,
    multi-material flat parts (`mats`/`triMat`, oak end grain).
  - Editor-verified: dock shows both custom bed cards (baked ones replaced), W/D + colour, single → one
    pillow, max, recolour.
- Single size + one pillow is NEW geometry the approved script never built: headboard panels and
  duvet drape at 0.90 m need a look. Build a Blender variant of the script (copy, never edit the
  approved original) at 90×190 / 140×190 / 160×200 / max, render them for Dan, THEN port.
- Then regenerate the bed min/max fixtures: today they are 1.75×1.95 and 2.05×2.18 placeholders.
  If one pillow changes the part list, add a fixture set on each side of the 120 switch.

## Decisions already made (don't re-ask)
- Port each Blender script line for line to TS; no GLB deformation.
- Dock shows ONLY the live card (`replacesAsset` + `thumbnail` on the GeneratorDef).
- Pacing: remaining **5 sofas together** (V3-2), then **Astra bed alone** (V3-3).
- Controls = the script's CLI: width/depth/height + colour (chaise also chaise length +
  side). Counts the script keeps fixed stay fixed.

## DONE: the 5 sofas' size ranges (approved 2026-09-23; kept for the method)
None were ever recorded. Proposal already put to him (unanswered): same proportional range
as block-arm — width −30%/+33%, depth −15%/+17%, height −12%/+7% of each default — then
build every sofa at those extremes in Blender and show renders BEFORE porting (block-arm's
max height was capped at 0.90 exactly because the render showed a problem). Then regenerate
the min/max fixtures — today they are copies of `default` and prove nothing:

```
# per sofa, from its r001 folder (scripts are READ-ONLY approved sources; --out is a flag)
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P build_sofa.py -- --width W --depth D --height H --out C:\Users\dandu\floorplan-3d-refs\parametric-factory\<slug>\min.glb
node scripts/factory-parity/extract-parts.mjs --glb <that.glb> --out src/parametric/factory/__fixtures__/<slug>.min.json --slug <slug> --set min --args '{"width":W,"depth":D,"height":H,"color":"<default>"}'
```
Render extremes for Dan: `scripts/factory-parity/render-compare.py` (any mix of .glb/.json).

## Recipe per piece (what the pilot established)
1. Read the build script fully + the `furniture_lib.py` functions it calls
   (`~/.claude/skills/done-furniture-factory/scripts/blender/`). Also
   `~/.claude/skills/done-furniture-factory/references/lessons-learned.md` §7d–7g —
   **a tuft/seam/fold is a divot: it pulls INWARD, never outward. Check the profile.**
2. New file `src/parametric/factory/<name>.ts`, Blender axes, same names for every part
   (the parity test matches parts by name). Extend `geom.ts` with any new lib function —
   port it once, reuse it.
3. Register: `scene.ts` union (+1 line — the ONLY protected edit), `index.ts` ALL,
   `generatorGlyphs.tsx` (fallback glyph), `messages/en.json` + `he.json`
   `editor.parametric.<id>.label`, `materials.ts` COLORABLE + `ParametricSection.tsx`
   FINISH_HEX for its `factory-*` finish id, `factory/materials.ts` FACTORY_MATERIALS entry
   (tex folder, normalScale, specular from `tex/manifest.json`).
4. Add the piece to `PORTS` in `factory.test.ts`; `npm run test:factory` must pass
   (every part ≤5mm at min/default/max, tris ≤ shipped, warm rebuild <50ms).
5. Visual: `npx tsx scripts/factory-parity/dump-port.ts <gen> w d h out.json`, then
   `render-compare.py` baked vs port (front/3/4/profile/close-up); then the editor via
   headless Playwright (dev server `npx next dev -p 3106 --webpack`; port 3105 is dev-main's).
   Compare baked vs port side by side IN the app before believing a colour difference —
   the pilot's "too dark" was camera/lighting.
6. `npx tsc --noEmit`, all `npm run test:*` parametric suites, commit `V3-2: …`.

## Per-piece notes (from a full survey of the scripts)
| Piece | Script | Watch out for |
|---|---|---|
| flare-arm | `seating/flare-arm-sofa/r001/build_sofa.py` | `flare()` shear FLARE=0.05 (absolute); AH=min(0.60,H·0.73); tex `curly-teddy-natural`. **Piping: shipped GLB used ring=6, lib default is now 8** — port with 6 to match shipped (fixture default has 896 extra tris from ring=8; compare tris to the SHIPPED count) |
| plain-block | `seating/plain-block-sofa/r001/build_sofa.py` | Same structure as flare-arm with FLARE=0; cone legs (`create_cone`, LEG_H 0.15); tex `hessian-380` |
| tufted-sage | `seating/tufted-sage-sofa/r001/build_sofa.py` | Local `tufted_slab` copy (L107-156): 6×2 buttons, DIVOT 0.052 / SIGMA 0.055 fixed in metres; `flare` 0.07 + `slope_arm` 0.05; AH=min(0.64,H·0.76); `pile_sheen` → MeshPhysicalMaterial sheen; tex `velour-velvet` |
| beige-leather | `seating/beige-leather-sofa/r001/build_sofa.py` | Hardest sofa: graded dense back cushion + analytic seam pull (SG 0.019); stitches raycast at pitch 0.0125 (COUNT changes with size); seat corner gathers; `randomise_uv` per part; thread material; tex `leather-grain`. 111k tris shipped — the <50ms bar may need a judgement call; report it, don't silently relax it |
| grey-chaise | `seating/grey-chaise-sectional/r001/build_sofa.py` | Extra args `--chaise-len`, `--chaise-side` (mirror = discrete toggle module, fixture `default_mirror`); 3 units each with 3×2 `grid_buttons`, SIGMA 0.045 DIVOT 0.036; 7 legs; nickel `metal_material` (no texture); `tone_setup/tone_apply` vertex-colour noise; tex `hessian-380` |
| Astra bed (V3-3) | `C:\Users\dandu\.codex\visualizations\2026\09\16\01a0abb5-fe2c-7c83-957f-6bd0a348ca8d\floorplan-furniture-expansion\scripts\curated\build-bed-benchmark.py` | Different codebase, no furniture_lib: analytic surfaces (`drape()`, `turnback()`), delta method DW=w−1.75 / DD=d−2.18, triplanar UV 0.42m, 3 own-work materials (tex `oatmeal-upholstery`, `ivory-washed-linen`, `bed-natural-oak`). W/D only. Existing evidence range: W up to 2.05, D down to 1.95 — ask Dan for the rest |

## Small open items
- `oak-veneer-01` tile is 2048px (3 MB); the shipped GLBs used 512px. Downscale to 1024
  if page weight matters — no visual loss expected on legs.
- `docs/DATA_RIGHTS.md` grey-chaise row calls its nickel "polished nickel (undefined)" and
  links a Poly Haven licence though nickel is scalar-only — cosmetic ledger fix, ask Dan.
- Reference GLBs + port dumps live OUTSIDE the repo:
  `C:\Users\dandu\floorplan-3d-refs\parametric-factory\`.
