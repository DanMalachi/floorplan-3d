# M1b Verification Record

What was measured, how, and what it showed. Companion to `docs/render-contract.md`
(the decisions) and `docs/render-diagnostic.md` (the M0 findings this closes).

Rig: `/calibration` (real mesh builders, real `Environment3d`, real store — not a
replica). Harness: `node scripts/render/verify-m1b.mjs <outDir>`, headless
Chromium + SwiftShader. Image statistics: `node scripts/render/image-stats.mjs <dir>`.

Judged against the calibration scene only. No real floorplan was used, and
nothing was tuned to make one look better.

---

## 1. Exposure — VERIFIED

`RENDER_EXPOSURE = PI / 100000 = 3.1416e-5`, derived not tuned (contract §2.2).

18% grey card, sun only at normal incidence, no sky / IBL / AO:

| | value |
|---|---|
| measured | sRGB 108,108,108 → linear **0.1500** |
| expected | **0.14** |
| delta | 0.01 linear (3/255) |

**The expected value is 0.14, not 0.18.** Khronos Neutral subtracts a fixed
black-point offset for any input at or above 0.08 — three's `NeutralToneMapping`:
`offset = x < 0.08 ? x - 6.25*x*x : 0.04` — and passes values below its 0.76
compression knee through otherwise unchanged. So a correctly exposed 18% card
reads 0.18 − 0.04 = 0.14.

This matters more than the number: comparing against 0.18 would have reported a
correct exposure as a 22% error, and the obvious "fix" would have been to inflate
the exposure constant to compensate — permanently miscalibrating the renderer to
cancel a tone-mapping operator's intended behavior. The first version of the rig
did exactly this comparison; the correction is in the page.

Residual 3/255 is not attributed. It is within SMAA and half-float noise, and it
is not an exposure error.

## 2. Sun through ceiling — FIXED

Root cause from M0: the ceiling mesh never set `castShadow` (`FloorMesh.tsx`).

Verified from an interior camera — the only place the defect is observable, since
in `full` mode with the ceiling visible there is nothing to see from outside.
Same camera, same exposure, two sun angles:

| hour | elevation | interior floor |
|---|---|---|
| 12:00 | 70.7° | no direct sun anywhere; uniform, moderate sky-lit interior |
| 16:30 | 22.4° | window patch only — two bright bands split by the mullion's shadow |

Noon is the decisive frame. A near-vertical sun puts nothing through a vertical
window, so any direct light on the floor could only have come through the roof.
Before the fix that frame would have been flooded at 100,000 lx; it is not.

**Cutaway (proxy path) — same result.** At noon with the near wall dissolved and
the ceiling invisible, the interior floor stays uniformly dim while the lawn
outside stays fully sunlit. That is the depth-only ceiling proxy working, and it
is the concrete argument for contract §5: suppressing the sun in cutaway would
have darkened that lawn — and the sky, ground and skyline with it — to fix an
interior leak.

**Balcony still correct.** The rail-bounded balcony has no ceiling *by design*
(skipped at generation, not hidden for viewing) and remains sunlit. It gets no
proxy. Ceilingless-by-design and ceiling-hidden-for-viewing behave differently,
which is the distinction contract §8 exists to protect.

## 3. Window and glass — VERIFIED

Sun passes through the window and lights interior surfaces. The patch carries the
frame and mullion shadows and nothing else — the glazed area casts nothing, so
the `glass` material class is doing its job (contract §6.1). No opaque rectangle.

## 4. Ceiling shadow acne — APPEARED, THEN FIXED WITH THICKNESS

The latent risk M0 flagged but could not test — a zero-thickness `DoubleSide`
plane resolves `shadowSide` to `DoubleSide`, so front and back faces land on the
same shadow-map depth — **manifested immediately** once `castShadow` was added.
Visible as concentric moiré across the entire roof: the shadow-map texel grid
self-shadowing.

Fix per M1b's instruction, thickness rather than bias:

- ceiling is now a **slab**, the room polygon extruded by `MIN_CASTER_THICKNESS`
  (0.12 m), underside at the old plane height so the interior surface did not move
- material changed `DoubleSide` → `FrontSide`, which resolves `shadowSide` to
  `BackSide`: the shadow map stores the slab's far side, a full thickness behind
  the lit surface

Acne signal — mean absolute difference between horizontally adjacent pixels on
the sunlit roof, measured across the sweep:

| hour | 6.5 | 7.5 | 9 | 10.5 | 12 | 13.5 | 15 | 16.5 | 17.5 |
|---|---|---|---|---|---|---|---|---|---|
| before | 0.000 | 1.056 | **6.434** | 5.387 | 1.809 | 6.306 | 2.052 | 1.227 | 0.000 |
| after | 0.000 | 0.000 | **0.000** | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

Confirmed visually at pixel zoom: the moiré is gone and the roof is a clean lit
surface. No peter-panning observed — bias was not touched, so there was no
mechanism to introduce it.

Bias values are unchanged and remain within contract §3.3: `bias −0.0002`,
`normalBias 0.02`.

## 5. Measurements that did NOT work — recorded so they are not trusted later

Two of the first-pass measurements were invalid. Both are recorded because a
number that looks like a result is worse than no number.

- **Off-screen probes read as black.** The first interior probes returned
  `deep = 0.0` at every hour in every mode. That is not "no light" — the points
  projected outside the viewport and `getImageData` returned transparent black.
  Reported as a clean pass, it would have "confirmed" the fix while measuring
  nothing. `window.__probe` now returns `visible: false` and the harness prints
  `OFFSCR` rather than a number.
- **Collapsed probes and a threshold that caught the wrong thing.** After
  re-aiming, `deep` and `patch` returned near-identical values in every row —
  both projected onto nearly the same pixels — and a whole-frame "fraction of
  pixels above a sun threshold" measure was dominated by bright baseboard trim,
  not sun. Neither discriminates. **The interior conclusions in §2 and §3 rest on
  the screenshots, which are unambiguous, not on those probe numbers.**

The acne numbers in §4 are trustworthy: the probe reported `visible: true`, the
before/after contrast is large and monotone, and it agrees with the pixel zoom.

## 6. Riser panels — FIXED (follow-up after the main M1b pass)

`buildRiserGeometry` produced a flat quad, and risers cast, so they were a live
§3.4 violation. Now a box, as thick as the wall it continues (`wall.thickness`),
with the material moved `DoubleSide` → `FrontSide` for the same shadowSide
reason as the ceiling.

Testable at last via a dedicated fixture, `src/app/calibration/riserScene.ts`,
driven by the `riser` rig and `scripts/render/verify-riser.mjs`. Risers only
appear where a **shared** wall is taller than a room's own ceiling — ceiling
height is the max over walls a room *owns*, so a room's own tall wall just
raises its ceiling instead. The fixture is therefore two rooms side by side,
all own-walls at 2.4 m, the single wall between them at 3.2 m.

Acne signal across the sweep: **0.000 at every hour**, on both the ceiling probe
and the riser probe, all probes reporting visible. Riser brightness tracks the
sun sensibly (130.9 at 07:30 with the sun on that face, 58.6 at 17:30 once it
swings round), which confirms the probe is reading lit geometry rather than a
static background.

### Caveat on what that measurement isolates

In this configuration the riser is **geometrically coincident with the taller
wall it seals against**: the riser spans [2.4, 3.2] on the wall centreline at
the wall's own thickness, and the wall body already spans [0, 3.2] on that same
centreline at that same thickness. The two solids occupy the same volume, and
their colours are near-identical (`#d8d2c4` both), so any z-fighting would be
invisible.

Consequences, stated rather than glossed:

- the riser probe cannot distinguish riser from wall, so "no acne on the riser"
  is really "no acne on the coincident wall-plus-riser surface"
- in this configuration the riser is **redundant geometry** — the wall already
  seals the strip, and the riser doubles the shadow caster there

Reading the generation rule, this looks like it always holds for solid walls:
the riser fires exactly when a shared wall is taller than every owned wall, and
that shared wall is rendered at its full height regardless. The plausible case
where a riser is genuinely load-bearing is a **portal**-kind boundary, which is
open by construction and so would leave a real gap for the riser to close. That
was not tested and is not something to change on inference — flagged for Dan.

## 7. Not verified in M1b

- **Real floorplans.** Deliberately out of scope: interiors will look wrong until
  M2 supplies per-room fixtures. Nothing here was judged against one.
- **Night.** Sky falls to full-moon 0.25 lx, which is physically right and renders
  near-black. Expected until M2.
- **GLB texture colour space.** Deferred to the M3b validator (contract §1.4).
