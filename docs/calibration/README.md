# M1c — the calibration baselines

Status: **PROVISIONAL. The lighting model is NOT frozen.**

Capture is complete and the images in this directory are real, but freezing them
would freeze two contract violations with them:

- **§7 — OPEN.** The environment map was never converted to physical units and
  supplies 53% of a lit horizontal surface, 83% of a shaded interior, and 100%
  of the light at midnight.
- **§3.1 — CLOSED at M1c-R, and M1c's reading of it was wrong.** three r182
  *absorbed* `PCFSoftShadowMap` into `PCFShadowMap` rather than removing it;
  `PCFShadowMap` is now the soft filter. These images are correctly
  soft-shadowed — verified by measured penumbra width, not by the constant's
  name — and are salvageable on shadow grounds.

Both were found *by* capturing, which is what M1c is for. One of the two did not
survive being checked, which is what R1 is for. Nothing here is a reference set
until §7 is settled.

---

## What these images are

Nine PNGs, one per lighting preset × camera mode, rendered from the `reference`
rig at `/calibration`:

|            | `full` (perspective) | `cutaway` | `top` |
|---|---|---|---|
| `none` (studio) | `none-full.png` | `none-cutaway.png` | `none-top.png` |
| `suburb` | `suburb-full.png` | `suburb-cutaway.png` | `suburb-top.png` |
| `city` | `city-full.png` | `city-cutaway.png` | `city-top.png` |

`manifest.json` records, per cell, every contract value that produced it —
exposure, tone-mapping operator, shadow type and resolution, bias, the camera
preset and its recorded departures, and the sun's derived illuminance and
direction. A reference image with no record of the contract that produced it
cannot be checked for staleness later, and a stale baseline set is worse than
none (§2.4).

### Perspective is the only physical cell

Contract §5.4: `perspective` is the sole physically motivated preset and the
only mode any correctness claim covers. `cutaway` and `top` are legibility-first
and carry recorded departures — `iblScale` 1.15 / 1.3 and an interim
`interiorFillLux` of 200 / 300 that retires at M2. Their images are captured so
a regression in them is visible, not because they are correct.

### The three shots deliberately differ

One fixed camera across all three modes would be tidier to compare and would
show nothing: `top` flattens walls to 0.32 m, which is meaningless from eye
level, and `cutaway` fades only the walls facing the camera, which from inside
the room is nothing at all. Each mode is baselined in the shot that mode is
actually used in. **Comparisons are image-to-image within a cell, never across
modes.**

## What is in the frame

The fixture (`src/app/calibration/referenceScene.ts`) is two rooms sharing a
wall, built from the product's own schema and mesh builders — not from bespoke
primitives, which would certify a renderer nothing ships through:

- **Roofed room** (left). Ceiling, floor, plain wall, a sky-lit window in the
  far wall, and the glazed sliding door in the shared wall. The door is left
  half open on purpose: the same hole then admits sun through glass on one side
  and through nothing on the other, so §6.1 is *visible* — the glass casts no
  shadow, the frame and glazing bars beside it do.
- **Terrace** (right). Rail-bounded, therefore open to the sky *by design*, so
  the chart on it gets full sun and full sky.

The pairing is not a convenience. A roofed interior is dark and stays dark until
M2 gives rooms their own fixtures (§4.2, §5.4) — but a chart you cannot read is
not a reference. Putting both regimes in one frame also stands the §8
distinction (ceilingless by design vs ceiling hidden for viewing) where a
regression in either is visible.

The chart (`src/app/calibration/ReferenceRig.tsx`) moves one variable at a time:

- 7-sphere **roughness gradient**, metalness 0, albedo 0.18 linear, roughness 0→1
- 7-sphere **metalness gradient**, roughness fixed at 0.3, albedo 0.55 linear,
  metalness 0→1
- **chrome sphere**, metalness 1, roughness 0 — the only object that reports on
  the IBL rig rather than the direct lights
- **18% grey card**, free-standing, angled onto the bisector of the sun and the
  hero camera
- **empty slot** — a 1.4 × 2.0 × 1.4 m cage in the roofed room, inside the
  slider's sun patch, where a candidate asset is dropped for comparison

The grey card here is **not** the exposure instrument. The `exposure` rig is:
sun-only, no sky, no IBL, normal incidence — that is what makes its number mean
something. Reading a number off this card and "correcting" `RENDER_EXPOSURE`
against it would cancel the calibration the exposure rig establishes.

## Canonical conditions

Hour **10.0**, weather clear. Derived, not preferred — it has to clear three
thresholds at once: above elevation ~16° the sky model stops warming the sun, so
the chart's colour is its own and not the sunset's; direct sun has to dominate
diffuse sky (84.8 klx against 18.4 klx) or the frame carries no directional
information; and the sun has to stay low enough that the beam through the slider
reaches ~1.3 m into the roofed room instead of dying at the reveal.

The hour is part of the baseline. A different sun angle is a different image.

---

## What capture found — §7 is unresolved, and it is load-bearing

**The environment map is still authored in the pre-§4 unitless intensities, and
it is one of the largest light sources in the scene.**

§7 says the IBL "after §4 lands is specified in nits alongside every other
light" and forbids "IBL intensity as an untracked look knob once §4 lands". M1b
converted the sun, sky and studio instruments to physical units and left the
three `<Lightformer>` rects in `Environment3d.tsx` at their eye-tuned values
(1.2 / 0.7 / 0.55, and 1.6 in studio).

### Measured

Probed off the chart's front bench top — a known 0.18-albedo horizontal surface,
with no AO in the calibration composer — in `suburb` / `perspective`, in this
exact fixture and hero shot, once at the canonical hour and once at hour 0. At
hour 0 the sun is below the horizon and the sky model has fallen to its 0.25 lx
moonlight floor, and `interiorFillLux` is 0 in `perspective`, so the environment
map is the **only** remaining light. That is what makes it a clean subtraction
rather than an estimate.

| probe | hour 10 | hour 0 | share from IBL |
|---|---|---|---|
| bench top (0.18 albedo, horizontal) | 0.219 | 0.115 | **53%** |
| terrace floor, direct sun | 0.477 | 0.205 | 43% |
| roofed floor, deep shade | 0.250 | 0.206 | **83%** |
| grey card | 0.202 | 0.067 | 33% |

Values are linear scene-referred, recovered from the captured sRGB by inverting
Khronos Neutral's black-point term. They are approximate — the operator's offset
uses `min(r,g,b)` and these are luminances — but not marginally so.

Two independent statements of the same defect:

1. **53% of a lit horizontal surface, and 83% of a shaded interior, comes from a
   light that does not vary with the hour.** Reconstructing an illuminance from
   the bench reading puts the environment map at roughly 6 × 10⁴ lx-equivalent,
   against an authored sky of 18.4 klx.
2. The key lightformer's intensity of 1.2 renderer units is
   `1.2 / RENDER_EXPOSURE` = **38,200 nits**. §4.1's own reference table gives a
   clear sky as 5,000–8,000 nits.

### Why this cannot be frozen

Every consequence the physical-units programme was for is currently being
overridden by an eye-tuned constant:

- the roughness gradient barely separates, because a large uniform diffuse
  source washes out the specular difference that roughness *is*;
- interiors are lifted by an ambient term that has no fixture behind it, which
  is precisely the M2 problem the contract says must be solved with lights that
  exist;
- night is not dark.

If these images are ratified, every future asset is judged against a lighting
model whose dominant term is a leftover, and §4 is decorative. That is the
failure §2.4 and §7 were written to prevent, arriving one milestone later than
expected and through the door M1c exists to open.

### What M1b's findings are NOT

M1b's results stand. The exposure calibration ran in the `exposure` rig, which
mounts no `<Environment>` at all. The roof-acne and interior-leak results were
differential (`adjDelta`, and deep-vs-patch), so a constant ambient floor does
not move them. This is a new finding, not a retraction.

### The proposal, sized

Author the lightformers in nits and convert them through `toRenderIntensity`,
the same path every other light already takes — the key rect from the sky
model's diffuse luminance so it tracks the hour, the two side rects from
ground-bounce luminance, and studio from its own stated instrument values. It is
a change to one file (`Environment3d.tsx`, protected — already covered by the
workstream exemption) plus a value table in `src/render/lightPresets.ts`, and it
invalidates nothing that has been ratified, because nothing has.

**It does invalidate all nine images here**, which is exactly why the ruling
comes first and the re-capture second.

---

## The second M1c finding — §3.1 — was WRONG, and is now closed

M1c reported that `PCFSoftShadowMap` "does not render" and that every image here
was hard-shadowed. **That was a misreading.** R1 checked it before acting on it,
which is the only reason it did not become a re-render.

**What r182 actually did.** The three.js migration guide, r181 → r182:

> "PCFSoftShadowMap with WebGLRenderer is now deprecated. Use PCFShadowMap which
> is now soft as well."

The constant was **absorbed, not removed**. In the installed build there is no
soft/hard pair left to pick between — `SHADOWMAP_TYPE_PCF` compiles a 5-tap
Vogel disk, rotated per pixel by interleaved-gradient noise, sampled through
`sampler2DShadow`. The hard 1-tap `step()` is the BASIC path. So
`live.shadowMapType: 1` is the soft filter under its new name, and it is
*softer* than the 3×3 kernel §3.1 originally asked for.

**Measured, because the constant's name is not evidence either way.**
`scripts/render/shadow-edge.mjs` fits a line to a shadow edge and reports the
10-90% transition width across it:

| cell | region | 10-90% width | scatter | inliers |
|---|---|---|---|---|
| `suburb-top` | bench shadow on terrace concrete | 3.62 px | 1.38 px | 0.89 |
| `city-top` | bench shadow on terrace concrete | 3.62 px | 1.38 px | 0.89 |
| `suburb-full` | slider beam edge on roofed floor | 3.66 px | 4.65 px | 0.65 |

A hard `step()` edge transitions in ~1–1.5 px, widened only by SMAA. Measured is
~2.5× that and matches the filter arithmetic: `shadowRadius` 1 → a one-texel
Vogel disk → 1.62 cm world → ~2.8 px at the top camera's 86 px/m, before AA.
Low scatter says the per-pixel rotation is not dithering the boundary, which is
what the real "pixelated shadow" symptom looks like. Visual inspection at 4×
across all nine cells agrees: graded edges, no blockiness, no stair-stepping,
no noise along boundaries.

(`none-top` is not profilable — studio shadow contrast falls below the tool's
gradient threshold. Checked by eye instead.)

**So the nine candidates are salvageable on shadow grounds.** No re-render is
needed for this reason.

**What was still worth fixing.** `generateShadowMapTypeDefine` falls back to
`SHADOWMAP_TYPE_BASIC` for any unrecognised value, and `PCFSoftShadowMap` is no
longer in its map. The alias reaches the soft path only because
`WebGLShadowMap.render` coerces it first — and that coercion was broken in r182
(it tested the wrong object reference), so shaders compiled BASIC and shadows
really did come out hard and aliased. That is three.js #32591, fixed by #32593
in **r183**. The installed build is 0.185.0 and carries the fix.

Naming the deprecated alias meant every shadow in this product depended on a
coercion in someone else's render loop that had already failed once. The
contract now names `PCFShadowMap`.

**The general fix is §0.3, not the rename.** Every clause in the contract
describes behaviour but records a *name*, and a name only refers to stable
behaviour within a version. The four render-stack packages are now pinned to
exact versions in `package.json` and in `VERIFIED_AGAINST`; a bump is a
contract-invalidation event requiring §1, §2 and §3 to be re-verified before any
baseline here stays valid. The caret ranges that were there permitted exactly
the kind of minor bump r182 was.

**What the manifest records.** Live `shadowMap.type` beside the contract's, for
every cell — because a manifest that records what the contract *says* is not
evidence about the image. Every live value now agrees with the contract.

---

## Re-capturing

```
npm run dev                            # in another terminal
npm run render:m1c                      # writes docs/calibration/
```

Headless Chromium with SwiftShader, ~8 minutes. Software rendering on purpose:
a baseline that depends on whose GPU it ran on is not a baseline.

## What invalidates these images

Re-capture, and say so, after any change to:

- the tone-mapping operator (§2.4)
- the shadow map type (§3.1)
- shadow resolution or frustum (§3.2)
- light units or `RENDER_EXPOSURE` (§4, §2.2) — **including the IBL, once §7 is
  settled**
- the reference fixture or its camera shots (`src/app/calibration/`)

Changing any of these after capture silently makes every image here a lie.

## The rule these images exist to enforce

An asset is judged against these images. **The lighting is never nudged to
flatter an asset.** If a candidate reads wrong in the slot, the asset is wrong,
or its material is wrong, or the contract is wrong — and if it is the contract,
the contract gets amended in writing and every image here gets re-captured.
