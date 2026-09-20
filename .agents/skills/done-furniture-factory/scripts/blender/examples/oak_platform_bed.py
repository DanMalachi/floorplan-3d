"""WORKED EXAMPLE (self-contained, does not import furniture_lib): oak platform bed r003, shipped as factory:oak-platform-bed.
Copy the patterns, not the numbers. Original location: assets/furniture/bedroom/oak-platform-bed/r003/build_bed.py.
Run: blender -b -P oak_platform_bed.py   (expects inputs/materials/ next to it; ~80 s, most of it the duvet cloth sim)."""
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
OUT = os.path.join(HERE, "exports", "oak-platform-bed_r003.glb")
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
_lift = lambda c: (0.55 + 0.45 * (c / max(float(c.max()), 1e-6))).clip(0, 1)
white_d = derive(fab_d_src, "cotton_white_diff_2k", lambda c: (_lift(c) * 1.0 + 0.04).clip(0, 1) * 0.97)
greige_d = derive(fab_d_src, "linen_greige_diff_2k", lambda c: _lift(c) * __import__("numpy").array([0.80, 0.75, 0.68]))
fab_r = load_img("fab_r", f"{MAT}/terlenka_rough_2k.jpg", "Non-Color")
fab_n = load_img("fab_n", f"{MAT}/terlenka_nor_gl_2k.jpg", "Non-Color")

for _i, _s in ((end_d, 512), (fab_d, 1024), (white_d, 1024), (greige_d, 1024), (fab_r, 1024), (fab_n, 1024)):
    _i.scale(_s, _s)

M_OAK = make_mat("oak_face", oak_d, oak_r, oak_n)
M_END = make_mat("oak_endgrain", end_d, oak_r, oak_n, normal_strength=0.6)
M_COTTON = make_mat("cotton_linen", fab_d, fab_r, fab_n, normal_strength=0.8)
M_WHITE = make_mat("cotton_white", white_d, fab_r, fab_n, normal_strength=0.8)
M_DUVET = make_mat("duvet_linen", greige_d, fab_r, fab_n, normal_strength=1.0)
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
# ONE continuous slab: a single grain figure runs across the whole headboard (no per-board repeat).
parts.append(wood_box("head_panel", 0, D / 2 - POST / 2, hb_z0, span_x, BOARD_T, hb_z1 - hb_z0, 2, bevel=0.003))
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


# ---- bedding: real cloth simulation (gravity, pressure, collision) -----------
from mathutils import Matrix, noise as _noise
scene = bpy.context.scene
scene.gravity = (0, 0, -9.81)


def bake_xform(ob):
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)


bake_xform(matt)
for _o in bpy.data.objects:
    if _o.type == "MESH" and _o.name.startswith("piping"):
        bake_xform(_o)


def add_collider(ob, dist=0.004):
    m = ob.modifiers.new("Collision", "COLLISION")
    m.settings.thickness_outer = dist
    m.settings.use_culling = False
    m.settings.cloth_friction = 25.0


colliders = [matt] + [p for p in parts if p.name.startswith(("post_", "rail_", "head_"))]
for _c in colliders:
    add_collider(_c)
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
_floor = bpy.context.active_object
_floor.name = "_sim_floor"
add_collider(_floor)


def cloth_bake(ob, frames, setup):
    """Run the cloth sim for real, then freeze the final frame into a plain mesh."""
    cl = ob.modifiers.new("Cloth", "CLOTH")
    setup(cl.settings, cl.collision_settings)
    cl.point_cache.frame_start, cl.point_cache.frame_end = 1, frames
    scene.frame_start, scene.frame_end = 1, frames
    for f in range(1, frames + 1):
        scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    out = bpy.data.objects.new(ob.name + "_sim", me)
    bpy.context.collection.objects.link(out)
    for m in ob.data.materials:
        me.materials.append(m)
    bpy.data.objects.remove(ob)
    scene.frame_set(1)
    return out


def flat_grid(name, w, d, res, uv_tile, mat):
    bm = bmesh.new()
    nx, ny = int(w / res), int(d / res)
    bmesh.ops.create_grid(bm, x_segments=nx, y_segments=ny, size=0.5)
    for v in bm.verts:
        v.co.x *= w; v.co.y *= d
    return bm


# --- pillows: firm visco (memory-foam) slabs, rounded edges, gentle neck contour, propped on the headboard
def visco_pillow(name, cx, cy, yaw, tilt):
    W_, D_, H_ = 0.62, 0.42, 0.115
    ob = rounded_box(name, W_, D_, H_, -H_ / 2, 0.042, 4, M_WHITE, FAB_TILE)
    for v in ob.data.vertices:
        if v.co.z > 0:   # shallow contour: dipped centre, raised ends
            v.co.z -= 0.013 * math.exp(-(v.co.x / 0.15) ** 2) * (v.co.z / (H_ / 2))
            v.co.z += 0.006 * (abs(v.co.x) / (W_ / 2)) ** 2 * (v.co.z / (H_ / 2))
    ob.data.transform(Matrix.Translation((cx, cy, top + 0.122 - 0.008)) @ Matrix.Rotation(yaw, 4, "Z")
                      @ Matrix.Rotation(tilt, 4, "X"))
    ob.data.update()
    return ob


top = DECK_TOP + MATT_H
pillows = [visco_pillow("pillow_L", -0.42, 0.785, 0.03, math.radians(18)),
           visco_pillow("pillow_R", 0.42, 0.785, -0.03, math.radians(18))]

# --- duvet: a real draped sheet, top edge stops below the pillows
def duvet_setup(st, co):
    st.quality = 8
    st.mass = 0.18
    st.tension_stiffness = st.compression_stiffness = 40
    st.shear_stiffness = 20
    st.bending_stiffness = 1.2
    st.bending_damping = 1.0
    st.air_damping = 2.5
    co.use_collision = True
    co.distance_min = 0.008
    co.collision_quality = 3
    co.use_self_collision = False


DW = 1.84
Y_FOOT, Y_FOLD = -1.14, 0.48            # foot edge overhangs ~12 cm; head edge sits below the pillows
ROWS_MAIN, ROWS_BAND = 74, 0
dy = (Y_FOLD - Y_FOOT) / ROWS_MAIN
DL = dy * (ROWS_MAIN + ROWS_BAND)
from mathutils import noise as _noise
dgm = bmesh.new()
bmesh.ops.create_grid(dgm, x_segments=int(DW / 0.022), y_segments=ROWS_MAIN + ROWS_BAND, size=0.5)
for v in dgm.verts:
    v.co.x *= DW
    v.co.y = Y_FOOT + (v.co.y / 0.5 * 0.5 + 0.5) * DL     # grid y is -0.5..0.5 -> foot..end
    v.co.z = 0.0
dgm.normal_update()
fabric_uv(dgm, 0.30)
for v in dgm.verts:
    v.co.z += top + 0.05 + 0.028 * _noise.noise((v.co.x * 2.2, v.co.y * 2.2, 0.0))
dgm.normal_update()
duv = new_obj("duvet", dgm)
duv.data.materials.append(M_DUVET)
duv = cloth_bake(duv, 110, duvet_setup)

# finish: thickness + smoothing so it reads as filled fabric, not a paper sheet
def finish(ob, thick, subdiv):
    if thick:
        sol = ob.modifiers.new("Solidify", "SOLIDIFY")
        sol.thickness = thick; sol.offset = 1.0
    if subdiv:
        sub = ob.modifiers.new("Sub", "SUBSURF")
        sub.levels = subdiv; sub.render_levels = subdiv
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in ob.data.polygons:
        p.use_smooth = True


def crease(ob, amp, freq, seed):
    """Soft settled creases: ridged multi-octave noise pushed along the vertex normal."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
    for v in bm.verts:
        p = v.co * freq + Vector((seed, seed * 0.7, seed * 1.3))
        n = 1.0 - abs(_noise.noise(p)) * 2.0                       # ridges
        n2 = _noise.noise(p * 2.3 + Vector((3.1, 1.7, 0.4)))
        v.co += v.normal * amp * (0.7 * n + 0.3 * n2)
    bm.to_mesh(ob.data); bm.free()


crease(duv, 0.017, 2.4, 5.0)
finish(duv, 0.022, 0)

# turned-down cuff along the head edge: covers the raw edge and gives the duvet its silhouette
cuff = rounded_box("duvet_cuff", 1.62, 0.19, 0.066, top + 0.028, 0.03, 3, M_DUVET, 0.30)
cuff.location.y = 0.395
bake_xform(cuff)
for v in cuff.data.vertices:
    v.co.z += 0.006 * math.sin(v.co.x * 5.5) + 0.004 * _noise.noise((v.co.x * 3, v.co.y * 3, 1.0)) - 0.05 * max(0.0, (abs(v.co.x) - 0.55) / 0.26) ** 2
crease(cuff, 0.005, 6.0, 9.0)
for p in cuff.data.polygons:
    p.use_smooth = True
bpy.data.objects.remove(_floor)
for _c in colliders:
    _c.modifiers.remove(_c.modifiers["Collision"])

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
