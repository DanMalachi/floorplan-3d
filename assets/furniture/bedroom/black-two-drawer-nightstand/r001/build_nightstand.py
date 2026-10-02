"""Matte black two-drawer nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): matte black bedside case, deep top, two flush drawers, short splayed block legs.
Changed: each drawer front carries its own forward finger ledge along the top edge, solid side stiles as one frame with the
top rail, a thinner plinth rail under the case, legs splayed on both axes with flat floor/case contact.
Finish = plain matte charcoal colour (no generated maps; they render pure black on dark colours).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 0.50)
D = opt("--depth", 0.40)
H = opt("--height", 0.56)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "black-two-drawer-nightstand_r001.glb")))
random.seed(46)
reset_scene()

# ---- construction variables (metres); one shared variable per junction -------------------------------------------
LEDGE_OUT = 0.012                # finger ledge protrusion in front of the front plane
TOP_SIDE = 0.008                 # top overhang left/right
TOP_FRONT = 0.006                # top overhang in front of the front plane
TOP_T = 0.026
LEG_H = 0.125                    # floor to underside of the plinth rail
PZ1 = H - TOP_T                  # top of case
BW = W - 2 * TOP_SIDE            # case width
yf = -D / 2 + LEDGE_OUT          # front plane: stiles, rails, drawer fronts coplanar
yb = D / 2 - 0.004
BD = yb - yf
yc = (yf + yb) / 2
STILE = 0.030                    # side frame thickness (full depth, doubles as the front stile)
PLINTH_H = 0.030
APRON_TOP = LEG_H + PLINTH_H + 0.012
RAIL_TOP = PZ1 - 0.026
GAP = 0.003
FRONT_T = 0.018
OPEN_W = BW - 2 * STILE
TILE = 1.2


def paint_mat(name, hexcol):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*lin(hexcol), 1.0)
    bs.inputs["Roughness"].default_value = 0.95
    bs.inputs["Specular IOR Level"].default_value = 0.10
    return m


M_BLACK = paint_mat("black_matte", "#494848")
M_BEND = paint_mat("black_matte_end", "#464545")

# ---- case ---------------------------------------------------------------------------------------------------------
z0 = LEG_H
ph = PZ1 - z0
for sx in (-1, 1):
    member(f"side{sx}", sx * (BW / 2 - STILE / 2), yc, z0, STILE, BD, ph + 0.002, 2, M_BLACK, M_BEND, TILE, bevel=0.0015)
member("plinth", 0.0, yc, z0, BW - 0.004, BD - 0.004, PLINTH_H, 0, M_BLACK, M_BEND, TILE, bevel=0.002)
member("apron", 0.0, yf + 0.0095, z0 + PLINTH_H - 0.001, OPEN_W + 0.006, 0.019, APRON_TOP - z0 - PLINTH_H + 0.001, 0, M_BLACK, M_BEND, TILE, bevel=0.0012)
member("toprail", 0.0, yf + 0.0095, RAIL_TOP, OPEN_W + 0.006, 0.019, PZ1 - RAIL_TOP + 0.002, 0, M_BLACK, M_BEND, TILE, bevel=0.0012)
member("fill", 0.0, (yf + 0.006 + yb - 0.014) / 2, APRON_TOP, OPEN_W + 0.006, BD - 0.020, RAIL_TOP - APRON_TOP, 0, M_BLACK, M_BEND, TILE, bevel=0.0012)
member("back", 0.0, yb - 0.007, z0, OPEN_W + 0.006, 0.014, ph + 0.002, 0, M_BLACK, M_BEND, TILE, bevel=0.0012)

# ---- drawer fronts (flush, 3 mm reveal) + top-edge finger ledge ---------------------------------------------------
NDR = 2
zo0, zo1 = APRON_TOP + GAP, RAIL_TOP - GAP
dh = (zo1 - zo0 - GAP * (NDR - 1)) / NDR
dw = OPEN_W - 2 * GAP
LEDGE_H = 0.014
for i in range(NDR):
    zz = zo0 + i * (dh + GAP)
    member(f"front{i}", 0.0, yf + FRONT_T / 2, zz, dw, FRONT_T, dh, 0, M_BLACK, M_BEND, TILE, bevel=0.0008)
    member(f"ledge{i}", 0.0, yf - LEDGE_OUT / 2 + 0.003, zz + dh - LEDGE_H, dw - 0.020, LEDGE_OUT + 0.006, LEDGE_H, 0, M_BLACK, M_BEND, TILE, bevel=0.001)

# ---- top: one deep slab -------------------------------------------------------------------------------------------
member("top", 0.0, (yf - TOP_FRONT + D / 2) / 2, PZ1, W, D / 2 - yf + TOP_FRONT, TOP_T, 0, M_BLACK, M_BEND, TILE, bevel=0.002)

# ---- splayed block legs: flat top against the plinth, flat bottom on the floor, flared on both axes ---------------
LX = BW / 2 - 0.040
LY = BD / 2 - 0.045
LW, LD = 0.044, 0.034
SPLAY_X, SPLAY_Y = 0.020, 0.024
for sx in (-1, 1):
    for sy in (-1, 1):
        top = (sx * LX, yc + sy * LY)
        bot = (top[0] + sx * SPLAY_X, top[1] + sy * SPLAY_Y)
        ztop = z0 + 0.002

        def ring(c, z):
            return [(c[0] + a * LW / 2, c[1] + b * LD / 2, z) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]

        t, b = ring(top, ztop), ring(bot, 0.0)
        bm = bmesh.new()
        quads = [(b[3], b[2], b[1], b[0]), (t[0], t[1], t[2], t[3])]
        for k in range(4):
            quads.append((b[k], b[(k + 1) % 4], t[(k + 1) % 4], t[k]))
        for q in quads:
            bm.faces.new([bm.verts.new(p) for p in q])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.0012, segments=1, affect="EDGES")
        lg = new_obj(f"leg{sx}{sy}", bm)
        lg.data.materials.append(M_BLACK)

# ---- shading (flat on rigid parts) + centre + export --------------------------------------------------------------
for ob in bpy.data.objects:
    if ob.type == "MESH":
        for p in ob.data.polygons:
            p.use_smooth = False
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
