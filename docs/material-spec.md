# Material Spec — M3a

Status: **M3a. Spec only — nothing here is implemented yet.** M3b builds the
ingest pipeline that enforces it; M3c ships the first material set through it.

Companion to `docs/render-contract.md`, and subordinate to it. Where the render
contract says how the *scene* is lit, this says what an *asset* must be so that
it reads correctly under that lighting without the lighting being changed for
it. Same shape as the render contract: every clause is a **decision**, a
**rationale**, and what it **forbids** — the forbidding half is the point.

The one-sentence version: **a material is data about a surface, not a picture
of a surface in a room.** Every clause below is a consequence of that.

---

## 0. Scope, and the two things this exists to prevent

Covers every surface the product renders: architecture (walls, floors,
ceilings, doors, windows) and the loaded-GLB furniture catalogs (IKEA,
BlenderKit). Covers texture content, authoring ranges, resolution, UV mapping,
compression, naming, and the acceptance test.

Does not cover light values (render contract §4/§7), the tone-mapping transform
(§2), or shadow behaviour by class (§6/`src/render/materialClass.ts`). Those are
settled and this document does not reopen them.

**Failure mode 1 — the asset that needs the lighting changed.** An asset with
lighting baked into its albedo looks right under exactly the setup it was baked
against and wrong everywhere else. The natural response is to adjust the
lighting until it looks right, which is forbidden by render contract §2.4 and
§4.1, and which breaks every asset that was correct. §1 is the whole answer to
this and it is the most important clause in this document.

**Failure mode 2 — the density lottery.** Texel density on the 16 shipped
floors ranges from **410 to 2276 px/m** (median 602) — measured, `1024 /
coverM` over `data/materials-floors.manifest.json`. Nobody chose that spread.
Every material was encoded at a fixed 1024², so density is whatever the
material's physical size made it. §3 inverts that: density is authored,
resolution is derived.

---

## 1. Albedo carries no light — the load-bearing clause

### 1.1 The rule

**Decision.** An albedo (base-colour) map contains **surface reflectance only**.
No baked direct light, no baked ambient occlusion, no baked shadow, no baked
gradient, no baked highlight, no baked contact darkening, no vignette.

Diffuse reflectance, expressed as linear albedo, stays inside **0.03–0.90**.
Nothing in a home is darker than charcoal (~0.03) or brighter than fresh snow
(~0.90); an albedo pixel outside that band is either baked light or baked
shadow, since real pigment cannot get there.

Reference values for the classes this product ships: white painted plaster
0.75–0.85, off-white 0.70, mid-grey 0.20, oak 0.25–0.35, walnut 0.08–0.12,
concrete 0.25–0.35, white tile 0.75, terracotta 0.20, black gloss tile 0.04.

**Rationale.** The renderer's whole job is to compute light × reflectance. An
albedo that already contains light makes the renderer compute light² over part
of the surface, and there is no lighting setup under which that is correct — it
is only *less visibly wrong* under the setup it was baked from. This is why the
symptom presents as "the asset looks fine in the studio preset and dead in the
suburb preset": the baked lighting is fighting a different sun.

The value band is what makes the clause checkable rather than aspirational. A
human cannot look at a texture and say whether an ambient-occlusion pass was
multiplied into it; a histogram can say that 8% of pixels sit below linear 0.02,
which no real material does.

**Forbids.** Multiplying an AO, cavity, curvature or light-map pass into the
albedo at any stage of authoring or ingest. Forbids "just a little" — a 20%
bake is 20% of the defect and it is not detectable by eye at review time, which
makes it worse than an obvious one. Forbids darkening an albedo to make an
asset sit better in a frame; if it sits wrong, the light is wrong or the
roughness is wrong (§2), and §2.4 of the render contract already forbids fixing
either with exposure. Forbids sourcing an albedo from a photograph of the
material *in situ* without delighting it — that photo is light × reflectance by
construction.

### 1.2 Occlusion is a separate channel, and it is a local term

**Decision.** Ambient occlusion ships in its own channel (§6's ORM packing, R),
never in the albedo. It represents **only** occlusion at a scale below the
geometry — the crevices between tiles, the weave of a carpet, the gap under a
sofa cushion. `aoMapIntensity` stays at 1.0.

Object-scale occlusion is not baked at all. The renderer computes it: N8AO runs
in the composer (render contract §2.3) and shadow maps handle the rest.

**Rationale.** Three's `aoMap` multiplies the *indirect* diffuse term only — it
does not darken direct light, which is physically what ambient occlusion means.
That is why the same darkening in the albedo is wrong: albedo multiplies
everything, including the sunbeam, so a baked crevice stays dark in full sun
where the real crevice is not.

Cutting the scale line at "below the geometry" is what keeps AO from
double-counting N8AO. An asset that bakes its own object-scale AO gets it twice
— once from the map, once from the screen-space pass — and the seat of a chair
turns to soot.

**Forbids.** Baking object-scale AO into the AO channel. Forbids `aoMapIntensity`
as a per-asset look knob — it is the same untracked-multiplier defect as
`envMapIntensity` in render contract §7, one level down. Forbids an AO map on a
flat surface with no sub-geometry relief; a wall's AO channel is a constant 1.0
and packs to nothing.

### 1.3 The delight escape hatch, and its bar

**Decision.** A source asset with baked lighting may be **delighted** and
ingested, or **rejected**. It may not be ingested as-is. The delight step runs
in M3b, is recorded per asset in the manifest, and the result faces the same
histogram check as any other albedo — the escape hatch does not lower the bar,
it just names a way over it.

**Rationale.** Most free PBR sources are clean; most photogrammetry and a
meaningful share of archviz assets are not. Refusing all of the latter loses
real catalog breadth, and accepting them silently loses the whole spec. Naming
delight as a step with the same exit bar is the only option that keeps both.

**Forbids.** Recording an asset as delighted without re-running the check.
Forbids a per-asset exemption from §1.1's band — the exemption path is delight
or rejection, and "this one is fine" is neither.

---

## 2. Roughness and metalness — authoring convention and ranges

### 2.1 Convention

**Decision.** glTF metallic-roughness, the convention the product already
consumes. Roughness is **perceptually linear** (the glTF/UE4 convention: sampled
value `r`, GGX alpha = `r²`), not squared-at-author-time. Metalness is
effectively **binary** — 0 or 1 — and intermediate values exist only to blend
across a boundary in a mixed-material texel.

Base scalars multiply their maps (`material.roughness × roughnessMap.g`), so an
asset ships either a scalar or a map-with-scalar-1.0, never a tuned scalar
correcting a map. `FloorMaterial.roughness` in the current registry is the
scalar-alongside-map form and is compliant.

**Rationale.** Perceptually-linear roughness is what every authoring tool
(Substance, ambientCG, Blender's Principled BSDF) and glTF itself export, and
three's `MeshStandardMaterial` expects. Deviating means every source asset needs
a conversion nobody will remember to apply.

Binary metalness is not a simplification — it is what metalness *is*. A material
is either a conductor or a dielectric; there is no such thing as 40% metal. A
mid-grey metalness map is the signature of a source asset that used it as a
"shininess" slider, and it produces the characteristic washed-out plastic look
because the dielectric specular and the conductor tint are being averaged.

**Forbids.** Squaring roughness at author time (double-squares at render).
Forbids metalness between 0.1 and 0.9 outside a boundary blend — the M3b
validator flags a metalness histogram whose mass sits in the middle. Forbids
`MeshPhongMaterial`/`MeshLambertMaterial` for any shipped surface: they are not
energy-conserving and cannot be authored against these numbers.

### 2.2 Ranges by surface class

**Decision.** An asset's roughness must land in its class's band. The bands are
authoring law, not defaults.

| Surface class | Roughness | Metalness | Notes |
|---|---|---|---|
| Matte painted plaster (walls, ceilings) | 0.80–0.95 | 0 | Current wall material is 0.85 — compliant |
| Eggshell / satin paint | 0.45–0.65 | 0 | |
| Raw / sealed concrete | 0.65–0.90 | 0 | |
| Matte ceramic / porcelain tile | 0.30–0.50 | 0 | |
| Polished / glazed tile, gloss lacquer | 0.05–0.15 | 0 | |
| Oiled or matte hardwood | 0.45–0.70 | 0 | |
| Lacquered hardwood | 0.15–0.35 | 0 | |
| Natural stone, honed | 0.35–0.60 | 0 | |
| Carpet, upholstery, textile | 0.85–1.00 | 0 | Current carpets are 0.95 |
| Brushed metal hardware | 0.30–0.45 | 1 | Current handle is 0.35 / 0.85 — **metalness out of band**, see below |
| Polished chrome | 0.02–0.10 | 1 | |
| Anodised aluminium (window frames, tracks) | 0.35–0.50 | 1 | Current track is 0.40 / 0.70 — **metalness out of band** |
| Glass | 0.00–0.10 | 0 | Dielectric. Current glass is 0.10, at the ceiling. Non-casting by render contract §6.1 |

**Rationale.** The bands are the point at which "make it look right" becomes
"look up the number", which is exactly what render contract §4.1 did for lights
and for the same reason: eyeballed values do not compose. Two independently
tuned materials in one frame have no defined relationship, so adding a third
means retuning all of them.

They also make a specific class of asset defect visible on ingest. A source
sofa arriving at roughness 0.4 is not a stylistic choice — it is an archviz
asset authored for a different renderer, and it will read as vinyl.

**Three existing violations are real and are M3c's, not M3a's.** Two are metal:
the hardware in `WallMesh.tsx` (handle metalness 0.85, track 0.70) sits in
exactly the forbidden middle band §2.1 describes. Currently invisible, because
those parts are millimetres on screen and carry no map.

The third is not a roughness problem at all: the glass material carries
`envMapIntensity: 1.4`, a **per-material environment-map multiplier**, which
render contract §7 forbids by name. It predates that clause. It matters more
after R2b than before, because the env map is now on a physical budget and a
1.4× override on one material is a 40% untracked departure from it. Recorded
here rather than changed on sight — removing it changes every captured cell that
contains the slider, so it is a deliberate M3c change with a re-capture, not a
drive-by.

**Forbids.** An asset outside its class band without a recorded, per-asset
justification in the manifest. Forbids inventing a class to escape a band.
Forbids using roughness to compensate for an albedo that is too bright or too
dark — that is §1's defect wearing a different hat.

---

## 3. Texel density and the wall tiling rule

### 3.1 Density is authored; resolution is derived

**Decision.** The target texel density for architectural surfaces is
**512 px/m**, and a material's map resolution is **derived** from it:

```
resolution = clampPow2( ceilPow2( coverM × 512 ), 256, 2048 )
```

where `coverM` is the metres one texture repeat spans — the existing, correct
field in `FloorMaterial`. Furniture, which is UV-unwrapped rather than tiled,
targets the same 512 px/m over its unwrapped surface area, capped at 1024² per
map by §5's budget.

Derived resolutions for the shipped floor set, against what actually ships:

| material | `coverM` | derived | ships | verdict |
|---|---|---|---|---|
| `tile-hex-white` | 0.45 | 256² | 1024² | 4× oversized — 2276 px/m |
| `stone-travertine` | 1.2 | 1024² | 1024² | correct |
| `wood-oak-natural` | 1.8 | 1024² | 1024² | correct |
| `carpet-navy` | 2.0 | 1024² | 1024² | correct |
| `concrete-grey` | 2.5 | 2048² | 1024² | undersized — 410 px/m |

**Rationale.** 512 px/m is 1:1 with the screen at **4.7 m** for the calibration
viewport (1600×1000, 45° vertical fov) at the `dpr` cap of 2 that render
contract §1.1 sets — vertical device pixels per metre is `2000 / (2·d·tan22.5°)`
= `2415/d`. At 4.7 m and beyond the texture is oversampled and mip-mapping
handles it; closer than that it is magnified. That is the correct trade for
architecture, because the surfaces are seen at room scale, they are mostly
stochastic (plaster, carpet, concrete have no feature of known size, which is
why the current registry can pick `coverM` freely for them), and the closest
viewing is grazing, where `anisotropy: 8` — already set in `materials/loader.ts`
— does more for perceived sharpness than doubling resolution.

Deriving rather than fixing the resolution is what stops the density lottery of
§0. It also *saves* bytes: it takes 4× off `tile-hex-white`, which is paying
1024² for a 0.45 m tile that nobody will ever see at 2276 px/m, and spends them
on `concrete-grey`, which is the one currently under target.

**Under-target is accepted for close-range detail at a stated cost — NOT
MEASURED.** No screenshot comparison of 512 vs 1024 px/m at walkthrough eye
height has been captured. The 512 figure is derived from viewport geometry, not
from a perceptual test, and if M3c's first walkthrough shows visible blur at
skirting distance, this clause is what gets reopened — with a measurement.

**Forbids.** Encoding at a fixed resolution and letting density fall out of it,
which is the current state. Forbids exceeding 2048² for any architectural
material (that is a 4 m repeat at target — larger repeats stop being tiles).
Forbids raising a resolution to fix a *look*; if a surface reads soft, check
`coverM` first, because a wrong physical size is far more often the cause and it
is also visible as wrong-sized grain.

### 3.2 UVs are metres, on `uv0`, for everything

**Decision.** Every architectural mesh carries **one** UV set, on the default
`uv` attribute (channel 0), whose units are **metres in surface space**. Tiling
is expressed as `texture.repeat = 1/coverM`, exactly as `materials/loader.ts`
already does for floors, so an authored physical size divides straight through.

All map slots read channel 0. This includes `aoMap`: `Texture.channel` defaults
to 0 in the pinned three 0.185.0 build (verified in `three.core.js`), so the
frequently-cited "aoMap needs a second UV set" is not true here and no second
set ships.

**Rationale.** Metre-space UVs make texel density a property of the material
alone instead of a property of every mesh that uses it, which is the only way
§3.1's derivation can hold across meshes of different sizes. `triangulateFloor.ts`
already does this — it pushes plan coordinates straight in as UVs — so this
clause makes the existing floor convention the general one rather than inventing
a second.

One UV set also means no per-asset unwrap for architecture, which matters
because architecture geometry is *generated at runtime* from the schema, not
authored. There is no authoring step in which someone could unwrap it.

**Forbids.** A second UV set on architectural geometry. Forbids normalised
[0,1] UVs on any tiled surface — they make the texture stretch with the mesh,
which is the exact defect §3.3 exists to prevent. Forbids per-mesh `repeat`
values differing from `1/coverM`.

### 3.3 The wall rule — UVs derived from wall dimensions at runtime

**Decision.** Wall UVs are computed from the wall's own dimensions **at mesh
build time**, never baked. For each wall piece, in wall-local space:

| face | u | v |
|---|---|---|
| side A (+Z), side B (−Z) | `uOffset + (x + halfLength)` | `vOffset + (y + halfHeight)` |
| end (+X, −X) | position along thickness | as above |
| top (+Y), bottom (−Y) | as side faces | position along thickness |

`uOffset` is the piece's start distance along the parent wall and `vOffset` its
base height. Both are **new fields on `WallPiece`** (`buildWallSegments.ts`),
carrying values that function already computes internally as `s` and `yb` and
currently discards.

**Rationale, and why the offsets are not optional.** Openings are cut by
emitting several boxes per wall — a sill box, a lintel box, full-height spans
between openings (`buildWallSegments.ts`). Each box is centred on its own
origin. Without `uOffset`/`vOffset`, every box restarts the texture at its own
corner, so a tiled wall visibly re-starts its pattern above every door and to
each side of every window. That defect appears the day the first patterned wall
material ships and is not fixable in the material.

Deriving at build time is what makes this survive variable wall dimensions. A
wall's length comes from the traced plan, its height from `wall.height ??
WALL_HEIGHT` per wall, and its thickness from `wall.thickness ??
DEFAULT_THICKNESS` — all three vary per wall and none is known when a texture is
authored. Any baked UV parametrisation is normalised by definition, and a
normalised UV on a 6 m wall and a 1.2 m wall means the same tile is 5× bigger on
one of them. Metre-space UVs computed from the actual box size hold the density
of §3.1 constant across every wall in the plan, for free.

**`buildWallGeometry` currently emits no `uv` attribute at all** — position and
index only. Adding it is a M3c change to a protected file, covered by the
render-workstream exemption (render contract §9 row 1) that has already carried
M1b/M2 into the same files.

**Known limitation, recorded not fixed: corner phase.** Wall-local `u` restarts
at each wall, so a *directional* pattern (brick courses, wide vertical panels)
will not align across a corner between two walls. It is invisible for the
stochastic materials M3c ships (plaster, paint, render) and it is real for the
patterned ones. The fix is world-space triplanar projection for the patterned
subset, which is a shader change and is **not** in M3. Recorded here so that
when a brick material is proposed, this is a known cost rather than a surprise.

**Forbids.** Baking wall UVs into any asset. Forbids normalised wall UVs.
Forbids per-wall `repeat` tuning to "make the tile look right on this wall" —
that breaks the invariant this clause exists to hold and produces a plan where
the same material is a different size in every room.

---

## 4. Resolution tiers by object class

**Decision.** §3.1 derives resolution for tiled architecture. For everything
UV-unwrapped, the tier is set by class and by the distance the class is actually
seen from:

| Class | Typical closest view | Max resolution | Notes |
|---|---|---|---|
| Floors, ceilings | 1.5 m, grazing | derived, ≤ 2048² | Grazing — carried by anisotropy, not resolution |
| Walls | 0.6 m, head-on | derived, ≤ 2048² | The closest architecture gets in walkthrough |
| Door & window frames, hardware | 0.5 m | 512² | Small screen area; often a scalar with no map at all |
| Furniture, large (sofa, bed, wardrobe) | 1.0 m | 1024² | Matches the shipped BlenderKit/IKEA cap |
| Furniture, small (lamp, vase, book) | 0.8 m | 512² | |
| Decorative / background props | 2 m+ | 256² | |

Normal maps may go one tier **above** their material's colour map. Roughness,
metalness and AO may go one tier **below**, and frequently should.

**Rationale.** Resolution follows screen area, and screen area follows both
distance and object size — a wardrobe at 1 m fills the frame, a vase at 0.8 m
does not. The existing 1024² furniture cap (`scripts/blenderkit/optimize.ts`,
`TEXTURE_SIZE`) was chosen on the same reasoning and is retained rather than
re-litigated.

The per-map asymmetry is where the bytes are. Normal maps carry the
highest-frequency information in a PBR set — that is what a normal map is for —
and they are also the map that suffers most from compression (§5). Roughness and
metalness are low-frequency control signals; a 512² roughness under a 1024²
colour is not detectable, and it is a 4× saving on a channel nobody looks at.
The shipped floors demonstrate the cost of ignoring this: `carpet-navy`'s normal
map is **783 KB**, 59% of that material's entire 1331 KB.

**Forbids.** Uniform resolution across all maps of an asset "for consistency".
Forbids exceeding a class cap without a recorded reason. Forbids a hero-asset
exemption — the calibration scene has one empty slot (§7) and no asset in this
product is ever the only thing on screen.

---

## 5. Compression, and the byte budget

### 5.1 Textures: KTX2/BasisU, with per-map codec choice

**Decision.** Shipped textures are **KTX2** containers:

| Map | Codec | Why |
|---|---|---|
| Albedo, thumbnails-excepted colour | ETC1S | Perceptual data, tolerant of block artifacts |
| ORM (§6) | ETC1S | Low-frequency control signals |
| Normal | UASTC (+ RDO, Zstd supercompression) | Direction data; ETC1S block artifacts become faceting in raking light |

Picker thumbnails stay **WebP** — they are UI images, never sampled by a shader,
and paying GPU-format overhead for a 128 px swatch is backwards.

**Rationale, and it is GPU memory, not download size.** WebP is *smaller on the
wire* than KTX2 will be. The reason to switch is what happens after decode: a
WebP decodes to uncompressed RGBA8 in VRAM, so each 1024² map costs **4 MB**
resident. Sixteen floor materials × 3 maps × 4 MB = **192 MB** if all are
resident, on top of the furniture catalog, and mobile GPUs do not have it. KTX2
transcodes to the GPU's native compressed format, which is 4–8× smaller resident
and stays compressed for the sampler's whole life.

The per-map codec split is the same reasoning `scripts/materials/repack.ts`
already applies to WebP, where the measured normal-map comparison was plain
lossy q92 = 56 KB against `smartSubsample` q92 = 70 KB against near-lossless 475
KB. UASTC is the KTX2 equivalent of that middle choice, for the same reason:
chroma-decimating a direction vector produces faceting, and 14 KB is worth
paying while 400 KB is not.

**Cost, stated plainly: KTX2 needs the external `toktx` binary** (KTX-Software),
which is why `scripts/blenderkit/optimize.ts` explicitly chose WebP over it and
recorded "revisit if GPU memory ever beats download size as the constraint."
This clause is that revisit.

**Deferred at M3b — Dan's ruling, 2026-08-02: install nothing.** The only
paths that get `toktx` onto this machine right now are a system-wide Windows
installer (writes Program Files + registry, hard to reverse) or an
unofficial npm package that re-bundles the official binaries (no registry
writes, but not Khronos-published — a supply-chain trust step this spec
shouldn't take on quietly). Neither is worth taking to unblock one milestone.
`scripts/materials/ingest/encoder.ts` implements the KTX2 step as pluggable
and detects a real `toktx` on PATH if one is ever present, but every asset
ingested today gets `encoder: null` on the record — not a silent WebP
substitution, an explicit, machine-readable deferral (§7's conformance test
fails closed on exactly that field).

Two paths give official provenance with no registry writes, and are the ones
to take when this is revisited: **build `toktx` from Khronos source** (CMake,
no installer), or **run it containerised** (a Docker image invoked per-encode,
nothing installed on the host). Recorded here so the next attempt starts from
one of these two, not from re-litigating the installer-vs-npm-package choice
this ruling already closed.

**Transfer sizes for our set under KTX2 are NOT MEASURED.** Every byte figure in
this document is a WebP measurement of what currently ships.

**Forbids.** Mixing compressed and uncompressed textures within one material
set. Forbids ETC1S on a normal map. Forbids shipping a KTX2 without the runtime
transcoder wired up — an un-transcodable texture fails to a black surface, which
is worse than the WebP it replaced. Forbids hand-tagging colour space on KTX2
textures in app code; render contract §1.4 defers GLB colour-space correctness
to this pipeline precisely because KTX2 changes how the loader assigns it, and
the fix belongs in the loader configuration, once.

### 5.2 Geometry: Draco, and nothing else

**Decision.** Mesh compression is **Draco**, using the decoder already served
from `public/draco/`.

**Rationale.** It is already there, already loaded by the IKEA and BlenderKit
paths, and already wired into `ReferenceRig.tsx`. Meshopt compresses better on
some assets and decodes faster, and it needs a second decoder shipped and a
second code path maintained for a benefit that does not show up at residential
scene complexity. One decoder is worth more than the delta.

Architecture is generated at runtime from the schema and has no compressed
representation — this clause is about loaded GLBs only.

**Forbids.** Meshopt, or a mixed Draco/meshopt catalog. Forbids a second decoder
path. Forbids simplification passes that change an asset's bounding box: the
BlenderKit pipeline already caught `join` silently removing 17.7% of a chair's
height, and `verify-optimized.ts` exists because of it — that check is inherited
by M3b, not re-derived.

### 5.3 Budget per asset

**Decision.** Hard ceilings, checked by the M3b validator:

| Asset class | Transfer (compressed) | GPU resident |
|---|---|---|
| Architectural material set (albedo + normal + ORM) | ≤ 1.0 MB | ≤ 8 MB |
| Furniture GLB, large | ≤ 1.5 MB | ≤ 12 MB |
| Furniture GLB, small | ≤ 0.6 MB | ≤ 4 MB |
| Picker thumbnail | ≤ 12 KB | n/a |

Measured against what ships today (WebP, no ORM packing): floor sets average
**369 KB** and range **82 KB → 1331 KB**. **`carpet-navy` (1331 KB) and
`carpet-beige` (861 KB) are the outliers**, and both are outliers in the same
place — a stochastic carpet weave paying for a huge normal map that §4's
one-tier-down rule and §6's packing both attack. Optimised BlenderKit furniture
measured 445 KB → 1.2 MB, inside the furniture ceiling already.

**Rationale.** A budget nobody measures against is a wish. These numbers are set
just above what the compliant part of the current catalog already achieves, so
the budget is a ratchet against regression rather than a target requiring a
rebuild — and the two assets that fail it fail it for a reason the spec already
identifies, which is the sign the ceiling is in roughly the right place.

**Forbids.** Merging a budget overrun into the catalog. Forbids a per-asset
exemption granted at review time — the escape is to drop a tier (§4), pack
harder (§6), or reject the asset.

---

## 6. Naming and channel packing — stated once

**Decision.** Three maps per material, no more. Occlusion, roughness and
metalness are packed into one RGB texture, **ORM**:

| Channel | Content |
|---|---|
| R | Ambient occlusion (§1.2) |
| G | Roughness |
| B | Metalness |

This is the glTF layout exactly — the spec's `metallicRoughnessTexture` uses G
for roughness and B for metalness, and `occlusionTexture` conventionally shares
the same image via R — so a packed ORM travels through glTF, gltf-transform and
`GLTFLoader` with no remapping, and three reads all three from one sampler.

Layout on disk, and in the manifest:

```
public/materials/<class>/<id>/albedo.ktx2
public/materials/<class>/<id>/normal.ktx2
public/materials/<class>/<id>/orm.ktx2
public/materials/<class>/<id>/thumb.webp
```

`<class>` ∈ `floors | walls | ceilings | doors | windows`. `<id>` is
kebab-case `family-descriptor` (`wood-oak-natural`, `plaster-white-matte`) —
the convention `data/materials-floors.manifest.json` already uses, kept.

Normal maps are **OpenGL/+Y-up (green up)**, tangent-space. Every map is
declared `NoColorSpace` except albedo, which is `SRGBColorSpace` — render
contract §1.2, restated here because this is where assets are made and that is
where the mistake happens.

**Rationale.** Three maps instead of four is one fewer HTTP request, one fewer
sampler bind, and — the part that matters — one fewer texture unit per material
in a scene that already carries shadow maps, an env map and the composer's
targets. The channels being genuinely independent single-channel signals is what
makes the packing lossless in the sense that matters: nothing is being shared or
approximated, they simply sat in three separate files for no reason.

Naming +Y explicitly is not pedantry. A flipped green channel is the classic
"lighting looks subtly inverted and nobody can say why" defect, it is invisible
in a thumbnail, and DirectX-convention (−Y) sources are common. It is a
one-channel-flip fix in the pipeline **if you know**, and a week of confusion if
you do not.

**Forbids.** Separate roughness/metalness/AO files in shipped output. Forbids a
fourth packed channel in A — alpha in a compressed texture takes a separate
codec path and there is no fourth signal that needs it. Forbids DirectX-convention
normals without conversion at ingest. Forbids per-material deviation from the
path layout: the manifest is generated, and a special case in a generated file
is a special case in every consumer of it.

---

## 7. The conformance test

**Decision.** An asset is accepted **only** if it reads correctly in the M1c
calibration scene under all three lighting presets **with zero changes to any
lighting value**.

Procedure:

1. Mount the candidate in the calibration fixture's **empty slot** — the
   1.4 × 2.0 × 1.4 m cage in the roofed room, inside the slider's sun patch
   (`src/app/calibration/ReferenceRig.tsx`). A material, rather than an object,
   is applied to the slot's test panels.
2. Capture all nine cells: `node scripts/render/capture-m1c.mjs <tmpdir>`, at
   the canonical hour 10.0 clear, 1600×1000, headless SwiftShader — the same
   conditions the committed baselines were captured under.
3. Compare against `docs/calibration/`. **The nine cells must differ only inside
   the slot.** Everything outside it — the chart, the grey card, the roughness
   and metalness gradients, the terrace, the sky — is unchanged, pixel for
   pixel modulo the SwiftShader capture noise already characterised at M2
   (0.37–0.57% of channels between re-captures of unmodified code).
4. Inside the slot, across the three presets, the material must: keep its hue
   (Khronos Neutral was chosen for exactly this — render contract §2.4); go
   dark at night and bright at noon, i.e. respond to the light rather than
   carrying its own; show specular separation consistent with its §2.2 band;
   and show no lighting direction that disagrees with the scene's sun.
5. `git diff` after the run must touch **no file** in `src/render/lightPresets.ts`,
   `src/render/contract.ts`, `src/viewport3d/environment/`, or
   `docs/calibration/`.

**Rationale.** This is the only test that catches §1's defect, and it catches it
without anyone having to reason about it. A baked-in light is defined by
disagreeing with the scene's light, so putting the asset in three scenes with
three different lights and requiring one appearance rule to hold in all of them
is a *direct* measurement of the property the spec cares about. No histogram
does that as well, which is why §1's histogram check is the cheap screen and
this is the gate.

Step 5 is the half people skip and it is half the test. The failure this
milestone exists to prevent is not "an asset looks wrong" — it is "an asset
looks wrong, so the lighting was adjusted until it looked right, and now every
other asset is wrong." An asset that passes only after a lighting tweak has
failed, and the diff is what proves no tweak happened. It is also the M3 exit
criterion, so it is measured on the way in rather than asserted at the end.

The three-preset requirement, rather than one: `none` (studio) has no sky, and
`suburb`/`city` differ in ground bounce and skyline. A material that reads right
in one and wrong in another has a light in it.

**Forbids.** Accepting an asset on a single-preset screenshot. Forbids
"conditionally accepted, will look at it later." Forbids adjusting *any*
lighting value to make a candidate pass — that is a render-contract §2.4/§4.1
violation before it is a material one. Forbids re-capturing
`docs/calibration/` as part of an asset review: those baselines are invalidated
by lighting changes only (render contract, M1c appendix), and an asset that
appears to require re-capture is an asset that changed the lighting.

---

## 8. What M3a does not decide

Recorded so the next milestone does not assume silence means permission.

- **Per-room or per-surface material assignment UI.** Walls carry paint colours
  today (`wall.paintA`/`paintB`); how a user assigns a *material* rather than a
  colour is product work, not spec work.
- **Triplanar projection** for patterned wall materials (§3.3's recorded
  limitation). Shader change, out of M3.
- **Emissive materials.** Nothing in the catalog is emissive yet, and an
  emissive surface is a light source, which puts it under render contract §4's
  physical-units rule, not this document's.
- **Transmission / real glass** (thickness, IOR, transmissive shadows). Render
  contract §6.1's declared limitation stands.
- **The transient class's shadow behaviour** — still the deferred slot of
  render contract §6.3.
