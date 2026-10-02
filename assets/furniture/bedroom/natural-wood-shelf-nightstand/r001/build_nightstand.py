"""Natural wood shelf nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): unfinished pale hardwood bedside table, one drawer over an open cubby, solid sides
running to the floor, bracket-foot base with a cut-out apron, turned wood knob.
Changed: own proportions, one shallow elliptical arch on the front apron and a matching low arch on each side (no ogee steps),
inset drawer flush with the side fronts (3 mm reveal), soft-rounded top edge instead of a moulded profile, mushroom knob of our own
profile, recessed back panel, plain one-piece sides (no glued-plank stripes).
Wood = pale warm derivative of Poly Haven oak_veneer_03 (CC0), roughness lifted for an unfinished (raw, matte) surface.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 0.46)
D = opt("--depth", 0.37)
H = opt("--height", 0.58)
SRC = "oak_veneer_03"
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "natural-wood-shelf-nightstand_r001.glb")))
random.seed(101)
reset_scene()

# ---- construction variables (metres); one shared variable per junction -------------------------------------------
OV = 0.012                       # top overhang at front and sides (back flush)
TOP_T = 0.018
BW = W - 2 * OV                  # carcass width (outer faces of the sides)
BD = D - OV                      # carcass depth (front face of the sides to the back)
SIDE_T = 0.020
PZ1 = H - TOP_T                  # underside of the top
PLINTH_H = 0.075                 # floor to underside of the cubby floor
FLOOR_T = 0.018
DIV_T = 0.018                    # divider between drawer and cubby
DRAWER_OPEN = 0.135              # drawer opening height
APRON_T = 0.020
BACK_T, BACK_IN = 0.008, 0.010   # recessed back panel
GAP = 0.003
FRONT_T = 0.020
ARCH_W, ARCH_H = 0.30, 0.038     # front apron arch (half-ellipse), feet are what is left
SARCH_W, SARCH_H = 0.20, 0.030   # side arch
TILE = 1.5

# ---- materials: pale warm unfinished hardwood --------------------------------------------------------------------
d0 = load_img("wd0", f"{MAT}/{SRC}_diff_2k.jpg", "sRGB")
r0 = load_img("wr0", f"{MAT}/{SRC}_rough_2k.jpg", "Non-Color")


def tint(c):
    import numpy as np
    g = c.mean(axis=1, keepdims=True)
    c = g + (c - g) * 0.65
    return np.clip(c * np.array((0.99, 0.95, 0.88), dtype=np.float32), 0.0, 1.0)


wd = derive_image(d0, "natural_shelf_nightstand_diff_2k", tint, MAT)
we = derive_image(d0, "natural_shelf_nightstand_end_2k", lambda c: tint(c) * 0.86, MAT)
wr = derive_image(r0, "natural_shelf_nightstand_rough_2k", lambda c: c * 0.6 + 0.38, MAT)   # raw wood: matte, mean about 0.68
wr.colorspace_settings.name = "Non-Color"
wn = load_img("wn", f"{MAT}/{SRC}_nor_gl_2k.jpg", "Non-Color")
M_WOOD = pbr_material("raw_wood", wd, wr, wn, normal_strength=1.0, spec=0.30)
M_END = pbr_material("raw_wood_end", we, wr, wn, normal_strength=0.8, spec=0.26)


class Fixed:
    def __init__(self, *v):
        self.v = list(v)

    def random(self):
        return self.v.pop(0)


def m(name, cx, cy, z0, sx, sy, sz, grain, bevel=0.0015, rng=random):
    return member(name, cx, cy, z0, sx, sy, sz, grain, M_WOOD, M_END, TILE, bevel=bevel, rng=rng)


def reuv(ob, grain, ou, ov):
    """World-scale UVs after a boolean (cutter faces arrive without UVs); same mapping as member()."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    others = [a for a in (0, 1, 2) if a != grain]
    for f in bm.faces:
        n = f.normal
        if abs(n[grain]) > 0.9:
            f.material_index = 1
            a, b = others
        else:
            f.material_index = 0
            a = max(others, key=lambda ax: abs(n[ax]))
            b = [x for x in others if x != a][0]
        for l in f.loops:
            l[uv].uv = (l.vert.co[b] / TILE + ou, l.vert.co[grain] / TILE + ov)
    bm.to_mesh(ob.data)
    bm.free()


def arch_pts(w, h, base, seg=24):
    """Half-ellipse cutter outline (u along the piece, z up) spanning u in [-w/2, w/2], rising h above `base`; 3 cm skirt below."""
    pts = [(w / 2, base - 0.03)]
    for i in range(seg + 1):
        a = math.pi * i / seg
        pts.append((w / 2 * math.cos(a), base + h * math.sin(a)))
    pts.append((-w / 2, base - 0.03))
    return pts


def boolean_cut(ob, cutter):
    bpy.context.view_layer.objects.active = ob
    mod = ob.modifiers.new("cut", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter, do_unlink=True)


yf = -D / 2 + OV                 # front plane of the carcass (sides, apron, drawer face)
yb = D / 2                       # back plane
ycen = (yf + yb) / 2
IN_W = BW - 2 * SIDE_T           # clear width between the sides

# ---- sides: one solid member each, full depth floor to top, low arch cut from the bottom edge ---------------------
for s in (-1, 1):
    cx = s * (BW / 2 - SIDE_T / 2)
    ou, ov = random.random(), random.random()
    side = m(f"side{s}", cx, ycen, 0.0, SIDE_T, BD, PZ1 + 0.002, 2, rng=Fixed(ou, ov))
    bm = bmesh.new()                                 # cutter: arch outline in (y, z), extruded across the side
    pts = arch_pts(SARCH_W, SARCH_H, 0.0)
    fr = [bm.verts.new((cx - 0.02, ycen + u, z)) for u, z in pts]
    bk = [bm.verts.new((cx + 0.02, ycen + u, z)) for u, z in pts]
    bm.faces.new(fr)
    bm.faces.new(bk[::-1])
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new([fr[i], fr[j], bk[j], bk[i]])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    boolean_cut(side, new_obj("scut", bm))
    reuv(side, 2, ou, ov)

# ---- base: front apron with an elliptical arch (bracket feet), plain back rail -------------------------------------
apron = m("apron", 0.0, yf + APRON_T / 2, 0.0, IN_W + 0.006, APRON_T, PLINTH_H, 0, rng=Fixed(0.21, 0.44))
boolean_cut(apron, prism("acut", arch_pts(ARCH_W, ARCH_H, 0.0), yf - 0.02, yf + APRON_T + 0.02))
reuv(apron, 0, 0.21, 0.44)
m("backrail", 0.0, yb - BACK_IN - APRON_T / 2, ARCH_H, IN_W + 0.006, APRON_T, PLINTH_H - ARCH_H + 0.002, 0)   # back face flush with the back panel

# ---- cubby: floor, back panel, divider (cubby ceiling / drawer floor) ----------------------------------------------
Z_FL = PLINTH_H + FLOOR_T                        # top of the cubby floor
Z_DIV = PZ1 - DRAWER_OPEN - DIV_T                # underside of the divider
YIN = yb - BACK_IN - BACK_T                      # floor and divider stop at the back panel (no strips through the back)
m("floor", 0.0, (yf + YIN) / 2, PLINTH_H, IN_W + 0.006, YIN - yf, FLOOR_T, 0)
m("divider", 0.0, (yf + YIN) / 2, Z_DIV, IN_W + 0.006, YIN - yf, DIV_T, 0)
m("back", 0.0, yb - BACK_IN - BACK_T / 2, PLINTH_H, IN_W + 0.006, BACK_T, PZ1 - PLINTH_H + 0.002, 2)

# ---- drawer: inset front flush with the side fronts, 3 mm reveal, solid fill behind (no light leak) ----------------
dz0, dz1 = Z_DIV + DIV_T + GAP, PZ1 - GAP
dx = IN_W - 2 * GAP
m("drawer_fill", 0.0, (yf + FRONT_T + yb - BACK_IN - BACK_T) / 2, Z_DIV + DIV_T, IN_W, yb - BACK_IN - BACK_T - yf - FRONT_T - 0.004,
  PZ1 - Z_DIV - DIV_T, 0)
m("drawer_front", 0.0, yf + FRONT_T / 2, dz0, dx, FRONT_T, dz1 - dz0, 0, bevel=0.0015, rng=Fixed(0.63, 0.12))


def lathe(name, prof, y0, zc, seg=32):
    """Turned part: prof = [(r, d)] with d = distance in front of y0 (toward -Y). Closed with a fan at the tip."""
    bm = bmesh.new()
    rings = []
    for r, dd in prof:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / seg), y0 - dd, zc + r * math.sin(2 * math.pi * k / seg)))
                      for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new([a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]])
    tip = bm.verts.new((0.0, y0 - prof[-1][1] - 0.0005, zc))
    for k in range(seg):
        bm.faces.new([rings[-1][k], rings[-1][(k + 1) % seg], tip])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    fabric_uv(bm, TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(M_WOOD)
    return ob


# mushroom knob: stem into the front, flared neck, domed head (turned profile; hardware = no variation)
KNOB = [(0.0065, -0.004), (0.0065, 0.004), (0.0058, 0.008), (0.0062, 0.011), (0.0100, 0.014), (0.0150, 0.017), (0.0168, 0.0195),
        (0.0170, 0.0215), (0.0160, 0.0240), (0.0130, 0.0262), (0.0085, 0.0278), (0.0035, 0.0285)]
lathe("knob", KNOB, yf, (dz0 + dz1) / 2)

# ---- top: one slab, soft 6 mm round on the front and side top edges, 2 mm elsewhere --------------------------------
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts:
    v.co.x *= W; v.co.y *= D; v.co.z *= TOP_T
    v.co += Vector((0.0, 0.0, PZ1 + TOP_T / 2))
big = [e for e in bm.edges if all(v.co.z > PZ1 + TOP_T * 0.9 for v in e.verts)
       and not all(v.co.y > D / 2 - 1e-6 for v in e.verts)]
bmesh.ops.bevel(bm, geom=big, offset=0.006, segments=5, affect="EDGES", profile=0.5)
sharp = [e for e in bm.edges if e.calc_face_angle(0.0) > 1.2]
bmesh.ops.bevel(bm, geom=sharp, offset=0.0018, segments=2, affect="EDGES")
top = new_obj("top", bm)
top.data.materials.append(M_WOOD)
top.data.materials.append(M_END)
reuv(top, 0, 0.47, 0.81)

# ---- shading + centre + export -----------------------------------------------------------------------------------
for ob in bpy.data.objects:                          # oak_veneer_03 fibres run along image U: transpose so grain follows the member
    if ob.type == "MESH" and ob.name != "knob":
        for l in ob.data.uv_layers[0].data:
            l.uv = (l.uv[1], l.uv[0])
for ob in bpy.data.objects:
    if ob.type == "MESH":
        for p in ob.data.polygons:
            n = p.normal
            axis_aligned = max(abs(n.x), abs(n.y), abs(n.z)) > 0.995
            p.use_smooth = ob.name == "knob" or (not axis_aligned and (ob.name in ("top", "apron") or ob.name.startswith("side")))
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
