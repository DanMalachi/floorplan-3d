"""White two-drawer nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): painted white two-drawer bedside table on short square legs.
Changed: corner posts run full height (visible joinery), recessed side panels, shaker-routed drawer fronts, satin brass
knobs, soft-edged top with a slim overhang. Paint = white derivative of Poly Haven oak_veneer_01 (CC0) so the open grain
shows faintly through the paint.
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
H = opt("--height", 0.55)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "white-two-drawer-nightstand_r001.glb")))
random.seed(41)
reset_scene()

# ---- construction variables (metres); one shared variable per junction -------------------------------------------
OV = 0.012                       # top overhang on each side
TOP_T = 0.018
BW, BD = W - 2 * OV, D - 2 * OV  # carcass footprint (outer face of the posts)
POST = 0.040
LEG_H = 0.130                    # floor to underside of the bottom panel
PZ1 = H - TOP_T                  # top of posts / carcass
PANEL_T = 0.016
PANEL_IN = 0.006                 # side/back panels sit this far inside the post faces
APRON_TOP = 0.185                # bottom of the drawer opening
RAIL_TOP = PZ1 - 0.030           # top of the drawer opening
GAP = 0.003
FRONT_T = 0.018
TILE = 1.83

# ---- paint material: plain satin white (tiled wood maps showed as diagonal bands under paint) -------------------
def paint_mat(name, hexcol):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*lin(hexcol), 1.0)
    bs.inputs["Roughness"].default_value = 0.5
    bs.inputs["Specular IOR Level"].default_value = 0.38
    return m


M_PAINT = paint_mat("paint", "#ece9e2")
M_PEND = paint_mat("paint_end", "#e6e3dc")
M_BRASS = metal_material("brass", "#c9a46a", 0.36)
M_BRASS.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.78

# ---- legs / corner posts: one piece, floor to underside of the top -----------------------------------------------
px = BW / 2 - POST / 2
py = BD / 2 - POST / 2
for sx in (-1, 1):
    for sy in (-1, 1):
        member(f"post{sx}{sy}", sx * px, sy * py, 0.0, POST, POST, PZ1 + 0.002, 2, M_PAINT, M_PEND, TILE, bevel=0.0025)

# ---- carcass panels ----------------------------------------------------------------------------------------------
pz0 = LEG_H
ph = PZ1 - pz0
for sx in (-1, 1):                                    # recessed side panels
    cx = sx * (BW / 2 - PANEL_IN - PANEL_T / 2)
    member(f"side{sx}", cx, 0.0, pz0, PANEL_T, BD - 2 * POST + 0.010, ph, 1, M_PAINT, M_PEND, TILE, bevel=0.0015)
member("back", 0.0, BD / 2 - PANEL_IN - PANEL_T / 2, pz0, BW - 2 * POST + 0.010, PANEL_T, ph, 0, M_PAINT, M_PEND, TILE, bevel=0.0015)
member("bottom", 0.0, 0.0, pz0, BW - 2 * PANEL_IN, BD - 2 * PANEL_IN, 0.016, 0, M_PAINT, M_PEND, TILE, bevel=0.0015)

OPEN_W = BW - 2 * POST
yf = -BD / 2                                          # front plane (outer face of posts)
# front apron under the drawers and top rail above them, flush with the posts
member("apron", 0.0, yf + 0.0095, pz0, OPEN_W + 0.010, 0.019, APRON_TOP - pz0, 0, M_PAINT, M_PEND, TILE, bevel=0.0015)
member("toprail", 0.0, yf + 0.0095, RAIL_TOP, OPEN_W + 0.010, 0.019, PZ1 - RAIL_TOP, 0, M_PAINT, M_PEND, TILE, bevel=0.0015)
# drawer box fill: closed drawers need no interior; a solid block behind the fronts stops light leaking through the reveals
member("fill", 0.0, 0.0, APRON_TOP, OPEN_W, BD - 2 * PANEL_IN - 0.02, RAIL_TOP - APRON_TOP, 0, M_PAINT, M_PEND, TILE, bevel=0.0015)

# ---- drawer fronts: flush with the posts, shaker-routed face, brass knob -----------------------------------------
NDR = 2
zo0, zo1 = APRON_TOP + GAP, RAIL_TOP - GAP
dh = (zo1 - zo0 - GAP * (NDR - 1)) / NDR
dw = OPEN_W - 2 * GAP
for i in range(NDR):
    z0 = zo0 + i * (dh + GAP)
    f = member(f"front{i}", 0.0, yf + FRONT_T / 2, z0, dw, FRONT_T, dh, 0, M_PAINT, M_PEND, TILE, bevel=0.0012)
    # shaker pocket: 4 mm deep, rounded corners, 38 mm margin
    m = 0.042
    cut = prism(f"cut{i}", rounded_rect_pts(-dw / 2 + m, dw / 2 - m, z0 + m, z0 + dh - m, 0.004, 0.004, seg=5), yf - 0.01, yf + 0.006)
    bpy.context.view_layer.objects.active = f
    mod = f.modifiers.new("shaker", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cut
    bpy.ops.object.modifier_apply(modifier="shaker")
    bpy.data.objects.remove(cut, do_unlink=True)
    for p in f.data.polygons:
        p.use_smooth = True
    # knob: turned brass, stem + domed head, centred on the pocket floor
    kz = z0 + dh / 2
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.0055, radius2=0.0055, depth=0.016,
                          matrix=Matrix.Translation((0, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.0155,
                              matrix=Matrix.Translation((0, -0.0165, 0)) @ Matrix.Diagonal((1, 0.55, 1, 1)))
    for v in bm.verts:
        v.co += Vector((0, yf + 0.004, kz))
    kn = new_obj(f"knob{i}", bm)
    kn.data.materials.append(M_BRASS)
    for p in kn.data.polygons:
        p.use_smooth = True

# ---- top: one slab, soft edge ------------------------------------------------------------------------------------
member("top", 0.0, 0.0, PZ1, W, D, TOP_T, 0, M_PAINT, M_PEND, TILE, bevel=0.003)

# ---- shading + centre + export -----------------------------------------------------------------------------------
for ob in bpy.data.objects:
    if ob.type == "MESH":
        for p in ob.data.polygons:
            p.use_smooth = ob.name.startswith("knob")
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
