"""Dark walnut two-drawer nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): boxy walnut-veneer bedside case, flush drawers, long black bar pulls, tall slim
tapered black metal legs. Changed: own proportions, standoff bar pulls with end posts, slim top with a small overhang,
black mounting plates under the case, sequence-matched grain across the two fronts.
Wood = Poly Haven walnut_veneer (CC0), darkened colour derivative (same recipe as the walnut TV console).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 0.50)
D = opt("--depth", 0.40)
H = opt("--height", 0.55)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "dark-walnut-two-drawer-nightstand_r001.glb")))
random.seed(44)
reset_scene()

# ---- construction variables (metres); one shared variable per junction -------------------------------------------
PULL_OUT = 0.024                 # bar pull standoff in front of the front plane
TOP_BACK = 0.008                 # top overhang behind the case
TOP_FRONT = 0.006                # top overhang in front of the fronts
TOP_T = 0.018
LEG_H = 0.170                    # floor to underside of the case
PZ1 = H - TOP_T                  # top of case
SIDE_T = 0.018
BW = W - 0.020                   # case width
yf = -D / 2 + PULL_OUT           # front plane: drawer fronts, side panels, rails all coplanar here
yb = D / 2 - TOP_BACK            # back plane
BD = yb - yf
yc = (yf + yb) / 2
APRON_TOP = LEG_H + 0.045
RAIL_TOP = PZ1 - 0.026
GAP = 0.003
FRONT_T = 0.018
OPEN_W = BW - 2 * SIDE_T
TILE = 1.80

# ---- materials ----------------------------------------------------------------------------------------------------
tint = lambda c: (lambda g: g + (c - g) * 0.45)(c.mean(axis=-1, keepdims=True)) * np.array([0.78, 0.66, 0.55])
d0 = load_img("wd0", f"{MAT}/walnut_veneer_diff_2k.jpg", "sRGB")
wd = derive_image(d0, "walnut_nightstand_diff_2k", tint, MAT)
end_d = derive_image(d0, "walnut_nightstand_end_2k", lambda c: tint(c) * 0.72, MAT)
wr = load_img("wr", f"{MAT}/walnut_veneer_rough_2k.jpg", "Non-Color")
wn = load_img("wn", f"{MAT}/walnut_veneer_nor_gl_2k.jpg", "Non-Color")
for im, px in ((wd, 2048), (end_d, 512), (wr, 1024), (wn, 1024)):
    im.scale(px, px)
M_WOOD = pbr_material("wood_face", wd, wr, wn, normal_strength=1.0, spec=0.42)
M_END = pbr_material("wood_end", end_d, wr, wn, normal_strength=0.6, spec=0.30)
M_BLACK = metal_material("black_metal", "#26272a", 0.50)       # satin black, not a mirror
M_BLACK.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.6


class Seq:
    """Fixed UV offsets so neighbouring parts continue the same veneer figure (sequence match)."""
    def __init__(self, a, b):
        self.v, self.i = (a, b), 0

    def random(self):
        r = self.v[self.i % 2]
        self.i += 1
        return r


FRONT_SEQ = (random.random(), random.random())

# ---- case: side panels full depth, apron + top rail flush with the fronts, fill block behind the drawers ----------
z0 = LEG_H
ph = PZ1 - z0
for sx in (-1, 1):
    member(f"side{sx}", sx * (BW / 2 - SIDE_T / 2), yc, z0, SIDE_T, BD, ph + 0.002, 2, M_WOOD, M_END, TILE, bevel=0.0007)
member("apron", 0.0, yf + 0.0095, z0, OPEN_W + 0.006, 0.019, APRON_TOP - z0, 0, M_WOOD, M_END, TILE, bevel=0.0007)
member("toprail", 0.0, yf + 0.0095, RAIL_TOP, OPEN_W + 0.006, 0.019, PZ1 - RAIL_TOP + 0.002, 0, M_WOOD, M_END, TILE, bevel=0.0007)
member("fill", 0.0, (yf + 0.006 + yb - 0.016) / 2, APRON_TOP, OPEN_W, BD - 0.022, RAIL_TOP - APRON_TOP, 0, M_WOOD, M_END, TILE, bevel=0.0007)
member("back", 0.0, yb - 0.008, z0, OPEN_W + 0.006, 0.016, ph + 0.002, 0, M_WOOD, M_END, TILE, bevel=0.0007)
member("bottom", 0.0, yc, z0, OPEN_W + 0.006, BD - 0.020, 0.016, 0, M_WOOD, M_END, TILE, bevel=0.0007)

# ---- drawer fronts (flush, 3 mm reveal) + black bar pulls ---------------------------------------------------------
NDR = 2
zo0, zo1 = APRON_TOP + GAP, RAIL_TOP - GAP
dh = (zo1 - zo0 - GAP * (NDR - 1)) / NDR
dw = OPEN_W - 2 * GAP
PULL_L = 0.240
FRONT_SEQ = (random.random(), random.random())
for i in range(NDR):
    zz = zo0 + i * (dh + GAP)
    member(f"front{i}", 0.0, yf + FRONT_T / 2, zz, dw, FRONT_T, dh, 0, M_WOOD, M_END, TILE, bevel=0.0006, rng=Seq(*FRONT_SEQ))
    kz = zz + dh / 2
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, yf - PULL_OUT + 0.005, kz)) @ Matrix.Diagonal((PULL_L, 0.010, 0.012, 1)))
    for sx in (-1, 1):                                   # two end posts
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((sx * (PULL_L / 2 - 0.009), yf - (PULL_OUT - 0.010) / 2, kz))
                              @ Matrix.Diagonal((0.008, PULL_OUT - 0.010, 0.008, 1)))
    ob = new_obj(f"pull{i}", bm)
    ob.data.materials.append(M_BLACK)

# ---- top: one slab ------------------------------------------------------------------------------------------------
member("top", 0.0, (yf - TOP_FRONT + yb + TOP_BACK) / 2, PZ1, W, BD + TOP_FRONT + TOP_BACK, TOP_T, 0, M_WOOD, M_END, TILE, bevel=0.0025)

# ---- tapered round black metal legs + square mounting plates -----------------------------------------------------
LX = BW / 2 - 0.040
LY = BD / 2 - 0.040
for sx in (-1, 1):
    for sy in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.0085, radius2=0.0145, depth=LEG_H - 0.004)
        for v in bm.verts:
            v.co += Vector((sx * LX, yc + sy * LY, (LEG_H - 0.004) / 2))
        lg = new_obj(f"leg{sx}{sy}", bm)
        lg.data.materials.append(M_BLACK)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((sx * LX, yc + sy * LY, LEG_H - 0.002)) @ Matrix.Diagonal((0.052, 0.052, 0.004, 1)))
        pl = new_obj(f"plate{sx}{sy}", bm)
        pl.data.materials.append(M_BLACK)

# ---- shading + centre + export ------------------------------------------------------------------------------------
for ob in bpy.data.objects:
    if ob.type == "MESH":
        for p in ob.data.polygons:
            p.use_smooth = ob.name.startswith("leg")
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
bpy.ops.object.select_all(action="SELECT")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_image_format="JPEG",
                          export_jpeg_quality=85, export_texcoords=True, export_normals=True, export_materials="EXPORT")
print("EXPORTED", OUT)
