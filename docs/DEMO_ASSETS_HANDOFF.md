# Demo asset work — handoff

**Written 2026-07-29.** Covers the BlenderKit furniture catalog and the ambientCG
floor materials added on 2026-07-28/29.

## Read this first

**This work was done in a hurry, for a demo.** It is real, verified and working
in the app — but the scope was chosen to make a demo look good quickly, not to
be the finished feature. Several things below are deliberately unfinished, and a
couple of them are decisions someone should revisit before this becomes product.

Nothing here is a pipeline you need to babysit: every script is offline,
idempotent and re-runnable. The risk is not that it breaks, it's that someone
mistakes the demo scope for the intended scope.

---

## What was actually shipped

| | Furniture | Floors |
|---|---|---|
| Source | BlenderKit (CC0 subset only) | ambientCG (all CC0) |
| Count | 75 models | 16 materials |
| Size in repo | ~20 MB (`public/furniture/blenderkit/opt/`) + 8 MB thumbs | 5.6 MB (`public/materials/floors/`) |
| Pipeline | `scripts/blenderkit/` | `scripts/materials/` |
| Runtime | rows appended in `src/furniture/catalog.ts` | `src/materials/{registry,loader}.ts` |

Both verified in the running app: models load at correct scale and sit on the
floor; floor tiling is physically correct (checked by counting a checkerboard —
0.51 m measured vs 0.525 m expected); catalog floors persist across reload; old
projects using the procedural `"wood"`/`"tile"`/`"concrete"` styles still render.

## Commands

```bash
# Furniture (BlenderKit, CC0 only)
npm run bk:index      # index the CC0 interior models
npm run bk:models     # download the selected .glb files (~412 MB, gitignored)
npm run bk:audit      # measure AABBs, detect up-axis, flag bad assets
npm run bk:optimize   # Draco + WebP -> public/furniture/blenderkit/opt
npm run bk:verify     # re-measure AABBs; catches passes that deform geometry
npm run bk:catalog    # emit data/furniture-blenderkit.catalog.json
npm run bk:thumbnails # pull picker thumbnails local

# Floors (ambientCG, CC0)
npm run mat:index     # index floor-relevant categories + physical sizes
npm run mat:fetch     # download + unpack the curated 16 (~38 MB, gitignored)
npm run mat:repack    # -> WebP + data/materials-floors.manifest.json
npm run mat:sheet out.png --category WoodFloor --sized   # review candidates visually
```

---

## Decisions taken under time pressure — revisit these

### 1. The protected 3D layer was edited

`CLAUDE.md` rule 1 protects the 3D viewer. Floors could not be extended without
touching it, so **Dan approved a scoped exception on 2026-07-29**: an adapter in
`src/materials/` owns the logic, and the protected files only delegate.

Total protected diff: **4 files, +102/−36** —
`src/schema/scene.ts` (FloorStyle union → string), `src/viewport3d/textures.ts`
(delegates to the registry), `src/viewport3d/FloorMesh.tsx` (2 lines),
`src/viewport3d/Viewport.tsx` (FloorCatalog renders from the registry).

This exception was granted for floors. **It is not a general licence to edit the
3D layer** — ask again for walls and doors.

### 2. Optimized binaries are committed to git

The IKEA models went to Vercel Blob because they're ~400 MB. These are 34 MB
total, so they're committed instead, which keeps a deploy reproducible from a
clean checkout rather than depending on files existing on one laptop.

If this grows much past ~100 MB, move it to Blob and follow the IKEA pattern
(gitignore + `.vercelignore` re-include + a `.blob.json` URL manifest).

### 3. Curation is hand-picked and shallow

`scripts/materials/curated.ts` names 16 materials explicitly and
`scripts/blenderkit/content-filter.ts` rejects 10 assets by name. Both were
chosen by looking at rendered contact sheets. That's honest and reviewable at
this size, but it does not scale — a real catalog needs the selection driven by
metadata plus a review pass, not a hard-coded list.

### 4. Catalog balance is skewed

75 furniture models, but **43 are Seating and only 1 is a bed and 1 is a kitchen
item.** Good enough to dress a demo living room, visibly thin anywhere else.
The fix is known — see "Blender" below.

---

## Known gaps

- **Walls and doors have no materials.** Only floors were done. Doors are the
  harder half: `Opening` in `src/schema/scene.ts` has no material field at all,
  and `buildJoinery.ts` emits boxes whose per-face 0–1 UVs will *stretch* a wood
  grain. That needs face-size-proportional UV remapping and is unproven.
- **234 BlenderKit assets are unreachable** because they ship `.blend` only, with
  no glTF export. 166 of them are realistic — 29 tables, 10 chairs, 8 sofas,
  6 desks, kitchen sets, 2 beds. Unlocking them needs **Blender installed** for a
  headless export step (~8.1 GB of transient downloads). Dan deferred this on
  2026-07-29. It is the single highest-yield next move and would roughly triple
  the catalog while fixing the balance problem above.
- **No automated tests** cover either pipeline. Verification was manual, in the
  browser. The `bk:verify` step is the closest thing to a regression check.

---

## Traps that already bit, so they don't bite again

- **`modelStyle: "realistic"` is not a quality filter.** It's a
  metadata-completeness filter. Filtering on it silently drops good furniture
  ("Mid Century Lounge Chair", "Vintage Day Bed") whose uploaders left the field
  blank. Cost: would have been 53 models instead of 85.
- **Reject scenes by physical size, not `objectCount`.** A sofa legitimately has
  cushions as separate objects.
- **`gltf-transform optimize` can deform geometry.** Its `join` pass silently
  dropped 17.7% of a chair's height. Always re-measure the AABB after optimizing
  — that's what `bk:verify` is for.
- **A file the toolchain can't read isn't automatically one three.js can't read
  — but check.** "Jiechen Table" (null texture sampler) failed in both and now
  renders as a white box if reinstated. It's content-rejected.
- **Only 26% of ambientCG materials publish physical dimensions.** Materials whose
  tiling scale is perceptible (wood planks, tiles) *must* use published sizes;
  stochastic ones (carpet, concrete, terrazzo) use a curated default because no
  one can tell. See the comment block in `scripts/materials/curated.ts`.
- **sharp's `chromaSubsampling` is JPEG-only.** WebP normal maps use
  `smartSubsample: true`.
- **Legacy floor styles must keep working forever.** `Room.floor` is persisted, so
  `"wood"`, `"tile"` and `"concrete"` appear in saved projects and must keep
  resolving to the procedural canvas textures.

---

## Licensing — the one thing not to get casual about

**Everything shipped is CC0.** No attribution required, redistribution allowed.

BlenderKit also has a large **Royalty-Free** tier that is deliberately excluded.
RF permits selling renders and games "if assets cannot be easily extracted" —
serving a `.glb` to a browser is the exact opposite. The restriction is enforced
three times in `scripts/blenderkit/` (search query, per-entry, pre-download).
**Do not relax it to grow the catalog.**

Provenance is recorded in `public/furniture/blenderkit/ATTRIBUTION.json` and per
material in the floor manifest.

Sources evaluated and rejected for licensing: 3dsky, Dimensiva, Design Connected,
BIMobject — all non-transferable licences, and largely branded designer furniture
carrying trademark/design-right exposure on top of model copyright. ABO (Amazon,
7,953 GLBs) and 3D-FUTURE are CC-BY-**NC**: fine for an internal demo, not for
product.
