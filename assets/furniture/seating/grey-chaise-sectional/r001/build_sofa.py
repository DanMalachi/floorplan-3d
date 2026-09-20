"""Grey L-shape chaise sectional, r001 - Route C (procedural static Blender), PARAMETRIC in width/depth/height/colour/chaise.

Run:  blender -b -P build_sofa.py -- --width 2.85 --depth 0.95 --chaise-len 0.70 --height 0.82 --color "#a9abae" --chaise-side left --out exports/x.glb
--depth is the DEPTH OF THE 3-SEAT RUN; the chaise extends forward from it by --chaise-len (total depth = depth + chaise-len).
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): L-shape with a chaise, three button-tufted back cushions, tufted chaise top,
two block arms (chaise side open), slim splayed nickel legs, woven light-grey fabric.
Changed: own proportions and tuft layout; real tension divots (padding held down by buttons), never raised cells.
Fabric = Poly Haven Hessian 380 (CC0), luminance-normalised, colour = baseColorFactor multiply.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 2.85)
D = opt("--depth", 0.95)                 # run depth
CHL = opt("--chaise-len", 0.70)          # chaise extension beyond the run front
H = opt("--height", 0.82)
COLOR = opt("--color", "#b9bbbe")
SIDE = opt("--chaise-side", "left")
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "grey-chaise-sectional_r001.glb")))
random.seed(41)

# ---- derived construction (metres) -------------------------------------------------------------------------------
LEG_H = 0.15                    # from the floor to the underside of the fabric base
BASE_Z = LEG_H                  # underside of the fabric body
FZ = 0.30                       # top of the fabric base
SEAT_T = 0.17
SEAT_TOP = FZ + SEAT_T - 0.02   # 0.45
AT = 0.15                       # arm thickness
AH = min(0.62, H * 0.76)        # arm top
BACK_T = 0.15                   # tufted back cushion thickness
PANEL_T = 0.10                  # back panel behind the cushions
TILT = math.radians(9)
FAB_TILE = 0.274                # hessian_380 real-world tile (m)
INNER0, INNER1 = -W / 2 + AT, W / 2 - AT
SW = (INNER1 - INNER0) / 3      # width of one seat / back unit
PLUMP = 0.020                   # padding dome height (kept small: outline stays clean)
DIVOT = 0.036                   # depth pulled in at each button
SIGMA = 0.045                   # divot width
FOLD = 0.0035                   # radial pull-fold amplitude
CURVE = 0.010                   # back cushions wrap forward at the ends by this much
y_back = D / 2
y_runfront = -D / 2
y_chaisefront = y_runfront - CHL


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def leg(name, x, y, mat, top=0.015, bot=0.0085, splay=0.05, sx=1, sy=1):
    """Slim tapered pin leg splaying outward (sx, sy = outward direction signs)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20, radius1=bot, radius2=top, depth=1.0)
    for v in bm.verts:
        t = 1.0 if v.co.z > 0 else 0.0
        v.co.z = (v.co.z + 0.5) * (LEG_H + 0.012)
        v.co.x += sx * splay * (1 - t)
        v.co.y += sy * splay * (1 - t)
    for v in bm.verts:
        v.co.x += x
        v.co.y += y
    bm.normal_update()
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def tufted_slab(name, sx, sy, sz, r, nx, nz, mat, tile, region, buttons, curve=0.0, seg=8, wear=1.0):
    """Rounded slab whose -Y face is a padded panel held down by buttons: one smooth dome, a conical tension divot at each
    button, faint radial pull-folds. region = (tx0, tx1, tz0, tz1) padded area, buttons = [(x, z)] in the slab local frame
    (x centred, z from 0 to sz). Divots only pull INWARD from the dome; the dome is the only outward term (PLUMP)."""
    tx0, tx1, tz0, tz1 = region
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=seg, profile=0.5, affect="EDGES")
    for axis, cuts in ((0, nx), (2, nz), (1, 2)):
        es = []
        for e in bm.edges:
            d = e.verts[0].co - e.verts[1].co
            if e.calc_length() > 0.02 and max(range(3), key=lambda i: abs(d[i])) == axis:
                es.append(e)
        bmesh.ops.subdivide_edges(bm, edges=es, cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        v.co.z += sz / 2
    bm.normal_update()
    fabric_uv(bm, tile)

    # every button is different: fabric stretches over padding and settles with use (depth, width, ellipse, fold, position, wear)
    rng = random.Random(sum(ord(c) * (i + 3) for i, c in enumerate(name)) + 5)
    zc = (tz0 + tz1) / 2
    bt = []
    for bx, bz in buttons:
        low = max(0.0, (zc - bz) / max(1e-6, (tz1 - tz0) / 2))            # lower buttons get pulled harder (the seated back)
        bt.append((bx + rng.uniform(-0.007, 0.007), bz + rng.uniform(-0.007, 0.007),
                   wear * rng.uniform(0.62, 1.32) * (1.0 + 0.22 * low),      # depth factor
                   rng.uniform(0.82, 1.28),                                   # width factor
                   rng.uniform(1.0, 1.55), rng.uniform(0, math.pi),           # ellipse ratio, ellipse angle
                   rng.uniform(0.5, 1.5), rng.uniform(0, 6.283)))             # fold amplitude, fold phase

    def bulge(x, z):
        edge = min(x - tx0, tx1 - x, z - tz0, tz1 - z)
        if edge <= 0:
            return 0.0
        win = smoothstep(edge / 0.06)
        hx = (tx1 - tx0) / 2; hz = (tz1 - tz0) / 2
        u, w = (x - (tx0 + tx1) / 2) / hx, (z - (tz0 + tz1) / 2) / hz
        v = PLUMP * (1.0 - 0.35 * u * u - 0.25 * w * w)
        for k, (bx, bz, dk, sk, ek, ak, fk, pk) in enumerate(bt):
            dx, dz = x - bx, z - bz
            ex = dx * math.cos(ak) + dz * math.sin(ak)
            ez = -dx * math.sin(ak) + dz * math.cos(ak)
            rr = math.hypot(ex, ez * ek)
            v -= DIVOT * dk * (1 + (rr / (SIGMA * sk)) ** 2) ** -1.5
            th = math.atan2(dz, dx)
            v += FOLD * fk * math.cos(7 * th + pk) * math.exp(-(rr / (0.065 * sk)) ** 2) * smoothstep(rr / 0.018)
        return v * win

    for v in bm.verts:
        front = v.co.y < -sy / 2 + 0.006
        v.co.y -= curve * (v.co.x / (sx / 2)) ** 2
        if front:
            v.co.y -= bulge(v.co.x, v.co.z)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    # buttons sit ON the final mesh surface (raycast), not at the analytic height: an undersampled pit is shallower than the
    # formula, so an analytic position buries the button (4 buttons went missing that way)
    bvh = surface(ob)
    pos = []
    for bx, bz, *_ in bt:
        hit = bvh.ray_cast(Vector((bx, -1.0, bz)), Vector((0, 1, 0)))
        y = hit[0].y if hit[0] is not None else -sy / 2 - curve * (bx / (sx / 2)) ** 2 - bulge(bx, bz)
        pos.append((bx, y - 0.0015, bz))
    return ob, pos


def button(name, x, y, z, mat, rad=0.0125):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=rad)
    for v in bm.verts:
        v.co.y *= 0.5
        v.co += Vector((x, y, z))
    bm.normal_update()
    fabric_uv(bm, FAB_TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def grid_buttons(w, l, cols, rows, margin=0.09):
    """cols x rows button positions over a w x l padded area (x centred, z from 0 to l); returns (region, buttons)."""
    tx = w / 2 - margin
    z0, z1 = margin, l - margin
    bs = [(-tx + (i + 0.5) * (2 * tx / cols), z0 + (j + 0.5) * (z1 - z0) / rows) for i in range(cols) for j in range(rows)]
    return (-tx, tx, z0, z1), bs


# ---- build -------------------------------------------------------------------------------------------------------
reset_scene()
fab = tinted_fabric("hess", os.path.join(MAT, "hessian_380_diff_2k.jpg"), os.path.join(MAT, "hessian_380_rough_2k.jpg"),
                    os.path.join(MAT, "hessian_380_nor_gl_2k.jpg"), COLOR, MAT, normal_strength=2.4, spec=0.2)
tone_setup(fab)   # large-scale tone from world-space noise (vertex colour), never repeats
nickel = metal_material("nickel", "#e0e1e4", 0.34)
nickel.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.72   # app viewer env is dark: a pure mirror renders black

# fabric base: run between the arms, plus the chaise base (full width, flush with the arm outer face)
run_base = rounded_box("runbase", INNER1 - INNER0 + 0.06, D - 0.02, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, seg=8)
randomise_uv(run_base)
place_mesh(run_base, 0, 0, BASE_Z)
place_mesh(piping("runbaseseam", (INNER1 - INNER0 + 0.06) / 2 - 0.002, (D - 0.02) / 2 - 0.002, FZ - BASE_Z - 0.03, 0.02, 0.0045, fab, FAB_TILE), 0, 0, BASE_Z, bz=0.0)
ch_w = AT + SW
ch_base = rounded_box("chaisebase", ch_w, CHL - 0.01, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, seg=8)
randomise_uv(ch_base)
place_mesh(ch_base, -W / 2 + ch_w / 2, y_runfront - CHL / 2 + 0.005, BASE_Z)
place_mesh(piping("chbaseseam", ch_w / 2 - 0.002, (CHL - 0.01) / 2 - 0.002, FZ - BASE_Z - 0.03, 0.02, 0.0045, fab, FAB_TILE),
           -W / 2 + ch_w / 2, y_runfront - CHL / 2 + 0.005, BASE_Z, bz=0.0)

# legs: run corners, mid back, mid front; chaise front corners (all inboard of the outline, splaying outward)
LI = 0.09
lx = W / 2 - LI
chx0 = -W / 2 + LI
chx1 = -W / 2 + ch_w - LI
legs = [(-lx, y_back - LI, -1, 1), (lx, y_back - LI, 1, 1), (lx, y_runfront + LI, 1, -1), (0.0, y_back - LI, 0, 1),
        (chx0, y_chaisefront + LI, -1, -1), (chx1, y_chaisefront + LI, 1, -1), (0.35, y_runfront + LI, 0, -1)]
for i, (x, y, sx_, sy_) in enumerate(legs):
    leg(f"leg{i}", x, y, nickel, sx=sx_, sy=sy_)

# arms: padded block, one continuous rounded form; chaise side has no arm in front of it
for s, nm in ((-1, "armL"), (1, "armR")):
    arm = rounded_box(nm, AT, D - 0.01, AH - BASE_Z, 0, 0.035, 2, fab, FAB_TILE, seg=8)
    puff(arm, 0.008, 0.004, 0.002)
    randomise_uv(arm)
    abz = min(v.co.z for v in arm.data.vertices)
    aseam = piping(nm + "seam", AT / 2 - 0.002, (D - 0.01) / 2 - 0.002, abz + AH - BASE_Z - 0.028, 0.035, 0.0045, fab, FAB_TILE)
    for o in (arm, aseam):
        place_mesh(o, 0, 0, BASE_Z, bz=abz)
    aseam.data.transform(Matrix.Translation((s * (W / 2 - AT / 2), 0, 0)))
    arm.data.transform(Matrix.Translation((s * (W / 2 - AT / 2), 0, 0)))

# back panel behind the cushions (blocks light through the gaps)
bp = rounded_box("backpanel", INNER1 - INNER0 + 0.04, PANEL_T, H - 0.12 - (FZ - 0.02), 0, 0.03, 1, fab, FAB_TILE, seg=8)
randomise_uv(bp)
place_mesh(bp, 0, y_back - PANEL_T / 2, FZ - 0.02)

# three tufted back cushions, leaned back
bz_world = FZ - 0.02
bh = (H - bz_world) / math.cos(TILT) - 0.005
tz_lo = SEAT_TOP + 0.005 - bz_world
for i in range(3):
    cx = INNER0 + (i + 0.5) * SW
    region, btns = grid_buttons(SW - 0.012, bh, 3, 2, margin=0.075)
    # the padded region starts above the seat (bottom margin lifted) and stops below the top edge
    tx = region[1]
    z_lo, z_hi = tz_lo + 0.05, bh - 0.06
    btns = [(-tx + (a + 0.5) * (2 * tx / 3), z_lo + (b + 0.5) * (z_hi - z_lo) / 2) for a in range(3) for b in range(2)]
    region = (-tx, tx, z_lo, z_hi)
    back, bp_ = tufted_slab(f"back{i}", SW - 0.012, BACK_T, bh, 0.045, 36, 26, fab, FAB_TILE, region, btns, curve=CURVE, wear=(0.95, 1.18, 1.02)[i])
    randomise_uv(back)
    bobs = [back] + [button(f"back{i}btn{k}", x, y, z, fab) for k, (x, y, z) in enumerate(bp_)]
    bzb = min(v.co.z for v in back.data.vertices)
    for o in bobs:
        place_mesh(o, cx, y_back - PANEL_T - BACK_T / 2 + 0.005, bz_world, rx=-TILT, bz=bzb)

# seating: three run units (the first one is the chaise root) plus the chaise extension. Plain crowned cushions with welts,
# each a little different (crown, belly, random settling wrinkles): no tufting on the seats.
seat_d = D - PANEL_T - BACK_T * 0.5


def seat(name, w, l, cx, cy, crown, belly, wr):
    c = rounded_box(name, w, l, SEAT_T, 0, 0.05, 2, fab, FAB_TILE, seg=8)
    puff(c, crown, belly, wr)
    randomise_uv(c)
    bz0 = min(v.co.z for v in c.data.vertices)
    ps = [piping(f"{name}pipe{k}", w / 2 - 0.003, l / 2 - 0.003, bz0 + z, 0.05, 0.0045, fab, FAB_TILE)
          for k, z in enumerate((0.02, SEAT_T - 0.026))]
    for o in [c] + ps:
        place_mesh(o, cx, cy, FZ - 0.02, bz=bz0)


for i, (crown, belly, wr) in enumerate(((0.030, 0.018, 0.0032), (0.024, 0.014, 0.0028), (0.033, 0.017, 0.0024))):
    seat(f"seat{i}", SW - 0.008, seat_d, INNER0 + (i + 0.5) * SW, y_runfront + seat_d / 2 + 0.02, crown, belly, wr)
seat("chaiseext", ch_w - 0.012, CHL + 0.02, -W / 2 + ch_w / 2, y_chaisefront + (CHL + 0.02) / 2, 0.028, 0.016, 0.0030)

# ---- centre + export ---------------------------------------------------------------------------------------------
if SIDE == "right":
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            ob.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
            ob.data.flip_normals()
lo = Vector((1e9,) * 3)
hi = Vector((-1e9,) * 3)
for ob in bpy.data.objects:
    if ob.type == "MESH":
        for v in ob.data.vertices:
            for k in range(3):
                lo[k], hi[k] = min(lo[k], v.co[k]), max(hi[k], v.co[k])
cx, cy, cz = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z
for ob in bpy.data.objects:
    if ob.type == "MESH":
        ob.data.transform(Matrix.Translation((-cx, -cy, -cz)))
tone_apply(fab, amp=(0.10, 0.06, 0.025))   # after the final centring
print("BOUNDS", [round(hi[k] - lo[k], 3) for k in range(3)])
export_glb(OUT)
