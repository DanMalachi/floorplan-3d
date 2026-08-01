# Render Contract

Status: **M1a — proposed, awaiting ratification.** Nothing here is implemented. Successor to `docs/render-diagnostic.md` (M0 findings), which this document turns into law.

Every clause below has three parts: the **decision**, the **rationale**, and what it **forbids**. The forbidding half is the point — a clause with no prohibition is a note, not a contract.

Three clauses are flagged **OPEN** and need Dan's ruling before M1b: §2.4 (tone mapping operator), §4/§2.2 (an unresolvable conflict between physical light units and the current exposure path), and §5 (I disagree with the stated preset decision after reading the cutaway implementation, as invited). They are collected in §9.

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

**Decision.** `src/render/contract.ts` exports `assertRenderContract(gl)`, called once from the Canvas `onCreated`. It compares live renderer state against the recorded contract and **throws** on mismatch in development. In production it logs one `console.error` and continues.

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

### 3.1 Type: PCFSoft

**Decision.** `THREE.PCFSoftShadowMap`.

**Rationale.** Plain PCF gives hard, stair-stepped shadow edges. At the texel densities this scene actually runs at (§3.2) that aliasing is visible on exactly the shadows that matter most — long straight wall and window-mullion shadows falling across a floor, where the eye tracks a continuous line and reads every jag. PCFSoft's wider bilinear-weighted kernel costs additional texture fetches in the shadow lookup and nothing else: no extra pass, no extra memory, no architectural change. For an architectural interior renderer it is the standard choice and the cost is the cheapest quality win available in this milestone.

**Forbids.** VSM (light-bleed through thin geometry is disqualifying for a scene built from thin walls, and it interacts badly with the zero-thickness ceiling of §3.4). Forbids `BasicShadowMap`. Forbids changing type after M1c without re-capturing baselines.

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

---

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

## Appendix — what M1c must capture

Recorded here so the baseline set is defined by contract rather than by whatever was on screen. Baselines are captured in `perspective` mode only (§5.4), after items 3 and 4 above are settled (§2.4, §5), and are invalidated by any change to §2.4, §3.1, §3.2 or §4.
