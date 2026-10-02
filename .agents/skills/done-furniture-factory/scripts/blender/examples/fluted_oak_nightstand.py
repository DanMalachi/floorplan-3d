"""Fluted pale-oak two-drawer nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): pale oak bedside table with rounded-corner wrapped case, fluted (reeded) drawer
fronts, no legs (recessed plinth). Changed: own proportions, 8 mm half-round reeds as real geometry, recessed finger pockets,
wrap radius, plinth depth, vertical-grain fronts against horizontal-grain frame.
Wood = Poly Haven oak_veneer_03 (CC0), tinted slightly darker; end grain a 0.72x derivative.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 0.50)
D = opt("--depth", 0.40)
H = opt("--height", 0.54)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "fluted-oak-two-drawer-nightstand_r001.glb")))
random.seed(53)
reset_scene()

# ---- construction variables (metres); one shared variable per junction ------------------------------------------
PLINTH_H = 0.060                 # floor to the underside of the case
PLINTH_IN = 0.030                # plinth set back from the case on every side
BZ0, BZ1 = PLINTH_H, H           # case underside / top
BH = BZ1 - BZ0
R = 0.035                        # case edge radius: the wrap (top, bottom, sides all round)
FRAME_SIDE, FRAME_TOP, FRAME_BOT = 0.044, 0.042, 0.044
POCKET_DEPTH = 0.022
GAP = 0.003                      # real reveal between the two fronts and to the frame
FRONT_T = 0.020                  # drawer front thickness (front plane to back)
FLUTE_P = 0.008                  # reed pitch
FLUTE_D = 0.003                  # reed depth (crest flush with the case front, valley 3 mm behind)
TILE = 1.0                       # Poly Haven oak_veneer_03 is 1.0 m

# ---- materials --------------------------------------------------------------------------------------------------
src = "oak_veneer_03"
tint = lambda c: c * 0.93
d0 = load_img("wd0", f"{MAT}/{src}_diff_2k.jpg", "sRGB")
wd = derive_image(d0, "pale_oak_diff_2k", tint, MAT)
end_d = derive_image(d0, "pale_oak_end_2k", lambda c: tint(c) * 0.72, MAT)
wr = load_img("wr", f"{MAT}/{src}_rough_2k.jpg", "Non-Color")
wn = load_img("wn", f"{MAT}/{src}_nor_gl_2k.jpg", "Non-Color")
for im, px in ((wd, 2048), (end_d, 512), (wr, 1024), (wn, 1024)):
    im.scale(px, px)
M_WOOD = pbr_material("wood_face", wd, wr, wn, normal_strength=1.0, spec=0.40)
M_END = pbr_material("wood_end", end_d, wr, wn, normal_strength=0.6, spec=0.30)
OU, OV = random.random(), random.random()      # one offset for the case; fronts get their own (vertical grain)

# ---- case profile unroll (arc length around the rounded cross-section keeps the grain continuous over the wrap) ----
ZI0, ZI1 = BZ0 + R, BZ1 - R
YI0, YI1 = -D / 2 + R, D / 2 - R
EPS = 1e-5


def unroll(y, z):
    cy, cz = min(max(y, YI0), YI1), min(max(z, ZI0), ZI1)
    dy, dz = y - cy, z - cz
    Lf = ZI1 - ZI0
    q = R * math.pi / 2
    if dy < -EPS and abs(dz) <= EPS:
        return z - ZI0
    if dy < -EPS and dz > EPS:
        return Lf + R * math.atan2(dz, -dy)
    if abs(dy) <= EPS and dz > EPS:
        return Lf + q + (y - YI0)
    if dy > EPS and dz > EPS:
        return Lf + q + (YI1 - YI0) + R * math.atan2(dy, dz)
    if dy > EPS and abs(dz) <= EPS:
        return Lf + 2 * q + (YI1 - YI0) + (ZI1 - z)
    if dy < -EPS and dz < -EPS:
        return -R * math.atan2(-dz, -dy)
    if abs(dy) <= EPS and dz < -EPS:
        return -q - (y - YI0)
    if dy > EPS and dz < -EPS:
        return -q - (YI1 - YI0) - R * math.atan2(dy, -dz)
    return z - ZI0


def case_uv(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        cx = f.calc_center_median().x
        end = abs(cx) > W / 2 - R + 1e-4 and abs(f.normal.x) > 0.5
        for l in f.loops:
            p = l.vert.co
            if end:
                l[uv].uv = (p.y / TILE + OU, p.z / TILE + OV)
            else:
                l[uv].uv = (unroll(p.y, p.z) / TILE + OU, p.x / TILE + OV)
    bm.to_mesh(ob.data)
    bm.free()


# ---- case: rounded box on a plinth, front pocket cut by boolean ------------------------------------------------
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts:
    v.co.x *= W; v.co.y *= D; v.co.z *= BH
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=R, segments=8, profile=0.5, affect="EDGES")
for v in bm.verts:
    v.co.z += BZ0 + BH / 2
case = new_obj("case", bm)
case.data.materials.append(M_WOOD)
case.data.materials.append(M_END)

px0, px1 = -W / 2 + FRAME_SIDE, W / 2 - FRAME_SIDE
pz0, pz1 = BZ0 + FRAME_BOT, BZ1 - FRAME_TOP
cutter = prism("cutter", rounded_rect_pts(px0, px1, pz0, pz1, 0.0, 0.0), -D / 2 - 0.02, -D / 2 + POCKET_DEPTH)
mod = case.modifiers.new("pocket", "BOOLEAN")
mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
bpy.context.view_layer.objects.active = case
bpy.ops.object.modifier_apply(modifier="pocket")
bpy.data.objects.remove(cutter, do_unlink=True)
case_uv(case)

# ---- plinth: contact chain floor -> plinth (0..PLINTH_H+4 mm) -> case underside --------------------------------
plinth = member("plinth", 0.0, 0.0, 0.0, W - 2 * PLINTH_IN, D - 2 * PLINTH_IN, PLINTH_H + 0.004, 0, M_WOOD, M_END, TILE, bevel=0.002)

# ---- fluted drawer fronts: reeds are geometry, vertical grain, finger pocket cut into the top ------------------
NDR = 2
dx0, dx1 = px0 + GAP, px1 - GAP
dw = dx1 - dx0
NREED = round(dw / FLUTE_P)
PITCH = dw / NREED
zo0, zo1 = pz0 + GAP, pz1 - GAP
dh = (zo1 - zo0 - GAP * (NDR - 1)) / NDR
yf = -D / 2
K = 8                                                    # segments per reed


def fluted_front(name, z0, z1, ou, ov):
    bm = bmesh.new()
    pts = []
    for i in range(NREED):
        for k in range(K + (1 if i == NREED - 1 else 0)):
            th = math.pi * k / K
            pts.append((dx0 + (i + (1 - math.cos(th)) / 2) * PITCH, yf + FLUTE_D * (1 - math.sin(th))))
    pts.append((dx1, yf + FRONT_T))
    pts.append((dx0, yf + FRONT_T))
    f = bm.faces.new([bm.verts.new((x, y, z0)) for x, y in pts])
    ret = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]:
        v.co.z = z1
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    ob = new_obj(name, bm)
    ob.data.materials.append(M_WOOD)
    ob.data.materials.append(M_END)
    # finger pocket near the top edge, cut through the reeds (flat floor, 12 mm deep, reads as a shadowed recess)
    ph = 0.016
    pc = prism(name + "_pull", rounded_rect_pts(-0.040, 0.040, z1 - 0.014 - ph, z1 - 0.014, 0.006, 0.006, seg=5), yf - 0.01, yf + 0.012)
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new("pull", "BOOLEAN")
    m.operation, m.solver, m.object = "DIFFERENCE", "EXACT", pc
    bpy.ops.object.modifier_apply(modifier="pull")
    bpy.data.objects.remove(pc, do_unlink=True)
    # hard edges at reed valleys and caps (split), smooth within each reed; vertical grain UVs
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > 0.9]
    bmesh.ops.split_edges(bm, edges=sharp)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for fc in bm.faces:
        n = fc.normal
        if abs(n.z) > 0.9:
            fc.material_index = 1
            for l in fc.loops:
                l[uv].uv = (l.vert.co.x / TILE + ou, l.vert.co.y / TILE + ov)
        else:
            fc.material_index = 0
            for l in fc.loops:
                p = l.vert.co
                a = p.y if abs(n.x) > 0.9 else p.x
                l[uv].uv = (a / TILE + ou, p.z / TILE + ov)
    bm.to_mesh(ob.data)
    bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


for i in range(NDR):
    z0 = zo0 + i * (dh + GAP)
    fluted_front(f"front{i}", z0, z0 + dh, random.random(), random.random())

# ---- shading: weighted normals on the case, flat on the plinth ---------------------------------------------------
for p in case.data.polygons:
    p.use_smooth = True
weighted_normals(case)
for p in plinth.data.polygons:
    p.use_smooth = False

# ---- oak_veneer_03 grain runs along U (oak_veneer_01 ran along V): swap U/V on every part so the grain follows the V-along-grain UVs above
for ob in bpy.data.objects:
    if ob.type == 'MESH':
        layer = ob.data.uv_layers[0]
        for l in layer.data:
            l.uv = (l.uv[1], l.uv[0])

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
