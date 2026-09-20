# Sofa playbook (family of the shipped `factory:block-arm-sofa`)

Template: `scripts/blender/examples/block_arm_sofa.py` (copy to the new candidate as `build_sofa.py`; it already takes
`--width --depth --height --color --out`). Helpers now live in `furniture_lib.py` (`puff`, `piping`, `place_mesh`,
`tinted_fabric`); the template still carries its own copies, so prefer the library versions in new builds.

## What shipped and what the owner flagged (fix these in the next sofa)

Approved with three weak spots, all to be fixed in the NEXT sofa:

1. **Fabric too smooth at room distance.** Rough Linen at its true 27 cm tile reads as fine linen. The references show chunky
   woven / textured upholstery. Choose a coarser CC0 fabric (Poly Haven ids to try, in order: `poly_wool_herringbone`,
   `wool_boucle`, `jogging_melange`, `hessian_230`, `cotton_jersey`) and pick by rendering ONE cushion close-up AND a
   room-distance shot before building the rest. A coarser weave needs no more geometry; do not fake it with a bigger tile
   (that breaks physical scale, which is a rule).
2. **Arm pads look headrest-like.** Make the arm one continuous form (a rounded box with a subtle crown and a seam line via
   `piping()`), or use a genuinely different arm (see styles below). Do not stack a separate pad on a track arm unless the
   reference shows it.
3. **Missing detail.** Add: seat-cushion seam/welt variety, optional button tufting or channel stitching where the reference
   has it (model as a displacement grid or explicit buttons, `lessons-learned.md` softness table), optional scatter cushions
   as a separate stuffed-goods part (cloth sim with pressure, `blender-recipes.md`), and a slightly stronger back-cushion
   crown/sag so it reads soft.

### Status of the three weak spots (updated 2026-09-20)

Fixed in `flare-arm-sofa r001` (approved): (1) coarser fabric, Poly Haven `curly_teddy_natural` (tile 0.333 m, normal strength 1.6,
colour multiply); (2) arm is one sheared rounded form (`flare()`: shear x by height, no pad); (3) plumper back cushions (0.20 m
thick, front bulge 0.05) plus piped seams. NOT done yet: tufting, scatter cushions, dedicated arm seam. Fabric notes: `wool_boucle`
is a plaid (unusable); `poly_wool_herringbone` and `jogging_melange` are fine-grain (same weakness as linen). Copy
`scripts/blender/examples/flare_arm_sofa.py` as the base for the next sofa: it uses the library helpers only.
Verified numbers: legs 0.19 m with 0.05 splay, arm 0.15 thick leaning 0.05 outward, frame 0.30, seat 0.19 thick, back cushions leaned 11 degrees.

### Update 2026-09-20 (plain-block-sofa r001, approved)

Start from `scripts/blender/examples/plain_block_sofa.py` (newest: cylindrical legs, seg=8 corners, hessian_380). Corner recipe: `rounded_box(..., seg=8)`, arm radius 0.035, sub 1 on flat parts, 2 on arms, 3 on shaped cushions (91k triangles). Legs: cone 0.040/0.030 radius, 0.15 tall. Arm 0.20 thick, vertical, top 0.62. Done sofas: block-arm, flare-arm, plain-block. See lessons-learned 7d.

### Update 2026-09-20 (tufted-sage-sofa r001, approved after 1 rejection)

Start from `scripts/blender/examples/tufted_sage_sofa.py` for anything with a wooden base, tufting or a pile fabric. Verified numbers: 4.5 cm oak base frame (front/back rails 2*FX+FT long, side rails between), outer faces flush with the arm underside; tapered legs 0.15 m long from the frame corners, splay 0.06, pulled inboard of the arm outline (a wider leg position grew the depth by 4 cm); tufted back = one slab (0.15 thick, 96 by 40 cuts on the front face, wrapped forward 4.5 cm at the ends, leaned 10 degrees), padding dome 3.2 cm, 12 buttons (6 by 2) each with a divot of depth 5.2 cm and sigma 5.5 cm plus 4.5 mm radial folds; velvet = Poly Haven velour_velvet (tile 0.284, normal 1.5) with `pile_sheen(weight 0.4, roughness 0.42)`; 86k triangles, 7.0 MB. Arm: 0.17 thick, top 0.64, flare 0.07, top slopes down 5 cm toward the front. Sofas done: block-arm, flare-arm, plain-block, tufted-sage. See lessons-learned 7e.

### Update 2026-09-20 (beige-leather-sofa r004, approved after 3 rejections)

Start from `scripts/blender/examples/beige_leather_sofa.py` for any leather sofa or any cushion with a stitched seam (uses the library upholstery-v2 helpers). Split back = two independent back cushions, 9 degree lean, one horizontal stitched seam at 60 percent height that is a pure inward divot (never an extruded chamber), rear back panel 0.09 thick, two seat cushions with welts and stitch rows, leather base box on 0.17 splayed oak legs. Verified numbers in lessons-learned 7f. Sofas done: block-arm, flare-arm, plain-block, tufted-sage, beige-leather. Remaining: 154244 (headrest back pads) and the two sectionals; 154204 (L-shape chaise, grey fabric, nickel legs) is the last one the owner asked for.

## The seven reference sofas (inspiration only; user screenshots, not inputs)

Screenshots live in `C:\Users\dandu\OneDrive\תמונות\Screenshots\` (2026-09-20 15:41 to 15:42, names `Screenshot 2026-09-20 154159/154204/154216/154228/154235/154244/154249.png`, plus the night one `Screenshot 2026-09-20 003321.png`, which is the grey block-arm sofa that became r001). Never copy them into the repo or the GLB.

| Shot | Sofa | Distinguishing vocabulary | Suggested build |
|---|---|---|---|
| 154159 | 3-seat, sage/grey-green, mid-century | Tufted back (grid buttons), flared angled arms, splayed oak legs, curved back | Tufting + flared arm + splayed legs |
| 154204 | L-shape chaise, light grey | Tufted back cushions, slim block arm (one side), metal legs, chaise on left | Chaise module; mirror parameter |
| 154216 | 3-seat, beige leather-look | Rolled/curved arms, split back, tapered wood legs | Curved arm, two back panels |
| 154228 | Corner sectional, charcoal | Wood plinth base, chaise, loose back cushions | Sectional layout, plinth |
| 154235 | 3-seat, cream/ivory | Flared thin arms, tapered wood legs, two seat + two back cushions | Closest to r001; arm variant only |
| 154244 | 3-seat, light grey | Headrest-style back pads with fold line, dark tapered legs, flared arms | Back with headrest fold |
| 154249 | 3-seat, beige | Square block arms, cylindrical wood legs, plain | Simplest; do it first |

Order suggested: 154235 (arm style change only) then 154249 (legs + plain back) then the tufted ones, then the L/corner
sectionals last (chaise module needs a layout parameter and a second footprint plan).

## Parametric contract (keep for every sofa)

- Args: width, depth, height (plus `--chaise-side left|right` and `--chaise-len` for sectionals), colour.
- Colour: `tinted_fabric` only; the same normalised texture for every colour so weave and roughness never change.
- Sizes: regenerate; never scale a GLB. Footprint in the catalog = audited bounds of the DEFAULT size.
- Ship one default size per sofa first; size/colour variants stay build arguments until the app supports variant pickers
  (`variantKey` / `colors` exist on catalog entries but are IKEA-era; check `src/furniture/variants.ts` before using).

## Verified numbers (r001, reuse as starting points)

Seat top 0.46 m, seat cushion 0.17 m thick with 0.028 crown, arm height about 0.62, leg 0.17 with 0.028 splay, back cushion
0.19 m thick leaned 9 degrees, piping radius 5.5 mm, back frame top 5 cm below the arm top, build 12 s, 60k triangles,
7.5 MB (2k fabric maps). Fabric maps at 2k are needed for weave to show; 1k erased it.

### Update 2026-09-20 (grey-chaise-sectional r001, approved after 2 rounds of small fixes)

Start from `scripts/blender/examples/grey_chaise_sectional.py` for any multi-module sofa or any sofa with tufted backs and plain seats. Solved layout (Blender axes, run back at +y, chaise at -x):
arm thickness AT 0.15, seat unit SW = (W - 2 AT) / 3, chaise extension width = AT + SW (flush with the arm's outer face), chaise length beyond the run 0.70,
run depth 0.95, total 1.65; fabric base 0.15 to 0.30 on 0.15 legs, seats 0.17 thick (top 0.45), back panel 0.10 thick behind three tufted back cushions
(0.15 thick, 9 degree lean, 3 x 2 buttons, plump 0.02, divot 0.036, sigma 0.045, wear 0.95 / 1.18 / 1.02), arms 0.62 high with a welt 2.8 cm below the top, seven
nickel pin legs (top radius 0.015, bottom 0.0085, splay 0.05, metallic 0.72). 105k triangles, 9.0 MB. Modules are separate parts with real seams; the footprint is
the bounding rectangle. `--chaise-side right` mirrors x and flips normals. Fabric: hessian_380 tinted `#b9bbbe`, normal 2.4, tone amplitudes 0.10 / 0.06 / 0.025.
Sofas done: block-arm, flare-arm, plain-block, tufted-sage, beige-leather, grey-chaise-sectional. Still never built: 154244 (headrest back pads), 154228 (charcoal corner sectional on a plinth).
