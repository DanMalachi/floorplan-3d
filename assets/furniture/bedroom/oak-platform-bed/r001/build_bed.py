"""Oak platform bed r001 — Route C (procedural static Blender).

Run:  blender -b -P build_bed.py
Blender axes: X width, Y depth (+Y = headboard, -Y = foot/front), Z up.
glTF export converts to Y-up with front = +Z, origin centred on X/Y, base at 0.
Materials: Poly Haven CC0 oak_veneer_01 + terlenka (see sources.json).
"""
import bpy, bmesh, math, random, os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
OUT = os.path.join(HERE, "exports", "oak-platform-bed_r001.glb")
random.seed(7)

# ---- dimensions (m) ---------------------------------------------------------
W, D = 1.72, 2.12
POST = 0.06
RAIL_T, RAIL_Z0, RAIL_Z1 = 0.040, 0.14, 0.30
HEAD_TOP = 1.04
CAP_H, CAP_OVER = 0.04, 0.015
BOARD_T = 0.024
MATT_W, MATT_D, MATT_H = 1.60, 2.00, 0.22
DECK_TOP = 0.26
BEVEL = 0.003
TILE = 1.83  # oak_veneer_01 real-world tile size (m)

# ---- clean scene ------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)


# ---- materials --------------------------------------------------------------
def load_img(name, path, colorspace):
    img = bpy.data.images.load(path)
    img.name = name
    img.colorspace_settings.name = colorspace
    return img


def make_mat(name, diff, rough, nor, rough_scale=1.0, normal_strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    d = nt.nodes.new("ShaderNodeTexImage"); d.image = diff
    r = nt.nodes.new("ShaderNodeTexImage"); r.image = rough
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = nor
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = normal_strength
    nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m


oak_d = load_img("oak_d", f"{MAT}/oak_veneer_01_diff_2k.jpg", "sRGB")
oak_r = load_img("oak_r", f"{MAT}/oak_veneer_01_rough_2k.jpg", "Non-Color")
oak_n = load_img("oak_n", f"{MAT}/oak_veneer_01_nor_gl_2k.jpg", "Non-Color")


def derive(src, name, fn):
    """Derived copy of a CC0 map, saved next to the source for provenance."""
    import numpy as np
    w, h = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(-1, 4)
    px[:, :3] = fn(px[:, :3])
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels[:] = px.ravel().tolist()
    img.filepath_raw = f"{MAT}/{name}.png"
    img.file_format = "PNG"
    img.save()
    img.colorspace_settings.name = "sRGB"
    img.pack()
    return img


# End grain: same oak, darker + slightly desaturated (absorbs finish, reads darker).
end_d = derive(oak_d, "oak_endgrain_diff_2k", lambda c: (c * 0.72) ** 1.0)
# Cotton: terlenka is cream; lift to a clean off-white.
fab_d_src = load_img("fab_d_src", f"{MAT}/terlenka_diff_2k.jpg", "sRGB")
fab_d = derive(fab_d_src, "cotton_offwhite_diff_2k",
               lambda c: (0.55 + 0.45 * (c / max(float(c.max()), 1e-6))).clip(0, 1) * 0.93)
fab_r = load_img("fab_r", f"{MAT}/terlenka_rough_2k.jpg", "Non-Color")
fab_n = load_img("fab_n", f"{MAT}/terlenka_nor_gl_2k.jpg", "Non-Color")

for _i, _s in ((end_d, 512), (fab_d, 1024), (fab_r, 1024), (fab_n, 1024)):
    _i.scale(_s, _s)

M_OAK = make_mat("oak_face", oak_d, oak_r, oak_n)
M_END = make_mat("oak_endgrain", end_d, oak_r, oak_n, normal_strength=0.6)
M_COTTON = make_mat("cotton_linen", fab_d, fab_r, fab_n, normal_strength=0.8)
FAB_TILE = 0.27  # terlenka real-world tile (m)


# ---- geometry helpers -------------------------------------------------------
def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def wood_box(name, cx, cy, z0, sx, sy, sz, grain, bevel=BEVEL):
    """Solid oak member. `grain`: 0/1/2 = axis the fibres run along.
    UVs are world-scale (metres / TILE) with the image's V axis along the grain,
    a random offset per member so parts never repeat the same figure."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    for v in bm.verts:
        v.co += Vector((cx, cy, z0 + sz / 2))
    bm.normal_update()
    uv = bm.loops.layers.uv.new("UVMap")
    ou, ov = random.random(), random.random()
    others = [a for a in (0, 1, 2) if a != grain]
    for f in bm.faces:
        n = f.normal
        if abs(n[grain]) > 0.9:
            f.material_index = 1  # end grain
            a, b = others
        else:
            f.material_index = 0
            a = max(others, key=lambda ax: abs(n[ax]))     # face plane normal axis
            b = [x for x in others if x != a][0]           # across-grain axis
        for l in f.loops:
            p = l.vert.co
            l[uv].uv = (p[b] / TILE + ou, p[grain] / TILE + ov)
    ob = new_obj(name, bm)
    ob.data.materials.append(M_OAK)
    ob.data.materials.append(M_END)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def fabric_uv(bm, tile):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [i for i in range(3) if i != ax]
        for l in f.loops:
            l[uv].uv = (l.vert.co[a] / tile, l.vert.co[b] / tile)


# ---- frame ------------------------------------------------------------------
parts = []
px = W / 2 - POST / 2
py = D / 2 - POST / 2
rail_h = RAIL_Z1 - RAIL_Z0

for sx in (-1, 1):
    parts.append(wood_box(f"post_head_{'L' if sx < 0 else 'R'}", sx * px, py, 0, POST, POST, HEAD_TOP - CAP_H, 2))
    parts.append(wood_box(f"post_foot_{'L' if sx < 0 else 'R'}", sx * px, -py, 0, POST, POST, RAIL_Z1 + 0.03, 2))

span_y = D - 2 * POST
span_x = W - 2 * POST
for sx in (-1, 1):
    parts.append(wood_box(f"rail_side_{'L' if sx < 0 else 'R'}",
                          sx * (W / 2 - RAIL_T / 2), 0, RAIL_Z0, RAIL_T, span_y, rail_h, 1))
parts.append(wood_box("rail_foot", 0, -(D / 2 - RAIL_T / 2), RAIL_Z0, span_x, RAIL_T, rail_h, 0))
parts.append(wood_box("rail_head", 0, D / 2 - RAIL_T / 2, RAIL_Z0, span_x, RAIL_T, rail_h, 0))

# ledgers + deck slats (visible only as shadow / through the open sides)
led_z = DECK_TOP - 0.018 - 0.03
for sx in (-1, 1):
    parts.append(wood_box(f"ledger_{'L' if sx < 0 else 'R'}",
                          sx * (W / 2 - RAIL_T - 0.015), 0, led_z, 0.03, span_y, 0.03, 1, bevel=0.001))
n_slats = 16
slat_w = 0.07
pitch = (span_y - slat_w) / (n_slats - 1)
for i in range(n_slats):
    y = -span_y / 2 + slat_w / 2 + i * pitch
    parts.append(wood_box(f"slat_{i:02d}", 0, y, DECK_TOP - 0.018, W - 2 * RAIL_T - 0.002, slat_w, 0.018, 0, bevel=0.001))

# ---- headboard --------------------------------------------------------------
hb_z0, hb_z1 = RAIL_Z1, HEAD_TOP - CAP_H
board_w = span_x / 5
for i in range(5):
    cx = -span_x / 2 + board_w * (i + 0.5)
    parts.append(wood_box(f"head_board_{i}", cx, D / 2 - POST / 2, hb_z0,
                          board_w - 0.004, BOARD_T, hb_z1 - hb_z0, 2, bevel=0.0035))
parts.append(wood_box("head_back_panel", 0, D / 2 - POST / 2 + BOARD_T / 2 + 0.003, hb_z0, span_x, 0.006, hb_z1 - hb_z0, 2, bevel=0.001))
parts.append(wood_box("head_cap", 0, D / 2 - POST / 2, HEAD_TOP - CAP_H, W, POST + 2 * CAP_OVER, CAP_H, 0, bevel=0.004))

# ---- mattress ---------------------------------------------------------------
def rounded_box(name, sx, sy, sz, z0, r, sub, mat, tile):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=4, profile=0.5, affect="EDGES")
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=sub, use_grid_fill=True)
    for v in bm.verts:
        v.co.z += z0 + sz / 2
    bm.normal_update()
    fabric_uv(bm, tile)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


matt = rounded_box("mattress", MATT_W, MATT_D, MATT_H, DECK_TOP, 0.035, 2, M_COTTON, FAB_TILE)
matt.location.y = -0.01  # small gap to headboard is realistic


# ---- mattress piping (top + bottom seam, sweeps a circle along a rounded rectangle) ----
def piping(name, z, half_x, half_y, r_corner, r_tube):
    pts = []
    for cxs, cys, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for i in range(9):
            a = math.radians(a0 + i * 90 / 8)
            pts.append((cxs * (half_x - r_corner) + r_corner * math.cos(a),
                        cys * (half_y - r_corner) + r_corner * math.sin(a), z))
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r_tube
    cu.bevel_resolution = 3
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (c[0], c[1], c[2], 1.0)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.active_object
    ob.data.materials.append(M_COTTON)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    fabric_uv(bm, FAB_TILE)
    bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.location.y = -0.01
    return ob


_inset = 0.035 * (1 - math.cos(math.radians(45)))
piping("piping_top", DECK_TOP + MATT_H - _inset, MATT_W / 2 - _inset + 0.001, MATT_D / 2 - _inset + 0.001, 0.03, 0.0065)
piping("piping_bottom", DECK_TOP + _inset, MATT_W / 2 - _inset + 0.001, MATT_D / 2 - _inset + 0.001, 0.03, 0.0065)


# ---- pillows ----------------------------------------------------------------
def pillow(name, cx, cy, cz, rot_x, rot_z):
    A, B, C, K, N = 0.33, 0.235, 0.095, 3.4, 3.0   # half extents 66 x 46, half thickness 8.5 cm
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=44, y_segments=32, size=1.0)
    for v in bm.verts:
        x, y = v.co.x, v.co.y                      # grid is -1..1
        m = max(abs(x), abs(y))
        t = (abs(x) ** K + abs(y) ** K) ** (1 / K)
        k = (m / t) if t > 1e-9 else 0.0
        px, py = x * k, y * k
        g = min(1.0, (abs(px) ** N + abs(py) ** N) ** (1 / N))
        h = C * (max(0.0, 1 - g * g) ** 0.5) * (0.92 + 0.08 * math.cos(px * 3.2))
        if m > 0.9999:
            h = 0.0
        v.co.x, v.co.y, v.co.z = px * A, py * B, h
    bmesh.ops.mirror(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), axis="Z", merge_dist=1e-5)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    fabric_uv(bm, FAB_TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(M_COTTON)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.location = (cx, cy, cz)
    ob.rotation_euler = (rot_x, 0, rot_z)
    return ob


top = DECK_TOP + MATT_H
p1 = pillow("pillow_L", -0.42, 0.78, top + 0.075, math.radians(-16), math.radians(3))
p2 = pillow("pillow_R", 0.42, 0.78, top + 0.07, math.radians(-16), math.radians(-4))

# ---- export -----------------------------------------------------------------
for ob in bpy.data.objects:
    for p in ob.data.polygons:
        p.use_smooth = True

for ob in bpy.data.objects:
    ob.location.y -= 0.0075   # centre Y (head cap overhangs the back by 15 mm)
# centre on X/Y (frame is symmetric in X and outer-bounds symmetric in Y already)
bpy.ops.object.select_all(action="SELECT")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_yup=True, export_apply=True,
    export_image_format="JPEG", export_jpeg_quality=85, export_texcoords=True,
    export_normals=True, export_materials="EXPORT",
)
print("EXPORTED", OUT)
