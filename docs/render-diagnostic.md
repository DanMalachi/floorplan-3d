# M0 Render Diagnostic

Read-only audit. No code changed. Repo state at time of audit: `three@^0.185.0`, `@react-three/fiber@^9.6.1`, `@react-three/drei@^10.7.7`, `@react-three/postprocessing@^3.0.4`. Scene code: `src/viewport3d/`.

## 1. Renderer config (as-is)

Single `<Canvas>`, `src/viewport3d/Viewport.tsx:1234-1244`.

| Setting | Value | Where | Note |
|---|---|---|---|
| `shadowMap.type` | `THREE.PCFShadowMap` | `Viewport.tsx:1235` (`shadows={{ type: THREE.PCFShadowMap }}`) | Plain PCF. Not `PCFSoftShadowMap`, not VSM. |
| shadow map resolution | `2048×2048`, per-light | `Environment3d.tsx:106,121` (`shadow-mapSize={[2048,2048]}`) | No global default; set on each directional light instance. |
| renderer tonemapping | disabled (`flat` prop) | `Viewport.tsx:1239` | Comment on line 1237-1238 states this is deliberate — avoids double tonemapping since ACES runs in the postprocessing chain instead. |
| tonemapping (actual) | ACES Filmic, via postprocessing | `Viewport.tsx:1300` — `<ToneMapping mode={ToneMappingMode.ACES_FILMIC} />` inside `<EffectComposer>` (1294-1302) | |
| `toneMappingExposure` | never set | grep empty repo-wide | Moot on the renderer since tonemapping is `flat`; the postprocessing `ToneMapping` effect uses its own default exposure, also never overridden. |
| `outputColorSpace` | never set explicitly | grep empty repo-wide | Relies on R3F v9 / three 0.185 default (`SRGBColorSpace`). Implicit, not asserted anywhere. |
| `THREE.ColorManagement.enabled` | never referenced | grep empty repo-wide | Implicit default (`true`) only. |
| antialiasing | `antialias` key absent from `gl={{ preserveDrawingBuffer: true }}` → default `true`; MSAA explicitly disabled in composer (`multisampling={0}`, `Viewport.tsx:1294`); `<SMAA />` used instead (`Viewport.tsx:1301`) | `Viewport.tsx:1241,1294,1301` | Final AA is SMAA-only, not MSAA. |
| pixel ratio | never touched — no `dpr` prop, no `setPixelRatio` anywhere | grep empty repo-wide | R3F default `dpr={[1,2]}` applies implicitly. |

Second, unrelated `WebGLRenderer` for offscreen furniture thumbnails: `src/furniture/thumbnails.ts:21` (`antialias: true, alpha: true`). No shadow map, no colorSpace, no toneMapping set there — separate render path, out of scope for the interactive viewport bug but worth knowing it exists.

**Bottom line:** every color-management-critical setting (`outputColorSpace`, `ColorManagement.enabled`, exposure) is running on library defaults, asserted nowhere in code. That's fragile — a three.js version bump changing a default silently changes the whole app's look with no compile error and no diff to review.

## 2. Texture color-space audit

| File:Line | Map slot | colorSpace | Correct? |
|---|---|---|---|
| `materials/loader.ts:62-63` | `map` (floor albedo) | `SRGBColorSpace` | ✅ |
| `materials/loader.ts:66-67` | `normalMap` (floor) | `NoColorSpace` | ✅ |
| `materials/loader.ts:70-71` | `roughnessMap` (floor) | `NoColorSpace` | ✅ |
| `viewport3d/textures.ts:189-190` | `map` (procedural floor) | `SRGBColorSpace` | ✅ |
| `viewport3d/textures.ts:192-193` | `normalMap` (procedural floor) | `NoColorSpace` | ✅ |
| `viewport3d/environment/City.tsx:96-99` | `map` + `emissiveMap` (skyline facade) | `SRGBColorSpace` (both) | ✅ (both are color data) |
| `viewport3d/environment/Suburb.tsx:142-144` | `map` (house facade) | `SRGBColorSpace` | ✅ |

**No incorrect tagging found.** Every explicit `.colorSpace` assignment in the codebase is correct — color maps sRGB, data maps linear. The failure mode the task asked me to hunt for (normal/roughness/metalness/AO tagged sRGB) does not exist in this codebase today.

**Gap, not a bug per se:** furniture GLTFs (all IKEA + BlenderKit models, loaded via `useGLTF` in `FurnitureLayer.tsx:91`, and thumbnail GLBs in `furniture/thumbnails.ts:10,30-31`) never have `.colorSpace` touched anywhere in app code. Correctness for ~all shipped furniture assets depends entirely on `GLTFLoader`'s built-in auto-tagging (baseColor/emissive → sRGB, normal/ORM → linear, per glTF spec) — nothing in-app verifies or overrides it. Worth a spot-check against a few actual furniture GLBs before trusting it long-term, but out of scope for this pass.

## 3. Light inventory

All in `src/viewport3d/environment/Environment3d.tsx`.

**Outdoor/"sun" preset:**
```
hemisphereLight  intensity = s.hemiIntensity   (computed, see below)
directionalLight intensity = s.sunIntensity    (computed, see below)  castShadow, shadow-mapSize 2048², bias -0.0002, normalBias 0.02
```
**Studio/"none" preset (fixed key light):**
```
hemisphereLight  intensity = 0.55   (Environment3d.tsx:115)
directionalLight intensity = 2.1    (Environment3d.tsx:119)  castShadow, shadow-mapSize 2048², bias -0.0002, normalBias 0.02
```

Computed values, `computeSky()` (`Environment3d.tsx:19-42`):
- `sunIntensity = night > 0.5 ? 0.3 : 0.4 + 2.0 * day` → range ≈ 0.3–2.4
- `hemiIntensity = 0.16 + 0.5 * day` → range ≈ 0.16–0.66

Plus a drei IBL rig (not classic lights but contributes to lighting): `Environment3d.tsx:131-135`, three `<Lightformer>` rects, intensities 1.2/1.6 (outdoor variant), 0.7, 0.55.

Separate light pair used only by the offscreen thumbnail renderer (`furniture/thumbnails.ts:36-37`): `HemisphereLight` intensity 1.35, `DirectionalLight` intensity 1.6. Not part of the interactive scene.

**Legacy vs. physical units:** no code evidence either way — zero occurrences of `physicallyCorrectLights`, `useLegacyLights`, or any lumens/watts/physical-unit comment anywhere in `src`. The magnitudes present (0.16–2.4 for hemisphere/directional, not old-style flat `intensity={1}` values) are *consistent with* having been eyeballed against three's current physically-correct-by-default lighting (standard since r155), but there's no explicit statement of intent in the code — this was tuned empirically by eye, not derived from a stated physical model. Flag this if intensities ever need to be ported to a different renderer/engine, since there's no documented basis to port from.

## 4. Shadow flags by mesh category

| Category | castShadow | receiveShadow | File:Line |
|---|---|---|---|
| Floor | — | ✅ | `FloorMesh.tsx:72` |
| **Ceiling** | **—** | ✅ | `FloorMesh.tsx:252` |
| Ceiling riser panel | — | ✅ | `FloorMesh.tsx:255` |
| Wall body | ✅ | ✅ | `WallMesh.tsx:343-344` |
| Baseboard trim | ✅ | ✅ | `WallMesh.tsx:364-365` |
| Door/window joinery (frame/leaf/mullion/handle/threshold/track) | ✅ | ✅ | `WallMesh.tsx:674-675` |
| Door/window glass pane specifically | — | — | `WallMesh.tsx:674` (`castShadow={p.role !== "glass"}` excludes it) |
| Balcony rail handrail cap | ✅ | — | `WallMesh.tsx:944` |
| Balcony rail glass panel | — | — | `WallMesh.tsx:940` (explicit comment: "no shadow, Three casts opaque shadows for glass") |
| Furniture (IKEA + BlenderKit + generic, all GLTF meshes) | ✅ (forced, unconditional) | ✅ (forced, unconditional) | `FurnitureLayer.tsx:59-60` |
| Furniture placeholder box (missing GLB fallback) | ✅ | ✅ | `FurnitureLayer.tsx:133` |
| Stairs | ✅ | ✅ | `StairMesh.tsx:258-259` |
| Studio ground disc | — | ✅ | `Environment3d.tsx:144` |
| City tower / roof deck | — | ✅ | `City.tsx:223,226` |
| Suburb ground/lawn | — | ✅ | `Suburb.tsx:514` |

Only structural categories with no `castShadow` anywhere: floor (expected — floors don't need to cast) and **ceiling** (not obviously expected — see §5).

## 5. Sun-through-ceiling bug: hypotheses tested against raw evidence

| # | Hypothesis | Test | Result |
|---|---|---|---|
| 1 | Ceiling mesh has `castShadow = false` | Read `FloorMesh.tsx:252`: `<mesh … material={mat} receiveShadow />` | **TRUE.** No `castShadow` prop at all on the ceiling mesh. This alone is sufficient to fully explain the symptom — a mesh that never casts a shadow can never block light in the shadow map, regardless of anything else. |
| 2 | Ceiling excluded from scene graph / `visible=false` in some camera modes | Read gating logic `FloorMesh.tsx:248`: `if (!show || wallMode !== "full") return null;` where `show = showCeilings` toggle, `wallMode` store state. Also `FloorMesh.tsx:177-180`: rooms touching a rail edge (balconies) get **no ceiling geometry generated at all**, `continue`d out of the loop. | **TRUE, and compounding.** Ceiling is entirely unmounted (not just hidden) outside Full wall-mode + Ceilings toggle on, and balcony-adjacent rooms never get ceiling geometry in the first place. Even if `castShadow` were fixed, ceilings would still be absent from the shadow map in Cutaway/Top camera modes and over any balcony-adjacent room. |
| 3 | Ceiling single-sided, winding faces away from sun | Read material `FloorMesh.tsx:221-230`: `side: THREE.DoubleSide`. Winding comes from `buildFloorGeometry` (`triangulateFloor.ts:9-32`, shared with floor), normals via `computeVertexNormals()`. | **RULED OUT as a contributing cause.** Material is explicitly `DoubleSide`, so face-winding direction can't hide the ceiling from a shadow-casting pass in the way it could with `FrontSide`. Moot anyway since the mesh doesn't cast at all (see #1). |
| 4 | Directional light shadow-camera frustum doesn't enclose the ceiling | Read `Environment3d.tsx:80,110`: `shadow = span*0.9+4`, frustum `[-shadow, shadow, shadow, -shadow, near=0.5, far=span*6]`. Compared against ceiling height (`c.height`, default `WALL_HEIGHT = 2.4` from `schema/constants.ts:3`, or custom per-wall). | **RULED OUT.** `span` is the model's horizontal footprint (tens of meters typically), so the ±shadow XY box and the 0.5→span*6 depth range comfortably contain a ~2.4 m ceiling plane. Frustum sizing is not the limiting factor. |
| 5 | Shadow bias/normalBias punching through thin geometry | Read `Environment3d.tsx:107-108,122-123`: `shadow-bias={-0.0002}`, `shadow-normalBias={0.02}`, identical on both light presets. | **RULED OUT as primary cause, can't fully rule out as secondary.** These are unremarkable, small values — not obviously misconfigured to punch through a plane. But since the ceiling never casts a shadow in the first place (#1), there is no shadow-map depth write to punch through yet; this hypothesis is currently untestable in isolation and moot until #1 is fixed. Revisit once `castShadow` is added, since a zero-thickness plane (#6) combined with bias tuned for wall thickness could still cause light leakage even after the primary fix.
| 6 | Ceiling is a zero-thickness plane, depth precision fails | Read `FloorMesh.tsx:199` (`buildFloorGeometry(loop)`, same function used for the floor slab) and `triangulateFloor.ts:9-32`: single Y-value triangulation, no extrusion, positions pushed as `(x, 0, y)` then translated via the mesh's `position={[0, c.height, 0]}`. | **TRUE — confirmed zero-thickness.** Ceiling is a single triangulated plane, not a box. Not itself sufficient to explain the bug (thin shadow casters are normal and workable with correct bias — see thin walls/floor, which don't have this problem), but it's a latent risk once `castShadow` is enabled: the same bias values tuned against wall body thickness may not suit a true zero-thickness plane, and self-shadowing/acne or light leakage at the ceiling plane should be specifically checked for at that point. |

### Root cause

**Primary, sufficient cause: ceiling mesh never sets `castShadow` (`FloorMesh.tsx:252`).** This alone fully explains "sun shines through the roof, no shadow is cast" — a non-casting mesh is invisible to the shadow map no matter how correct its geometry, frustum coverage, or bias are.

**Compounding cause, independent of the above: ceiling is conditionally absent from the scene graph** (`FloorMesh.tsx:248,177-180`) in Cutaway/Top camera modes and for any balcony-adjacent room. Fixing `castShadow` alone will only restore shadowing in Full wall-mode with the Ceilings toggle on, over non-balcony rooms — the other cases will still leak light through the roof because there's no ceiling mesh present to cast in the first place.

**Latent, not yet triggered:** zero-thickness plane geometry (#6) combined with bias values seemingly tuned for wall-thickness geometry — flag for a follow-up check once `castShadow` is added, since it's the kind of thing that produces shadow acne or leakage only after the primary bug is fixed and the ceiling starts actually appearing in the shadow map.

This is a "one primary + one compounding" finding, not a single isolated root cause — fixing `castShadow` alone is necessary but not sufficient for full correctness across all camera modes and room types.

## 6. Transparency inventory

| File:Line | Material | transparent/opacity/alphaTest/transmission | Category | castShadow on that mesh |
|---|---|---|---|---|
| `WallMesh.tsx:529-536` | `glass` joinery role | `transparent: true`, `opacity: 0.22` | Door/window glass pane | **false** (`WallMesh.tsx:674`, explicitly excluded by role) |
| `WallMesh.tsx:576-578` | Joinery materials, mutated at runtime during cutaway fade | `transparent` forced true; `opacity = baseOpacity[role] * o` | All door/window joinery, opacity-animated in Cutaway mode | Same exclusion as above — non-glass roles keep casting, glass doesn't |
| `WallMesh.tsx:158-171` | Wall body (`neutral/matA/matB`) | `transparent: true`, `opacity` animated 1 → ~0.13 in cutaway | Wall body | **true**, unconditionally (`WallMesh.tsx:343`) — a wall faded to ~13% opacity in cutaway view still casts a full-strength shadow |
| `WallMesh.tsx:181-190` | `baseboardMat`, animated with wall | `transparent: true` | Baseboard trim | **true** (`WallMesh.tsx:364`), same issue as wall body |
| `WallMesh.tsx:841-850` | Balcony rail glass panel | `transparent: true`, `opacity: 0.22` | Balcony/rail glass | **neither** flag set at all (`WallMesh.tsx:940`); comment explains why (line 939) |
| `WallMesh.tsx:1017-1029` | `band` (selection/hover highlight overlay) | `transparent: true`, `opacity` animated 0.42–0.95 | UI overlay, not a building element | N/A, no shadow flags, `depthWrite: false` |
| `FurnitureLayer.tsx:67-71` | Any furniture material, when placement-ghost `opacity` prop passed | `transparent: true`, variable opacity (e.g. 0.55 ghost) | Furniture placement preview | **true/true forced** at normalize-time (`FurnitureLayer.tsx:59-60`), set *before* the opacity mutation and never revisited — a semi-transparent drag-preview ghost still casts an opaque shadow |
| `FurnitureLayer.tsx:135-141` | `PlaceholderBox` | conditional `transparent`, `opacity` | Placeholder/missing-GLB fallback | unconditional `castShadow receiveShadow` (`FurnitureLayer.tsx:133`) regardless of opacity |
| `Rain.tsx:54` | Rain particle lines | `transparent: true`, `opacity: 0.34` | Weather VFX | N/A, line geometry, no shadow props |

**No `alphaTest` usage anywhere in `src`.** **No `transmission` usage anywhere** — there is no `MeshPhysicalMaterial`-based physical glass in this codebase; every "glass" surface (windows, doors, balcony rails) is `MeshStandardMaterial` + low `opacity` + `transparent: true`.

**Correctly handled:** dedicated `glass` joinery role and the balcony rail glass panel are both excluded from shadow casting.

**Not handled — worth flagging even though this milestone is diagnostic-only:** wall body/baseboard during cutaway fade, and the furniture placement ghost, both keep full-opacity shadow casting while visually faded to near-transparent. Not part of the sun-through-ceiling bug, but the same category of problem (a mesh's shadow behavior not tracking its visual opacity) and likely worth a shared fix pass once shadow work starts.

---

**Scope note:** this document is diagnostic only, per M0 instructions. No code was changed. Root-cause fix (adding `castShadow` to the ceiling mesh, deciding what should happen for balcony/cutaway/top-mode ceiling absence) is M1+ work.
