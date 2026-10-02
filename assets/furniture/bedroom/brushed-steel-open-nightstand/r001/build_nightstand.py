"""Brushed-steel open nightstand r001 (draft 2) - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): folded sheet-metal bedside box, open front, sits on the floor.
Changed: ONE bent sheet forms top + both sides (plain top, real fold radius), closed back plate and plinth block.
Material = stainless matching the app's fridge finish (src/parametric/materials.ts buildSteel: #c6c8ca, metalness 0.9,
roughness 0.3) plus a self-authored brushed-grain colour/roughness/normal set (no source, no licence issue).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 0.46)
D = opt("--depth", 0.38)
H = opt("--height", 0.55)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "brushed-steel-open-nightstand_r001.glb")))
reset_scene()

# ---- construction variables (metres); one variable per junction -------------------------------------------------
T = 0.0025                  # sheet thickness
R_OUT = 0.009               # outer fold radius (top corners); inner = R_OUT - T
PLINTH_H = 0.030            # closed plinth block: floor of the cubby, no gap under it
EPS = 0.0003                # back/plinth plates sit 0.3 mm inside the sheet edge: no coplanar faces, no gap
TILE = 0.15                 # brushed map covers 0.15 m: 1 px line = 0.15 mm (sub-mm)
METAL = opt("--metal", 0.9)
PLAIN = "--plain" in argv     # control: the app fridge material exactly, no maps


def brushed_maps(px=1024, seed=7):
    """Tileable brushed-stainless set, grain along axis 0 of the arrays (V): tone, roughness (mean ~0.3), normal (gradient across
    the grain). Self-authored."""
    import numpy as np
    rng = np.random.default_rng(seed)

    def blur(a, axis, k):                       # wrapped box blur = tileable
        c = np.cumsum(np.concatenate([a, a[:k] if axis == 0 else a[:, :k]], axis=axis), axis=axis)
        return (c[k:k + px] - c[:px]) / k if axis == 0 else (c[:, k:k + px] - c[:, :px]) / k

    # strictly directional: independent 1 px-wide lines across the grain, only faintly modulated along it (no low-frequency = no wood)
    col = rng.standard_normal((1, px)).astype(np.float32)
    col2 = blur(rng.standard_normal((px, px)).astype(np.float32), 0, 160)
    s = np.repeat(col, px, axis=0) * 0.9 + col2 / (col2.std() + 1e-6) * 0.35
    s = s / s.std()
    rough = np.clip(0.30 + 0.010 * s, 0.12, 0.6)
    tone = None
    dh = (np.roll(s, -1, axis=1) - np.roll(s, 1, axis=1)) * 0.25
    nx = -dh * 0.08
    ln = np.sqrt(nx * nx + 1.0)
    nrm = np.stack([nx / ln * 0.5 + 0.5, np.full_like(nx, 0.5), 1.0 / ln * 0.5 + 0.5], axis=-1)
    print("MAPS rough mean %.3f std %.3f, normal x std %.4f" % (rough.mean(), rough.std(), (nx / ln).std()))
    return tone, rough, nrm


def img_from(name, arr3, colorspace):
    import numpy as np
    h, w = arr3.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([arr3, np.ones((h, w, 1), dtype=np.float32)], axis=-1)
    img.pixels[:] = rgba.ravel().tolist()
    d = os.path.join(HERE, "inputs", "materials")
    os.makedirs(d, exist_ok=True)
    img.filepath_raw = os.path.join(d, name + ".png")      # a generated image only exports pixels once saved + reloaded
    img.file_format = "PNG"
    img.save()
    img = bpy.data.images.load(os.path.join(d, name + ".png"))
    img.colorspace_settings.name = colorspace
    img.pack()
    return img


def steel_material():
    import numpy as np
    tone, rough, nrm = brushed_maps()
    r = img_from("steel_rough", np.repeat(rough[..., None], 3, axis=-1).astype(np.float32), "Non-Color")
    n = img_from("steel_nrm", nrm.astype(np.float32), "Non-Color")
    m = bpy.data.materials.new("brushed_steel")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bs.outputs["BSDF"], out.inputs["Surface"])
    bs.inputs["Metallic"].default_value = METAL      # 0.9 = the fridge
    bs.inputs["Specular IOR Level"].default_value = 0.5
    tr, tn = (nt.nodes.new("ShaderNodeTexImage") for _ in range(2))
    tr.image, tn.image = r, n
    bs.inputs["Base Color"].default_value = (*lin("#c6c8ca"), 1.0)      # exact fridge colour, no colour map
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 1.0
    nt.links.new(tr.outputs["Color"], bs.inputs["Roughness"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bs.inputs["Normal"])
    return m


def grain_uv(ob):
    """World-scale planar UVs: grain (V) vertical on vertical faces, along X on horizontal faces."""
    me = ob.data
    uv = me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        ax = max(range(3), key=lambda i: abs(p.normal[i]))
        for li in p.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            if ax == 2:
                uv.data[li].uv = (c.y / TILE, c.x / TILE)
            elif ax == 0:
                uv.data[li].uv = (c.y / TILE, c.z / TILE)
            else:
                uv.data[li].uv = (c.x / TILE, c.z / TILE)


def plain_steel():
    m = bpy.data.materials.new("plain_steel")
    m.use_nodes = True
    b = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*lin("#c6c8ca"), 1.0)
    b.inputs["Metallic"].default_value = 0.9
    b.inputs["Roughness"].default_value = 0.3
    return m


M_STEEL = plain_steel() if PLAIN else steel_material()


def arc(cx, cz, r, a0, a1, n=8):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def plate(name, x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(((v.co.x + 0.5) * (x1 - x0) + x0, (v.co.y + 0.5) * (y1 - y0) + y0, (v.co.z + 0.5) * (z1 - z0) + z0))
    return new_obj(name, bm)


# ---- bent sheet: top + both sides as ONE 'n' profile with a real fold radius, extruded along depth ---------------
hw = W / 2
ri = R_OUT - T
outer = [(-hw, 0.0)] + arc(-hw + R_OUT, H - R_OUT, R_OUT, math.pi, math.pi / 2) \
    + arc(hw - R_OUT, H - R_OUT, R_OUT, math.pi / 2, 0.0) + [(hw, 0.0)]
inner = [(hw - T, 0.0)] + arc(hw - R_OUT, H - R_OUT, ri, 0.0, math.pi / 2) \
    + arc(-hw + R_OUT, H - R_OUT, ri, math.pi / 2, math.pi) + [(-hw + T, 0.0)]
prism("bent_sheet", outer + inner, -D / 2, D / 2)

# ---- back plate (fully closes the back, overlaps sides and top) and closed plinth block --------------------------
plate("back", -hw + T / 2, hw - T / 2, D / 2 - T, D / 2 - EPS, 0.0, H - T / 2)
plate("plinth", -hw + T / 2, hw - T / 2, -D / 2 + EPS, D / 2 - T, 0.0, PLINTH_H)

# ---- materials, flat shading, normals, centre, export ---------------------------------------------------------------
for ob in bpy.data.objects:
    if ob.type == "MESH":
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.materials.clear()
        ob.data.materials.append(M_STEEL)
        grain_uv(ob)
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

# ---- see-through check: every line through a random point of the object's volume must hit the mesh ------------------
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
rng = random.Random(3)
miss = 0
N = 3000
for _ in range(N):
    p = Vector((rng.uniform(-W / 2 + 0.02, W / 2 - 0.02), rng.uniform(-D / 2 + 0.02, D / 2 - 0.02), rng.uniform(0.04, H - 0.02)))
    d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
    hit = False
    for sgn in (1, -1):
        r = bpy.context.scene.ray_cast(dg, p + d * sgn * 0.0001, d * sgn, distance=5.0)
        if r[0]:
            hit = True
            break
    miss += 0 if hit else 1
print("SEETHROUGH_MISSES", miss, "of", N)

bpy.ops.object.select_all(action="SELECT")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_image_format="JPEG",
                          export_jpeg_quality=92, export_texcoords=True, export_normals=True, export_materials="EXPORT")
print("EXPORTED", OUT)
