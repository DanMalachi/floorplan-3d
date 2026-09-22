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
- Out of scope, do not touch: the oak platform bed (Codex-made, not approved), the Codex
  WIP generic `bed.ts` in the dev-main worktree.

## Decisions already made (don't re-ask)
- Port each Blender script line for line to TS; no GLB deformation.
- Dock shows ONLY the live card (`replacesAsset` + `thumbnail` on the GeneratorDef).
- Pacing: remaining **5 sofas together** (V3-2), then **Astra bed alone** (V3-3).
- Controls = the script's CLI: width/depth/height + colour (chaise also chaise length +
  side). Counts the script keeps fixed stay fixed.

## FIRST: ask Dan for the 5 sofas' size ranges
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
