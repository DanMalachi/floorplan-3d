# Blender recipes (Route C)

Tested on Blender 5.2.1 LTS. Helpers live in `scripts/blender/furniture_lib.py`; the worked example is
`scripts/blender/examples/oak_platform_bed.py`. Run everything headless: `blender -b -P build.py`.

## Setup

- Install: `winget install BlenderFoundation.Blender` (needs the user to accept a UAC prompt). Verify the path before
  building: `C:\Program Files\Blender Foundation\Blender <ver>\blender.exe`.
- Always use **absolute paths** in scripts (`os.path.abspath`). Relative render/export paths resolve to `C:\`.
- Coordinates: metres, Blender Z up, front faces **-Y** (glTF export turns that into +Z). Centre X/Y, base at Z=0.
- Seed the RNG. A build must be reproducible or comparing revisions is meaningless.

## Rigid members (timber, board, metal section)

- `member(...)` = box with real thickness, 2 to 3 mm bevel (2 segments), world-scale UVs with V along the grain,
  per-member random UV offset, separate end-grain material on faces normal to the grain.
- Real product thicknesses: rails 25 to 45 mm, panels 18 to 30 mm, posts 45 to 70 mm, slats 15 to 20 mm.
- One visible surface = one member (see `lessons-learned.md`). Add a back panel behind any real reveal.
- Slats and ledgers that are only visible through gaps can stay simple boxes with a 1 mm bevel.

## PBR materials

- Base colour `sRGB`; roughness and normal `Non-Color`. Use the GL-convention normal map (`nor_gl`).
- The glTF exporter repacks roughness into `metallicRoughness`; verify all three channels in the audit (`missing` empty).
- Derivatives (end grain, tinted linen) are made with `derive_image` and logged in `sources.json` as derivatives of the CC0 map.
- Texture bytes: hero surface 2k (the eye lands on it), end grain 512, secondary fabrics 1k. JPEG q85 in export.
- Do not bake lighting into base colour.

## Structured soft goods (mattress, seat cushion, firm pillow)

- `rounded_box(name, w, d, h, z0, radius, subdiv, mat, tile, seg=4)` (seg=8 for hero upholstery; sub cuts multiply bevel rings); radius 3 to 5 cm. Add contour by moving top vertices: a Gaussian
  dip at the centre (about 1 cm) plus a slight lift at the ends. Piping = a curve with `bevel_depth` swept along the inset
  seam, converted to a mesh.
- Lean firm pillows against a headboard or backrest by rotating about X (about 18 degrees) and lowering so the lowest corner
  touches the surface (about 8 mm sink).

## Cloth simulation (draped and stuffed goods)

Sequence: model the rigid frame and the structured soft goods, `bake_xform` on anything that moves, add colliders, then simulate.

- Colliders: every part the cloth can touch, `add_collider(ob)` (friction about 25). Add a temporary floor collider as a
  safety net; delete it and all collision modifiers before export.
- Draped textile (`drape_setup`): one flat sheet from `flat_sheet(...)` about 2 to 5 cm above the surface, resolution 2 cm,
  about 110 frames, then `crease(amp 0.010 to 0.017, freq 2.4)` and `finish_cloth(thickness 0.02)`. Overhang about 12 cm per
  side. Mass is **per vertex**. Keep self-collision off.
- Stuffed (`inflate_setup`): sealed two-layer bag built from a flat grid whose boundary is a rounded superellipse (mirror in
  Z, weld the seam), start about 1 cm thick, pressure about 6, target volume about 0.038 m3 for a 66 x 47 cm bed pillow,
  about 70 frames, self-collision on. Then subdivide once for smoothness.
- **Never** simulate a fold from a double layer. Model the fold or cuff as a rounded box with a droop at the ends.
- Step the timeline frame by frame (`scene.frame_set(f)` for f in 1..N). The cache is not filled otherwise.
- Bake the evaluated mesh (`new_from_object(ob.evaluated_get(depsgraph))`) into a plain object; remove the cloth object.
- After mirroring or folding, check normals: glTF is single-sided by default.
- A full bed build with one cloth sim runs about 80 s. Budget sim time when planning revisions.

## Export and audit

- Downscale images before export; shift object locations so bounds are symmetric in X and Z; export with `export_apply=True`.
- `node .agents/skills/done-furniture-factory/scripts/audit-glb.mjs model.glb --json audit.json`. The audit is write-once:
  move a stale one to `audit.superseded-<sha8>.json` before re-running.
- Compare bounds against the brief. Record the final GLB bounds as the catalog footprint.

## Review renders

`blender -b -P scripts/blender/render-views.py -- model.glb renders --samples 40` writes front, three_quarter, side, back,
top, underside_contact, close_material_grazing and close_corner. Add the construction close-up the gate requires with
`--views extra.json`. `--thumb out.png` makes a 512 px transparent catalog thumbnail with a soft contact shadow. Use
`--samples 10` for drafts.
