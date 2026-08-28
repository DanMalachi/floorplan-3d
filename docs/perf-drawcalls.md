# Draw-call inventory — where the submissions come from

**Companion to `docs/PERFORMANCE-HANDOFF.md` findings 3 and 4.** Branch
`perf-integrated-gpu`. This is an analysis pass: it changed no source.

Everything below is read from source at a cited `file:line`, or measured from
`scripts/perf/baselines/2026-08-27-dpr1-unfurnished.json`. Anything estimated is
labelled, with its assumptions.

---

## 0. The headline

Finding 3 said "every wall segment, window frame, mullion and rail post is its
own submission". That is true but it undercounts, and it names the wrong villain.

**A wall piece is not one draw call. It is six.** Not because the wall is split
six ways — because it is drawn with a six-slot material array over a six-group
geometry, and four of those six slots hold *the same material object*.

```
src/viewport3d/geometry/wallGeometry.ts:67
  geom.addGroup(f * 6, 6, f);          // one group per box face, f = 0..5

src/viewport3d/WallMesh.tsx:278-281
  const mats = useMemo(
    () => [neutral, neutral, neutral, neutral, matA, matB],
    [neutral, matA, matB],
  );
```

`three.core.js:23582-23590` (three 0.185.0): when a mesh's material is an
`Array`, the renderer walks `geometry.groups` and submits one draw per group.
Six groups, six draws, twelve triangles total — **two triangles per draw call.**

Groups 0-3 (+X, -X, +Y, -Y) all resolve to the identical `neutral` material.
They are contiguous in the index buffer (indices 0..23), so they could be one
group and one draw with no change to anything else. That is four wasted
submissions per wall piece, and wall pieces are the most numerous object in the
scene.

This single fact accounts for roughly **two thirds of the scene's draw calls**
in the modelled house (§3), and the fix is a two-line change (§5.1).

---

## 1. Per-element inventory

"Calls" = draw calls in the composer's scene pass (`RenderPass`). Shadow passes
are excluded — `ShadowRefreshRig.tsx:63` sets `gl.shadowMap.autoUpdate = false`,
so shadow maps are static in the steady state. See §1.10 for what happens when
they are not.

### 1.1 Solid wall — `WallGroup`, `src/viewport3d/WallMesh.tsx:150-503`

| part | count | calls each | materials | geometry shared? |
|---|---|---|---|---|
| body pieces (`buildWallSegments`) | 1 + openings-dependent | **6** | 6-slot array over 3 objects: `neutral`, `matA`, `matB` | no — built per wall from its own size + junction ends |
| baseboard runs (`buildBaseboards`) | 1, +1 per floor-level opening | 1 | single `baseboardMat` | no |
| corner handles | 2, only when selected | 1 | inline | no |

Piece counts from `src/viewport3d/geometry/buildWallSegments.ts:89-99`:

- no openings → **1** piece
- one mid-wall door (`sill == 0`, top below wall height) → **3** (solid, lintel, solid)
- one mid-wall window (`sill > 0`) → **4** (solid, sill, lintel, solid)
- one opening at a wall end → one fewer solid span

So a **plain wall costs 7 calls** (1x6 body + 1 baseboard); a **wall with one
window costs 25** (4x6 + 1); a **wall with one door costs 20** (3x6 + 2).

Materials are per wall instance and never shared between walls
(`WallMesh.tsx:230-262`). All four are `transparent: true` with `opacity: 1`
(`WallMesh.tsx:238`, `:271`) so the entire architecture renders in the
**transparent queue** — back-to-front, sorted every frame, with no early-Z
rejection. On a tile-based integrated GPU that is a second, separate problem
from the call count.

### 1.2 Opening — `OpeningPick`, `src/viewport3d/WallMesh.tsx:598-928`

| part | calls | notes |
|---|---|---|
| pick box | **1, always** | `WallMesh.tsx:860-889`. `transparent`, `opacity: 0` when idle. Three does not skip zero-opacity materials — this is a full draw call that writes nothing, once per opening, every frame. |
| joinery pieces | 1 each | `WallMesh.tsx:892-905`. Each is its own `<mesh>` with its own inline `<boxGeometry>`, so one geometry and one draw per piece. |
| edge handles + `Html` label | 2 + 1 | only when selected |

Joinery piece counts, read directly off `src/viewport3d/geometry/buildJoinery.ts`:

| opening | pieces | breakdown | + pick box |
|---|---|---|---|
| window (default `cols 2, rows 1`) | 6 | 4 frame (jamb L/R, head, sill ledge) + 1 glass + 1 vertical mullion (`:203-240`) | **7** |
| window, `cols c` / `rows r` | 3 + c + r | mullion grid is `(c-1)` + `(r-1)` bars | 4 + c + r |
| single swing door | 9 | 3 frame + 1 threshold + 1 leaf + **4 handle** (plate + lever, per face, `:300-321`) | **10** |
| double swing door | 14 | 3 frame + 1 threshold + 2 leaves + 8 handle | **15** |
| patio (bypass, glazed, 2 panels) | 13 | 3 frame + 1 threshold + 2x(glass + 2 stiles + handle) + 1 track (`:129-148`) | **14** |
| wardrobe (bypass, solid, 2 panels) | 9 | 3 frame + 1 threshold + 2x(leaf + handle) + 1 track | **10** |
| barn (surface slide) | 7 | 3 frame + 1 threshold + leaf + track + handle (`:98-110`) | **8** |
| passage, lined | 3 | jamb L/R + head; returns early at `:215` | **4** |
| passage, `lining: false` | 0 | | **1** |

Seven role materials per opening, shared across that opening's pieces
(`WallMesh.tsx:629-646`) and not across openings.

**Every joinery mesh sets `raycast={() => null}` (`WallMesh.tsx:899`).** Picking
is entirely the pick box's job. This is the most important fact in the whole
inventory for merge planning: joinery can be merged freely without touching
interaction.

### 1.3 Rail — `RailGroup`, `src/viewport3d/WallMesh.tsx:1038-1197`

**2 calls.** A glass balustrade panel and a handrail cap (`:1170-1186`), each
one box, two materials. There are **no rail posts** — finding 3's "rail post" is
not a thing this renderer draws. Rails are the cheapest boundary in the app.

### 1.4 Portal — `PortalGroup`, `src/viewport3d/WallMesh.tsx:1231-1370`

**2 calls, Build mode only** (`:1321` returns null otherwise): a threshold band
with `raycast={() => null}`, and an invisible catcher box
(`meshBasicMaterial transparent opacity={0}`, `:1356`) that exists only to be
raycastable — a second always-drawn, never-visible submission.

### 1.5 Room floor — `Floor`, `src/viewport3d/FloorMesh.tsx:72-175`

**1 call.** One earcut-triangulated polygon (`triangulateFloor.ts`), one
material per room so the hover/select highlight stays per-room (`:94-121`).
Floor *textures* are shared; materials are not.

### 1.6 Room ceiling + risers — `Ceilings`, `src/viewport3d/FloorMesh.tsx:211-368`

**1 call per roofed room, plus 1 per riser panel.** Materials ARE shared across
all rooms (`mat`, `riserMat`, `proxyMat` — `:289-331`), the only shared
architecture materials in the app.

Note `:343` and `:353`: when the ceiling is hidden (cutaway, top view, ceilings
toggled off) the mesh **stays in the scene and keeps drawing**, swapped to
`proxyMat` (`colorWrite: false, depthWrite: false`). It writes nothing to the
colour buffer but still costs a full submission, per room, every frame, in the
two view modes people spend most of their time in. It is there to keep the sun
out (contract §5) — a shadow-caster-only role that does not need a colour-pass
draw at all.

### 1.7 Fixture — `FixtureBody`, `src/viewport3d/FixtureLayer.tsx:178-282`

| shape | calls | parts |
|---|---|---|
| `pendant` | **4** | ceiling rose, cord, cone shade, bulb (`:219-236`) |
| `sconce` | **3** | backplate, arm, shade (`:247-260`) |
| `flushDisc` | **2** | trim plate, squashed diffuser dome (`:268-276`) |

Every geometry and every material is declared inline in JSX, so **nothing is
shared between two fixtures of the same shape** — same geometry parameters,
different `BufferGeometry` objects, different materials. `+1` for a
`SelectionRing` when hovered or selected (`:396`).

Triangle-heavy for their size: `flushDisc`'s dome is `sphereGeometry(0.135, 24, 16)`
= 720 triangles, its plate `cylinderGeometry(..., 24)` = 96. Ten flush discs are
~8k triangles in 20 draw calls — a majority of the unfurnished scene's triangle
budget from about 3% of its submissions.

### 1.8 Stair — `StairMesh`, `src/viewport3d/StairMesh.tsx:196-276`

One shared material per stair (`:201-213`), one call per piece
(`buildPieces`, `:162-194`):

- `style: "solid"` → **1 piece per flight** (one extruded side profile) + 1 per landing
- `style: "open"` → **steps + 2 stringers per flight** (`openFlight`, `:97-141`) + 1 per landing

A solid straight stair is 1 call. An open 16-riser stair is 18.

### 1.9 Furniture — `FurnitureLayer`, `src/viewport3d/FurnitureLayer.tsx`

**One call per mesh inside the GLB, per placement.** Geometry *is* shared
between placements of the same model (`Object3D.clone` shares the underlying
`BufferGeometry` — see the ownership note at `:85-95`), and materials are shared
too unless the instance tints or ghosts (`:91`), but there is no instancing:
six identical chairs are 6x the chair's mesh count in submissions.

Out of scope for finding 3's 687 — that reading was on an unfurnished scene —
but this is where the number goes when the scene is furnished.

### 1.10 Lights — `src/render/RoomLights.tsx`

Zero colour-pass draw calls. One `pointLight` per eligible room (`:114-130`),
of which `ROOM_LIGHT.shadow.maxCasters = 1` casts (`contract.ts:188`).

The cost is in the shadow pass, and it is not paid every frame: `autoUpdate` is
off. But `ShadowRefreshRig.tsx:85-91` refreshes **every frame while a gesture is
in flight or a walkthrough door is swinging**, and on those frames the whole
caster list is re-submitted once for the sun's ortho map and six times for the
casting point light's cube map. Worse, `three.core.js:23582` applies to the
shadow pass too — a wall piece submits **six** depth draws per shadow face. A
refresh frame therefore costs roughly `7 x (6 x wall pieces + other casters)`
extra submissions on top of the colour pass. That is the worst frame in the app
and nobody has measured it.

### 1.11 Environment — `src/viewport3d/environment/`

| preset | calls | composition |
|---|---|---|
| studio (`none`) | **1** | ground disc only (`Environment3d.tsx:156-159`); `<Sky>` is outdoor-only (`:71-73`) |
| city | **~22** | host box, deck, 3 instanced tower variants **x 6 material-array groups each = 18** (`City.tsx:184-185, 234-236`), haze plane, `<Sky>` |
| suburb | **~11** | ground, instanced grass, 3 instanced house variants, instanced roofs, 4 instanced tree styles (`Suburb.tsx:514-528`), `<Sky>` |

The environments are the *only* well-batched part of the app — 172k triangles in
suburb for ~11 calls. Note City repeats the wall mistake at a smaller scale: its
`matArrays[v] = [f, f, roofMat, undersideMat, f, f]` turns each instanced tower
mesh into six draws.

### 1.12 Composer — 11 draw calls

Eleven fullscreen triangles, one per `renderer.render()` in the pass chain
except the scene render itself. Enumerated in §6.

### 1.13 Conditional overlays

`SnapGridOverlays` (2 `lineSegments` per surface), `MeasureTool`, `WallTool`,
`OpeningTool`, `RunHandles`, `RunDrawGhost`, `CounterItemGhost`,
`PlacementGhost` (a 600x600 invisible pick plane, `FixtureLayer.tsx:458-467` and
`FurnitureLayer.tsx:522-530`) and drei's `<Grid>` all mount only during a
placement, a drag or a tool. None of them are in the steady state; all of them
are cheap. Not a target.

---

## 2. Summary table

Per element, steady state, nothing selected or hovered:

| element | meshes | draw calls | distinct materials | geometry shared |
|---|---|---|---|---|
| wall, no openings | 2 | **7** | 4 | no |
| wall + 1 window | 5 | **25** | 4 | no |
| wall + 1 door | 5 | **20** | 4 | no |
| window (in the wall above) | 7 | **7** | 7 (per opening) | no |
| single swing door | 10 | **10** | 7 (per opening) | no |
| double door | 15 | **15** | 7 | no |
| patio slider | 14 | **14** | 7 | no |
| passage | 4 | **4** | 7 | no |
| rail | 2 | **2** | 2 | no |
| portal (Build only) | 2 | **2** | 2 | no |
| room floor | 1 | **1** | 1 per room | no |
| room ceiling | 1 | **1** (even when hidden) | shared scene-wide | no |
| ceiling riser | 1 | **1** | shared scene-wide | no |
| fixture: pendant / sconce / flushDisc | 4 / 3 / 2 | **4 / 3 / 2** | 2 per fixture | no |
| stair, solid, 1 flight | 1 | **1** | 1 per stair | no |
| stair, open, 16 risers | 18 | **18** | 1 per stair | no |
| furniture item | GLB mesh count | = mesh count | shared across placements | **yes** |
| composer | 11 fullscreen tris | **11** | 11 | shared |

Fully-loaded: **a wall with one window and one door costs 45 draw calls.**

---

## 3. Does the model reproduce 687?

### 3.1 What I can check exactly

The 687 reading's scene is not recorded anywhere in the repo, so its wall,
opening and room counts are unknown. What *is* recorded is the automated
baseline, and it gives two independent checks that do not depend on the plan.

**Check A — the environment delta.** `editor:city` and `editor:studio` are the
same plan, same camera path, different environment.

|  | measured | modelled |
|---|---|---|
| calls, city - studio | **+20** | +21 (22 city - 1 studio) |
| geometries, city - studio | **+2** | +3 |
| textures, city - studio | **+6** | +6 (3 facade maps + 3 emissive) |

Textures land exactly. Calls and geometries are each off by exactly one, in the
same direction — consistent with one City object (the haze plane or the deck)
being frustum-culled on that camera path. **The environment model is correct to
+/- 1 draw call.**

**Check B — the composer.** §6 enumerates the pass chain from source and
predicts **exactly 12** `renderer.render()` calls. Finding 4 measured exactly 12,
invariant across every scenario. That is not a fit; it is a derivation that
matches on the nose.

### 3.2 The 687 model

Composer 11 + city environment 21 leaves **655 house draw calls**.

Applying §2 to a house of 30 solid walls (14 plain, 8 with one window, 8 with
one door), 10 rooms, 2 rails, 10 flush-disc fixtures and 2 risers:

| | count | calls each | subtotal |
|---|---|---|---|
| plain walls | 14 | 7 | 98 |
| wall + window (body) | 8 | 25 | 200 |
| windows | 8 | 7 | 56 |
| wall + door (body) | 8 | 20 | 160 |
| single doors | 8 | 10 | 80 |
| rails | 2 | 2 | 4 |
| floors | 10 | 1 | 10 |
| ceilings | 10 | 1 | 10 |
| risers | 2 | 1 | 2 |
| fixtures (flushDisc) | 10 | 2 | 20 |
| | | **house** | **640** |
| environment (city) | | | 21 |
| composer | | | 11 |
| | | **total** | **672** |

Measured 687. The model is **2% low**, closed by two more openings or two more
walls.

### 3.3 Honest reading

**Yes, it reproduces — but as a consistency check, not a proof.** The plan's
element counts are a free parameter I could not read, and a ~30-wall /
~16-opening / ~10-room house is an ordinary traced plan rather than a tuned one.

What makes it more than a plausible story is that the *dominant* term is not
fitted. 420 of the 640 modelled calls are wall bodies, and their 6x multiplier is
forced by `wallGeometry.ts:67` plus `WallMesh.tsx:278` plus `three.core.js:23582`
— it cannot be adjusted to make the arithmetic work. The only freedom is in the
plan size, and the plan size that fits is unremarkable.

The failure mode to watch: if Dan's house is much smaller than 30 walls, the
model over-predicts and something else is contributing (the obvious candidate
would be a shadow refresh caught in the reading, §1.10, which would multiply
everything by ~7). **Ask Dan for `scene.walls.length`, `scene.openings.length`
and `scene.rooms.length` on the measured project — one console line settles it.**

### 3.4 A stronger result, unasked for: draw calls explain the entire dataset

Refitting cost against draw calls on the six **vsync-free** automated scenarios
(the handoff's 7.5 us/call came from four vsync-clamped hand readings):

```
frame p50 = 0.324 ms + 5.82 us x drawCalls      R^2 = 0.964
js    p50 = 0.240 ms + 5.55 us x drawCalls
```

| scenario | calls | frame p50 measured | predicted |
|---|---|---|---|
| editor:city | 140 | 1.15 | 1.14 |
| editor:studio | 120 | 1.00 | 1.02 |
| editor:suburb | 129 | 1.10 | 1.08 |
| walk:still | 62 | 0.70 | 0.69 |
| walk:look | 62 | 0.60 | 0.69 |
| walk:forward | 38 | 0.60 | 0.55 |

Two parameters, six scenarios, R² 0.96. **Triangles explain none of it**:
`editor:suburb` carries 116x `editor:studio`'s triangles (172,055 vs 1,483) and
is 0.10 ms slower — exactly what its +9 draw calls predict, and nothing more.

The slope (5.8 us) is 23% below the handoff's 7.5 us, which is expected: the
hand readings it was fitted to were vsync-clamped. Extrapolating the clean fit,
**687 calls predicts 4.3 ms/frame, of which 4.1 ms is `jsMs`.** Finding 3's
magnitude survives an independent, better-conditioned fit.

---

## 4. Interactivity: what a merge is allowed to break

Before ranking, the constraints, all read from source:

1. **Walls are one pick target already.** Every body piece of a wall carries the
   same `userData.pick` and the same handler set (`WallMesh.tsx:452-461`).
   Merging a wall's pieces costs nothing.
2. **Baseboards and joinery are already unpickable** — `raycast={() => null}` at
   `WallMesh.tsx:469` and `:899`. Free to merge.
3. **Face picking reads `materialIndex`.** `faceSide` (`WallMesh.tsx:77-80`)
   maps group 4 to side A and group 5 to side B; wall paint, the eyedropper and
   the per-side selection lift all depend on it. `Mesh.raycast` only populates
   `face.materialIndex` on the *array-material* branch (`three.core.js:23603`),
   so **collapsing a wall to a single material silently breaks paint** — every
   click would report side A. Mitigation is easy and is written down in the
   source already: `wallGeometry.ts:86-88` guarantees the long faces are exactly
   `(0, 0, +/-1)` in local space, so a normal-based `faceSide` is a drop-in and
   is more robust than the group index.
4. **Cutaway fade is per wall and per opening, by material mutation.**
   `WallMesh.tsx:306-332` damps `opacity` on `neutral/matA/matB/baseboardMat`
   inside a per-`WallGroup` `useFrame`; `:781` does the same per opening. Any
   merge that crosses a wall boundary must carry opacity per instance
   (`BatchedMesh` per-instance colour/uniform, or a vertex attribute), or the
   whole merged batch fades together.
5. **Selection/hover is per element, by material mutation.** Same mechanism,
   same constraint.
6. **Per-side paint colour** lives on `matA`/`matB` per wall
   (`WallMesh.tsx:283-289`), with a per-wall procedural normal/roughness pair
   (`paintTexture()`, `:245-250`). A scene-wide wall merge would need
   per-instance colour *and* per-instance texture, which is where a merge stops
   being cheap.
7. **Door leaves and sliding panels animate.** `buildJoinery` re-emits the leaf
   at a new angle per frame during a swing; `geomOpsCache` (`WallMesh.tsx:181-188`)
   exists precisely so the *body* does not rebuild with it. A joinery merge must
   keep the moving roles out of the merged geometry.
8. **Ceilings need to exist as shadow casters even when invisible**
   (`FloorMesh.tsx:318-331`).

---

## 5. Ranked merge opportunities

Savings are against the §3.2 modelled house (640 house calls). "Risk" weighs
feature breakage and protected-diff size together. Every file named below is in
`docs/PROTECTED_PATHS.md`; the workstream has Dan's 2026-08-27 sign-off for
performance work, so the rule in force is *keep the diff small and tell him*.

### 5.1 RANK 1 — Collapse the wall geometry's four neutral groups into one

**Saves ~210 of 640 (33%). Risk: minimal. Diff: ~4 lines across 2 protected files.**

Mechanism: **shared-material batching**, not a merge. `wallGeometry.ts:63-81`
emits `addGroup(f*6, 6, f)` for f = 0..5. Faces 0-3 (+X, -X, +Y, -Y) are
contiguous in the index buffer and all resolve to `neutral`. Emit
`addGroup(0, 24, 0)`, `addGroup(24, 6, 1)`, `addGroup(30, 6, 2)` instead, and
change `mats` to `[neutral, matA, matB]` (`WallMesh.tsx:278`).

**6 draws per wall piece becomes 3.** 70 modelled wall pieces x 3 = 210 calls,
~1.2 ms at 5.8 us/call.

What it costs: nothing. Same materials, same objects, same mutation points, same
picking, same cutaway, same paint, same UVs — the paint UVs are written per-face
at `:68-80` and are unaffected by regrouping. The one required companion change
is `faceSide` (`WallMesh.tsx:78`): side A moves from `materialIndex 4` to `1`,
side B from `5` to `2`. Miss that and wall painting silently paints the wrong
side — it is the only trap in this change.

Files: `src/viewport3d/geometry/wallGeometry.ts`, `src/viewport3d/WallMesh.tsx`.
Both protected; three lines in one, two in the other. `wallJunctions.test.ts` and
`joinery.test.ts` do not assert on groups, so nothing existing should break —
worth adding a group-count assertion in the same change.

There is a further step to **1 draw per piece** — use a single material whenever
`paintA === paintB` and the wall is neither hovered nor selected — worth another
~140 calls. It needs the normal-based `faceSide` from §4.3 and it makes the
material identity state-dependent, which reintroduces React-visible churn into a
file that deliberately mutates instead. Do it second, separately, if 5.1 is not
enough.

### 5.2 RANK 2 — Merge each opening's static joinery

**Saves ~64 of 640 (10%). Risk: low. Diff: moderate, 2 protected files.**

Mechanism: `mergeGeometries` per opening per role, or one geometry with one
group per role. All joinery already has `raycast: () => null`
(`WallMesh.tsx:899`) — the pick box owns interaction — so **this merge destroys
nothing**. It is the cleanest candidate in the inventory.

- window: 6 meshes → 3 (frame x4 merged, glass, mullions x N merged). With a
  4x4 mullion grid it is 6 fewer.
- door: merge the 3 frame members + threshold → 1; leaf and 4 handle pieces stay
  separate because they animate (§4.7). 9 → 6.

Files: `src/viewport3d/geometry/buildJoinery.ts` (emit merged, role-grouped
output), `src/viewport3d/WallMesh.tsx` (render one mesh per role). Both
protected; the geometry file is pure and covered by `joinery.test.ts`, which
makes this the safest non-trivial change available.

### 5.3 RANK 3 — Merge a wall's body pieces into one geometry

**Saves ~120 more on top of 5.1. Risk: medium. Diff: real, in 2 protected files.**

Mechanism: merged `BufferGeometry`. A wall's pieces share rotation, materials,
handlers and pick ref, so 4 pieces x 3 draws (post-5.1) becomes 3 draws — one per
material slot for the entire wall. 30 walls x 3 = 90 calls instead of 210.

Interactivity: **unchanged.** One pick target, one set of handlers, one material
triple, one cutaway fade. Everything that reads per-wall state already does.

Why it is rank 3 and not rank 1: `mergeGeometries(geoms, true)` produces one
group *per input geometry*, which would give 3N groups again. Getting 3 groups
out of N pieces means `buildWallGeometry` changes signature from "one piece" to
"a wall's pieces", emitting all faces of all pieces into three contiguous index
ranges. That is a genuine rewrite of a protected, unit-tested geometry file, not
a two-line edit. Do 5.1 first and measure; if the remaining wall cost still
dominates, this is the next lever and it is well-understood.

Files: `src/viewport3d/geometry/wallGeometry.ts` (+ tests),
`src/viewport3d/WallMesh.tsx`. Both protected.

### 5.4 RANK 4 — Stop drawing the meshes that draw nothing

**Saves ~26 of 640 (4%), plus fragment work. Risk: low. Diff: small, 2 protected files.**

Three always-submitted, never-visible draws:

1. **Opening pick boxes** (`WallMesh.tsx:860-889`) — `opacity: 0` when idle, one
   per opening, drawn every frame. `visible={false}` is not available: three's
   raycaster skips invisible subtrees, so it would kill opening selection. Two
   real options: (a) delete the box and put `raycast` back on the joinery
   frame/leaf meshes with the opening's `userData.pick` — zero extra draws;
   (b) one `InstancedMesh`/`BatchedMesh` pick proxy per wall, resolving the
   opening from `instanceId`/`batchId`. (a) is simpler and composes with 5.2.
2. **Portal catchers** (`WallMesh.tsx:1335-1358`) — same shape, Build mode only.
   Same fix: raycast the threshold band instead of adding a second box.
3. **Hidden ceilings** (`FloorMesh.tsx:343-366`) — in cutaway and top view every
   room's slab still submits with `colorWrite: false` because it must stay a
   shadow caster. `Object3D` has no shadow-only flag, but layers do the job: put
   hidden slabs on a layer the camera does not test and the lights do. One call
   per room recovered in the two most-used view modes, plus their fragment cost.

Files: `WallMesh.tsx`, `FloorMesh.tsx`. Both protected; each change is local.

### 5.5 RANK 5 — Instance the fixtures

**Saves ~17 of 640 (3%) and roughly half the scene's triangles. Risk: medium.**

Mechanism: one `InstancedMesh` (or `BatchedMesh`) per shape per part.
`FixtureLayer.tsx:178-282` builds identical geometry per fixture with no sharing
at all, so ten flush discs are 20 meshes, 20 materials and ~8k triangles that
could be 2 draws.

What it costs: the pick target today is the wrapping `<group>`
(`FixtureLayer.tsx:381-383`), which instancing dissolves. `BatchedMesh` keeps
picking working through `batchId` and also keeps per-instance `visible`, which
`InstancedMesh` does not. The `SelectionRing` is a separate mesh so it survives;
the red collision tint is per-instance material variation and needs per-instance
colour.

Lower rank than the arithmetic suggests because fixtures are few and the
protected diff is a rewrite of the layer's rendering path. Worth doing for the
triangle count if a low-end GPU ever turns out to be vertex-bound.

### 5.6 RANK 6 — `BatchedMesh` for repeated furniture

**Saves 0 today. Possibly the largest saving that exists.**

The 687 reading was unfurnished, so there is no evidence to rank this on.
`FurnitureLayer` already shares geometry across placements
(`FurnitureLayer.tsx:85-95`), which is exactly the precondition for
`BatchedMesh`. Per-instance visibility, per-instance transform and `batchId`
picking are all supported; per-instance material variation (the red collision
tint, the ghost's 0.55 opacity) is not, and would need the ghost and the
colliding item to fall back to individual meshes.

**Do not start this before someone measures a furnished scene.** Phase 3's
texture cap is blocked on licensing; the *measurement* is not.

### 5.7 Considered and rejected

- **Scene-wide wall merge.** Would collapse everything to a handful of draws and
  breaks per-wall paint (§4.6), per-wall cutaway (§4.4) and per-wall selection
  (§4.5) simultaneously. `BatchedMesh` could carry per-instance colour and
  visibility, but per-wall *textures* and the damped per-wall opacity make it a
  large, risky rewrite of the most protected file in the repo for a lever that
  5.1 + 5.3 already mostly deliver.
- **Merging baseboards scene-wide.** They are unpickable and share a shape, but
  they participate in each wall's cutaway fade (`WallMesh.tsx:322`), so they
  cannot leave their wall. 5.3 already absorbs them.
- **Instancing joinery across openings.** Every box is built to its opening's
  exact dimensions, so there is nothing to instance; merging per opening (5.2)
  is the right shape.
- **Fixing City's 6-group instanced towers** (`City.tsx:184`). Same mistake as
  the wall, but `City.tsx` genuinely needs 3 distinct materials (facade, roof,
  underside) and only 2 of the 6 slots are redundant. ~6 calls. Not worth a
  protected diff on its own; fold it in if someone is already in the file.

---

## 6. The 12-pass composer chain, enumerated

`src/viewport3d/Viewport.tsx:540-557` declares four children. What actually gets
built (`@react-three/postprocessing/dist/index.js`, the `EffectComposer`
component) is: a `RenderPass`, then each child — `Pass` instances added directly,
`Effect` instances merged into `EffectPass`es. **`SMAAEffect` declares
`EffectAttribute.CONVOLUTION`** (`postprocessing/build/index.js:10970`), and the
merger refuses to fold a convolution effect in with its neighbours, so
`ToneMapping` and `SMAA` become **two** `EffectPass`es, not one.

Every fullscreen pass in both libraries draws through
`renderer.render(fullscreenTriangle, orthoCamera)`
(`postprocessing` `Pass.fullscreenGeometry`; `n8ao/src/FullScreenTriangle.js:23-25`),
so each one increments `info.render.frame` **and** contributes exactly one draw
call. That is why finding 4's 12 is invariant.

| # | pass | source | resolution | draw calls |
|---|---|---|---|---|
| 1 | `RenderPass` — the scene | added by `<EffectComposer>` | full, RGBA16F | **N** (the entire scene: 676 in the 687 reading) |
| 2 | N8AO depth downsample | `N8AOPostPass.js:610` | **half** (MRT: depth + normal) | 1 |
| 3 | N8AO AO evaluation, 16 samples | `:635` | half | 1 |
| 4 | N8AO Poisson denoise, iteration 1 | `:661` | half | 1 |
| 5 | N8AO Poisson denoise, iteration 2 | `:661` (`denoiseIterations: 2`, `:81`) | half | 1 |
| 6 | N8AO accumulation | `:669` | half | 1 |
| 7 | N8AO composite (AO x scene colour, fog) | `:731` | **full** | 1 |
| 8 | N8AO copy to output buffer | `:737` | **full** | 1 |
| 9 | `EffectPass` — ACES tone mapping | `Viewport.tsx:555` | full | 1 |
| 10 | SMAA edge detection | `SMAAEffect.update`, `postprocessing:11189` | full | 1 |
| 11 | SMAA blend-weight calculation | `:11190` | full | 1 |
| 12 | `EffectPass` — SMAA blend to screen | `Viewport.tsx:556` | full, default framebuffer | 1 |

**= 12 `renderer.render()` calls, 11 fullscreen draws + the scene.** Matches
finding 4 exactly.

Not counted in the 12 but real: a `ClearPass` inside `SMAAEffect.update`
(`postprocessing:11188`) clears the full-res edges target without a draw call.

### What this costs, and why it is the integrated-GPU risk

`FRAME_BUFFER_TYPE = THREE.HalfFloatType` (`contract.ts:88`) — every full-res
target is **RGBA16F, 8 bytes per pixel**, and §2.1 of the render contract forbids
dropping it. At the measured 1730x883 (1.53 MP), assuming every pass covers the
full viewport and N8AO's half-res passes cover a quarter of the area:

- 6 full-res fullscreen passes (7, 8, 9, 10, 11, 12) = 9.2 MP of fragments
- 5 half-res passes (2-6) = 1.9 MP
- **~11 MP of fullscreen fragment work per displayed frame — 7.25x the screen** —
  before a single scene triangle.

At DPR 2 (6.11 MP) that is ~44 MP and ~350 MB of RGBA16F traffic per frame. On a
discrete 1060 with dedicated bandwidth this is the 0.05-0.10 ms that finding 2
measured and dismissed. On an Apple/Intel tile GPU, each full-res RGBA16F target
is 8 B/px of *tile* memory and every one of those six passes is a full store and
reload of it. **This is the number that should transfer worst, and it is fixed
cost — it does not shrink when the scene is empty.**

Two observations for whoever attacks it:

1. **Pass 8 is a pure copy.** N8AO composites into its own `outputTargetInternal`
   and then blits that into the composer's `outputBuffer`
   (`N8AOPostPass.js:723-738`); the direct write is commented out three lines
   above. That is one full-res RGBA16F read + write per frame, ~24 MB of traffic,
   for nothing. It is library behaviour, not an app decision — fixable only by
   patching, forking, or replacing N8AO. Worth knowing before anyone concludes
   "AO costs X" and budgets around it.
2. **N8AO is 7 of the 12 renders and 6 of the 11 fullscreen draws.** Issue A's
   suspect (`transparencyAware`) and lead B4 ("drop AO in walkthrough") both live
   here. Disabling the pass (`AmbientOcclusion.tsx:93-96` already toggles
   `enabled` rather than unmounting) drops the chain from 12 renders to 5 and the
   fullscreen fragment load from ~11 MP to ~4.6 MP — a 58% cut in fixed
   fullscreen cost, at the price of the grounding AO gives furniture.

---

## 7. Where this leaves the plan

- Finding 3 is confirmed and its mechanism is now named: **six draws per wall
  piece, four of them redundant by construction.** It is not "geometry is
  fragmented" — the geometry is fine, the material array is not.
- §5.1 is a ~4-line change to two protected files that removes a third of the
  scene's draw calls with no behaviour change. Nothing else in the inventory has
  that ratio. It should be the first thing the next session does, with the
  `faceSide` companion edit, measured with `npm run perf:measure` against
  `scripts/perf/baselines/2026-08-27-dpr1-unfurnished.json`.
- Finding 4 is enumerated. The chain is derivable from source and matches at 12.
  The transferable risk is ~7.25 screen-fulls of RGBA16F fullscreen work per
  frame, of which N8AO is 6 and one is a pure copy the library does not need.
- The unmeasured worst case is not the walkthrough. It is **any frame during a
  drag or a door swing**, where `ShadowRefreshRig` re-renders the sun's map and
  six cube faces, each re-submitting every wall piece six times.

## 8. Open questions

1. `scene.walls.length` / `openings.length` / `rooms.length` on the project that
   produced 687 — turns §3's consistency check into a real verification.
2. Draw calls during a drag (shadow refresh active). Predicted to be several
   times the steady-state figure; never measured.
3. Draw calls on a **furnished** scene. Decides whether 5.6 outranks everything
   above it.

## 9. Answers (2026-08-28)

**Q3 — furnished draw calls: measured, and 5.6 does NOT outrank the wall work.**
`--furnish 40` against the same `de882e79`, editor:city, DPR 1
(`baselines/2026-08-28-dpr1-furnished40.json`):

| scene | draw calls | triangles | tri/call |
|---|---|---|---|
| unfurnished | 140 | 2 943 | 21 |
| IKEA ×40 | 186 | 534 677 | 2 875 |
| mix ×40 | 321 | 902 583 | 2 812 |
| BlenderKit ×40 | 399 | 973 865 | 2 441 |

Furniture costs **1.2–6.5 draw calls per item** depending on source, against the
140-call unfurnished floor that is almost entirely architecture. So on a 40-item
scene the two are comparable, and on the 687-call reading that motivated this
document — a much larger house — the architecture dominates outright. **The
ranking in §7 stands.** Note the contrast in health: furniture submits
~2 400–2 900 triangles per call, architecture submits 21. The problem was never
"too much geometry"; it is that the architecture is shredded into tiny
submissions.

A caution for anyone acting on the BlenderKit row: those assets carry *more*
draw calls and triangles than IKEA's, which is a property of the models
themselves, not of the optimisation pipeline. Draco is wire compression — it
decodes to identical geometry. Do not read that row as "optimising a model makes
it slower to draw".

**Q1 — partially.** `de882e79` carries ~50 walls and 5 parametric items; it is
the small house, not the one that produced 687. The consistency check in §3 is
still unverified against the large project.
