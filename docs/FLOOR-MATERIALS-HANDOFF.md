# Floor materials — handoff

**Written 2026-09-24**, after adding "Smoked walnut" (`wood-smoked-walnut`) —
the first hand-curated (non-ambientCG) floor material, done from a single
reference photo through two rounds of iteration with Dan. This is the
playbook for doing the next one faster. Background: [[floor-materials-pipeline]]
memory and `scripts/materials/curated.ts`'s own header comment cover the
original 16-material ambientCG pipeline; this doc covers what's different
when the request is "match this specific photo" rather than "pick something
from the catalog."

## The fast path, end to end

For a floor that needs to match a specific reference (not just "pick a good
ambientCG wood"):

1. **Find the reference.** Usually the latest image in Downloads. Read it,
   note the real-world material name if visible (tile sample tags, product
   labels) — that name is a search term.
2. **Search both ambientCG and Poly Haven**, not just ambientCG. `lib.ts`'s
   own comment says Poly Haven is "the better source for one-off hero
   materials" — this session proved it: ambientCG's WoodFloor/Planks
   categories skew narrow-strip parquet, glossy, or warm honey-oak, and had
   nothing matching a modern matte wide-plank floor. Poly Haven's texture
   catalog (`https://api.polyhaven.com/assets?type=textures&categories=wood`)
   has product-name-literal entries (`smoked_walnut_veneer`,
   `laminate_floor_02`, `washed_grey_oak_veneer`, ...) that ambientCG doesn't.
   **Judge from rendered contact sheets, not tags or names** — build one with
   `sharp` compositing a grid of downloaded thumbnails (`?width=512&height=512`
   from `cdn.polyhaven.com/asset_img/thumbs/<id>.png`), same principle as
   `scripts/materials/contact-sheet.ts` already uses for ambientCG. A name
   like `smoked_walnut_veneer` can still be structurally wrong (it's a
   seamless veneer sheet, no plank seams — wrong for a floor that needs
   visible board joints).
3. **Pull 1k Diffuse + nor_gl + Rough** from Poly Haven's `/files/<id>` API
   (`dl.polyhaven.org/.../jpg/1k/<id>/<id>_{diff,nor_gl,rough}_1k.jpg`). Keep
   these as the ungraded base (`color_source.jpg`) — never overwrite it once
   grading starts, every later variant regrades FROM it, not from a previous
   grade.
4. **Grade the color map** against the reference with `sharp().modulate({brightness, saturation, hue})`.
   See "Grading" below before touching hue.
5. **Wire it in**: raw files → `scripts/materials/.raw/<id>/`, append one
   entry to `data/materials-floors.resolved.json` (matching the
   `ResolvedMaterial` shape — `id`, `name`, `family`, `coverM`, `roughness`,
   `maps`, `license`, `source`), run `npx tsx scripts/materials/repack.ts`
   (idempotent — only encodes what's missing, safe to rerun after adding more
   entries), add the picker label to **both** `messages/en.json` and
   `messages/he.json` under `editor.dock.floors.names.<id>` — miss this and
   the swatch shows the raw i18n key as its name/tooltip instead of failing
   loudly, easy to not notice.
6. **Grade the thumbnail separately, darker.** See "Thumbnail" below.
7. **Verify in the "View" tab**, not "Decorate". See "Rendering trap" below.
8. **Document the hand-added entry** in `curated.ts`'s header comment (it
   lives outside `CURATED` and will be silently dropped if
   `fetch-materials.ts` is ever rerun — that script rebuilds
   `resolved.json` from `CURATED` alone).

## Sourcing: ambientCG vs Poly Haven

Both CC0, both fine legally (see [[floor-materials-pipeline]] for the
licensing rationale already established). The choice is about **coverage of
the specific look**, not licence:

- ambientCG: deeper (74 wood floors + 59 planks vs Poly Haven's ~137 mixed
  wood textures including furniture veneers), but skews rustic/exterior in
  `Planks` and narrow-strip/parquet in `WoodFloor`. Good for "some good clean
  wood floor," weak for a specific modern LVT/laminate look.
- Poly Haven: shallower but has real flooring-product photography
  (`laminate_floor_*`, `plank_flooring_*`, `old_wooden_floor_*`) with visible
  plank seams and moderate sheen, closer to what a modern reference photo of
  a physical flooring sample actually looks like.

Don't assume — build the contact sheet and look. This session checked ~15
ambientCG candidates by name/tag first, wasted time, then switched.

## Grading: the hue-rotation direction trap

**This cost an entire wasted round.** `sharp().modulate({ hue })` rotates on
the standard hue wheel: 0°=red, 30°≈orange, 60°=yellow. A typical warm-oak
source photo sits around hue ≈30° (orange). Rotating **negative** moves
*toward* 0° — **toward red** — not away from it. Round 1 of this session
wanted "less orange/yellow" and rotated hue negative, which technically
reduced yellow but pushed the material toward red/mahogany instead — and
when Dan asked for "less red," the fix was to stop rotating negative, not
rotate further.

**The actual lever for "grey/neutral/pale-desaturated" is saturation and
brightness, not hue.** A large saturation drop (this session: 1.0 → ~0.2–0.3)
makes hue direction nearly irrelevant — there's not enough chroma left for
the eye to read a cast either way. Reach for saturation first; only nudge hue
a few degrees, and only after checking which direction the source's actual
hue sits relative to red, using real numbers, not a guess:

```js
// quick hue check before choosing a rotation sign
import sharp from "sharp";
const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
// convert mean RGB -> HSL, read h*360 — this is the number that tells you
// which way "toward red" actually is for THIS photo
```

"Pale" means **raise brightness**, not lower it — obvious in hindsight, easy
to get backwards when you're already three sliders deep into "more smoke/more
grey" and reflexively darkening everything.

## Thumbnail: grade it a step darker than the color map

`repack.ts`'s default thumbnail is a flat, uncropped `resize(128,128,{fit:"cover"})`
of the same `color.jpg` used for the 3D texture. That's **systematically
paler/more washed-out** than how the material reads once it's tiled, lit, and
shadowed in an actual room — every flat sRGB diffuse crop is, this isn't
specific to this material. Dan caught this ("thumbnail looks 100%, doesn't
match the real floor") on the very first approved material, so treat it as a
standing rule, not a one-off: after `repack.ts` runs, regrade
`thumb.webp` by hand, separately, a step darker and less saturated
(`brightness ≈0.83, saturation ≈0.9` was right for this material — recheck by
eye each time, don't copy the numbers blindly) from the same graded
`color.jpg`. Cheap: it's one more `sharp()` call. `curated.ts` now documents
this per-material so a future full `repack.ts` rerun (which would silently
regenerate the plain, too-pale crop) doesn't quietly undo it.

## Rendering trap: judge color in "View", never "Decorate"

**Found and reproduced twice this session.** The Decorate tab's live editing
viewport renders any sufficiently desaturated matte floor with a wrong
blue/mauve color cast — confirmed against both the new material and the
pre-existing "Weathered grey," so it's not new damage, it's a standing bug in
that viewport's lighting/IBL handling that just happens to be invisible on
saturated/glossy materials. The severity tracks the outdoor "Suburb" scene's
sky color and the camera's grazing angle, but it isn't purely angle-dependent
— it showed up from directly overhead too in one test. The **"View" tab
(walkthrough render) is correct** every time it was checked against the raw
texture files.

**Practical rule: never judge or show a floor color from the Decorate tab.**
Apply the material there (that's the only place with the paint tool), then
switch to View to actually look at it. This is a real product bug in a
protected file (`src/viewport3d/*` / `Viewport.tsx`) — flag it, don't try to
fix it inline; CLAUDE.md rule 1 means that needs Dan's sign-off first.

## The live-variant comparison pattern

The fastest way to get Dan from "not quite right" to "approved" is **not**
iterating on a flat contact sheet alone — it's generating 3–5 lettered
variants (`<id>-a`, `<id>-b`, ...), wiring **all of them** into the real
picker as real selectable materials (same `resolved.json` + `repack.ts` +
i18n steps as the final one, just N times), and letting Dan click through
them on the actual room in View. A flat swatch sheet is still useful as a
first-pass filter (cheap, fast, catches obviously-wrong directions before
spending repack cycles), but the decision itself should happen in the room —
lighting changes how tone reads enough that flat-sheet rankings and in-room
rankings aren't always the same.

Once Dan picks one: fold its `color.jpg` into the canonical `<id>` (overwrite
the canonical raw `color.jpg`, delete the stale `public/materials/floors/<id>/{color,thumb}.webp`
so `repack.ts` regenerates them, since it skips files that already exist),
delete every other lettered variant's raw dir, public dir, `resolved.json`
entry, and i18n keys, then rerun `repack.ts` once more. Don't leave the
runner-up variants in the picker "just in case" — they clutter the family
group and every one of them is a fake pick for whoever opens the app next.

## Shipping: check what "main" actually is before pushing

**Found this session, unrelated to floors but nearly caused an accidental bad
deploy:** local `main` had 3 commits ("hero redesign + a11y compliance") that
[[git-branch-layout]] memory believed were already live in production. They
were not — `origin/main` on GitHub was 3 commits *behind* local `main`, i.e.
those commits were made locally and never pushed. Don't trust a memory note
or a local branch pointer for "what's in prod" — check
`gh api repos/<owner>/<repo>/commits/main --jq '.sha'` against local `git log
--oneline -1 main`, or just `git fetch origin && git log origin/main -1`
freshly, before any push to `main`.

If the current branch carries unrelated in-progress work (this session was on
`wip/kitchen-editor`, mid-flight, explicitly marked "not finished, not
reviewed" in its own commit message) and only one specific commit needs to
reach prod: don't push the branch. Cherry-pick the one commit onto a
**detached worktree** at the true `origin/main` tip, verify the diff is
exactly the intended file set (`git diff --name-only origin/main..HEAD`),
push that (`git push origin HEAD:main`), then remove the worktree. This never
touches the working directory with the in-progress work, so there's no risk
of losing it or dragging it along.

## Failure catalog (what cost time this session)

- Checked ambientCG WoodFloor/Planks by tag/name first — wasted ~15 fetches
  before switching to Poly Haven and building an actual contact sheet.
  **Contact sheet first, always**, tags lie (established for ambientCG
  already in `curated.ts`; now confirmed true for Poly Haven too).
- Rotated hue in the wrong direction for "less orange" (see above) — cost a
  full round of variants that all read reddish despite being desaturated.
- Judged floor color from the Decorate tab — genuinely thought the texture
  file was broken (saw blue/purple) before realizing it was the viewport,
  not the asset. Burned real time re-deriving/re-verifying raw files that
  were fine all along. **Check the View tab before concluding a texture is
  wrong.**
- Shipped a picker-visible material with no i18n entry — showed the raw
  translation key as its name until caught by chance while testing with
  `find`. Add the `en.json`/`he.json` lines in the same step as the
  `resolved.json` entry, not after.
- Almost pushed the current branch (`wip/kitchen-editor`) straight to `main`
  before noticing it carried unrelated unfinished work *and* that local
  `main` itself didn't match production. Always diff the exact file set
  before pushing to `main` when the source branch isn't a clean, dedicated
  feature branch.

## A concrete next efficiency lever (not built yet)

Every step above is manual: copy raw files, hand-edit `resolved.json`, run
`repack.ts`, hand-edit two message files, remember the thumbnail regrade. The
furniture factory skill's equivalent (`new-candidate.mjs` /
`iterate.mjs`) collapses that into one command per iteration. A
`scripts/materials/add-custom.mjs <id> <name> --like <existing-id> --brightness --saturation --hue`
helper (reuse an existing material's normal/roughness, grade a supplied
source photo, upsert the `resolved.json` entry, run repack, and print the
two i18n lines to paste) would turn this whole doc into a five-minute task
instead of the half-day this one took. Wasn't built this session because the
ask was one material with iteration, not a repeatable pipeline — but if a
third hand-curated floor gets requested, build it then rather than doing the
manual dance a third time.
