"""Flare-arm 3-seat sofa, r001 - Route C (procedural static Blender), PARAMETRIC in width/depth/height/colour.

Run:  blender -b -P build_sofa.py -- --width 2.10 --depth 0.92 --height 0.82 --color "#f1eadb" --out exports/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): scandinavian 3-seater, slim arms that lean outward, splayed tapered wood legs,
two seat + two back cushions. Changed: arm is one continuous sheared form (no pad), piped cushions, own proportions.
Fabric = Poly Haven Curly Teddy Natural (CC0), luminance-normalised, colour = baseColorFactor multiply (weave never changes).
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
H = opt("--height", 0.82)
COLOR = opt("--color", "#f1eadb")
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "flare-arm-sofa_r001.glb")))
random.seed(23)

# ---- derived construction (metres) -------------------------------------------------------------------------------
LEG_H = 0.19
FZ = 0.30                       # top of the fabric base frame
SEAT_T = 0.19
SEAT_TOP = FZ + SEAT_T - 0.02
AT = 0.15                       # arm thickness
AH = min(0.60, H * 0.73)        # arm top height
FLARE = 0.05                    # arm top leans outward by this much
ARM_Z0 = LEG_H + 0.005
BACK_T = 0.13
TILT = math.radians(11)
FAB_TILE = 0.333                # curly_teddy_natural real-world tile (m)
OAK_TILE = 1.83
INNER_W = W - 2 * (AT + 0.4 * FLARE)


def small(img, px):
    img.scale(px, px)
    return img


def oak_material():
    d = load_img("oak_d", os.path.join(MAT, "oak_veneer_01_diff_2k.jpg"), "sRGB"); small(d, 512)
    r = load_img("oak_r", os.path.join(MAT, "oak_veneer_01_rough_2k.jpg"), "Non-Color"); small(r, 512)
    n = load_img("oak_n", os.path.join(MAT, "oak_veneer_01_nor_gl_2k.jpg"), "Non-Color"); small(n, 512)
    return pbr_material("oak", d, r, n, spec=0.4)


def leg(name, x, y, mat, top=0.055, bot=0.03, splay=0.05, sx=1, sy=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        t = 1.0 if v.co.z > 0 else 0.0
        s = bot + (top - bot) * t
        v.co.x *= s
        v.co.y *= s
        v.co.z = (v.co.z + 0.5) * (LEG_H + 0.012)
        v.co.x += sx * splay * (1 - t)
        v.co.y += sy * splay * 0.7 * (1 - t)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.002, segments=2, affect="EDGES")
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


# ---- build -------------------------------------------------------------------------------------------------------
reset_scene()
fab = tinted_fabric("teddy", os.path.join(MAT, "curly_teddy_natural_diff_2k.jpg"), os.path.join(MAT, "curly_teddy_natural_rough_2k.jpg"),
                    os.path.join(MAT, "curly_teddy_natural_nor_gl_2k.jpg"), COLOR, MAT, normal_strength=1.6, spec=0.2)
oak = oak_material()

y_front, y_back = -D / 2, D / 2

# legs (oak, tapered, splayed outward), inset under the frame
lx, ly = W / 2 - 0.20, D / 2 - 0.13
for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
    leg(f"leg{i}", sx * lx, sy * ly, oak, sx=sx, sy=sy)

# base frame between the arms
base = rounded_box("base", INNER_W + 0.06, D - 0.04, FZ - LEG_H, 0, 0.02, 2, fab, FAB_TILE)
place_mesh(base, 0, 0, LEG_H)

# arms: one continuous rounded form that leans outward (no separate pad)
for s, nm in ((-1, "armL"), (1, "armR")):
    arm = rounded_box(nm, AT, D - 0.01, AH - ARM_Z0, 0, 0.05, 3, fab, FAB_TILE)
    puff(arm, 0.010, 0.006, 0.002)
    place_mesh(arm, 0, 0, ARM_Z0)
    flare(arm, s, FLARE)
    arm.data.transform(Matrix.Translation((s * (W / 2 - AT / 2 - FLARE), 0, 0)))

# back frame (rear)
back = rounded_box("backframe", INNER_W + 0.06, BACK_T, AH - 0.06 - LEG_H, 0, 0.035, 3, fab, FAB_TILE)
place_mesh(back, 0, y_back - BACK_T / 2, LEG_H)

# seat cushions: two, crowned, front proud of the frame by 2 cm
seat_d = D - BACK_T - 0.01
cw = (INNER_W - 0.006) / 2
for i, s in enumerate((-1, 1)):
    c = rounded_box(f"seat{i}", cw - 0.004, seat_d, SEAT_T, 0, 0.05, 4, fab, FAB_TILE)
    puff(c, 0.034, 0.02)
    bz0 = min(v.co.z for v in c.data.vertices)
    ps = [piping(f"seatpipe{i}{k}", (cw - 0.004) / 2 - 0.003, seat_d / 2 - 0.003, bz0 + z, 0.05, 0.0055, fab, FAB_TILE)
          for k, z in enumerate((0.02, SEAT_T - 0.026))]
    for o in [c] + ps:
        place_mesh(o, s * (cw / 2 + 0.001), y_front + seat_d / 2 + 0.02, FZ - 0.02, bz=bz0)

# back cushions: two, plump, leaned back, top reaches H
BC_T = 0.20
bc_z0 = SEAT_TOP - 0.03
bc_h = (H - bc_z0) / math.cos(TILT) - 0.005
for i, s in enumerate((-1, 1)):
    c = rounded_box(f"backc{i}", cw - 0.004, BC_T, bc_h, 0, 0.06, 4, fab, FAB_TILE)
    puff(c, 0.0, 0.04, 0.004, front=0.05)
    bz0 = min(v.co.z for v in c.data.vertices)
    ps = [piping(f"backpipe{i}{k}", (cw - 0.004) / 2 - 0.004, BC_T / 2 - 0.004, bz0 + z, 0.06, 0.0055, fab, FAB_TILE)
          for k, z in enumerate((0.02, bc_h - 0.022))]
    for o in [c] + ps:
        place_mesh(o, s * (cw / 2 + 0.001), y_back - BACK_T - 0.06, bc_z0, rx=-TILT, bz=bz0)

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
