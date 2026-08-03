# Render Contract

Status: **M1b implemented; M1c-R closed all three capture findings; `perspective` baselines FROZEN, `cutaway`/`top` PROVISIONAL by design. M2 (interior lighting) implemented and FROZEN — see §10.** Successor to `docs/render-diagnostic.md` (M0 findings), which this document turns into law.

Every clause below has three parts: the **decision**, the **rationale**, and what it **forbids**. The forbidding half is the point — a clause with no prohibition is a note, not a contract.

The three clauses that were OPEN before M1b (§2.4 tone-mapping operator, §4/§2.2 the exposure-path conflict, §5 camera-mode presets) are resolved and implemented. M1c's capture opened two more, both now closed, and a related timing gap in §1.3 is also closed:

- **§3.1 — CLOSED at M1c-R, and M1c's reading of it was wrong.** three r182 *absorbed* `PCFSoftShadowMap` into `PCFShadowMap` rather than removing it; `PCFShadowMap` is now the soft filter. The nine M1c candidates are correctly soft-shadowed, verified by measured penumbra width, not by the constant's name. The clause is rewritten and §0.3 pins the versions so the next renamed-behaviour cannot slip through the same gap.
- **§7.1 — CLOSED at R2b + R4.** The dome partition of §7.2.4 is built: `envIntensityForSky`/`hemisphereLuxForSky` (`src/render/lightPresets.ts`) put the env map and `hemisphereLight` on one shared sky budget instead of two duplicated ones, driven by the single `environmentIntensity` lever. Verified analytically — at hour 10 the two halves sum to `skyLux` exactly and the key rect lands at `skyLux / PI` = 5,840 nits, inside §4.1's clear-sky range — and via `verify-m1b.mjs` (clean run, no regression). `docs/calibration/` is re-captured against it; `manifest.json` marks the three `perspective` cells `provisional: false` (frozen) and the six `cutaway`/`top` cells `provisional: true` (legibility departures, §5.4, never a correctness claim).
- **§1.3 — CLOSED at R3.** The startup assertion ran one frame too early to see a value `WebGLShadowMap`'s first shadow pass can overwrite; `RenderContractCheck` now asserts after that pass completes, and `src/render/contract.test.ts` proves the assertion throws on a corrupted value.

§9 carries the ledger; `docs/calibration/README.md` carries the account.

---

## 0. Governance — where contract values live, and the protected-paths conflict

### 0.1 Contract values live in a new unprotected module

**Decision.** All contract constants and the startup assertion live in a **new** file, `src/render/contract.ts`. Protected files import from it. No contract value is written as a literal inside a protected file.

**Rationale.** Every file this contract governs is on the protected list (§0.2). Centralizing the values means the diff to protected code is an import plus a reference, not a scattered set of tuned literals — the same pattern that kept the floor-materials work to a 4-file protected diff. It also makes the startup assertion possible at all: an assertion needs a single recorded source of truth to compare against.

**Forbids.** Writing a renderer, shadow, light-unit or tone-mapping value as a bare literal in `Viewport.tsx`, `Environment3d.tsx`, `WallMesh.tsx`, `FloorMesh.tsx` or `FurnitureLayer.tsx`. If a value is in this contract, it is imported. A literal that duplicates a contract value is a contract violation even when the number happens to match.

### 0.2 Protected-paths conflict — needs Dan's explicit sign-off before M1b

**This is a hard-rule tripwire, not a formality.** `CLAUDE.md` rule 1 and `docs/PROTECTED_PATHS.md` place every file this contract touches under protection:

| Clause | Files it must edit | Protected? |
|---|---|---|
| §1 color mgmt, §2 tone mapping, §3 shadows | `src/viewport3d/Viewport.tsx` | Yes — PROTECTED_PATHS.md:17 |
| §4 light units, §5 presets, §7 IBL | `src/viewport3d/environment/Environment3d.tsx` | Yes — PROTECTED_PATHS.md:21 |
| §6 material classes | `WallMesh.tsx`, `FloorMesh.tsx`, `FurnitureLayer.tsx` | Yes — PROTECTED_PATHS.md:18 |
| §8 tripwire TODO | `src/schema/scene.ts` | Yes — PROTECTED_PATHS.md:26 |

The protection is written to shield the 3D layer *from the extraction rebuild*, and this render work is the separate 3D-fidelity workstream — so the intent probably permits it. But the rule says stop and ask, and the file list is unambiguous.

**Decision.** M1b does not begin until Dan confirms in writing that the render-fidelity workstream is exempt from rule 1, or scopes an exemption to a named file list.

**Forbids.** Treating "the render milestones obviously need these files" as implied permission. Also forbids the reverse dodge — reimplementing renderer setup in new parallel files to technically avoid touching protected ones, which would leave two competing renderer configs.

### 0.3 Version pin — added at M1c-R, and it is the general fix

**Decision.** The render stack is pinned to exact versions, recorded in `VERIFIED_AGAINST` (`src/render/contract.ts`) and as exact — not caret — ranges in `package.json`:

| Package | Verified against |
|---|---|
| `three` | 0.185.0 |
| `@react-three/fiber` | 9.6.1 |
| `@react-three/drei` | 10.7.7 |
| `postprocessing` | 6.39.2 |

A change to any of them is a **contract-invalidation event**: §1, §2 and §3 are re-verified against the new build before any captured baseline is treated as valid.

**Rationale.** §1.1 already says an implicit default is a decision made by a dependency's changelog, and answers it by recording the value. §3.1 is the case that answer does not cover: the value was recorded, the recording never drifted, and the clause still became false — because `PCFSoftShadowMap` meant "a 3×3 soft kernel" when M1a wrote it and means "deprecated alias, coerced elsewhere, and hard-shadowed for one whole release" now. Every clause in this document describes *behaviour* but records a *name*, and a name is only a stable reference to behaviour within a version.

Renaming the constant fixes that one instance. The pin is what makes the class of defect visible, because it converts a silent semantic change into a deliberate, reviewable version bump.

The caret ranges that were here (`^0.185.0` and friends) were the actual mechanism: they permit exactly the kind of minor bump that r182 was.

**Forbids.** Caret or tilde ranges on these four packages. Forbids bumping any of them as an incidental part of unrelated work, or as a lockfile refresh. Forbids treating baselines captured before a bump as valid after it — they are re-captured or explicitly re-verified, and §2.4's rule that a stale baseline set is worse than none applies.

---

## 1. Color management

M0 found the audit clean and every setting implicit. Correct-by-default is not the same as correct-by-contract.

### 1.1 Assert every value explicitly, including ones already correct

**Decision.** `src/render/contract.ts` records and asserts:

| Setting | Contract value | Currently |
|---|---|---|
| `THREE.ColorManagement.enabled` | `true` | never referenced in `src` — implicit default |
| `gl.outputColorSpace` | `THREE.SRGBColorSpace` | never set — implicit default |
| pixel-ratio policy | `dpr={[1, 2]}` — explicit, clamped, upper bound 2 | never set — implicit R3F default |

**Rationale.** The current values are right, so this clause buys nothing today and everything later. An implicit default is a decision made by a dependency's changelog, and a three.js or R3F version bump that changes one produces a silently different image with no diff to review and no test failure. Recording the value converts a future silent regression into a loud one. The dpr upper bound of 2 is also a real performance decision, not just documentation — on a 3× display, uncapped dpr more than doubles the fragment cost of a scene that already carries N8AO and SMAA.

**Forbids.** Relying on a library default for any color-management value, including when the default is known-correct. Forbids `dpr` unbounded or above 2 without a recorded amendment. Forbids the `linear` prop on `<Canvas>` — it disables sRGB output encoding and is easily confused with the `flat` prop that §2 requires; `flat` yes, `linear` never.

### 1.2 Per-map color-space rule — law, no exceptions

**Decision.**

| Map slot | Color space |
|---|---|
| `map` (albedo / base color), `emissiveMap` | `THREE.SRGBColorSpace` |
| `normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`, `displacementMap`, `bumpMap`, `alphaMap` | `THREE.NoColorSpace` |

Every texture in the codebase already complies (M0 §2 — `materials/loader.ts:62-71`, `viewport3d/textures.ts:189-193`, `City.tsx:96-99`, `Suburb.tsx:142-144`). This clause makes compliance mandatory rather than fortunate.

**Rationale.** Data maps carry direction, gloss and occlusion, not color. Passing them through an sRGB→linear decode applies a ≈2.2 power curve to values that are not perceptual, which bends normals toward the surface and skews roughness dark. The failure is quiet: nothing errors, materials just never quite behave, and the natural response is to re-tune the material until it looks right under one light — which bakes the error into the authoring. That is why this is stated as law now, before M2 gives anyone a reason to author materials.

**Forbids.** Tagging any data map `SRGBColorSpace`, under any justification including "it looked better." A data map that looks better in sRGB is evidence the material or the lighting is wrong, and the material is what gets fixed. Also forbids the pre-r152 `.encoding` API (`sRGBEncoding` / `LinearEncoding`) — currently absent from the codebase and to stay absent.

### 1.3 Startup assertion, dev-only, fails loudly

**Decision.** `src/render/contract.ts` exports `assertRenderContract(gl)`, called once from `RenderContractCheck` (mounted as the last child of the Canvas, after `<EffectComposer>`), on the second `useFrame` call — after the first `gl.render`, including its shadow pass, has completed. It compares live renderer state against the recorded contract and **throws** on mismatch in development. In production it logs one `console.error` and continues.

Asserted: `ColorManagement.enabled`, `gl.outputColorSpace`, `gl.toneMapping === NoToneMapping` (§2.2), `gl.shadowMap.type`, `gl.shadowMap.enabled`.

**Rationale.** Throwing is the point. A warning in a console that already carries R3F and Next.js noise is a warning nobody reads; the assertion exists precisely for the case where someone is not looking. Dev-throw / prod-log splits the difference honestly — a version bump must not white-screen a user, but it must be impossible to miss on the machine where the bump happens.

**Forbids.** Downgrading the dev throw to a warning to unblock work. If the assertion fires, either the code is wrong or the contract is wrong, and one of the two gets amended — the assertion is not silenced. Forbids asserting values the contract does not record, which would make the assertion the de-facto source of truth instead of this document.

### 1.4 GLB texture tagging — deferred to the M3b validator

**Decision.** Color-space correctness of textures inside furniture GLBs (IKEA, BlenderKit, generic) is **deferred to M3b**. Not audited in M1, not asserted at runtime.

**Rationale.** All ~390 shipped furniture assets get their tagging from `GLTFLoader`'s spec-mandated behavior; nothing in app code touches it (M0 §2). Verifying that today would test a code path that KTX2 replaces — KTX2/Basis changes how the loader assigns color space, so an M1 audit would certify a pipeline that no longer exists by M3. Testing the outgoing path is wasted work that also produces false confidence.

**Forbids.** Hand-tagging GLB texture color spaces in app code as an interim fix. That would fight the loader, and every such override becomes a landmine when KTX2 lands. Forbids treating M3b as optional — the deferral is on the condition that the validator actually ships.

---

## 2. Tone mapping and the postprocessing chain

Renderer-flat with ACES in the composer is correct and stays. But it relocates the decision surface, and two things found while verifying it are load-bearing.

### 2.1 Composer render-target format — verified HalfFloat, now asserted

**Decision.** Composer frame-buffer type is `THREE.HalfFloatType`, recorded and passed explicitly rather than inherited.

**Verified:** `@react-three/postprocessing`'s `EffectComposer` defaults `frameBufferType` to `HalfFloatType` (`node_modules/@react-three/postprocessing/dist/index.js` — `frameBufferType: S = xe`, where `xe` is `HalfFloatType` imported from three). The current chain is therefore already HDR-correct. Nothing to fix; everything to pin.

**Rationale.** This is the clause the whole physical-units plan rests on. An 8-bit `UnsignedByteType` target clamps radiance to 1.0 *before* the tone-mapping pass, so highlights clip flat, ACES receives pre-destroyed data, and physical light values buy nothing but a white image. It is correct today by library default — see §1.1 for why that is not the same as safe.

**Forbids.** `UnsignedByteType` on the composer, and relying on the library default rather than passing the value. Forbids adding a pass or effect that writes to an LDR intermediate target upstream of tone mapping.

### 2.2 Exposure ownership — currently owned by nobody, and this conflicts with §4

**Verified, and it changes the clause as briefed.** The brief says exposure is owned by the effect, not `renderer.toneMappingExposure`. Neither is true today:

- `renderer.toneMappingExposure` is **inert**. The composer forces `gl.toneMapping = NoToneMapping` on mount (`@react-three/postprocessing/dist/index.js` — `d.toneMapping = _e`, `_e` = `NoToneMapping`), reinforced by `flat` on the Canvas (`Viewport.tsx:1239`). With `NoToneMapping`, three omits the `tonemapping_fragment` chunk entirely, and `toneMappingExposure` is the uniform that chunk consumes. It is not merely unused — it is unreachable.
- `ToneMappingEffect` **has no exposure parameter**. Its constructor options are `mode`, `resolution`, `whitePoint`, `middleGrey`, `minLuminance`, `averageLuminance`, `adaptationRate` — and the type docs state plainly that "the additional parameters only affect the Reinhard2 operator" (`node_modules/postprocessing/build/types/index.d.ts:8517-8530`). In `ACES_FILMIC` mode the operator is a fixed curve with a hardcoded 1.0/0.6 scale (ibid.:8486). There is no knob.

So there is no exposure control anywhere in the current pipeline. **This is fine for the current eyeballed intensities and fatal for §4.** Physical units mean a noon sun of ~100,000 lx; with no exposure stage to map scene-referred illuminance onto a display range, every surface clips to white no matter how correct the HalfFloat buffer is. Clause §4 as briefed cannot coexist with clause §2 as briefed.

**Decision (proposed — see §9).** Exposure becomes a single **scene-referred** constant, `RENDER_EXPOSURE`, in `src/render/contract.ts`, applied at the lighting layer: physical values authored in lux/candela/nits are multiplied by it on the way into three light intensities. The tone-mapping effect stays parameterless, and `renderer.toneMappingExposure` stays at its default 1.0 and asserted inert.

**Rationale.** This preserves both halves of the brief's intent — one owner, global, not a per-scene knob — without needing a shader stage the library does not offer. It is also exactly what three's own physical-lighting workflow does with `toneMappingExposure`, just moved upstream of the tone mapper instead of into it, because the composer has taken that slot away. Applying it at the light layer rather than as a display-referred multiply keeps the authored numbers physical: the preset table reads in lux, and the conversion to renderer units happens in one place.

`RENDER_EXPOSURE` has **no value in this document — it is NOT MEASURED.** M1b calibrates it against a stated reference: an 18% grey card, lit by the noon-sun preset, must land at approximately 0.18 post-tone-map. A number invented here would be a placeholder metric, which `CLAUDE.md` rule 7 forbids.

**Forbids.** Setting `renderer.toneMappingExposure` to anything but 1.0, and reading it as if it did something. Forbids a second exposure multiplier anywhere — per-preset, per-camera-mode, or per-material. Forbids adjusting `RENDER_EXPOSURE` to make a scene or an asset look right: it is calibrated once against the grey-card reference and then frozen (§2.4).

### 2.3 Effect ordering, with tone mapping's position fixed

**Decision.** The composer chain is ordered, and tone mapping's slot is fixed:

```
1. RenderPass                     (implicit)
2. HDR scene-space effects        — SSAO/N8AO, bloom, DoF, god rays, SSR
3. ToneMapping                    — FIXED. HDR ends here.
4. LDR display-space effects      — SMAA, vignette, LUT, grain
```

Current chain complies: N8AO → ToneMapping → SMAA (`Viewport.tsx:1294-1302`).

**Rationale.** Everything above the tone-map line operates on scene-referred radiance where values exceed 1.0 and physical relationships hold; everything below operates on display-referred color where they do not. Bloom after tone mapping blooms from clamped values, so bright highlights stop blooming *more* than merely-bright ones — the effect survives but stops meaning anything. Antialiasing is the mirror case and belongs after: SMAA is a perceptual edge filter and gives better edges on display-referred data. Writing the slot down now is what makes the M2/M3 bloom-and-SSAO work a matter of picking a line number.

**Forbids.** Any HDR-domain effect below the ToneMapping entry, any LDR-domain effect above it, and more than one ToneMapping entry in the chain. Forbids re-enabling composer `multisampling` while SMAA is present (`Viewport.tsx:1294` sets `multisampling={0}`) — paying for MSAA and SMAA both is cost without benefit.

### 2.4 Operator choice — recommend changing ACES → Khronos Neutral (OPEN)

The brief asks to confirm or change, with rationale. My recommendation is **change**, and it needs ratification because it visibly alters every render and must land before M1c captures baselines.

**Recommendation: `ToneMappingMode.NEUTRAL`** (Khronos PBR Neutral). Available — requires three r162+, repo is on r185 (ibid.:8488).

**Rationale.** ACES is the film-industry default and it is a genuinely good curve, but it has a specific, well-documented behavior: it desaturates and hue-shifts saturated colors as they brighten, pulling reds toward orange and blues toward white. In a cinematic pipeline that is a feature. In this product it is a defect, because the product is interior *design* — the user picks a paint color (`wall.paintA` / `paintB`, `WallMesh.tsx:199-203`) and the north star is that they can trust what they see. A wall painted a saturated color, lit by a bright sun, will not render as the color they chose. Khronos Neutral was designed for exactly this constraint — accurate material color for product and model viewing — and preserves albedo hue and saturation far into the highlights, rolling off only at true clipping.

The cost is real and worth stating: Neutral is less filmic. Sunsets and bright exterior skies lose some of ACES's dramatic highlight rolloff, and the overall image reads slightly flatter and less "graded." Given that the paying use case is a person deciding what color to paint their living room, and the exterior environment is context rather than subject, that is the right trade. AgX is the third option and I do not recommend it here — it handles extreme highlights best of the three but is the most aggressively desaturating, which is the wrong direction for this product.

**Decision (whichever operator is ratified): exposure is a global constant, not a per-scene knob.** If a future asset or scene needs the exposure changed to look right, the asset is wrong, or the light preset is wrong, or the material is wrong. The exposure is not the fix.

**Forbids.** Per-preset, per-camera-mode, per-scene or per-asset tone-mapping mode or exposure. Forbids changing the operator after M1c baselines are captured without explicitly invalidating and re-capturing every reference image — the change is global and silent, and a stale baseline set is worse than none.

---

## 3. Shadows — locked here, before M1c

M0 found `PCFShadowMap`, not `PCFSoftShadowMap` (`Viewport.tsx:1235`). Changing this after baselines invalidates every reference image, so it is settled now.

### 3.1 Type: `PCFShadowMap` — which since r182 IS the soft filter

**Decision.** `THREE.PCFShadowMap`.

**This clause was rewritten at M1c-R after the M1c reading of it was found to be wrong.** M1c reported that "M1b's soft-shadow decision has never rendered" and that every baseline was hard-shadowed. The first half is true in a trivial sense and the second half is false. Both halves came from reading a deprecation warning and not checking what the deprecation meant.

**What r182 actually did.** The three.js migration guide, r181 → r182:

> "PCFSoftShadowMap with WebGLRenderer is now deprecated. Use PCFShadowMap which is now soft as well."

The constant was **absorbed, not removed**. In the installed build there is no soft/hard pair left to choose between — `shadowMapTypeDefines` maps `PCFShadowMap` → `SHADOWMAP_TYPE_PCF` and `VSMShadowMap` → `SHADOWMAP_TYPE_VSM`, and nothing else (`three.module.js:6579-6581`). `SHADOWMAP_TYPE_PCF` compiles a **5-tap Vogel disk, rotated per pixel by interleaved-gradient noise, sampled through `sampler2DShadow`** so each tap is itself hardware-filtered. The old hard 1-tap `step()` is the `#else` BASIC path. `PCFShadowMap` in r182+ is therefore *softer* than the 3×3 kernel the original clause asked for.

So `live.shadowMapType: 1` is the soft path under its new name. **The nine M1c candidates are not hard-shadowed.**

**Why naming the deprecated alias was still dangerous.** `generateShadowMapTypeDefine` falls back to `SHADOWMAP_TYPE_BASIC` for any value it does not recognise (`three.module.js:6586`), and `PCFSoftShadowMap` (2) is not in the map. It reaches the soft path only because `WebGLShadowMap.render` coerces it to `PCFShadowMap` before the define is generated (`three.module.js:9148-9152`). That coercion was broken in r182 — it tested the wrong object reference, so no coercion and no warning happened, the shader compiled BASIC, and shadows came out hard and aliased (three.js #32591). It was fixed by #32593, milestone **r183**. The installed build is 0.185.0 and carries the fix, verified in `node_modules`.

Naming the alias meant the correctness of every shadow in this product depended on a coercion in someone else's `render()` loop that had already failed once.

**Verified in the captures, not only in the source.** `scripts/render/shadow-edge.mjs` profiles the 10-90% transition width across a fitted shadow edge:

| cell | region | 10-90% width | scatter | inliers |
|---|---|---|---|---|
| `suburb-top` | bench shadow on terrace concrete | 3.62 px | 1.38 px | 0.89 |
| `city-top` | bench shadow on terrace concrete | 3.62 px | 1.38 px | 0.89 |
| `suburb-full` | slider beam edge on roofed floor | 3.66 px | 4.65 px | 0.65 |

A hard `step()` edge transitions in ~1–1.5 px, widened only by SMAA. Measured is ~2.5× that, and it matches the filter arithmetic: `shadowRadius` defaults to 1, so the Vogel disk spans one shadow-map texel = `2 × 16.6 m / 2048` = 1.62 cm, which at the top camera's 86 px/m is ~2.8 px before AA. Low scatter (1.38 px on the clean edge) says the stochastic rotation is not producing the dithered boundary that is the actual "pixelated shadow" symptom.

Visual inspection at 4× on all nine cells confirms it: graded edges, no blockiness, no stair-stepping at texel scale, no per-pixel noise along boundaries. (`none-top` is not profilable — studio shadow contrast falls below the tool's gradient threshold. Its edges were checked by eye.)

**Rationale for the clause as it now stands.** One filter is available and it is the right one: a rotated-disk PCF gives soft edges on exactly the shadows that matter here — long straight wall and mullion shadows across a floor, where the eye tracks a continuous line and reads every jag. The cost is extra texture fetches in the shadow lookup: no extra pass, no extra memory, no architectural change.

**Forbids.** Writing `PCFSoftShadowMap` anywhere. It is a deprecated alias whose only route to correct behaviour runs through a coercion that has already regressed once, and it is scheduled for removal (the guide's r185 → r186 entry removes it for WebGPURenderer). Forbids VSM (light-bleed through thin geometry is disqualifying for a scene built from thin walls, and it interacts badly with §3.4's slab ceiling). Forbids `BasicShadowMap`. Forbids changing type after baselines are captured without re-capturing them.

**Forbids, added at M1c-R.** Describing a shadow as soft or hard on the strength of the constant's name. §0.3 pins the version; the empirical check is `scripts/render/shadow-edge.mjs`, and a claim about penumbra without one of the two is not evidence.


### 3.2 Resolution and frustum: 2048², single frustum, with a recorded degradation threshold

**Decision.** `shadow-mapSize = [2048, 2048]`, single orthographic frustum, half-extent `span * 0.9 + 4` (unchanged from `Environment3d.tsx:80,106,110`). Cascaded shadow maps are **deferred**.

**Rationale, with the number that matters.** Texel density is `2 * (span * 0.9 + 4) / 2048` meters per texel:

| Model span | Frustum width | m/texel |
|---|---|---|
| 10 m (flat) | 26 m | 1.3 cm |
| 15 m (typical apartment) | 35 m | 1.7 cm |
| 40 m (large house / multi-unit) | 80 m | 3.9 cm |

At 1.7 cm/texel, furniture contact shadows read correctly and this is fine. At 3.9 cm a chair leg is under one texel wide and its contact shadow disappears — the object starts to float. So single-frustum is not "good enough forever," it is good enough up to a span this contract now records. CSM is the fix and it is genuinely more machinery (an extra dependency or a hand-rolled cascade split, plus per-cascade frustum fitting); paying for it before any evidence of large-span models in real use is premature.

**Tripwire.** If a real model exceeds ~25 m span, or contact shadows are reported missing on furniture, this clause is what gets reopened — reach for CSM, not for a bigger map. 4096² doubles memory and bandwidth for one stop of density and does not change the shape of the problem.

**Forbids.** Raising the map size as a substitute for cascades. Forbids per-scene or per-model resolution — a scene-dependent shadow resolution makes every baseline image scene-dependent too.

### 3.3 Bias convention: normal-bias primary, constant bias minimal

**Decision.** `shadow.normalBias` is the primary acne control. `shadow.bias` stays small and negative, magnitude ≤ 0.0005. Current values (`normalBias 0.02`, `bias -0.0002`, `Environment3d.tsx:107-108,122-123`) comply and are the starting point; M1b re-validates them once the ceiling actually casts.

**Rationale.** Constant bias offsets every fragment equally regardless of geometry, so the value needed to clear acne on a surface at grazing light is large enough to detach contact shadows elsewhere — the peter-panning trade. Normal bias offsets along the surface normal proportional to the light angle, which targets the acne without the detachment, and is the correct primary tool. Fixing the convention now matters because §3.4's zero-thickness ceiling is the exact geometry that tempts someone to crank constant bias until the leak stops.

**Forbids.** Raising `shadow.bias` past 0.0005 magnitude to fix a leak. A leak at that point is a geometry problem (§3.4), and the geometry gets fixed. Forbids per-light bias values diverging without a recorded reason — both directional lights currently share values and should stay in sync.

### 3.4 Shadow casters are solids — the ceiling is the known violation

**Decision.** Shadow-casting geometry must be a closed solid with non-zero thickness. The ceiling is currently a zero-thickness triangulated plane (`FloorMesh.tsx:199,252` via `triangulateFloor.ts:9-32`) and is the one known violation. **M1b picks one:** give the ceiling real thickness (a slab, consistent with how walls and floors are built), or grant a documented exemption with the bias behavior measured rather than assumed.

**Rationale.** M0 identified the sun-through-ceiling root cause as the missing `castShadow` flag (`FloorMesh.tsx:252`), with zero-thickness geometry flagged as latent — a risk that cannot manifest while the mesh casts nothing. The moment M1b adds `castShadow`, it manifests: a zero-thickness caster occupies a single depth value, so front-face and back-face depths are identical and the bias margin that protects a thick wall has nothing to bite into. Recommendation is a real slab — it matches how every other architectural element is built, makes the ceiling correct from any interior viewing angle, and removes the special case rather than documenting it.

**Forbids.** Adding `castShadow` to the ceiling without resolving its thickness in the same change. Forbids "fixing" the resulting leak with bias (§3.3). Forbids introducing new zero-thickness casters — a plane that must cast gets thickness or gets `castShadow = false`.

---

## 4. Light units — physical, and the old values are discarded

### 4.1 Physical units

**Decision.** All lights are authored in physical units:

| Light type | Unit | Reference values |
|---|---|---|
| Directional (sun) | lux (lx) | clear noon ≈ 100,000; overcast ≈ 10,000; golden hour ≈ 400–1,000; full moon ≈ 0.25 |
| Hemisphere / sky | lux | clear-sky diffuse ≈ 10,000–20,000; overcast carries essentially the whole ≈10,000 |
| Point | candela (cd) | domestic LED bulb ≈ 800 lm → 800/(4π) ≈ 64 cd |
| Spot | candela (cd) | `lumens / (2π(1 − cos halfAngle))` |
| Area / emissive | nits (cd/m²) | clear sky ≈ 5,000–8,000; overcast ≈ 2,000 |

These become the basis of the M2 preset table. Conversion to three intensities happens once, via `RENDER_EXPOSURE` (§2.2).

**Rationale.** Physical units make lighting *derivable* instead of tuned. A preset for "overcast afternoon" is then a lookup, not a taste judgment, and — this is the part that pays off at M2 — a room's interior lights can be specified as the fixtures that would actually be in it, in lumens off a box, rather than as numbers that happened to look right. Eyeballed values do not compose: two independently-tuned lights in one room have no defined relationship, so adding a third means retuning all of them.

**Forbids.** Introducing a light whose intensity has no stated unit. Forbids mixing conventions within a preset. Forbids adding a light to fix a look without a physical justification — if a room is too dark, the fixture is wrong or `RENDER_EXPOSURE` is uncalibrated, and there is a right answer to find.

### 4.2 The current values are discarded, not converted

**Decision.** Existing intensities — sun `0.4 + 2.0 * day` (range ≈0.3–2.4), hemisphere `0.16 + 0.5 * day`, studio directional `2.1`, studio hemisphere `0.55` (`Environment3d.tsx:32,39,115,119`) — are **discarded**. They are not converted, not scaled, not used as targets.

**Rationale.** M0 confirmed no code evidence of any unit basis: zero references to `physicallyCorrectLights`, `useLegacyLights`, lumens or watts anywhere in `src`. These numbers were tuned by eye, against a fixed ACES curve with no exposure control, in whatever preset was on screen. There is no scale factor to recover because there was never a scale — the ratio between the sun and hemisphere values encodes a person's judgment, not a physical relationship, and there is no arithmetic that turns it into one. **There is nothing to migrate.** Any effort spent "preserving" them is effort spent fitting new physics to old guesses.

The *look* they produced is not discarded — it is a reasonable reference for M1c, and if the physical values land somewhere very different, that is worth understanding. But the reference is the rendered image, not the numbers.

**Forbids.** Deriving any new value from an old one. Forbids a compatibility path, a scale factor, or a "legacy intensities" flag. Forbids treating the old look as a target the physical values must reproduce — if physically-correct noon sun looks different from the eyeballed version, the eyeballed version was wrong, and §2.4 forbids fixing that with exposure.

---

## 5. Camera-mode lighting presets — **I disagree with the briefed decision (OPEN)**

The brief invited disagreement after reading the cutaway implementation. I read it, and I disagree. Recording both positions; Dan rules.

### 5.1 What cutaway actually is

Cutaway is **not diagrammatic**. `WallMesh.tsx:217-238`: a normal perspective camera, with a per-wall opacity fade applied only to walls whose plan-space direction from the model center has a positive dot product (> 0.25) with the camera direction — near-side walls fade to 0.13, far-side walls stay fully opaque. Everything else is unchanged. The sky, sun, fog, ground, and the full suburb or city environment all still render (`Environment3d.tsx:86-99,139-148`).

So cutaway is a photographic view of a sunlit building in a sunlit world, with the near walls dissolved. It is much closer to perspective mode than the name suggests. Top view is more genuinely diagrammatic, and the distinction between the two matters here.

### 5.2 Why the briefed decision has a problem

The brief says cutaway and top get presets with sun contribution off or heavily reduced, interior lights and IBL carrying the frame.

The problem: **the sun is one scene-wide directional light.** It lights the lawn, the skyline, the ground plane and the sky-lit exterior of the building — all of which remain fully in frame in cutaway. Turning it off or heavily reducing it does not selectively stop sunlight from reaching interior floors; it darkens the entire visible world. The user toggles from perspective to cutaway and the sun goes out on the neighborhood. That is a more conspicuous artifact than the leak it fixes.

The brief's rationale for rejecting the depth-only ceiling proxy is that it "buys physical correctness at the cost of a dim cutaway." That is true **today**, and stops being true at M2. The reason a correctly-roofed interior is dim is that it has no interior lights yet. M2 adds them. So the proxy's stated cost is a pre-M2 artifact with a scheduled expiry, while the preset's cost — the exterior going dark — is permanent.

On code volume, the two are closer than the brief assumes. The proxy is: mount the existing ceiling geometry regardless of `wallMode`, with `colorWrite = false` and `castShadow = true` when it would otherwise be hidden. It reuses `buildFloorGeometry` output that already exists. Three named light presets is a preset table plus per-camera-mode wiring plus a transition policy.

### 5.3 Recommendation

**Depth-only ceiling proxy, plus a modest interior fill in cutaway and top that retires when M2 lands.**

The proxy gives physically correct occlusion in every camera mode, keeps the exterior world correctly sunlit, and means the ceiling question is answered once instead of per-mode. The interim fill is explicitly temporary and its retirement is a checkable M2 exit condition.

I still recommend recording **three named presets** as the brief specifies — the structure is right and M2 needs it regardless. The disagreement is only about whether the presets solve the sun leak. Under my recommendation the proxy solves the leak and the presets carry legitimate mode-specific differences (interior fill, IBL weighting).

### 5.4 The clause, either way

**Decision.** Three named presets: `perspective`, `cutaway`, `top`. **`perspective` is the only physically-motivated one** — it is the mode M1c baselines are captured in and the only one where a physical-correctness claim is made. `cutaway` and `top` are explicitly legibility-first and may depart from physical values, with each departure recorded and justified.

**Rationale.** Naming the modes and marking exactly one as physical prevents the slow drift where every mode accumulates its own tweaks and nothing is a reference any more. It also gives M1c an unambiguous answer to which mode a baseline is captured in.

**Forbids.** Camera-mode-specific lighting outside the three named presets. Forbids a physical-correctness claim about cutaway or top. Forbids an undocumented departure from physical values in any preset. Forbids per-preset exposure or tone-mapping changes (§2.4) — presets adjust lights, never the display transform.

---

## 6. Material class taxonomy and shadow behavior

**Decision.** Four declared classes. Every mesh belongs to exactly one, assigned by class rather than by per-mesh flag.

| Class | Members | Casts | Receives |
|---|---|---|---|
| **Opaque architecture** | walls, baseboards, floors, ceilings, solid door leaves, frames, mullions, thresholds, stairs, opaque furniture | yes | yes |
| **Glass** | window glass, transparent door panes, balcony rail glass | **no** | yes |
| **Alpha-cutout** | foliage, grilles, sheer curtains, perforated screens | yes, via `customDepthMaterial` with matching `alphaTest` | yes |
| **Transient / diagrammatic** | cutaway-faded walls and baseboards, furniture placement ghosts, selection highlight bands | *deferred — slot required, see below* | *deferred* |

**Rationale.** M0 found the behavior scattered across per-mesh flags at nine sites, with the correct glass exclusions expressed three different ways: a role predicate (`WallMesh.tsx:674`), an omitted flag with an explanatory comment (`WallMesh.tsx:939-940`), and an unconditional forced-true traversal (`FurnitureLayer.tsx:59-60`). The behavior is right and the structure is not — there is no place to state a rule, so every new mesh re-decides from scratch and the furniture path decides wrong by default. Declaring classes moves the decision to one place and makes the next asset inherit it.

### 6.1 Glass — a declared limitation, not an oversight

**Decision.** Glass does not cast shadows. Documented as a deliberate limitation.

**Rationale.** Three.js shadow maps store depth only, with no transmission, tint or refraction. A glass mesh that casts renders a fully opaque shadow — a window would throw a solid black rectangle across the floor it is supposed to be lighting. Between two wrong answers, no shadow is much closer to right than an opaque one, and this is a renderer limitation rather than a choice, which is why it is recorded as a limitation. The existing code already does this correctly; the point of the clause is that the *reason* is now written down, so nobody "fixes" it later by adding the flag back.

**Forbids.** `castShadow` on any glass-class mesh. Forbids per-mesh exceptions. Revisiting requires a real technique (transmissive shadow maps, ray-traced or baked caustics), not a flag flip.

### 6.2 Alpha-cutout — defined now, unused now

**Decision.** Defined with a `customDepthMaterial` whose `alphaTest` and `alphaMap` match the visible material's. Nothing uses this class today (M0 confirms zero `alphaTest` usage anywhere in `src`).

**Rationale.** The default shadow depth material ignores alpha entirely, so a cutout leaf casts the shadow of its quad. The failure appears the day the first plant is added to the catalog, in an area of code whose author will be thinking about furniture placement, not shadow depth materials. Defining it while nothing depends on it costs nothing; retrofitting it after a dozen foliage assets ship costs a sweep of all of them.

**Forbids.** Adding a cutout asset without its `customDepthMaterial`. Forbids `transparent: true` as a substitute for `alphaTest` on cutout geometry — it produces sorting artifacts and still casts a full-quad shadow.

### 6.3 Transient / diagrammatic — class declared in M1a, behavior deferred, **slot required in M1b**

**Decision.** The class is declared now. Its shadow behavior is **deferred**. M1b must ship the slot — the class assignment and the plumbing for a per-class shadow policy — even though the policy value it carries is initially unchanged behavior.

**Rationale.** M0 found these meshes keep full-opacity shadow casting while faded to near-invisible: cutaway walls at opacity 0.13 still cast a solid shadow (`WallMesh.tsx:230-237` fading, `WallMesh.tsx:343` casting), as does the furniture placement ghost (`FurnitureLayer.tsx:59-60,67-71`). This is a real defect and it is not the M1 defect, so fixing the behavior now is scope creep. But the *slot* is the difference between a later one-line value change and a later retrofit of the class system into five protected files. Shipping the class without the behavior is the cheap half, and it is cheap only if done now.

**Forbids.** Deferring the slot along with the behavior. If M1b ships class assignment without a per-class shadow policy hook, this clause has not been met. Forbids fixing the behavior in M1b by special-casing the two known meshes — that is the retrofit this clause exists to prevent.

---

## 7. Environment / IBL

**Decision.** The environment map contributes to all materials in all presets. It is a procedural `<Environment>` rig at `resolution={128}` with three `<Lightformer>` rects (`Environment3d.tsx:131-135`). Intensity is **preset-varying**, and after §4 lands it is specified in nits alongside every other light. Its current single variation — key lightformer at 1.2 outdoors vs 1.6 in studio — is retained as the pattern.

**Rationale.** IBL is what makes glass, polished floors and metal furniture hardware read as materials rather than flat shaded shapes; direct lights alone leave them dead. Preset-varying rather than fixed is the honest answer because the environment map is standing in for the real surroundings, and those genuinely differ — a studio preset has no sky, so its IBL is a lighting instrument, whereas outdoors it approximates an actual sky that §4 gives a physical value.

The 128px resolution is a deliberate cost decision: it is regenerated when the preset changes, and it is blurry reflection detail rather than lighting accuracy that suffers at that size. Recorded so that raising it is a decision with a known cost, not a tweak.

**Forbids.** Disabling the environment map in any preset — a preset that needs no IBL should set a low physical value, not switch the rig off, so materials keep behaving consistently. Forbids IBL intensity as an untracked look knob once §4 lands: it is a light with a unit like any other. Forbids per-material `envMapIntensity` overrides used to compensate for a preset's IBL level — that is the same drift §2.4 forbids, one level down. Forbids raising `resolution` without recording the frame-cost measurement.

### 7.1 The clause was UNMET, measured at M1c capture — CLOSED at R2b/R4

**M1b converted the sun, the sky and the studio instruments to physical units and left the three `<Lightformer>` rects at their eye-tuned values** (1.2 / 0.7 / 0.55 outdoors, 1.6 in studio — `Environment3d.tsx:123-125`). The "once §4 lands" condition above landed; the conversion did not happen. Nothing failed loudly because the assertion in §1.3 covers renderer state, not light values.

**Measured, not inferred.** Probed off the calibration chart's front bench — a known 0.18-albedo horizontal surface, no AO in that composer — in `suburb` / `perspective`, at the canonical hour and again at hour 0, where the sun is below the horizon and the sky model has fallen to its 0.25 lx moonlight floor. At hour 0 the environment map is the only light left:

| probe | hour 10 | hour 0 | from IBL |
|---|---|---|---|
| bench top, 0.18 albedo, horizontal | 0.219 | 0.115 | **53%** |
| terrace floor, direct sun | 0.477 | 0.205 | 43% |
| roofed floor, deep shade | 0.250 | 0.206 | **83%** |

Linear scene-referred, recovered by inverting Neutral's black-point term; approximate, because that term reads `min(r,g,b)` and these are luminances. Independently: the key rect's 1.2 renderer units is `1.2 / RENDER_EXPOSURE` = **38,200 nits**, against §4.1's own clear-sky reference of 5,000–8,000.

**Why it blocks the freeze rather than being a defect to note.** The environment map does not vary with the hour, so it is a constant ambient floor under every scene — it washes out the specular difference that roughness *is*, it lifts interiors with light that has no fixture behind it (the exact M2 problem the contract says must be solved with lights that exist), and it means night is not dark. Ratifying M1c's images would make every future asset judgement depend on that constant, and §4 would be decorative.

**M1b's results are unaffected.** The exposure calibration ran in the `exposure` rig, which mounts no `<Environment>`; the roof-acne and interior-leak results were differential. This is new, not a retraction.

**Proposed fix: superseded by §7.2.** The first proposal here was "author the rects in nits and rescale". R2a audited the rig before doing that and found the magnitude was only half the defect — see §7.2 for the roles, the double-counting audit, and the disposition that replaces it.

**Closed.** §7.2.4's dome partition shipped at R2b and `docs/calibration/` was re-captured against it at R4 — see the status block at the top of this document and `docs/calibration/README.md`.

---

### 7.2 R2a — what each rect represents, and the double-counting audit

Rescaling was not done first, deliberately. A 5–7× overage has more than one possible cause, and "the numbers were eye-tuned" is the one that requires no further thought. The audit below establishes what each rect *is* before anything is multiplied.

**Everything here is computed, not estimated.** `scripts/render/ibl-audit.mjs` integrates the rig's irradiance from its geometry and colours by cosine-weighted Monte Carlo. This is computable because drei's `<Environment>` with children renders **only those children** into a virtual scene (`Environment.js` — `createPortal(children, virtualScene)`): the sky mesh, the ground, the neighbourhood and the building are not in the map. The environment is exactly these three rects, and a `Lightformer` is a `MeshBasicMaterial` with `toneMapped: false` whose colour is multiplied by `intensity`, so its rendered value *is* its radiance in renderer units.

#### 7.2.1 What the three rects are, mechanically

| rect | geometry | colour | radiance | nits | share of env irradiance |
|---|---|---|---|---|---|
| key | 14 × 14 at `y = 8`, explicit `rotation` — normal +Y, so it lies flat overhead | `#eef3ff` cool white | 1.0740 | **34,186** | **95.7 %** |
| coolSide | 8 × 5 at `[-9, 3, -6]`, ~15.5° elevation, **aimed at the origin** | `#cfe0ff` cool blue | 0.5166 | 16,443 | 2.3 % |
| warmSide | 8 × 5 at `[9, 3, 6]`, ~15.5° elevation, **aimed at the origin** | `#ffe6c8` warm cream | 0.4511 | 14,360 | 2.0 % |

The aiming is the tell. Neither side rect carries a `rotation` prop, so `Lightformer` runs its default `lookAt([0,0,0])`, and `Object3D.lookAt` on a non-camera puts the object's +Z at the target. **They point at the scene centre.** A region of sky does not aim at anything; a softbox does.

**Role assignment.** The rig is a three-point studio softbox set: an overhead key, a cool side fill, a warm side fill. That is a defensible instrument set for the `none` preset — §7 already says as much ("a studio preset has no sky, so its IBL is a lighting instrument"). It is not a sky.

So **§7's own sentence "outdoors it approximates an actual sky" is not true of the implementation.** Outdoors the rig is the studio instrument set with one number changed (key 1.2 instead of 1.6). Nothing in it varies with the hour, the weather, or the sun's position.

#### 7.2.2 Double-counting audit

**The sun disc is NOT double-counted. The hypothesis is refuted, with numbers.**

| | solar disc | brightest rect |
|---|---|---|
| luminance | 1.60 × 10⁹ nits | 3.42 × 10⁴ nits |
| solid angle | 6.72 × 10⁻⁵ sr | 1.54 sr |

The key rect is **47,000× too dim** and **23,000× too large** to be a sun disc, and its colour is cool rather than solar. (The disc figures also check the contract against itself: 1.6 × 10⁹ nits × 6.72 × 10⁻⁵ sr = 107,500 lx at normal incidence, which is `REFERENCE_SUN_LUX`. §4.1's sun value is self-consistent with standard photometry.)

There is no sun-disc rect to delete. Good — and it must stay that way: the directional light casts the shadows, and a sun in the env map would add a second, shadowless one.

**The SKY is double-counted.** This is the real finding.

`hemisphereLight` is authored at `skyLux` and models diffuse skylight. The environment map also delivers diffuse irradiance, because three's `scene.environment` feeds **both** `RE_IndirectDiffuse` and `RE_IndirectSpecular` through a single scalar. Two representations of one object, summed:

| source | irradiance on an up-facing surface, hour 10 |
|---|---|
| `hemisphereLight` (authored, physical) | 18,346 lx |
| environment map (computed from geometry) | **54,893 lx** |
| total "sky" | 73,239 lx |

The env map delivers **3.0×** the sky it is supposed to be approximating. Measured independently at hour 0 — sun below the horizon, sky at its 0.25 lx moonlight floor, so the env map is the only light left — the probe reads ≈ 63,900 lx. The two disagree by 16%; the geometric figure is the more trustworthy of the two, and the probe's bias is understood (see 7.2.4).

**Ground bounce is counted once, weakly, and in the wrong place.** Sunlit ground at hour 10 receives ~87,600 lx; at a grass albedo near 0.25 it returns ~22,000 lx upward — a real term of the same order as the sky. It is represented only by `hemisphereLight.groundColor`. `warmSide`'s colour suggests it was reaching for this, but it sits 15.5° *above* the horizon, where ground bounce cannot come from.

#### 7.2.3 The structural finding: a rescale alone cannot satisfy §4.1

The rig's **geometric gain** — irradiance delivered per unit key radiance, with the three intensities held in their current ratio — is

```
G = E / L_key = 1.606 sr        (a full uniform dome gives PI = 3.142 sr)
```

so **the rig covers 51.1% of the projected hemisphere.** That number is what forecloses the obvious fixes:

- Make the env carry the whole sky (`E_env = skyLux`) and its panels must sit at `skyLux / G` = 11,400 nits — **43% above §4.1's 8,000 nit ceiling for a clear sky**, because half the dome is missing and the visible half has to make up for it. Reflections would show a sky that is too bright.
- Make the env show the correct sky luminance (`skyLux / PI` = 5,840 nits, comfortably inside §4.1's 5,000–8,000) and it delivers only 51.1% of `skyLux` — leaving a real shortfall.
- Keep `hemisphereLight` at full `skyLux` alongside either of the above and the double-count returns.

Three's env map has one intensity scalar and no way to separate its diffuse from its specular contribution, and §7 forbids per-material `envMapIntensity` overrides — so "env for reflections, hemisphere for irradiance" is not available either.

#### 7.2.4 Disposition — partition the dome, do not scale it

**Decision (proposed, needs ratification).** The sky is one object represented by two rigs that **partition its solid angle** rather than duplicate it:

| | carries | value |
|---|---|---|
| environment map | the part of the dome the rig actually covers | key rect radiance = `skyLux / PI`; the other two keep their current ratio to it |
| `hemisphereLight` | the rest of the dome | `skyLux × (1 − G / PI)` |

At hour 10 that is 5,840 nits on the key rect, 9,375 lx from the env (51.1%) and 8,971 lx from the hemisphere (48.9%), summing to `skyLux` exactly. The sky is counted once, and both halves are derived — the only measured input is `G`, which is a geometric constant of the rig.

Three properties make this the right shape rather than a compromise:

1. **It is the only option where both of §4.1's independent numbers hold at once.** `skyLux / PI` = 5,840 nits at hour 10 and 6,366 at noon, both inside the stated 5,000–8,000 clear-sky range. That the lux table and the nits table agree through `E = PI · L` is a check on the contract, not a coincidence arranged here.
2. **The rescale is one number, not three.** The panels' *ratios* encode the sky's shape and are kept; only the level moves, via `<Environment environmentIntensity>` → `scene.environmentIntensity`. That gives §7 the single owner it asks for, in the same way §2.2 gave exposure one.
3. **It makes the env hour-driven**, which it has never been. `skyLux` already varies with hour, weather and overcast; the env now inherits all of it, and night becomes dark.

**Dispositions, per rect. Nothing is deleted.**

| rect | outdoor role | disposition |
|---|---|---|
| key | sky dome, zenith region | survives, rescaled with the rig |
| coolSide | sky dome, horizon region | survives, rescaled with the rig |
| warmSide | warm horizon; the honest role is **ground bounce**, but it is above the horizon | survives, rescaled with the rig. Re-siting it below the horizon is a geometry change and is **not** in R2b — recorded as a known gap |

The audit found no rect that is the wrong *object*, so nothing meets the deletion bar. What was wrong is the **level** (5.85× on the key rect) and the **duplication** (the hemisphere light was carrying a full sky alongside it). The first is a rescale; the second is why the hemisphere light changes too.

**Studio.** The same partition rule applies with `STUDIO.fillLux` in place of `skyLux`. The defect is larger there, not smaller: the rig delivers 72,441 lx against a stated instrument budget of `keyLux + fillLux` = 26,000 lx.

**Forbids.** Rescaling the rig to make a frame look right rather than to satisfy `E = PI · L`. Forbids re-introducing a sun into the environment map — the directional light casts the shadows and an env sun would add a second, shadowless one. Forbids letting `hemisphereLight` and the env map both carry a full sky again; if the rig's geometry changes, `G` is re-measured and the partition re-derived.

#### 7.2.5 Instrument note — the probe over-reads, and gets fixed in R2b

The hour-0 probe reported ≈ 63,900 lx against the geometric 54,893. The probe averages **sRGB** pixel values over a 16 × 16 box and converts the mean afterwards. That transform is convex, so the mean of the converted values is below the converted mean: averaging in display space over any region with variance **overestimates** the linear value, which is the direction and roughly the size of the gap. The box also sits close enough to the chart's first sphere to pick up geometry that is not the bench top.

R2b accumulates in linear and probes a clear patch. Recorded because the R2b exit criterion is "the measurement lands near the analytically derived value", and an instrument with a known bias would otherwise be asked to confirm a derivation to a precision it does not have.

## 8. Deferred with a tripwire — ceilingless-by-design vs ceiling-hidden-for-viewing

### 8.1 The gap

The schema cannot distinguish a balcony (no ceiling by design) from a bedroom in cutaway (ceiling hidden for viewing). Both surface identically as "ceiling mesh not mounted."

Worse than the brief states: the render layer currently *derives* the distinction from geometry. `FloorMesh.tsx:177-180` omits ceiling geometry for any room touching a rail edge — so "is this room open to the sky" is inferred from railing adjacency inside a mesh builder. `Room` (`src/schema/scene.ts:179-185`) has no field for it. The nearest thing, `RoomFeatures.railWallCount` (`scene.ts:135`), is documented as a "strong outdoor (balcony/deck) signal" — but it is derived, not authored, and it is the same inference by another name.

**Deferred, per Dan's call.** Justified: in perspective mode a balcony taking direct sun is already correct, and in cutaway the §5 resolution suppresses the leak either way. No visible defect in M1.

### 8.2 Why it becomes load-bearing at M2

The failure mode is specific. If M2 derives per-room lighting by checking whether a ceiling mesh is mounted, a balcony and a cutaway bedroom are indistinguishable, and **interior lights will appear and disappear as the user toggles camera modes.** That is a real bug and a confusing one — the user changes how they are looking at the room and the room's lamps switch off.

### 8.3 The tripwire rule — free now, load-bearing later

**Decision.** **Lighting derivation reads scene schema, never runtime mesh mount state.** Any room property that lighting depends on — including whether a room has a ceiling — is a schema field, not a render-layer observation.

**Rationale.** Free at this stage because nothing derives lighting from rooms yet, and it costs one rule to state. It converts the M2 failure from silent to loud: M2 either finds the schema field or fails at the schema layer, where the problem is visible and fixable, instead of quietly coupling lighting to camera mode and surfacing as flickering lamps three milestones later. It is the same principle as §1.1 — make the dependency explicit while it is still cheap.

**Forbids.** Any lighting code reading `visible`, mesh mount state, `wallMode`, or the presence of a mesh in the scene graph as a proxy for a room property. Forbids re-deriving ceiling presence from `railWallCount` or rail-edge adjacency in lighting code — that is the same inference the render layer makes and it will diverge.

**Action now (one line, no behavior).** A TODO in `Room` (`src/schema/scene.ts:179-185`) marking where the field goes:

```ts
// TODO(M2 lighting): authored ceiling state — a room is roofed by design or open
// to the sky by design. Must be a schema field, never inferred from whether the
// ceiling mesh is mounted (that also goes false in cutaway) or from rail
// adjacency (that misses covered balconies). See docs/render-contract.md §8.
```

### 8.4 Known modelling gap, recorded, not for action

**Covered balconies — roofed but open-sided — have no representation.** The current model offers roofed-and-enclosed or open-and-unroofed, and the rail-adjacency inference at `FloorMesh.tsx:177-180` actively assigns covered balconies the wrong one. They are common in the target market (Israeli residential — the *mirpeset* is near-universal, and a large share are roofed by the balcony above). This will come back. Recorded here so that when the §8.3 field is designed, it is designed as ceiling state independent of wall/rail state, rather than as a boolean that bakes the conflation in again.

---

## 9. Open decisions — ratify before M1b

| # | Clause | Question | Resolution |
|---|---|---|---|
| 1 | §0.2 | Protected-paths exemption for the render workstream — `CLAUDE.md` rule 1 covers every file M1b touches | **RESOLVED** — Dan authorised M1b implementation. Contract values live in the new unprotected `src/render/`, keeping the protected diff to imports and references |
| 2 | §2.2 / §4 | **Conflict as briefed.** `ToneMappingEffect` has no exposure parameter and `renderer.toneMappingExposure` is unreachable under the composer | **IMPLEMENTED** — `RENDER_EXPOSURE = PI / 100000`, one global constant applied scene-referred at the lighting layer. Verified on the grey card: reads linear 0.150 against Neutral's designed 0.14. See `render-m1b-verification.md` §1 |
| 3 | §2.4 | Tone-mapping operator — confirm ACES or change | **IMPLEMENTED as Khronos Neutral.** Landed before any M1c baseline was captured, as required |
| 4 | §5 | Camera-mode presets vs depth-only ceiling proxy | **IMPLEMENTED as proxy + interim fill.** Verified: at noon in cutaway the interior stays dim while the lawn outside stays fully sunlit — the outcome the sun-suppression preset would have destroyed |
| 5 | §3.4 | Ceiling thickness — real slab, or documented zero-thickness exemption | **IMPLEMENTED as a real slab** (`MIN_CASTER_THICKNESS`, 0.12 m) after acne appeared exactly as predicted the moment the ceiling started casting. Acne signal 6.434 → 0.000 across the sweep |
| 6 | §7 | **Opened by M1c capture.** The IBL is still authored in the pre-§4 unitless intensities and measures as one of the largest lights in the scene | **RESOLVED at R2b/R4.** Dome partition (`envIntensityForSky`/`hemisphereLuxForSky`) replaces duplication; `docs/calibration/` re-captured against it, `perspective` cells frozen. See §7.1/§7.2 |
| 7 | §3.1 | **Opened by M1c capture, CLOSED at M1c-R — and M1c had it wrong.** r182 absorbed `PCFSoftShadowMap` into `PCFShadowMap`, which is now the soft filter; the candidates were never hard-shadowed | **RESOLVED.** §3.1 rewritten to name `PCFShadowMap`, with the migration-guide quote, the #32591/#32593 history, and measured penumbra widths (3.6 px against ~1.3 px for a hard step). Candidates salvageable on shadow grounds. New §0.3 pins the render-stack versions — the general fix for a contract that records names for behaviour |
| 8 | §1.3 | The assertion checks the right values one frame too early to see a value the renderer overwrites during its first shadow pass | **RESOLVED.** `RenderContractCheck` now asserts from the second `useFrame` call instead of a post-mount `requestAnimationFrame`, so the check runs after the first `gl.render` (and its shadow pass) has completed. `src/render/contract.test.ts` corrupts `gl.shadowMap.type`/`gl.toneMapping` and proves `assertRenderContract` throws in development |

**Riser panels — CLOSED.** `buildRiserGeometry` now produces a solid as thick as
the wall it continues, verified acne-free across the sun sweep against a purpose-
built fixture (`src/app/calibration/riserScene.ts`). No zero-thickness casters
remain in the codebase, so §3.4 holds everywhere.

**Opened by that fix, for Dan:** in every configuration a solid wall can produce,
the riser is geometrically coincident with the taller wall it seals — same
centreline, same thickness, same span — and is therefore redundant duplicate
geometry that doubles the shadow caster. A **portal**-kind boundary is the
plausible case where a riser is genuinely load-bearing, since a portal is open by
construction. Not changed on inference. See `render-m1b-verification.md` §6.

---

## Appendix — M1c, what was captured

Recorded here so the baseline set is defined by contract rather than by whatever was on screen. Full account in `docs/calibration/README.md`.

**Captured: 3 lighting presets × 3 camera modes = 9 cells**, from the `reference` rig at `/calibration`, at hour 10.0 clear, 1600×1000, headless SwiftShader. `docs/calibration/manifest.json` records every contract value in force per cell.

That is more than §5.4's "perspective only", and the difference is deliberate: **only the `perspective` cells are baselines in the sense §5.4 means** — the only mode any physical-correctness claim covers. The `cutaway` and `top` cells are captured so a regression in a legibility-first mode is still visible against something, and they are labelled as carrying recorded departures (`iblScale` 1.15 / 1.3, interim `interiorFillLux` 200 / 300, retiring at M2). Nothing about capturing them makes a correctness claim about them.

Each mode is shot from the camera that mode is actually used from — a single fixed camera would show nothing in `top`, which flattens walls to 0.32 m. Comparisons are therefore image-to-image within a cell, never across modes.

**The set is PROVISIONAL and the lighting model is NOT frozen.** §7.1 was found during capture: the IBL is still in pre-§4 units and contributes 53% of a lit horizontal surface and 83% of a shaded interior. Freezing would ratify that. The ruling on §9 row 6 comes first; the re-capture follows it.

Invalidated by any change to §2.4, §3.1, §3.2, §4, §7, or to the fixture and camera shots in `src/app/calibration/`.

---

## 10. M2 — interior lighting engine. FROZEN.

**Decision.** One ceiling-mounted `THREE.PointLight` per detected room (`src/render/roomLighting.ts`, mounted by `src/render/RoomLights.tsx`), physically authored, no placement UI, no per-room tuning.

**Position.** The room loop's pole of inaccessibility (`src/lib/rooms/poleOfInaccessibility.ts`, Mapbox's `polylabel` algorithm reimplemented rather than a new dependency), not the vertex-average centroid — the L-shaped fixture in `roomLighting.test.ts` demonstrates the centroid landing outside the room the pole stays inside. Height is the room's own ceiling height (mirrors `FloorMesh.tsx`'s per-room max-perimeter-wall-height rule, reimplemented locally since that logic isn't exported and this is a stable geometric fact, not the rail-adjacency *presence* question below), dropped `ROOM_LIGHT.dropBelowCeilingM` (0.15 m) for a flush-mount fixture rather than one buried in the slab.

**Intensity.** Derived, not tuned: `roomFixtureCandela(area, targetLux)` in `lightPresets.ts` treats the fixture as an isotropic source whose downward hemisphere (2π sr — the ceiling occludes the rest) delivers `targetLux` (300 lx, §4.1's own residential-ambient reference) averaged over the room's exact floor area, so `candela = targetLux * area / (2*PI)`. Converted through `toRenderIntensity` — the same single exposure owner as every other light (§2.2) — never a second exposure path. Two equal-area rooms get identical intensity by construction (`roomLighting.test.ts`); a large or elongated room reads brighter at its center and dimmer at its far corners, which is a stated limitation of one fixture per room, not a bug in the formula.

**Ceiling presence — the schema field §8.3 reserved.** `Room.ceiling?: "roofed" | "open"` now exists (`src/schema/scene.ts`). Lighting reads it, never rail edges or mesh state directly (§8.3's forbid). No authoring UI ships in M2, so `src/lib/rooms/roomCeiling.ts` provides `inferCeilingState` — the ONE place outside `FloorMesh.tsx`'s own mesh-builder check allowed to guess from rail adjacency when nothing is authored — and `resolveCeilingState`, which prefers the authored field. This is the single derivation, not a second copy that can diverge from the render layer's: `FloorMesh.tsx` keeps its own inline rail check for ceiling *geometry* (untouched, out of scope here); `roomCeiling.ts` is what lighting calls.

**Degenerate cases.**
- No ceiling (open by rail-adjacency guess or authored `"open"`) → no light. Verified: a rail-bounded balcony and an explicitly-authored-open room both get skipped even though only one of them would trip the geometric guess.
- Below `ROOM_LIGHT.minAreaM2` (1.5 m²) → no light. Closets, shafts, trace slivers.
- Open-plan space detected as one large face → still exactly one light, at its pole of inaccessibility, sized by its full area. No subdivision — that's future work if a room's area exceeds roughly 40 m², recorded here as the point a single fixture starts visibly underlighting the far end, the same style of tripwire as §3.2's cascade threshold.

**Shadow budget.** Point-light shadows are a 6-face cube map — 6x a directional pass. `ROOM_LIGHT.shadow.maxCasters` (3) room lights cast at a time, at `mapSize` 512 (vs. the sun's 2048): 3×6×512² ≈ 4.7M shadow-map texels/frame, the same order as the existing single 2048² directional pass (~4.2M) — a second pass of comparable cost, not a new dominant one. Selection is nearest-K to camera by world distance, re-ranked every 0.35 s (`RANK_INTERVAL_S` in `RoomLights.tsx`) rather than every frame: toggling `castShadow` forces three to recompile the affected materials' shadow variant, and doing that continuously for a light sitting near the rank boundary is worse than the rank being briefly stale. Every room light still contributes ordinary (non-shadow) illumination regardless of rank.

**Interim interior fill — retired.** `CAMERA_PRESETS.cutaway`/`.top`'s `interiorFillLux` is now 0 (`lightPresets.ts`) — rooms carry real fixtures, so the flat ambient stand-in this milestone was explicitly scoped to retire (§5.4, §9 row 4) is gone. The `<ambientLight>` branch stays in `Environment3d.tsx` (dead at `fill === 0`) so a future preset that genuinely needs a flat fill has the field rather than a new code path.

**Calibration parity — verified, not assumed.** `/calibration` (`src/app/calibration/page.tsx`) assembles its own Canvas tree directly from `Floors`/`Ceilings`/`Walls`/`Environment3d` — it never imports `Viewport.tsx` and therefore never mounts `RoomLights`. Re-captured `suburb-full` (the frozen `perspective` cell) against the committed M1c baseline: differs by the same order of magnitude (0.37-0.57% of channels, informed by two independent re-captures of the *unmodified* pre-M2 code differing from the committed baseline by a comparable amount) — i.e. ordinary SwiftShader capture-to-capture noise, not a regression. `cutaway`/`top` cells do change (the `interiorFillLux` retirement above) — expected, since only `perspective` carries a correctness claim (§5.4) and those cells were captured precisely so a deliberate departure like this one is visible, not to freeze them.

**Performance.** Measured via `@react-three/fiber`'s manual `advance()` (bypasses `requestAnimationFrame`, which browser automation backgrounds and throttles to near-zero — see `docs/calibration` tooling notes), 300-frame samples after a 30-frame warm-up, on a synthetic 3x2 grid (6 rooms, 16 walls) and a 4x4 grid (16 rooms):

| scene | frame avg | fps | p95 | max |
|---|---|---|---|---|
| 6 rooms, no lights (all `ceiling:"open"`) | 2.44 ms | 410 | 3.50 ms | 23.3 ms |
| 6 rooms, lights on (3 casting shadows) | 6.79 ms | 147 | 8.80 ms | 14.5 ms |
| 16 rooms, lights on (3 casting shadows, 13 non-shadow) | 12.10 ms | 83 | 13.4 ms | 16.4 ms |

Both the representative 6-room case and the 16-room stress case stay under the 16.6 ms / 60 fps budget on this dev machine (no dedicated GPU — SwiftShader-free, real WebGL). The 16-room number shows the *second*, undocumented cost axis: non-shadow-casting point lights still add per-fragment forward-lighting cost unboundedly with room count, on top of the capped shadow budget — fine at residential scale (the numbers above), a tripwire for very large multi-unit plans if one is ever loaded whole rather than floor-by-floor.

**Exit criteria.**
- Every detected room lit, no manual per-room intervention — yes, by construction (`computeRoomLights` iterates every room in the scene).
- Calibration scene matches its M1c baseline exactly — yes for the frozen `perspective` cells (verified above); `cutaway`/`top` change by the documented, pre-planned `interiorFillLux` retirement.
- Frame time within budget on a representative multi-room plan — yes, 6.79 ms avg / 8.80 ms p95 on a 6-room plan, well under 16.6 ms.

**Known, out-of-scope limitation.** A room lit only to ~150-300 lx by its own fixture, with no window and no other light source, renders very dark under this contract's single global exposure (calibrated to a ~100,000 lx noon sun, §2.2) — roughly 300-600x dimmer in absolute physical terms, and that ratio is real, not a bug in this milestone's formula (verified: the pre-M2 interim ambient fill at the same physical magnitude produced the same near-black result in the existing M1c `cutaway` baseline). Fixing the *look* would mean either a second, interior-scaled exposure regime or brighter-than-realistic fixtures tuned to compensate — both are §2.2/§2.4-level decisions this milestone does not have standing to make unilaterally. Recorded here as the next thing worth Dan's ruling if lit interiors need to read as "well lit" on screen rather than merely correctly dim.

---

## 11. M3 — materials. Spec lives in `docs/material-spec.md`.

The asset side of this contract is specified separately, because it governs what
gets *made* rather than what the renderer *does*. `docs/material-spec.md` (M3a)
is subordinate to this document and does not reopen any clause in it.

Two clauses here are discharged there rather than in this file:

- **§1.4** — GLB texture colour-space correctness, deferred to "the M3b
  validator". Material spec §5.1 carries the KTX2 decision the deferral was
  conditioned on, and names the cost (`toktx` must be installed) rather than
  letting it quietly become another WebP milestone.
- **§7 / §2.4's family of forbids** — the material spec's conformance test
  (§7 there) is what enforces them from the asset side: an asset is accepted
  only if the nine calibration cells differ inside the candidate slot and
  nowhere else, with a `git diff` proving no lighting file was touched.

One pre-existing violation of **§7** was found while writing the spec and is
**not fixed here**: the glass material in `WallMesh.tsx` carries
`envMapIntensity: 1.4`, a per-material env-map override this section forbids by
name. It predates the clause. It is scheduled into M3c because removing it
changes every captured cell containing the slider, and that is a deliberate
re-capture, not a drive-by edit.

**Known, out-of-scope limitation (M2).** A room lit only to ~150-300 lx by its own fixture, with no window and no other light source, renders very dark under this contract's single global exposure (calibrated to a ~100,000 lx noon sun, §2.2) — roughly 300-600x dimmer in absolute physical terms, and that ratio is real, not a bug in this milestone's formula (verified: the pre-M2 interim ambient fill at the same physical magnitude produced the same near-black result in the existing M1c `cutaway` baseline). Fixing the *look* would mean either a second, interior-scaled exposure regime or brighter-than-realistic fixtures tuned to compensate — both are §2.2/§2.4-level decisions this milestone does not have standing to make unilaterally. Recorded here as the next thing worth Dan's ruling if lit interiors need to read as "well lit" on screen rather than merely correctly dim.

---

## 12. Post-M2 — fixture placement, and Dan's brightness ruling

M2 above is unchanged: `computeRoomLights`'s candela formula, the single global exposure, and the shadow budget are all still exactly as specified. What changed is what feeds position/brightness/color into that formula.

**Fixtures are real, placeable, visible objects now.** `FixtureItem` (`src/schema/scene.ts`, additive) carries a `mount` (`{kind:"ceiling",x,y}` or `{kind:"wall",wallId,offset,sill,side}` — the latter mirrors `Opening`'s own `wallId`+`offset` anchoring), placed/dragged/deleted through `src/viewport3d/FixtureLayer.tsx` exactly like furniture, with a small procedural catalog (`src/fixtures/catalog.ts` — flush disc, pendant, wall sconce; GLBs are later work, not this pass). `seedRoomFixtures` (`src/fixtures/seedRoomFixtures.ts`) gives every eligible room one default fixture the first time a scene exists, so M2's "every room lit by construction" exit criterion holds for a fresh scene — but past that first seed, fixtures are fully authoritative: a room a user has emptied of fixtures stays dark, no silent fallback. `computeRoomLights` reflects this — see `roomLighting.ts`'s own doc comment, not restated here.

**Brightness and color are now per-fixture, not room-wide constants.** `FixtureItem.targetLux`/`colorK` (undefined = `DEFAULT_FIXTURE_LUX`/`DEFAULT_FIXTURE_COLOR_K`, `lightPresets.ts`), each editable via a plain range slider in `Viewport.tsx`'s `MiniInspector` (intentionally minimal — that UI is expected to get a real overhaul later, so this pass didn't invest past two `<input type="range">`s).

**`DEFAULT_FIXTURE_LUX` = 1500, not `ROOM_LIGHT.targetLux`'s frozen 300.** This is Dan's ruling on the exact gap the M2 caveat above flagged — reached after seeing a seeded scene on screen and asking for it "much brighter." `ROOM_LIGHT.targetLux` stays 300 and FROZEN as the physically-derived M2 reference point; `DEFAULT_FIXTURE_LUX` is a deliberate, separate, higher default scoped to interactive fixtures only. 5x is still nowhere near closing the documented 300-600x gap to the sun-calibrated exposure — actually closing that ratio is still the §2.2/§2.4-level exposure decision M2 reserved for later, untouched here. This just makes a default fixture read as "on."

**Wall-mount room attribution is geometric, not authored.** A wall fixture's `side` (`"a"`/`"b"`, same convention as `Wall.paintA`/`paintB`) determines which of a wall's two rooms it lights: `resolveFixtureWorldXY` (`roomLighting.ts`) pushes the fixture's position off the wall's centerline along that side's outward normal, and whichever room's polygon contains the resulting point is the one that gets the light — reusing the exact same point-in-polygon test ceiling fixtures use, no separate wall-to-room lookup to maintain.

**Second pass: `DEFAULT_FIXTURE_LUX` 1500 wasn't enough either, and intensity alone can't fix it.** Dan's screenshot after the first pass still read as too dark. The reason isn't "not enough lux" so much as `ROOM_LIGHT.decay = 2` (`THREE.PointLight`'s inverse-square falloff, the M2 choice) fixing the near-fixture/far-corner brightness *ratio* independent of intensity — raising intensity moves both ends of that ratio together, so a value that lit the far corner acceptably was blowing out the wall right next to the fixture. **Decay dropped to 1** (contract.ts, documented there) is the change that actually addresses "far corner too dark" instead of fighting the symptom with a bigger number; `DEFAULT_FIXTURE_LUX` also went to 3000 (10x the frozen reference now) and the strength slider's range to 200-20000, so the two compound rather than either alone trying to do the whole job. Both remain scoped to interior point lights only — nothing about the sun, sky, IBL, tone mapping, or shadow *type* changed.

**Third pass: shadow quality, once brightness stopped being the complaint.** Next screenshot's feedback — lamp shadows "spikey"/hard, and visibly not blending with the sun's shadow. `ROOM_LIGHT.shadow.maxCasters` (3 → 1, contract.ts): with 2-3 nearby lamps each casting off the same object, the result was multiple hard-edged shadows fanning out in different directions — the "spikey" look, an inherent overlapping-cube-map artifact, not a ranking bug. One caster gives one clean shadow per object. `mapSize` 512 → 1024 and a new `radius: 6` (PCF blur, wired as `shadow-radius` on the JSX point light, `RoomLights.tsx`) soften that one shadow's edge instead of leaving it hard and low-res. **What this does not do:** make a lamp's shadow point the same direction as the sun's, or otherwise merge two physically distinct light sources into one shadow — that's not a bug this can fix, it's what two real light sources actually do. Softening the lamp shadow is what lets it read as gentle fill next to the sun's dominant hard shadow instead of a second competing hard one; it doesn't and can't erase the fact there are two of them.
