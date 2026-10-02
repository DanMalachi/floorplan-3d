"""Natural oak two-drawer nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): light oak bedside table, two drawers between four slim tapered legs.
Changed: legs are one piece with the corner posts and splay slightly below the case, visible mid rail between the drawers,
sequence-matched horizontal grain across the two fronts, undercut slim round brushed-nickel bar pulls on turned standoffs, slim 18 mm top with a 12 mm overhang.
Wood = lightened derivative of Poly Haven white_oak_veneer (CC0).
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
D = opt("--depth", 0.38)
H = opt("--height", 0.55)
SRC = opt("--src", "oak_veneer_02")
LIFT = opt("--lift", 0.90)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "natural-oak-two-drawer-nightstand_r001.glb")))
random.seed(52)
reset_scene()

# ---- construction variables (metres); one shared variable per junction -------------------------------------------
OV = 0.012                       # top overhang on each side
TOP_T = 0.018
BW, BD = W - 2 * OV, D - 2 * OV  # carcass footprint (outer face of the posts)
POST = 0.036
PZ1 = H - TOP_T                  # top of posts / carcass
LEG_H = 0.150                    # floor to underside of the apron
FOOT = 0.022                     # leg section at the floor
SPLAY = 0.012                    # outward shift of the foot centre (both axes)
PANEL_T = 0.014
PANEL_IN = 0.006
APRON_H, MID_H, TOPRAIL_H = 0.030, 0.022, 0.025
RAIL_T = 0.019
GAP = 0.003
FRONT_T = 0.018
TILE = 1.5

# ---- wood material: lightened white oak, end grain 0.72x ---------------------------------------------------------
d0 = load_img("wd0", f"{MAT}/{SRC}_diff_2k.jpg", "sRGB")
lift = (LIFT, LIFT, LIFT * 0.97)


def tint(c):
    import numpy as np
    g = c.mean(axis=1, keepdims=True)
    c = g + (c - g) * 0.7                              # calmer than raw white oak: the viewer saturates warm wood
    return np.clip(c * np.array(lift, dtype=np.float32), 0.0, 1.0)


wd = derive_image(d0, "natural_oak_nightstand_diff_2k", tint, MAT)
we = derive_image(d0, "natural_oak_nightstand_end_2k", lambda c: tint(c) * 0.88, MAT)
wr = load_img("wr", f"{MAT}/{SRC}_rough_2k.jpg", "Non-Color")
wn = load_img("wn", f"{MAT}/{SRC}_nor_gl_2k.jpg", "Non-Color")
M_OAK = pbr_material("oak", wd, wr, wn, normal_strength=1.0, spec=0.35)
M_END = pbr_material("oak_end", we, wr, wn, normal_strength=0.8, spec=0.30)
M_NICKEL = metal_material("brushed_nickel", "#d0d1d3", 0.34)   # light colour + metallic about 0.58: a pure conductor renders black in the viewer
M_NICKEL.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.58


class Fixed:
    """Shared UV offset so neighbouring fronts read as sequence-matched veneer."""
    def __init__(self, *v):
        self.v = list(v)

    def random(self):
        return self.v.pop(0)


def m(name, cx, cy, z0, sx, sy, sz, grain, bevel=0.0015, rng=random):
    return member(name, cx, cy, z0, sx, sy, sz, grain, M_OAK, M_END, TILE, bevel=bevel, rng=rng)


# ---- legs: one piece per corner, vertical post inside the case, tapered + splayed below it -----------------------
def leg(name, sx, sy):
    cx, cy = sx * (BW / 2 - POST / 2), sy * (BD / 2 - POST / 2)
    rings = [
        (PZ1 + 0.002, POST / 2, 0.0, 0.0),
        (LEG_H, POST / 2, 0.0, 0.0),
        (0.0, FOOT / 2, SPLAY * sx, SPLAY * sy),
    ]
    bm = bmesh.new()
    vr = []
    for z, h, ox, oy in rings:
        vr.append([bm.verts.new((cx + ox + a * h, cy + oy + b * h, z)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for r in range(2):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new([vr[r][i], vr[r][j], vr[r + 1][j], vr[r + 1][i]])
    bm.faces.new(vr[0][::-1])
    bm.faces.new(vr[2])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.0015, segments=2, affect="EDGES")
    bm.normal_update()
    uv = bm.loops.layers.uv.new("UVMap")
    ou, ov = random.random(), random.random()
    for f in bm.faces:
        n = f.normal
        if abs(n.z) > 0.9:
            f.material_index = 1
            for l in f.loops:
                l[uv].uv = (l.vert.co.x / TILE + ou, l.vert.co.y / TILE + ov)
        else:
            f.material_index = 0
            u_ax = 1 if abs(n.x) > abs(n.y) else 0
            for l in f.loops:
                l[uv].uv = (l.vert.co[u_ax] / TILE + ou, l.vert.co.z / TILE + ov)
    ob = new_obj(name, bm)
    ob.data.materials.append(M_OAK)
    ob.data.materials.append(M_END)
    return ob


for sx in (-1, 1):
    for sy in (-1, 1):
        leg(f"leg{sx}{sy}", sx, sy)

# ---- carcass -----------------------------------------------------------------------------------------------------
pz0 = LEG_H
ph = PZ1 - pz0
for sx in (-1, 1):                                    # recessed side panels, vertical grain
    cx = sx * (BW / 2 - PANEL_IN - PANEL_T / 2)
    m(f"side{sx}", cx, 0.0, pz0, PANEL_T, BD - 2 * POST + 0.010, ph, 2)
m("back", 0.0, BD / 2 - PANEL_IN - PANEL_T / 2, pz0, BW - 2 * POST + 0.010, PANEL_T, ph, 2)
m("bottom", 0.0, 0.0, pz0, BW - 2 * PANEL_IN, BD - 2 * PANEL_IN, 0.016, 0)

OPEN_W = BW - 2 * POST
yf = -BD / 2                                          # front plane (outer face of the posts)
Z_AP = pz0 + APRON_H                                  # top of the apron = bottom of the drawer opening
Z_TR = PZ1 - TOPRAIL_H                                # top of the drawer opening
reg = (Z_TR - Z_AP - MID_H) / 2                       # height of each drawer opening
Z_MID = Z_AP + reg
RW = OPEN_W + 0.010                                   # rails tuck 5 mm into each post
rc = yf + RAIL_T / 2
m("apron", 0.0, rc, pz0, RW, RAIL_T, APRON_H, 0)
m("midrail", 0.0, rc, Z_MID, RW, RAIL_T, MID_H, 0)
m("toprail", 0.0, rc, Z_TR, RW, RAIL_T, TOPRAIL_H, 0)
# solid fill behind the closed fronts (no interior needed, no light leak through the reveals)
m("fill", 0.0, (yf + RAIL_T + BD / 2 - PANEL_IN) / 2, Z_AP, OPEN_W, BD / 2 - PANEL_IN - yf - RAIL_T, Z_TR - Z_AP, 0)

def bar_pull(name, zc, length=0.110, r=0.0055, post_r=0.0045, span=0.082, stand=0.017):
    """Slim round nickel bar on two short standoffs, centred on the front. Hardware: identical on every drawer."""
    bm = bmesh.new()
    rot_x = Matrix.Rotation(math.pi / 2, 4, "Y")        # cone axis Z -> X
    rot_y = Matrix.Rotation(math.pi / 2, 4, "X")        # cone axis Z -> Y
    yb = yf - stand                                      # bar axis
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=r, depth=length - 2 * r,
                          matrix=Matrix.Translation((0, yb, zc)) @ rot_x)
    for s in (-1, 1):
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=r,
                                  matrix=Matrix.Translation((s * (length / 2 - r), yb, zc)))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=post_r, radius2=post_r, depth=stand + 0.002,
                              matrix=Matrix.Translation((s * span / 2, yf - stand / 2 + 0.001, zc)) @ rot_y)
    fabric_uv(bm, TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(M_NICKEL)
    return ob


# ---- drawer fronts: flush with the frame, shared UV offset, bar pull ----------------------------------------------
dw = OPEN_W - 2 * GAP
for i, zr in enumerate((Z_AP, Z_MID + MID_H)):
    z0 = zr + GAP
    dh = reg - 2 * GAP
    m(f"front{i}", 0.0, yf + FRONT_T / 2, z0, dw, FRONT_T, dh, 0, bevel=0.0012, rng=Fixed(0.31, 0.62))
    bar_pull(f"pull{i}", z0 + dh * 0.58)


# ---- top: one slab, subtle edge; face material on the edges too so no dark end-grain band reads as a plate -------
member("top", 0.0, 0.0, PZ1, W, D, TOP_T, 0, M_OAK, M_OAK, TILE, bevel=0.0035)

# ---- shading + centre + export -----------------------------------------------------------------------------------
# oak_veneer_02 has its fibres along the image's U axis (white_oak_veneer: along V): transpose every UV so grain follows the member axis
if opt("--swapuv", 1 if SRC == "oak_veneer_02" else 0):
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            for l in ob.data.uv_layers[0].data:
                l.uv = (l.uv[1], l.uv[0])
for ob in bpy.data.objects:
    if ob.type == "MESH":
        for p in ob.data.polygons:
            p.use_smooth = ob.name.startswith("pull")
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
