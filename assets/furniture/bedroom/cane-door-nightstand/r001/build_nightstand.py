"""Cane door nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): pale limed-wood bedside cabinet, single door with a woven cane panel, square legs.
Changed: frame-and-panel door (stiles + rails as real members) with the cane set 9 mm back, a short lens-shaped finger scoop carved
into the door's top rail (not a full-width lip), legs tapered on the inside faces only below the case, recessed side/back panels
between the posts, slim 20 mm top with a 10 mm overhang, own proportions.
Wood = limed derivative of Poly Haven oak_veneer_02 (CC0). Cane = self-authored geometry (over-under ribbons), plain colour + per-strand tone.
"""
import sys, os, zlib
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 0.48)
D = opt("--depth", 0.40)
H = opt("--height", 0.60)
SRC = "oak_veneer_02"
DESAT = opt("--desat", 0.40)          # fraction of saturation kept
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "cane-door-nightstand_r001.glb")))
random.seed(71)
reset_scene()

# ---- construction variables (metres); one shared variable per junction -------------------------------------------
OV = 0.010                       # top overhang on each side
TOP_T = 0.020
BW, BD = W - 2 * OV, D - 2 * OV  # carcass footprint (outer face of the posts)
POST = 0.036
PZ1 = H - TOP_T                  # top of posts / carcass
LEG_H = 0.160                    # floor to underside of the apron
FOOT = 0.026                     # leg section at the floor (inside faces taper, outside faces stay plumb)
PANEL_T = 0.014
PANEL_IN = 0.005
APRON_H, TOPRAIL_H = 0.034, 0.020
RAIL_T = 0.019
GAP = 0.003                      # door reveal
DOOR_T = 0.020
STILE, RAIL_TOP, RAIL_BOT = 0.034, 0.048, 0.034
CANE_SET = 0.009                 # cane plane behind the door face
BACKING_Y = 0.042                # dark interior panel behind the door, from the front plane
PITCH, STRAND, CANE_T, WEAVE = 0.0056, 0.0034, 0.0007, 0.0006
TILE = 1.5

# ---- materials --------------------------------------------------------------------------------------------------------
d0 = load_img("wd0", f"{MAT}/{SRC}_diff_2k.jpg", "sRGB")


def tint(c):
    import numpy as np
    g = c.mean(axis=1, keepdims=True)
    c = g + (c - g) * DESAT                             # limed / whitewashed: much calmer than natural oak
    c = c * np.array((0.97, 0.95, 0.91), dtype=np.float32) + 0.03
    return np.clip(c, 0.0, 1.0)


wd = derive_image(d0, "cane_nightstand_diff_2k", tint, MAT)
we = derive_image(d0, "cane_nightstand_end_2k", lambda c: tint(c) * 0.88, MAT)
wr = load_img("wr", f"{MAT}/{SRC}_rough_2k.jpg", "Non-Color")
wn = load_img("wn", f"{MAT}/{SRC}_nor_gl_2k.jpg", "Non-Color")
M_OAK = pbr_material("limed_wood", wd, wr, wn, normal_strength=1.0, spec=0.32)
M_END = pbr_material("limed_wood_end", we, wr, wn, normal_strength=0.8, spec=0.28)


def plain(name, hexc, rough, spec=0.4, vcol=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    if vcol:                                           # colour lives in the vertex colours (exports as COLOR_0, factor 1)
        vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
        nt.links.new(vc.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (*lin(hexc), 1.0)
    return m


M_CANE = plain("cane", None, 0.46, spec=0.42, vcol=True)
M_BACK = plain("interior", "#4c4239", 0.9, spec=0.2)


class Fixed:
    def __init__(self, *v):
        self.v = list(v)

    def random(self):
        return self.v.pop(0)


def m(name, cx, cy, z0, sx, sy, sz, grain, bevel=0.0015, rng=random):
    return member(name, cx, cy, z0, sx, sy, sz, grain, M_OAK, M_END, TILE, bevel=bevel, rng=rng)


def reuv(ob, grain, ou, ov):
    """Re-project world-scale UVs after a boolean (cutter faces arrive without UVs); same mapping as member()."""
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


# ---- legs: one piece per corner, plumb outside faces, inside faces taper below the case ---------------------------
def leg(name, sx, sy):
    cx, cy = sx * (BW / 2 - POST / 2), sy * (BD / 2 - POST / 2)
    sh = (POST - FOOT) / 2
    rings = [(PZ1 + 0.002, POST / 2, 0.0, 0.0), (LEG_H, POST / 2, 0.0, 0.0), (0.0, FOOT / 2, sh * sx, sh * sy)]
    bm = bmesh.new()
    vr = [[bm.verts.new((cx + ox + a * h, cy + oy + b * h, z)) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
          for z, h, ox, oy in rings]
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
for sx in (-1, 1):                                    # recessed side panels, vertical grain, tucked into the top
    m(f"side{sx}", sx * (BW / 2 - PANEL_IN - PANEL_T / 2), 0.0, pz0, PANEL_T, BD - 2 * POST + 0.010, ph + 0.002, 2)
m("back", 0.0, BD / 2 - PANEL_IN - PANEL_T / 2, pz0, BW - 2 * POST + 0.010, PANEL_T, ph + 0.002, 2)
m("bottom", 0.0, 0.0, pz0, BW - 2 * PANEL_IN, BD - 2 * PANEL_IN, 0.016, 0)

OPEN_W = BW - 2 * POST
yf = -BD / 2                                          # front plane (outer face of the posts)
Z_AP = pz0 + APRON_H
Z_TR = PZ1 - TOPRAIL_H
RW = OPEN_W + 0.010
m("apron", 0.0, yf + RAIL_T / 2, pz0, RW, RAIL_T, APRON_H, 0)
m("toprail", 0.0, yf + RAIL_T / 2, Z_TR, RW, RAIL_T, TOPRAIL_H + 0.002, 0)
# interior seen through the cane and the reveals: one mid-dark matte panel, tucked into posts and rails (no light leak)
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, yf + BACKING_Y + 0.005, (Z_AP + Z_TR) / 2))
                      @ Matrix.Diagonal((OPEN_W + 0.006, 0.010, Z_TR - Z_AP + 0.010, 1.0)))
ob = new_obj("interior", bm)
ob.data.materials.append(M_BACK)

# ---- door: frame-and-panel, flush with the posts, 3 mm reveal ----------------------------------------------------
dx0, dx1 = -OPEN_W / 2 + GAP, OPEN_W / 2 - GAP
dz0, dz1 = Z_AP + GAP, Z_TR - GAP
dcy = yf + DOOR_T / 2
for s in (-1, 1):
    m(f"stile{s}", s * (OPEN_W / 2 - GAP - STILE / 2), dcy, dz0, STILE, DOOR_T, dz1 - dz0, 2, bevel=0.0012)
rw = dx1 - dx0 - 2 * STILE + 0.004                  # rails tuck 2 mm into each stile
m("rail_bot", 0.0, dcy, dz0, rw, DOOR_T, RAIL_BOT, 0, bevel=0.0012)
rail_top = m("rail_top", 0.0, dcy, dz1 - RAIL_TOP, rw, DOOR_T, RAIL_TOP, 0, bevel=0.0012, rng=Fixed(0.37, 0.58))

# lens-shaped finger scoop carved into the top rail: ellipsoid cutter, 10 mm deep, about 14 cm long at the face
zc = dz1 - RAIL_TOP * 0.52
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=24, radius=1.0,
                          matrix=Matrix.Translation((0, yf - 0.006, zc)) @ Matrix.Diagonal((0.072, 0.016, 0.0085, 1.0)))
cutter = new_obj("scoop_cut", bm)
bpy.context.view_layer.objects.active = rail_top
mod = rail_top.modifiers.new("scoop", "BOOLEAN")
mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
bpy.ops.object.modifier_apply(modifier="scoop")
bpy.data.objects.remove(cutter, do_unlink=True)
reuv(rail_top, 0, 0.37, 0.58)

# ---- cane: over-under woven ribbons as real geometry, ends tucked into the frame ----------------------------------
cx0, cx1 = dx0 + STILE - 0.005, dx1 - STILE + 0.005
cz0, cz1 = dz0 + RAIL_BOT - 0.005, dz1 - RAIL_TOP + 0.005
yc = yf + CANE_SET
nv = int((cx1 - cx0) / PITCH)
nh = int((cz1 - cz0) / PITCH)
xs = [cx0 + (cx1 - cx0 - (nv - 1) * PITCH) / 2 + i * PITCH for i in range(nv)]
zs = [cz0 + (cz1 - cz0 - (nh - 1) * PITCH) / 2 + j * PITCH for j in range(nh)]
bm = bmesh.new()
col = bm.loops.layers.float_color.new("Col")
CANE = lin("#d2b68c")


def strand_tone(key):
    r = random.Random(zlib.crc32(key.encode()))
    t = 0.80 + 0.30 * r.random()
    return [CANE[0] * t * (1.0 + 0.04 * (r.random() - 0.5)), CANE[1] * t, CANE[2] * t * (0.95 + 0.08 * r.random()), 1.0]


def ribbon(path, half_w, axis, tone):
    """path = [(along, y)] points; axis 'v' runs along z at x = path owner, 'h' runs along x. Two faces (front + back), own verts."""
    for side, dy in ((-1, -CANE_T / 2), (1, CANE_T / 2)):
        rows = []
        for a, y in path:
            if axis[0] == "v":
                rows.append((bm.verts.new((axis[1] - half_w, y + dy, a)), bm.verts.new((axis[1] + half_w, y + dy, a))))
            else:
                rows.append((bm.verts.new((a, y + dy, axis[1] - half_w)), bm.verts.new((a, y + dy, axis[1] + half_w))))
        for k in range(len(rows) - 1):
            q = [rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]]
            f = bm.faces.new(q if (side < 0) == (axis[0] == "v") else q[::-1])
            for l in f.loops:
                l[col] = tone


for i, x in enumerate(xs):                           # vertical strands: over at even crossings
    path = [(cz0, yc)] + [(z, yc + (-WEAVE if (i + j) % 2 == 0 else WEAVE)) for j, z in enumerate(zs)] + [(cz1, yc)]
    ribbon(path, STRAND / 2, ("v", x), strand_tone(f"v{i}"))
for j, z in enumerate(zs):                           # horizontal strands: opposite phase
    path = [(cx0, yc)] + [(x, yc + (WEAVE if (i + j) % 2 == 0 else -WEAVE)) for i, x in enumerate(xs)] + [(cx1, yc)]
    ribbon(path, STRAND / 2, ("h", z), strand_tone(f"h{j}"))
bm.normal_update()
fabric_uv(bm, TILE)
cane = new_obj("cane", bm)
cane.data.materials.append(M_CANE)

# ---- top: one slab, soft edge -------------------------------------------------------------------------------------
member("top", 0.0, 0.0, PZ1, W, D, TOP_T, 0, M_OAK, M_OAK, TILE, bevel=0.004)

# ---- shading + centre + export -----------------------------------------------------------------------------------
for ob in bpy.data.objects:                          # oak_veneer_02 fibres run along image U: transpose so grain follows the member
    if ob.type == "MESH" and ob.name not in ("cane", "interior"):
        for l in ob.data.uv_layers[0].data:
            l.uv = (l.uv[1], l.uv[0])
for ob in bpy.data.objects:
    if ob.type == "MESH":
        for p in ob.data.polygons:
            n = p.normal
            axis_aligned = max(abs(n.x), abs(n.y), abs(n.z)) > 0.995
            p.use_smooth = ob.name == "cane" or (ob.name == "rail_top" and not axis_aligned and abs(n.x) < 0.7)
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
print("CANE", nv, "x", nh, "strands,", len(cane.data.polygons), "faces")
bpy.ops.object.select_all(action="SELECT")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_image_format="JPEG",
                          export_jpeg_quality=85, export_texcoords=True, export_normals=True, export_materials="EXPORT")
print("EXPORTED", OUT)
