"""Tufted mid-century 3-seat sofa, r001 - Route C (procedural static Blender), PARAMETRIC in width/depth/height/colour.

Run:  blender -b -P build_sofa.py -- --width 2.10 --depth 0.92 --height 0.84 --color "#9ca993" --out exports/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): mid-century 3-seater, grid-tufted back with buttons, flared angled arms,
splayed tapered oak legs with a slim oak rail, two seat cushions.
Changed: own proportions, real modelled tufting (pinched creases + covered buttons), arm that slopes toward the front.
Fabric = Poly Haven Velour Velvet (CC0), luminance-normalised, colour = baseColorFactor multiply (pile never changes).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 2.10)
D = opt("--depth", 0.92)
H = opt("--height", 0.84)
COLOR = opt("--color", "#9ca993")
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "tufted-sage-sofa_r001.glb")))
random.seed(31)

# ---- derived construction (metres) -------------------------------------------------------------------------------
LEG_H = 0.15                    # leg length, from the floor to the underside of the oak base
RAIL_H = 0.045                  # oak base frame height (the sofa sits on this, as in the reference)
BASE_Z = LEG_H + RAIL_H         # underside of the fabric body
FZ = 0.30                       # top of the fabric base frame
SEAT_T = 0.17
SEAT_TOP = FZ + SEAT_T - 0.02
AT = 0.17                       # arm thickness
AH = min(0.64, H * 0.76)        # arm top height (rear)
FLARE = 0.07                    # arm top leans outward by this much
SLOPE = 0.05                    # arm top drops toward the front by this much
ARM_Z0 = BASE_Z                 # arms sit directly on the oak base
BACK_T = 0.15
TILT = math.radians(10)
FAB_TILE = 0.284                # velour_velvet real-world tile (m)
OAK_TILE = 1.83
INNER_W = W - 2 * (AT + 0.4 * FLARE)
BTN_COLS, BTN_ROWS = 6, 2          # button grid (rows of buttons)
PLUMP = 0.032                   # padding dome height
DIVOT = 0.052                   # depth pulled in at each button
SIGMA = 0.055                   # divot width
SHEEN = 0.40                    # velvet pile sheen (round 2 used 1.0: too glossy)
FOLD = 0.0045                   # radial pull-fold amplitude
CURVE = 0.045                   # back wraps forward at both ends by this much


def small(img, px):
    img.scale(px, px)
    return img


def oak_material():
    d = load_img("oak_d", os.path.join(MAT, "oak_veneer_01_diff_2k.jpg"), "sRGB"); small(d, 1024)
    r = load_img("oak_r", os.path.join(MAT, "oak_veneer_01_rough_2k.jpg"), "Non-Color"); small(r, 1024)
    n = load_img("oak_n", os.path.join(MAT, "oak_veneer_01_nor_gl_2k.jpg"), "Non-Color"); small(n, 1024)
    return pbr_material("oak", d, r, n, spec=0.4)


def leg(name, x, y, mat, top=0.030, bot=0.019, splay=0.06, sx=1, sy=1):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=28, radius1=bot, radius2=top, depth=1.0)
    for v in bm.verts:
        t = 1.0 if v.co.z > 0 else 0.0
        v.co.z = (v.co.z + 0.5) * (LEG_H + 0.012)
        v.co.x += sx * splay * (1 - t)
        v.co.y += sy * splay * 0.9 * (1 - t)
    for v in bm.verts:
        v.co.x += x
        v.co.y += y
    bm.normal_update()
    fabric_uv(bm, OAK_TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    return ob


def flare(ob, s, amount):
    """Shear an arm so its top leans outward (s = +1 right, -1 left) while keeping its thickness."""
    zs = [v.co.z for v in ob.data.vertices]
    z0, z1 = min(zs), max(zs)
    for v in ob.data.vertices:
        v.co.x += s * amount * (v.co.z - z0) / (z1 - z0)


def slope_arm(ob, drop):
    """Lower the arm top toward the front (-Y): z drops by `drop` at the front, linearly to nothing at the back."""
    ys = [v.co.y for v in ob.data.vertices]; zs = [v.co.z for v in ob.data.vertices]
    y0, y1, z0, z1 = min(ys), max(ys), min(zs), max(zs)
    for v in ob.data.vertices:
        v.co.z -= drop * (1 - (v.co.y - y0) / (y1 - y0)) * (v.co.z - z0) / (z1 - z0)


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def tufted_slab(name, sx, sy, sz, r, nx, nz, mat, tile, region, buttons, seg=8):
    """Rounded slab whose -Y face is a plump padded panel held down by buttons: the padding is one smooth dome and every
    button pulls the fabric into a conical divot with faint radial pull-folds (tension, not extruded cells).
    region = (tx0, tx1, tz0, tz1) padded area, buttons = [(x, z)] in the slab's local frame (z from 0 to sz).
    Returns (object, button_positions)."""
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

    def bulge(x, z):
        edge = min(x - tx0, tx1 - x, z - tz0, tz1 - z)
        if edge <= 0:
            return 0.0
        win = smoothstep(edge / 0.07)
        hx = (tx1 - tx0) / 2; hz = (tz1 - tz0) / 2
        u, w = (x - (tx0 + tx1) / 2) / hx, (z - (tz0 + tz1) / 2) / hz
        v = PLUMP * (1.0 - 0.35 * u * u - 0.25 * w * w)                  # one padded dome
        for k, (bx, bz) in enumerate(buttons):
            dx, dz = x - bx, z - bz
            rr = math.hypot(dx, dz)
            v -= DIVOT * (1 + (rr / SIGMA) ** 2) ** -1.5                  # tension divot around the button
            th = math.atan2(dz, dx)
            v += FOLD * math.cos(7 * th + k * 1.7) * math.exp(-(rr / 0.075) ** 2) * smoothstep(rr / 0.02)   # radial pull-folds
        return v * win

    for v in bm.verts:
        front = v.co.y < -sy / 2 + 0.006                                  # front flat face only
        v.co.y -= CURVE * (v.co.x / (sx / 2)) ** 2                        # wrap the whole slab forward at the ends
        if front:
            v.co.y -= bulge(v.co.x, v.co.z)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    pos = [(bx, -sy / 2 - CURVE * (bx / (sx / 2)) ** 2 - bulge(bx, bz), bz) for bx, bz in buttons]
    return ob, pos


def button(name, x, y, z, mat, rad=0.0135):
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


# ---- build -------------------------------------------------------------------------------------------------------
reset_scene()
fab = tinted_fabric("velour", os.path.join(MAT, "velour_velvet_diff_2k.jpg"), os.path.join(MAT, "velour_velvet_rough_2k.jpg"),
                    os.path.join(MAT, "velour_velvet_nor_gl_2k.jpg"), COLOR, MAT, normal_strength=1.5, spec=0.12)
oak = oak_material()
# velvet: pile sheen (view-dependent brighter/darker response), moderate so it never reads as gloss
pile_sheen(fab, weight=SHEEN, roughness=0.42)

y_front, y_back = -D / 2, D / 2

# oak base: a 4.5 cm perimeter frame the body sits on, with tapered legs splaying out from its corners
FT = 0.034
FX = W / 2 - FLARE - FT / 2      # oak base outer face flush with the arm underside (arm bottom outer edge = W/2 - FLARE)
FY = (D - 0.01) / 2 - FT / 2     # ... and with the arm front/back faces
member("basefront", 0, -FY, LEG_H, 2 * FX + FT, FT, RAIL_H, 0, oak, oak, OAK_TILE, bevel=0.004)
member("baseback", 0, FY, LEG_H, 2 * FX + FT, FT, RAIL_H, 0, oak, oak, OAK_TILE, bevel=0.004)
for k, sx_ in enumerate((-1, 1)):
    member(f"baseside{k}", sx_ * FX, 0, LEG_H, FT, 2 * FY - FT, RAIL_H, 1, oak, oak, OAK_TILE, bevel=0.004)
for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
    leg(f"leg{i}", sx * (FX - 0.045), sy * (FY - 0.065), oak, sx=sx, sy=sy)

# base frame between the arms
base = rounded_box("base", INNER_W + 0.06, D - 0.04, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, seg=8)
place_mesh(base, 0, 0, BASE_Z)

# arms: one continuous rounded form, leaning outward, sloping down toward the front
for s, nm in ((-1, "armL"), (1, "armR")):
    arm = rounded_box(nm, AT, D - 0.01, AH - ARM_Z0, 0, 0.04, 2, fab, FAB_TILE, seg=8)
    puff(arm, 0.008, 0.004, 0.002)
    place_mesh(arm, 0, 0, ARM_Z0)
    slope_arm(arm, SLOPE)
    flare(arm, s, FLARE)
    arm.data.transform(Matrix.Translation((s * (W / 2 - AT / 2 - FLARE), 0, 0)))

# tufted back: one slab, wraps forward at the ends, leans back
bz_world = FZ - 0.02
bh = (H - bz_world) / math.cos(TILT) - 0.005
slab_w = INNER_W + 0.08
tz0 = (SEAT_TOP + 0.005 - bz_world)
tz1 = bh - 0.05
tx = (INNER_W - 0.03) / 2
bspan = 2 * tx / BTN_COLS
btns = [(-tx + (i + 0.5) * bspan, tz0 + (j + 1) * (tz1 - tz0) / (BTN_ROWS + 1)) for i in range(BTN_COLS) for j in range(BTN_ROWS)]
back, btn = tufted_slab("backtuft", slab_w, BACK_T, bh, 0.045, 96, 40, fab, FAB_TILE, (-tx, tx, tz0, tz1), btns)
print("BUTTONS", [(round(x,3),round(y,3),round(z,3)) for x,y,z in btn])
bobs = [back] + [button(f"btn{i}", x, y, z, fab) for i, (x, y, z) in enumerate(btn)]
bzb = min(v.co.z for v in back.data.vertices)
for o in bobs:
    place_mesh(o, 0, y_back - BACK_T / 2 - 0.09, bz_world, rx=-TILT, bz=bzb)

# seat cushions: two, crowned, front proud of the frame by 2 cm
seat_d = D - BACK_T - 0.01
cw = (INNER_W - 0.006) / 2
for i, s in enumerate((-1, 1)):
    c = rounded_box(f"seat{i}", cw - 0.004, seat_d, SEAT_T, 0, 0.05, 3, fab, FAB_TILE, seg=8)
    puff(c, 0.030, 0.018)
    bz0 = min(v.co.z for v in c.data.vertices)
    ps = [piping(f"seatpipe{i}{k}", (cw - 0.004) / 2 - 0.003, seat_d / 2 - 0.003, bz0 + z, 0.05, 0.0045, fab, FAB_TILE)
          for k, z in enumerate((0.02, SEAT_T - 0.026))]
    for o in [c] + ps:
        place_mesh(o, s * (cw / 2 + 0.001), y_front + seat_d / 2 + 0.02, FZ - 0.02, bz=bz0)

# ---- centre + export ---------------------------------------------------------------------------------------------
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
print("BOUNDS", [round(hi[k] - lo[k], 3) for k in range(3)])
export_glb(OUT)
