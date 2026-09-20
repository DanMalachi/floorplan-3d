"""Block-arm 3-seat sofa, r001 - Route C (procedural static Blender), PARAMETRIC in width/depth/height/colour.

Run:  blender -b -P build_sofa.py -- --width 2.10 --depth 0.94 --height 0.84 --color "#8a8f96" --out exports/x.glb
Blender axes: X width, Y depth (-Y = front / seat side), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Everything not a governing dimension derives from them; fabric weave and oak grain keep physical scale (world-scale UVs).
Colour = multiply of ONE neutral (grey-normalised) Poly Haven Rough Linen texture, so weave/roughness/normal never change.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 2.10)      # overall width incl. arms
D = opt("--depth", 0.94)      # overall depth
H = opt("--height", 0.84)     # overall height
COLOR = opt("--color", "#8a8f96")
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "block-arm-sofa_r001.glb")))
random.seed(11)

# ---- derived construction (metres) -------------------------------------------------------------------------------
LEG_H = 0.17
FZ = 0.31                       # top of the fabric base frame
SEAT_T = 0.17                   # seat cushion thickness
SEAT_TOP = FZ + SEAT_T - 0.015  # cushion compressed slightly into the frame
AT = 0.17                       # arm thickness
AH = min(0.62, H * 0.74)        # arm top height
PAD_T = 0.07                    # arm pad on top of the arm
BACK_T = 0.14                   # back frame thickness (rear)
TILT = math.radians(9)
FAB_TILE = 0.271               # rough_linen real-world tile (m)
OAK_TILE = 1.83
INNER_W = W - 2 * AT


# ---- materials ---------------------------------------------------------------------------------------------------
def hex_lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c]


def small(img, px):
    img.scale(px, px)
    return img


def fabric_material(color):
    """Neutral grey-normalised weave x colour multiply. Colour is the only thing that varies between variants."""
    import numpy as np
    src = load_img("ter_d", os.path.join(MAT, "rough_linen_Diffuse_2k.jpg"), "sRGB")
    small(src, 2048)
    grey = os.path.join(MAT, "linen_grey_2k.png")
    if os.path.exists(grey):
        d = load_img("ter_grey", grey, "sRGB")
    else:
        def norm(px):                                   # luminance, normalised to a fixed mean, keeps the weave contrast
            lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
            lum = lum / lum.mean() * 0.72
            return np.clip(np.stack([lum] * 3, axis=1), 0, 1)
        d = derive_image(src, "linen_grey_2k", norm, MAT)
    r = load_img("ter_r", os.path.join(MAT, "rough_linen_Rough_2k.jpg"), "Non-Color")
    n = load_img("ter_n", os.path.join(MAT, "rough_linen_nor_gl_2k.jpg"), "Non-Color")
    m = pbr_material("fabric", d, r, n, normal_strength=1.8, spec=0.25)
    nt = m.node_tree
    bsdf = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
    tex = next(x for x in nt.nodes if x.type == "TEX_IMAGE" and x.image == d)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (*hex_lin(color), 1.0)
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return m


def oak_material():
    d = load_img("oak_d", os.path.join(MAT, "oak_veneer_01_diff_2k.jpg"), "sRGB"); small(d, 512)
    r = load_img("oak_r", os.path.join(MAT, "oak_veneer_01_rough_2k.jpg"), "Non-Color"); small(r, 512)
    n = load_img("oak_n", os.path.join(MAT, "oak_veneer_01_nor_gl_2k.jpg"), "Non-Color"); small(n, 512)
    return pbr_material("oak", d, r, n, spec=0.4)


# ---- geometry helpers --------------------------------------------------------------------------------------------
def puff(ob, crown, belly, wr=0.0025, front=0.0):
    """Soft-goods shaping on a rounded slab: raised crown on top, slightly bellied sides, faint settling wrinkles."""
    me = ob.data
    zs = [v.co.z for v in me.vertices]
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    hx, hy = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    for v in me.vertices:
        u = (v.co.x - cx) / hx
        w = (v.co.y - cy) / hy
        t = (v.co.z - z0) / (z1 - z0)
        edge = max(abs(u), abs(w))
        if t > 0.5:
            v.co.z += crown * max(0.0, 1 - u * u) * max(0.0, 1 - w * w) * (t - 0.5) * 2
        if front and w < 0:                       # plump front face (-Y side) of a back cushion
            v.co.y -= front * max(0.0, 1 - u * u) * (1 - (2 * t - 1) ** 2) * (-w)
        bulge = belly * (1 - (2 * t - 1) ** 2)
        v.co.x += bulge * u * min(1.0, edge * 1.2) * 0.5
        v.co.y += bulge * w * min(1.0, edge * 1.2) * 0.5
    if wr:
        crease(ob, wr, 7.0, random.random() * 9)


def piping(name, hx, hy, z, rc, rad, mat, ring=6):
    """Upholstery welt: a small tube swept around a rounded-rectangle path (half extents hx, hy, corner radius rc) at height z,
    in the parent cushion's local frame (centre at origin). Move it with place() exactly like the cushion."""
    pts = []
    for cxs, cys, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for k in range(7):
            a = math.radians(a0 + 90 * k / 6)
            pts.append((cxs * (hx - rc) + rc * math.cos(a), cys * (hy - rc) + rc * math.sin(a)))
    n = len(pts)
    bm = bmesh.new()
    rings = []
    for i, (x, y) in enumerate(pts):
        nx, ny = pts[(i + 1) % n]
        px, py = pts[i - 1]
        tx, ty = nx - px, ny - py
        L = math.hypot(tx, ty) or 1
        tx, ty = tx / L, ty / L
        ox, oy = ty, -tx                                  # outward normal in plan
        rg = []
        for j in range(ring):
            t = 2 * math.pi * j / ring
            rg.append(bm.verts.new((x + ox * rad * math.cos(t), y + oy * rad * math.cos(t), z + rad * math.sin(t))))
        rings.append(rg)
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(ring):
            bm.faces.new((a[j], a[(j + 1) % ring], b[(j + 1) % ring], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    fabric_uv(bm, FAB_TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def place(ob, x, y, z, rx=0.0, bz=None):
    """Rotate about X around the object's own base-centre, then move it into place (mesh space, no object transform)."""
    me = ob.data
    if bz is None:
        bz = min(v.co.z for v in me.vertices)
    m =Matrix.Translation((x, y, z)) @ Matrix.Rotation(rx, 4, "X") @ Matrix.Translation((0, 0, -bz))
    me.transform(m)


def leg(name, x, y, mat, top=0.056, bot=0.034, splay=0.028, sx=1, sy=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        t = 1.0 if v.co.z > 0 else 0.0
        s = bot + (top - bot) * t
        v.co.x *= s
        v.co.y *= s
        v.co.z = (v.co.z + 0.5) * (LEG_H + 0.012)
        v.co.x += sx * splay * (1 - t)
        v.co.y += sy * splay * (1 - t)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.002, segments=2, affect="EDGES")
    for v in bm.verts:
        v.co.x += x
        v.co.y += y
    bm.normal_update()
    fabric_uv(bm, OAK_TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ---- build -------------------------------------------------------------------------------------------------------
reset_scene()
fab = fabric_material(COLOR)
oak = oak_material()

y_front, y_back = -D / 2, D / 2

# legs (oak, tapered, splayed outward)
lx, ly = W / 2 - 0.10, D / 2 - 0.10
for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
    leg(f"leg{i}", sx * lx, sy * ly, oak, sx=sx, sy=sy)

# base frame between the arms
base = rounded_box("base", INNER_W + 0.04, D - 0.03, FZ - LEG_H, 0, 0.018, 2, fab, FAB_TILE)
place(base, 0, 0, LEG_H)

# arms (fabric body + slightly wider pad on top for the real-upholstery seam shadow)
for s, nm in ((-1, "armL"), (1, "armR")):
    arm = rounded_box(nm, AT - 0.008, D - 0.012, AH - PAD_T - LEG_H, 0, 0.03, 3, fab, FAB_TILE)
    place(arm, s * (W / 2 - AT / 2), 0, LEG_H)
    pad = rounded_box(nm + "_pad", AT, D, PAD_T, 0, 0.032, 3, fab, FAB_TILE)
    puff(pad, 0.006, 0.004, 0.0015)
    place(pad, s * (W / 2 - AT / 2), 0, AH - PAD_T)

# back frame (rear), behind the back cushions
back = rounded_box("backframe", INNER_W + 0.04, BACK_T, AH - 0.05 - LEG_H, 0, 0.03, 3, fab, FAB_TILE)
place(back, 0, y_back - BACK_T / 2, LEG_H)

# seat cushions: two, crowned; front proud of the base by 1 cm
seat_d = D - BACK_T - 0.01
cw = (INNER_W - 0.006) / 2
for i, s in enumerate((-1, 1)):
    c = rounded_box(f"seat{i}", cw - 0.004, seat_d, SEAT_T, 0, 0.04, 4, fab, FAB_TILE)
    puff(c, 0.028, 0.016)
    bz0 = min(v.co.z for v in c.data.vertices)
    ps = [piping(f"seatpipe{i}{k}", (cw - 0.004) / 2 - 0.003, seat_d / 2 - 0.003, bz0 + z, 0.04, 0.0055, fab)
          for k, z in enumerate((0.02, SEAT_T - 0.024))]
    for o in [c] + ps:
        place(o, s * (cw / 2 + 0.001), y_front + seat_d / 2 + 0.005, FZ - 0.015, bz=bz0)

# back cushions: two, leaned back ~9 deg, top reaches H
bc_z0 = SEAT_TOP - 0.03
bc_h = (H - bc_z0) / math.cos(TILT) - 0.005
for i, s in enumerate((-1, 1)):
    c = rounded_box(f"backc{i}", cw - 0.004, 0.19, bc_h, 0, 0.05, 4, fab, FAB_TILE)
    puff(c, 0.0, 0.03, 0.003, front=0.03)
    bz0 = min(v.co.z for v in c.data.vertices)
    ps = [piping(f"backpipe{i}{k}", (cw - 0.004) / 2 - 0.004, 0.19 / 2 - 0.004, bz0 + z, 0.05, 0.0055, fab)
          for k, z in enumerate((0.02, bc_h - 0.022))]
    for o in [c] + ps:
        place(o, s * (cw / 2 + 0.001), y_back - BACK_T - 0.055, bc_z0, rx=-TILT, bz=bz0)

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
