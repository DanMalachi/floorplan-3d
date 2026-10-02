"""Mid-century walnut nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): mid-century walnut bedside case with rounded wrap corners, two drawers with a
half-moon finger scoop cut into each top edge, short splayed round tapered legs.
Changed: own proportions, wrap radius and frame widths, grain wrapped continuously around the shell, sequence-matched fronts,
dark drawer cavity behind the scoops, legs set in from the corners on both axes, no under-rail.
Wood = Poly Haven walnut_veneer (CC0), desaturated 55 percent and tinted mid brown (approved walnut recipe, lessons 7k.6).
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


W = opt("--width", 0.52)
D = opt("--depth", 0.40)
H = opt("--height", 0.52)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "mid-century-walnut-nightstand_r001.glb")))
random.seed(81)
reset_scene()

# ---- construction variables (metres); one shared variable per junction -------------------------------------------
LEG_H = 0.160                    # floor to the case underside
BZ0, BZ1 = LEG_H, H
BH = BZ1 - BZ0
R = 0.030                        # wrap radius: the four corners seen from the front
EDGE = 0.003                     # front/back edge round-over
FR_SIDE, FR_TOP, FR_BOT = 0.020, 0.022, 0.022
POCKET = 0.040                   # drawer pocket depth behind the front plane
GAP = 0.003                      # reveal around and between the fronts
FRONT_T = 0.018
UPPER = 0.43                     # share of the pocket height taken by the upper drawer
SCOOP_W, SCOOP_S = 0.084, 0.024  # half-moon scoop: chord at the top edge, depth down the front
TILE = 1.80
yf = -D / 2

# ---- materials ----------------------------------------------------------------------------------------------------
tint = lambda c: (lambda g: g + (c - g) * 0.45)(c.mean(axis=-1, keepdims=True)) * np.array([0.95, 0.74, 0.56])
d0 = load_img("wd0", f"{MAT}/walnut_veneer_diff_2k.jpg", "sRGB")
wd = derive_image(d0, "mcm_walnut_diff_2k", tint, MAT)
end_d = derive_image(d0, "mcm_walnut_end_2k", lambda c: tint(c) * 0.72, MAT)
wr = load_img("wr", f"{MAT}/walnut_veneer_rough_2k.jpg", "Non-Color")
wn = load_img("wn", f"{MAT}/walnut_veneer_nor_gl_2k.jpg", "Non-Color")
for im, px in ((wd, 2048), (end_d, 512), (wr, 1024), (wn, 1024)):
    im.scale(px, px)
M_WOOD = pbr_material("wood_face", wd, wr, wn, normal_strength=1.0, spec=0.42)
M_END = pbr_material("wood_end", end_d, wr, wn, normal_strength=0.6, spec=0.30)
M_BACK = bpy.data.materials.new("cavity")
M_BACK.use_nodes = True
_b = next(x for x in M_BACK.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
_b.inputs["Base Color"].default_value = (*lin("#3a2b22"), 1.0)
_b.inputs["Roughness"].default_value = 0.9
_b.inputs["Specular IOR Level"].default_value = 0.2
OU, OV = random.random(), random.random()


class Fixed:
    def __init__(self, *v):
        self.v = list(v)

    def random(self):
        return self.v.pop(0)


# ---- shell: rounded-rectangle outline in XZ extruded along Y, edges eased, drawer pocket cut by boolean ------------
XI0, XI1 = -W / 2 + R, W / 2 - R
ZI0, ZI1 = BZ0 + R, BZ1 - R
EPS = 1e-5


def unroll(x, z):
    """Arc length around the XZ outline (left side up, over the top, right side down, under the bottom): grain wraps the shell."""
    cx, cz = min(max(x, XI0), XI1), min(max(z, ZI0), ZI1)
    dx, dz = x - cx, z - cz
    Lf = ZI1 - ZI0
    q = R * math.pi / 2
    if dx < -EPS and abs(dz) <= EPS:
        return z - ZI0
    if dx < -EPS and dz > EPS:
        return Lf + R * math.atan2(dz, -dx)
    if abs(dx) <= EPS and dz > EPS:
        return Lf + q + (x - XI0)
    if dx > EPS and dz > EPS:
        return Lf + q + (XI1 - XI0) + R * math.atan2(dx, dz)
    if dx > EPS and abs(dz) <= EPS:
        return Lf + 2 * q + (XI1 - XI0) + (ZI1 - z)
    if dx < -EPS and dz < -EPS:
        return -R * math.atan2(-dz, -dx)
    if abs(dx) <= EPS and dz < -EPS:
        return -q - (x - XI0)
    if dx > EPS and dz < -EPS:
        return -q - (XI1 - XI0) - R * math.atan2(dx, -dz)
    return z - ZI0


px0, px1 = -W / 2 + FR_SIDE, W / 2 - FR_SIDE
pz0, pz1 = BZ0 + FR_BOT, BZ1 - FR_TOP


def shell_uv(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        c = f.calc_center_median()
        f.material_index = 0
        inside = px0 - 1e-3 < c.x < px1 + 1e-3 and pz0 - 1e-3 < c.z < pz1 + 1e-3 and c.y < yf + POCKET + 1e-3
        for l in f.loops:
            p = l.vert.co
            if abs(n.y) > 0.9:                              # front ring, back, pocket floor: horizontal grain
                l[uv].uv = (p.z / TILE + OU, p.x / TILE + OV)
            elif inside:                                    # pocket walls
                l[uv].uv = (p.y / TILE + OU, (p.z if abs(n.x) > 0.7 else p.x) / TILE + OV)
            else:                                           # wrapped outer surface
                l[uv].uv = (p.y / TILE + OU, unroll(p.x, p.z) / TILE + OV)
    bm.to_mesh(ob.data)
    bm.free()


shell = prism("shell", rounded_rect_pts(-W / 2, W / 2, BZ0, BZ1, R, R, seg=8), -D / 2, D / 2)
bm = bmesh.new()
bm.from_mesh(shell.data)
caps = [f for f in bm.faces if abs(f.normal.y) > 0.9]
ce = list({e for f in caps for e in f.edges})
bmesh.ops.bevel(bm, geom=ce, offset=EDGE, segments=3, affect="EDGES")
bm.to_mesh(shell.data)
bm.free()
shell.data.materials.append(M_WOOD)
shell.data.materials.append(M_END)
cutter = prism("pocket_cut", rounded_rect_pts(px0, px1, pz0, pz1, 0.004, 0.004, seg=4), yf - 0.02, yf + POCKET)
bpy.context.view_layer.objects.active = shell
mod = shell.modifiers.new("pocket", "BOOLEAN")
mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
bpy.ops.object.modifier_apply(modifier="pocket")
bpy.data.objects.remove(cutter, do_unlink=True)
shell_uv(shell)

# dark drawer cavity seen through the scoops and reveals (drawer boxes are not modelled)
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, yf + FRONT_T + 0.010, (pz0 + pz1) / 2))
                      @ Matrix.Diagonal((px1 - px0 - 0.002, 0.006, pz1 - pz0 - 0.002, 1.0)))
ob = new_obj("cavity", bm)
ob.data.materials.append(M_BACK)


# ---- drawer fronts: flush with the shell front, sequence-matched horizontal grain, half-moon scoop cut through the top edge
def reuv(ob, grain, ou, ov):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    others = [a for a in (0, 1, 2) if a != grain]
    for f in bm.faces:
        n = f.normal
        if abs(n[grain]) > 0.9:
            f.material_index = 1
        else:
            f.material_index = 0
        a = max(others, key=lambda ax: abs(n[ax])) if f.material_index == 0 else others[0]
        b = [x for x in others if x != a][0]
        for l in f.loops:
            l[uv].uv = (l.vert.co[b] / TILE + ou, l.vert.co[grain] / TILE + ov)
    bm.to_mesh(ob.data)
    bm.free()


FRONT_SEQ = (random.random(), random.random())
dx0, dx1 = px0 + GAP, px1 - GAP
ph = pz1 - pz0 - 3 * GAP
h_up, h_lo = ph * UPPER, ph * (1 - UPPER)
fronts = []
for name, z0, hh in (("front_lo", pz0 + GAP, h_lo), ("front_up", pz0 + 2 * GAP + h_lo, h_up)):
    f = member(name, 0.0, yf + FRONT_T / 2, z0, dx1 - dx0, FRONT_T, hh, 0, M_WOOD, M_END, TILE, bevel=0.0012, rng=Fixed(*FRONT_SEQ))
    rs = (SCOOP_W ** 2 / 4 + SCOOP_S ** 2) / (2 * SCOOP_S)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=rs, radius2=rs, depth=FRONT_T + 0.02,
                          matrix=Matrix.Translation((0, yf + FRONT_T / 2, z0 + hh + rs - SCOOP_S)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    cut = new_obj(name + "_scoop", bm)
    bpy.context.view_layer.objects.active = f
    mod = f.modifiers.new("scoop", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cut
    bpy.ops.object.modifier_apply(modifier="scoop")
    bpy.data.objects.remove(cut, do_unlink=True)
    reuv(f, 0, *FRONT_SEQ)
    fronts.append(f)


# ---- legs: four round tapered, splayed outward on both axes, set in from the corners, grain along the axis ---------
def tapered_leg(name, top_c, foot_c, r0, r1, seg=24):
    T, F = Vector(top_c), Vector(foot_c)
    ax = (F - T)
    L = ax.length
    a = ax.normalized()
    ref = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
    e1 = a.cross(ref).normalized()
    e2 = a.cross(e1)

    def ring(c, r, zplane):
        out = []
        for i in range(seg):
            th = 2 * math.pi * i / seg
            p = c + (e1 * math.cos(th) + e2 * math.sin(th)) * r
            out.append(p + a * ((zplane - p.z) / a.z))
        return out

    rt, rf = ring(T, r0, T.z), ring(F, r1, F.z)
    bm = bmesh.new()
    vt = [bm.verts.new(p) for p in rt]
    vf = [bm.verts.new(p) for p in rf]
    uv = bm.loops.layers.uv.verify()
    circ = 2 * math.pi * (r0 + r1) / 2
    ou, ov = random.random(), random.random()
    for i in range(seg):
        j = (i + 1) % seg
        f = bm.faces.new((vt[i], vt[j], vf[j], vf[i]))
        for l, ui, vv in zip(f.loops, (i, i + 1, i + 1, i), (0.0, 0.0, L, L)):
            l[uv].uv = (ui / seg * circ / TILE + ou, vv / TILE + ov)
    for ringp, flip in ((rt, True), (rf, False)):
        pts = ringp[::-1] if flip else ringp
        f = bm.faces.new([bm.verts.new(p) for p in pts])
        f.material_index = 1
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / TILE + ou, l.vert.co.y / TILE + ov)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    ob = new_obj(name, bm)
    ob.data.materials.append(M_WOOD)
    ob.data.materials.append(M_END)
    return ob


LX, LY = W / 2 - 0.058, D / 2 - 0.058
SPX, SPY = 0.026, 0.020
legs = []
for sx in (-1, 1):
    for sy in (-1, 1):
        legs.append(tapered_leg(f"leg_{sx}_{sy}", (sx * LX, sy * LY, BZ0 + 0.004), (sx * (LX + SPX), sy * (LY + SPY), 0.0), 0.0175, 0.0105))

# ---- shading: shell smooth + weighted normals; fronts flat except the scoop arc; legs smooth (caps own verts) -------
for p in shell.data.polygons:
    p.use_smooth = True
weighted_normals(shell)
for f in fronts:
    for p in f.data.polygons:
        n = p.normal
        p.use_smooth = max(abs(n.x), abs(n.y), abs(n.z)) < 0.995 and abs(n.y) < 0.5
for lg in legs:
    for p in lg.data.polygons:
        p.use_smooth = abs(p.normal.z) < 0.9

# ---- centre + export --------------------------------------------------------------------------------------------
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
