"""Beige leather 3-seat sofa, r004 - Route C (procedural static Blender), PARAMETRIC in width/depth/height/colour.

Run:  blender -b -P build_sofa.py -- --width 2.10 --depth 0.92 --height 0.84 --color "#cdb794" --out exports/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): contemporary 3-seater, slim curved arms leaning outward with rolled tops,
split back with a fold line, two seat cushions, splayed tapered wood legs.
Changed: own proportions, stuffed-roll arm, stitched pinch seam, own tileable leather grain (make_leather_maps.py), oak legs.

Reusable example (uses furniture_lib upholstery-v2 helpers). Grain maps: scripts/blender/make_leather_maps.py -> inputs/materials.
Physics modelled (v2): a cushion is foam wrapped in a leather cover. The cover is sewn tight across the seam, so the foam
bulges into a pillow on each side and the leather pinches into a narrow V at the stitch line, with wrinkles fanning out from
the seam ends where the hide is gathered. Seat corners gather the same way. Stitches are real thread on the real surface.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 2.10)
D = opt("--depth", 0.92)
H = opt("--height", 0.84)
COLOR = opt("--color", "#cdb794")
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "beige-leather-sofa_r004.glb")))
random.seed(17)

# ---- derived construction (metres) -------------------------------------------------------------------------------
LEG_H = 0.17
BASE_Z = LEG_H
FZ = 0.30
SEAT_T = 0.17
AT = 0.16
AH = min(0.62, H * 0.74)
FLARE = 0.09
SLOPE = 0.05
TILT = math.radians(9)
FAB_TILE = 0.25                 # leather_grain tile, 2048 px = 0.25 m
OAK_TILE = 1.83
INNER_W = W - 2 * (AT + 0.4 * FLARE)
PANEL_T = 0.09
BACK_T = 0.17
PITCH = 0.0125                  # stitch pitch (stitch 8.5 mm + 4 mm gap)


def small(img, px):
    img.scale(px, px)
    return img


def oak_material():
    d = load_img("oak_d", os.path.join(MAT, "oak_veneer_01_diff_2k.jpg"), "sRGB"); small(d, 1024)
    r = load_img("oak_r", os.path.join(MAT, "oak_veneer_01_rough_2k.jpg"), "Non-Color"); small(r, 1024)
    n = load_img("oak_n", os.path.join(MAT, "oak_veneer_01_nor_gl_2k.jpg"), "Non-Color"); small(n, 1024)
    return pbr_material("oak", d, r, n, spec=0.4)


def leg(name, x, y, mat, top=0.031, bot=0.019, splay=0.06, sx=1, sy=1):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=bot, radius2=top, depth=1.0)
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
    zs = [v.co.z for v in ob.data.vertices]
    z0, z1 = min(zs), max(zs)
    for v in ob.data.vertices:
        v.co.x += s * amount * (v.co.z - z0) / (z1 - z0)


def slope_arm(ob, drop):
    ys = [v.co.y for v in ob.data.vertices]; zs = [v.co.z for v in ob.data.vertices]
    y0, y1, z0, z1 = min(ys), max(ys), min(zs), max(zs)
    for v in ob.data.vertices:
        v.co.z -= drop * (1 - (v.co.y - y0) / (y1 - y0)) * (v.co.z - z0) / (z1 - z0)


# ---- dense, graded cushion mesh -----------------------------------------------------------------------------------
def finish(bm, name, mat):
    fabric_uv(bm, FAB_TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    randomise_uv(ob)
    return ob


# ---- split back: two chambers of foam pinched by one stitched seam ------------------------------------------------
def back_cushion(name, sx, sy, sz, r, zseam, mat):
    xs = frange(-sx / 2 + r, sx / 2 - r + 1e-6, 0.013)
    zs = graded(r, sz - r, zseam)
    bm = cushion_mesh(sx, sy, sz, r, {0: xs, 2: zs})
    ob = finish(bm, name, mat)
    me = ob.data
    front = [v.index for v in me.vertices if v.co.y < -sy / 2 + 1e-4]      # flat front face, before any shaping
    puff(ob, 0.010, 0.005, 0)                                             # barely-there crown: the cushion outline stays clean
    x0, x1, z0, z1 = -sx / 2 + r, sx / 2 - r, r, sz - r
    PLUMP, DIV, SG = 0.010, 0.030, 0.019                                  # padding dome height, seam pull depth, seam width
    ph = random.random() * 6.28
    cxm, hxm, hzm, czm = (x0 + x1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, (z0 + z1) / 2

    def bulge(x, z):
        """ONE padded face (only a faint softening dome); the seam is a stitch that pulls the leather INWARD (a divot with a
        sharp V) and does not extrude anything, tapering out at the cushion ends where the hide gathers into wrinkles."""
        edge = min(x - x0, x1 - x, z - z0, z1 - z)
        if edge <= 0:
            return 0.0
        win = smoothstep(edge / 0.06)
        u, w = (x - cxm) / hxm, (z - czm) / hzm
        dome = PLUMP * (1.0 - 0.30 * u * u - 0.22 * w * w)
        dz = z - zseam
        pull = DIV * (1.0 + (dz / SG) ** 2) ** -1.5 * smoothstep((x - x0) / 0.035) * smoothstep((x1 - x) / 0.035)
        val = dome * win - pull                                            # a divot INTO the face; nothing is pushed out
        for ex in (x0 + 0.03, x1 - 0.03):
            dx = x - ex
            rr = math.hypot(dx, dz)
            val += 0.0028 * math.cos(9 * math.atan2(dz, dx) + ph) * math.exp(-(rr / 0.07) ** 2) * smoothstep(rr / 0.015) * smoothstep(edge / 0.025)
        val += 0.0006 * math.cos(2 * math.pi * x / 0.0315) * math.exp(-((z - zseam) / 0.011) ** 2)   # puckers between stitches
        return val

    for i in front:
        v = me.vertices[i]
        v.co.y -= bulge(v.co.x, v.co.z)
    return ob


# ---- seat cushion: pillow top, hide gathered at the corners ------------------------------------------------------
def seat_cushion(name, sx, sy, sz, r, mat):
    xs = frange(-sx / 2 + r, sx / 2 - r + 1e-6, 0.014)
    ys = frange(-sy / 2 + r, sy / 2 - r + 1e-6, 0.014)
    zs = frange(0.02, sz - 0.01, 0.014)
    bm = cushion_mesh(sx, sy, sz, r, {0: xs, 1: ys, 2: zs})
    ob = finish(bm, name, mat)
    me = ob.data
    top = [v.index for v in me.vertices if v.co.z > sz - 1e-4]
    puff(ob, 0.030, 0.018, 0)
    cx0, cx1, cy0, cy1 = -sx / 2 + r, sx / 2 - r, -sy / 2 + r, sy / 2 - r
    corners = [(cx0, cy0), (cx1, cy0), (cx0, cy1), (cx1, cy1)]
    phs = [random.random() * 6.28 for _ in corners]
    for i in top:
        v = me.vertices[i]
        edge = min(v.co.x - cx0, cx1 - v.co.x, v.co.y - cy0, cy1 - v.co.y)
        if edge <= 0:
            continue
        w = smoothstep(edge / 0.03)
        dz = 0.0
        for (px, py), ph in zip(corners, phs):
            rr = math.hypot(v.co.x - px, v.co.y - py)
            dz += 0.0026 * math.cos(8 * math.atan2(v.co.y - py, v.co.x - px) + ph) * math.exp(-(rr / 0.10) ** 2) * smoothstep(rr / 0.018)
        v.co.z += dz * w
    return ob


# ---- stitches: real thread raycast onto the real surface ---------------------------------------------------------
# ---- build -------------------------------------------------------------------------------------------------------
reset_scene()
fab = tinted_fabric("leather", os.path.join(MAT, "leather_grain_diff_2k.png"), os.path.join(MAT, "leather_grain_rough_2k.png"),
                    os.path.join(MAT, "leather_grain_nor_gl_2k.png"), COLOR, MAT, normal_strength=1.0, spec=0.55)
oak = oak_material()
thread = thread_material(COLOR)

# large-scale tone variation must never repeat: vertex colour from world-space noise (see tone_apply at the end)
tone_setup(fab)

y_front, y_back = -D / 2, D / 2

FX = W / 2 - FLARE
for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
    leg(f"leg{i}", sx * (FX - 0.10), sy * (D / 2 - 0.11), oak, sx=sx, sy=sy)

base = rounded_box("base", INNER_W + 0.06, D - 0.04, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, seg=8)
randomise_uv(base)
place_mesh(base, 0, 0, BASE_Z)

for s, nm in ((-1, "armL"), (1, "armR")):
    arm = rounded_box(nm, AT, D - 0.01, AH - BASE_Z, 0, 0.068, 2, fab, FAB_TILE, seg=8)
    puff(arm, 0.014, 0.006, 0.003)
    randomise_uv(arm)
    place_mesh(arm, 0, 0, BASE_Z)
    slope_arm(arm, SLOPE)
    flare(arm, s, FLARE)
    arm.data.transform(Matrix.Translation((s * (W / 2 - AT / 2 - FLARE), 0, 0)))

pz0 = FZ - 0.02
panel = rounded_box("backpanel", INNER_W + 0.04, PANEL_T, (H - 0.10) - pz0, 0, 0.03, 1, fab, FAB_TILE, seg=8)
randomise_uv(panel)
place_mesh(panel, 0, y_back - PANEL_T / 2 - 0.005, pz0)

n_stitch = 0
cw = (INNER_W - 0.008) / 2
bh = (H - pz0 - 0.030) / math.cos(TILT)
zseam = bh * 0.60
for i, s in enumerate((-1, 1)):
    bw = cw - 0.006
    c = back_cushion(f"back{i}", bw, BACK_T, bh, 0.065, zseam, fab)
    bvh = surface(c)
    rows = [stitch_row_along_x(bvh, -bw / 2 + 0.09, bw / 2 - 0.09, zseam + dz) for dz in (-0.0075, 0.0075)]
    st, k = stitch_mesh(f"backstitch{i}", rows, thread)
    n_stitch += k
    bz0 = min(v.co.z for v in c.data.vertices)
    for o in (c, st):
        place_mesh(o, s * (cw / 2 + 0.002), y_back - PANEL_T - BACK_T / 2 - 0.015, pz0, rx=-TILT, bz=bz0)

seat_d = D - 0.30
for i, s in enumerate((-1, 1)):
    sw = cw - 0.004
    c = seat_cushion(f"seat{i}", sw, seat_d, SEAT_T, 0.05, fab)
    bz0 = min(v.co.z for v in c.data.vertices)
    zw = SEAT_T - 0.026
    ps = [piping(f"seatpipe{i}{k}", sw / 2 - 0.003, seat_d / 2 - 0.003, bz0 + z, 0.05, 0.0045, fab, FAB_TILE)
          for k, z in enumerate((0.02, zw))]
    bvh = surface(c)
    rows = [stitch_row_around(bvh, sw / 2, seat_d / 2, 0.05, bz0 + zw + dz) for dz in (-0.011, 0.011)]
    st, k = stitch_mesh(f"seatstitch{i}", rows, thread)
    n_stitch += k
    for o in [c, st] + ps:
        place_mesh(o, s * (cw / 2 + 0.001), y_front + seat_d / 2 + 0.02, FZ - 0.02, bz=bz0)
print("STITCHES", n_stitch)

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
tone_apply(fab)                              # after the final centring
print("BOUNDS", [round(hi[k] - lo[k], 3) for k in range(3)])
export_glb(OUT)
