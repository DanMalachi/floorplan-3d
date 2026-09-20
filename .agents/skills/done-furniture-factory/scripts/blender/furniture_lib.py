"""Reusable Blender helpers for done-furniture-factory Route C (procedural static Blender, 5.x).

Extracted from the oak platform bed (r001-r003) that shipped as `factory:oak-platform-bed`.
Import from a build script that runs under `blender -b -P build.py`:

    import sys; sys.path.insert(0, r"<repo>/.agents/skills/done-furniture-factory/scripts/blender")
    from furniture_lib import *

Conventions: metres; Blender Z up; front of the piece faces -Y (glTF export makes that +Z); origin centred in X/Y,
base at Z=0. Everything here is deterministic given the rng seed, so a revision costs seconds, not a redo.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, noise as _noise

__all__ = [
    "reset_scene", "load_img", "pbr_material", "derive_image", "new_obj", "fabric_uv", "member", "rounded_box",
    "bake_xform", "add_collider", "cloth_bake", "drape_setup", "inflate_setup", "crease", "finish_cloth",
    "flat_sheet", "puff", "piping", "place_mesh", "tinted_fabric", "pile_sheen", "export_glb",
    "smoothstep", "lin", "frange", "graded", "cushion_mesh", "randomise_uv", "thread_material", "surface", "rr_path", "resample",
    "stitch_row_along_x", "stitch_row_around", "stitch_mesh", "tone_setup", "tone_apply", "metal_material", "tufted_slab", "button", "grid_buttons", "rounded_rect_pts", "prism", "weighted_normals", "Vector", "Matrix", "bmesh", "bpy", "math", "random", "_noise",
]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---- materials --------------------------------------------------------------
def load_img(name, path, colorspace):
    """colorspace: 'sRGB' for base colour, 'Non-Color' for roughness / normal / metallic maps."""
    img = bpy.data.images.load(path)
    img.name = name
    img.colorspace_settings.name = colorspace
    return img


def pbr_material(name, diff, rough, nor, normal_strength=1.0, spec=0.35):
    """Principled BSDF fed by three image textures. The glTF exporter repacks roughness into metallicRoughness."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Specular IOR Level"].default_value = spec
    d, r, n = (nt.nodes.new("ShaderNodeTexImage") for _ in range(3))
    d.image, r.image, n.image = diff, rough, nor
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = normal_strength
    nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def derive_image(src, name, fn, save_dir):
    """Make a tinted/darkened derivative of a CC0 map (e.g. end grain = 0.72x darker oak; cream cotton -> white).
    fn maps an (N,3) float array of linear-ish RGB to a new (N,3) array. Saved next to the sources for provenance."""
    import numpy as np
    w, h = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(-1, 4)
    px[:, :3] = fn(px[:, :3])
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels[:] = px.ravel().tolist()
    img.filepath_raw = os.path.join(save_dir, name + ".png")
    img.file_format = "PNG"
    img.save()
    img.colorspace_settings.name = "sRGB"
    img.pack()
    return img


# ---- geometry ---------------------------------------------------------------
def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def fabric_uv(bm, tile):
    """World-scale planar UVs (metres / tile) per face, projected on the face's dominant axis."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [i for i in range(3) if i != ax]
        for l in f.loops:
            l[uv].uv = (l.vert.co[a] / tile, l.vert.co[b] / tile)


def member(name, cx, cy, z0, sx, sy, sz, grain, face_mat, end_mat, tile, bevel=0.003, rng=random):
    """Solid timber-like member: real thickness, bevelled edges, world-scale UVs with V along the grain.
    grain = 0/1/2 (axis the fibres run along). Faces normal to the grain get `end_mat` (darker end grain).
    A random UV offset per member stops neighbouring parts from repeating the same figure.
    LAW: a surface that reads as ONE piece of material (a headboard, a table top, a door) is ONE member.
    Splitting it into N members (boards) with the same tile makes the repeat visible in shadow."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    for v in bm.verts:
        v.co += Vector((cx, cy, z0 + sz / 2))
    bm.normal_update()
    uv = bm.loops.layers.uv.new("UVMap")
    ou, ov = rng.random(), rng.random()
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
            p = l.vert.co
            l[uv].uv = (p[b] / tile + ou, p[grain] / tile + ov)
    ob = new_obj(name, bm)
    ob.data.materials.append(face_mat)
    ob.data.materials.append(end_mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def rounded_box(name, sx, sy, sz, z0, r, sub, mat, tile, seg=4):
    """Rounded, subdivided slab (mattress, firm foam pillow, cushion, cuff). r = bevel radius, sub = extra cuts, seg = bevel segments (4 reads faceted at corners up close; use 8 for hero upholstery)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=seg, profile=0.5, affect="EDGES")
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


def bake_xform(ob):
    """Push the object transform into the mesh (needed before cloth/collision: the sim works on world verts)."""
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)


# ---- cloth: drapes, bedding, throws, curtains, cushion covers ----------------
def add_collider(ob, dist=0.004, friction=25.0):
    """High friction is what stops a draped sheet from sliding off the piece and pooling on the floor."""
    m = ob.modifiers.new("Collision", "COLLISION")
    m.settings.thickness_outer = dist
    m.settings.use_culling = False
    m.settings.cloth_friction = friction


def cloth_bake(scene, ob, frames, setup):
    """Really run the sim (frame-by-frame, cache needs sequential stepping), then freeze the last frame to a mesh."""
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


def drape_setup(st, co):
    """Heavy woven cotton draped over a bed/sofa/table: holds soft folds, hangs, does not slide. Mass is PER VERTEX."""
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
    co.use_self_collision = False      # keep OFF for single-layer cloth; see blender-recipes.md for the folded-edge trap


def inflate_setup(st, co, volume_m3=0.038, pressure=6.0):
    """Soft stuffed goods (pillows, cushions, poufs): a sealed two-layer bag inflated by cloth pressure.
    Pressure MUST be > 0 in volume mode or it stays a flat sack. Start flat (thickness ~1 cm), let pressure do the rest."""
    st.quality = 10
    st.mass = 0.05
    st.tension_stiffness = st.compression_stiffness = 30
    st.shear_stiffness = 20
    st.bending_stiffness = 0.5
    st.air_damping = 1.6
    st.use_pressure = True
    st.uniform_pressure_force = pressure
    st.use_pressure_volume = True
    st.target_volume = volume_m3
    st.pressure_factor = 1.4
    co.use_collision = True
    co.distance_min = 0.006
    co.collision_quality = 4
    co.use_self_collision = True
    co.self_distance_min = 0.004


def flat_sheet(name, w, d, res, y0, z, tile, mat, wobble=0.0):
    """Regular grid sheet spanning x in [-w/2, w/2], y in [y0, y0+d], at height z, UVs from the FLAT layout so the weave
    survives the sim. `wobble` (m) adds low-frequency initial height noise so the sheet settles into natural folds."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=int(w / res), y_segments=int(d / res), size=0.5)   # size is half-extent
    for v in bm.verts:
        v.co.x *= w
        v.co.y = y0 + (v.co.y + 0.5) * d
        v.co.z = 0.0
    bm.normal_update()
    fabric_uv(bm, tile)
    for v in bm.verts:
        v.co.z = z + wobble * _noise.noise((v.co.x * 2.2, v.co.y * 2.2, 0.0))
    bm.normal_update()
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    return ob


def crease(ob, amp, freq, seed):
    """Soft settled creases: ridged multi-octave noise pushed along vertex normals. amp ~0.010-0.017 m for a duvet."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.normal_update()
    for v in bm.verts:
        p = v.co * freq + Vector((seed, seed * 0.7, seed * 1.3))
        n = 1.0 - abs(_noise.noise(p)) * 2.0
        n2 = _noise.noise(p * 2.3 + Vector((3.1, 1.7, 0.4)))
        v.co += v.normal * amp * (0.7 * n + 0.3 * n2)
    bm.to_mesh(ob.data); bm.free()


def finish_cloth(ob, thickness=0.0, subdiv=0):
    """Give a sim'd sheet real thickness (a paper-thin sheet reads as a tablecloth) and optional smoothing."""
    if thickness:
        s = ob.modifiers.new("Solidify", "SOLIDIFY"); s.thickness = thickness; s.offset = 1.0
    if subdiv:
        s = ob.modifiers.new("Sub", "SUBSURF"); s.levels = subdiv; s.render_levels = subdiv
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in ob.data.polygons:
        p.use_smooth = True



# ---- upholstery (added after the block-arm sofa) -------------------------------------------------------------------
def puff(ob, crown, belly, wr=0.0025, front=0.0):
    """Soft-goods shaping on a rounded_box slab: raised crown on top (crown, m), bellied sides (belly), faint settling
    wrinkles (wr), optional plump -Y face (front) for back cushions. Call BEFORE place_mesh (works in the slab's local frame)."""
    me = ob.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    z0, z1 = min(zs), max(zs)
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    hx, hy = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    for v in me.vertices:
        u, w, t = (v.co.x - cx) / hx, (v.co.y - cy) / hy, (v.co.z - z0) / (z1 - z0)
        edge = max(abs(u), abs(w))
        if t > 0.5:
            v.co.z += crown * max(0.0, 1 - u * u) * max(0.0, 1 - w * w) * (t - 0.5) * 2
        if front and w < 0:
            v.co.y -= front * max(0.0, 1 - u * u) * (1 - (2 * t - 1) ** 2) * (-w)
        b = belly * (1 - (2 * t - 1) ** 2)
        v.co.x += b * u * min(1.0, edge * 1.2) * 0.5
        v.co.y += b * w * min(1.0, edge * 1.2) * 0.5
    if wr:
        crease(ob, wr, 7.0, random.random() * 9)


def piping(name, hx, hy, z, rc, rad, mat, tile, ring=8):
    """Upholstery welt: small tube around a rounded-rectangle path (half extents hx, hy, corner radius rc) at height z in the
    parent cushion's LOCAL frame. Move it with place_mesh(..., bz=<cushion base z>) exactly like the cushion it belongs to."""
    pts = []
    for cxs, cys, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for k in range(7):
            a = math.radians(a0 + 90 * k / 6)
            pts.append((cxs * (hx - rc) + rc * math.cos(a), cys * (hy - rc) + rc * math.sin(a)))
    n = len(pts); bm = bmesh.new(); rings = []
    for i, (x, y) in enumerate(pts):
        nx, ny = pts[(i + 1) % n]; px, py = pts[i - 1]
        tx, ty = nx - px, ny - py; L = math.hypot(tx, ty) or 1
        ox, oy = ty / L, -tx / L
        rings.append([bm.verts.new((x + ox * rad * math.cos(2 * math.pi * j / ring), y + oy * rad * math.cos(2 * math.pi * j / ring),
                                    z + rad * math.sin(2 * math.pi * j / ring))) for j in range(ring)])
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(ring):
            bm.faces.new((a[j], a[(j + 1) % ring], b[(j + 1) % ring], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    fabric_uv(bm, tile)
    ob = new_obj(name, bm); ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def place_mesh(ob, x, y, z, rx=0.0, bz=None):
    """Rotate about X around the object's base-centre, then translate, all in MESH space (no object transform to bake).
    Pass the same bz (cushion base z) for a cushion and its piping so they stay together."""
    if bz is None:
        bz = min(v.co.z for v in ob.data.vertices)
    ob.data.transform(Matrix.Translation((x, y, z)) @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Translation((0, 0, -bz)))


def tinted_fabric(name, diff_path, rough_path, nor_path, colour_hex, save_dir, px=2048, normal_strength=1.8, spec=0.25):
    """PARAMETRIC COLOUR, SAME TEXTURE: luminance-normalise a CC0 fabric diffuse to mean 0.72 (cached as <name>_grey.png), then
    multiply by a colour. The glTF exporter writes the colour as baseColorFactor, so weave/roughness/normal are identical
    across colour variants and the app can retint at runtime. A pure-white target tops out at 0.72 albedo, which is right for fabric."""
    import numpy as np
    def lin(h):
        h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    grey = os.path.join(save_dir, name + '_grey.png')
    if os.path.exists(grey):
        d = load_img(name + '_g', grey, 'sRGB')
    else:
        src = load_img(name + '_src', diff_path, 'sRGB'); src.scale(px, px)
        def norm(p):
            lum = p @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
            return np.clip(np.stack([lum / lum.mean() * 0.72] * 3, axis=1), 0, 1)
        d = derive_image(src, name + '_grey', norm, save_dir)
    m = pbr_material(name, d, load_img(name + '_r', rough_path, 'Non-Color'), load_img(name + '_n', nor_path, 'Non-Color'), normal_strength, spec)
    nt = m.node_tree
    bsdf = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'); tex = next(x for x in nt.nodes if x.type == 'TEX_IMAGE' and x.image == d)
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'; mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (*lin(colour_hex), 1.0)
    nt.links.new(tex.outputs['Color'], mix.inputs[6]); nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    return m


def pile_sheen(mat, weight=0.4, roughness=0.4, tint=(0.94, 1.0, 0.94, 1.0), spec_level=0.12):
    """Velvet / felt / brushed-pile response: a Principled sheen lobe (exports as KHR_materials_sheen) plus a low specular level.
    Real pile fibres stand up and scatter light at grazing angles, so the surface brightens toward silhouettes and shifts shade with the
    view direction, while a plain fabric stays diffuse. Keep weight moderate (0.3 to 0.5): at 1.0 the rim reads as gloss or satin.
    Also raise roughness to 0.4 or more so the lobe is broad. Call after tinted_fabric / pbr_material."""
    bs = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for k, val in (('Sheen Weight', weight), ('Sheen Roughness', roughness), ('Sheen Tint', tint), ('Specular IOR Level', spec_level)):
        if k in bs.inputs:
            bs.inputs[k].default_value = val
        else:
            print('MISSING INPUT', k)


# ---- export -----------------------------------------------------------------
def export_glb(path, recentre_y=0.0):
    """Select everything and export. Recentre BEFORE this (shift object locations) so bounds are symmetric in X/Z;
    check with audit-glb.mjs afterwards. Texture bytes: downscale images before export (2k hero surface, 512-1k the rest)."""
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            for p in ob.data.polygons:
                p.use_smooth = True
            ob.location.y += recentre_y
    bpy.ops.object.select_all(action="SELECT")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_yup=True, export_apply=True,
        export_image_format="JPEG", export_jpeg_quality=85, export_texcoords=True,
        export_normals=True, export_materials="EXPORT",
    )
    print("EXPORTED", path)


# ---- upholstery v2: dense cushion meshes, stitching, non-repeating tone (beige leather sofa, 2026-09-20) --------------
def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lin(h):
    """'#rrggbb' to linear RGB list."""
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def frange(a, b, step):
    out, x = [], a
    while x < b:
        out.append(x); x += step
    return out


def graded(lo, hi, centre=None, fine=0.003, mid=0.008, coarse=0.02):
    """Edge-loop positions from lo to hi: `fine` spacing within 3 cm of `centre` (a seam), `mid` within 8 cm, `coarse` elsewhere."""
    out, x = [], lo
    while x < hi:
        out.append(x)
        d = abs(x - centre) if centre is not None else 1.0
        x += fine if d < 0.03 else (mid if d < 0.08 else coarse)
    if centre is not None:
        out.append(centre)
    return sorted(set(round(p, 5) for p in out))


def cushion_mesh(sx, sy, sz, r, loops, seg=8):
    """Bevelled block (centre origin in X/Y, base at z=0) cut with clean edge loops via bisect_plane. loops = {axis: [positions]}
    (x, y in the centred frame; z measured from the base). Returns a bmesh: shape it, then finish it with fabric_uv + new_obj.
    Cost guide: 1.3 cm loops on x, graded z, on a 0.43 x 0.17 x 0.57 back cushion = about 10k triangles."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=seg, profile=0.5, affect="EDGES")
    for axis in (0, 1, 2):
        for p in loops.get(axis, []):
            q = p - sz / 2 if axis == 2 else p
            co = [0, 0, 0]; no = [0, 0, 0]; co[axis] = q; no[axis] = 1
            bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), dist=1e-5, plane_co=co, plane_no=no)
    for v in bm.verts:
        v.co.z += sz / 2
    bm.normal_update()
    return bm


def randomise_uv(ob):
    """Rotate + offset the planar UVs of ONE part at random so identical grain never lines up between parts."""
    th, ox, oy = random.random() * 6.283, random.random(), random.random()
    c, sn = math.cos(th), math.sin(th)
    for l in ob.data.uv_layers.active.data:
        x, y = l.uv
        l.uv = (c * x - sn * y + ox, sn * x + c * y + oy)


def thread_material(colour_hex, dark=0.58):
    """Tone-on-tone thread: `dark` x the hide colour (0.58 reads at close range; 0.72 vanished), matte, no texture."""
    m = bpy.data.materials.new("thread")
    m.use_nodes = True
    b = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*[c * dark for c in lin(colour_hex)], 1.0)
    b.inputs["Roughness"].default_value = 0.6
    b.inputs["Specular IOR Level"].default_value = 0.3
    return m


def surface(ob):
    """BVH of an object's mesh (mesh-space coordinates): raycast stitch positions onto the FINAL shaped surface, before place_mesh."""
    from mathutils.bvhtree import BVHTree
    me = ob.data
    return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def rr_path(hx, hy, rc, k=7):
    """Rounded-rectangle path (x, y, outward nx, ny), same arcs as piping()."""
    pts = []
    for cxs, cys, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for j in range(k):
            a = math.radians(a0 + 90 * j / (k - 1))
            pts.append((cxs * (hx - rc) + rc * math.cos(a), cys * (hy - rc) + rc * math.sin(a), math.cos(a), math.sin(a)))
    return pts


def resample(pts, pitch):
    """Points every `pitch` along a closed polyline of (x, y, nx, ny)."""
    out, carry = [], 0.0
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        d = carry
        while d < L:
            t = d / L
            nx, ny = a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t
            m = math.hypot(nx, ny) or 1
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, nx / m, ny / m))
            d += pitch
        carry = d - L
    return out


def stitch_row_along_x(bvh, x0, x1, z, pitch=0.0125, y_from=-1.0):
    """Stitch anchor points along a horizontal line on a -Y facing surface (rays from the front)."""
    row, x = [], x0
    while x <= x1:
        hit = bvh.ray_cast(Vector((x, y_from, z)), Vector((0, 1, 0)))
        if hit[0] is not None:
            row.append((hit[0], hit[1]))
        x += pitch
    return row


def stitch_row_around(bvh, hx, hy, rc, z, pitch=0.0125, out=0.4):
    """Stitch anchor points around a rounded-rectangle perimeter at height z (rays from outside, horizontal)."""
    row = []
    for (x, y, nx, ny) in resample(rr_path(hx, hy, rc), pitch):
        hit = bvh.ray_cast(Vector((x + nx * out, y + ny * out, z)), Vector((-nx, -ny, 0)))
        if hit[0] is not None:
            row.append((hit[0], hit[1]))
    return row


def stitch_mesh(name, rows, mat, L=0.0085, w=0.0021, h=0.0018):
    """rows = list of [(point, normal)] along a path. One tiny 8-triangle lens per stitch (8.5 mm long, axis along the path,
    half sunk in the hide). 1100 stitches cost about 9k triangles. Returns (object, count). Move it with place_mesh like its cushion."""
    bm = bmesh.new()
    n_st = 0
    for row in rows:
        m = len(row)
        for i, (p, n) in enumerate(row):
            a, b = row[max(i - 1, 0)][0], row[min(i + 1, m - 1)][0]
            t = b - a
            t -= n * t.dot(n)
            if t.length < 1e-6:
                continue
            t.normalize()
            s = n.cross(t)
            c = p - n * 0.0004
            ring = [bm.verts.new(c + s * w), bm.verts.new(c + n * h), bm.verts.new(c - s * w), bm.verts.new(c - n * h * 0.4)]
            t0, t1 = bm.verts.new(c - t * L / 2), bm.verts.new(c + t * L / 2)
            for j in range(4):
                bm.faces.new((t0, ring[(j + 1) % 4], ring[j]))
                bm.faces.new((t1, ring[j], ring[(j + 1) % 4]))
            n_st += 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob, n_st


def tone_setup(mat, layer="Col"):
    """Multiply a vertex colour attribute into the material's base colour (exports as COLOR_0; the app loads GLB materials as-is).
    Call after tinted_fabric(); then call tone_apply(mat) after the final centring."""
    nt = mat.node_tree
    bsdf = next(x for x in nt.nodes if x.type == "BSDF_PRINCIPLED")
    link = next(l for l in nt.links if l.to_socket == bsdf.inputs["Base Color"])
    vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = layer
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type, mx.blend_type = "RGBA", "MULTIPLY"; mx.inputs[0].default_value = 1.0
    nt.links.new(link.from_socket, mx.inputs[6]); nt.links.new(vc.outputs["Color"], mx.inputs[7]); nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])


def tone_apply(mat, layer="Col", amp=(0.115, 0.06, 0.02), freq=(7.0, 19.0, 47.0)):
    """Smooth random light/dark patches from WORLD-space noise on every mesh using `mat` (never repeats, continuous across parts).
    Only meshes dense enough to hold the frequency show it (cushions yes, big flat boxes gradient only)."""
    offs = (Vector((3.1, 1.7, 5.3)), Vector((9.2, 4.4, 1.1)), Vector((2.6, 7.7, 3.9)))
    for ob in bpy.data.objects:
        if ob.type == "MESH" and any(m is mat for m in ob.data.materials):
            ca = ob.data.color_attributes.new(layer, "FLOAT_COLOR", "POINT")
            for v in ob.data.vertices:
                t = 1.0 + sum(a * _noise.noise(v.co * f + o) for a, f, o in zip(amp, freq, offs))
                ca.data[v.index].color = (t, t, t, 1.0)


def metal_material(name, colour_hex="#cfd1d4", roughness=0.22):
    """Plain conductor for legs/hardware: metallic 1, no diffuse, tinted reflection (polished nickel/chrome about 0.15-0.3, brushed 0.35-0.5).
    Untested in the app viewer (sofa 6 is the first user): judge it there; a mirror finish can look black without a varied environment,
    raise roughness if so. The audit will list it as 'missing PBR maps' (plain colour, like the thread)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*lin(colour_hex), 1.0)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = roughness
    return m


# ---- button tufting (universal: sofas, headboards, ottomans, banquettes) ---------------------------------------------------
def tufted_slab(name, sx, sy, sz, r, nx, nz, mat, tile, region, buttons, curve=0.0, seg=8, wear=1.0,
                plump=0.020, divot=0.036, sigma=0.045, fold=0.0035, vary=True):
    """Rounded slab whose -Y face is a padded panel held down by buttons: ONE smooth dome (plump, keep <= 2 cm), a conical tension
    divot at each button (divot = depth, sigma = width) and faint radial pull-folds. Divots only pull INWARD, nothing lobes out.
    region = (tx0, tx1, tz0, tz1) padded area, buttons = [(x, z)] in the slab local frame (x centred, z from 0 to sz).
    vary=True makes every button different (fabric over padding stretches and settles): depth x0.62-1.32 (lower buttons pull
    harder), width x0.82-1.28, an elliptical stretch at a random angle, fold strength/phase, +-7 mm position drift; `wear` scales the
    whole cushion (0.95 fresh, 1.2 the most sat-against). Deterministic per `name`.
    Returns (object, [(x, y, z)] button positions ON the final mesh surface (raycast)). Use `button()` at those positions.
    For an UP-facing tufted top (chaise, ottoman): build the slab as usual, then rotate -90 deg about X (-Y becomes +Z, local z becomes world y)."""
    tx0, tx1, tz0, tz1 = region
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=seg, profile=0.5, affect="EDGES")
    for axis, cuts in ((0, nx), (2, nz), (1, 2)):
        es = []
        for e in bm.edges:
            d = e.verts[0].co - e.verts[1].co
            if e.calc_length() > 0.02 and max(range(3), key=lambda i: abs(d[i])) == axis:
                es.append(e)
        bmesh.ops.subdivide_edges(bm, edges=es, cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        v.co.z += sz / 2
    bm.normal_update()
    fabric_uv(bm, tile)
    rng = random.Random(sum(ord(c) * (i + 3) for i, c in enumerate(name)) + 5)      # NOT hash(): str hash differs per process
    zc = (tz0 + tz1) / 2
    bt = []
    for bx, bz in buttons:
        low = max(0.0, (zc - bz) / max(1e-6, (tz1 - tz0) / 2))
        if vary:
            bt.append((bx + rng.uniform(-0.007, 0.007), bz + rng.uniform(-0.007, 0.007), wear * rng.uniform(0.62, 1.32) * (1.0 + 0.22 * low),
                       rng.uniform(0.82, 1.28), rng.uniform(1.0, 1.55), rng.uniform(0, math.pi), rng.uniform(0.5, 1.5), rng.uniform(0, 6.283)))
        else:
            bt.append((bx, bz, wear, 1.0, 1.0, 0.0, 1.0, 0.0))

    def bulge(x, z):
        edge = min(x - tx0, tx1 - x, z - tz0, tz1 - z)
        if edge <= 0:
            return 0.0
        win = smoothstep(edge / 0.06)
        hx = (tx1 - tx0) / 2; hz = (tz1 - tz0) / 2
        u, w = (x - (tx0 + tx1) / 2) / hx, (z - (tz0 + tz1) / 2) / hz
        v = plump * (1.0 - 0.35 * u * u - 0.25 * w * w)
        for k, (bx, bz, dk, sk, ek, ak, fk, pk) in enumerate(bt):
            dx, dz = x - bx, z - bz
            ex = dx * math.cos(ak) + dz * math.sin(ak)
            ez = -dx * math.sin(ak) + dz * math.cos(ak)
            rr = math.hypot(ex, ez * ek)
            v -= divot * dk * (1 + (rr / (sigma * sk)) ** 2) ** -1.5
            th = math.atan2(dz, dx)
            v += fold * fk * math.cos(7 * th + pk) * math.exp(-(rr / (0.065 * sk)) ** 2) * smoothstep(rr / 0.018)
        return v * win

    for v in bm.verts:
        front = v.co.y < -sy / 2 + 0.006
        v.co.y -= curve * (v.co.x / (sx / 2)) ** 2
        if front:
            v.co.y -= bulge(v.co.x, v.co.z)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    # buttons sit ON the final mesh (raycast), never at the analytic height: an undersampled pit is shallower than the formula,
    # so an analytic position buries the button (four buttons went missing that way on the grey sectional)
    bvh = surface(ob)
    pos = []
    for bx, bz, *_ in bt:
        hit = bvh.ray_cast(Vector((bx, -1.0, bz)), Vector((0, 1, 0)))
        y = hit[0].y if hit[0] is not None else -sy / 2 - curve * (bx / (sx / 2)) ** 2 - bulge(bx, bz)
        pos.append((bx, y - 0.0015, bz))
    return ob, pos


def button(name, x, y, z, mat, tile, rad=0.0125):
    """Covered button: squashed UV sphere (y x 0.5) at a position returned by tufted_slab. Move it with its slab (same place_mesh call)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=rad)
    for v in bm.verts:
        v.co.y *= 0.5
        v.co += Vector((x, y, z))
    bm.normal_update()
    fabric_uv(bm, tile)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def grid_buttons(w, l, cols, rows, margin=0.09):
    """cols x rows button grid over a w x l panel (x centred, z from 0 to l); returns (region, buttons) for tufted_slab."""
    tx = w / 2 - margin
    z0, z1 = margin, l - margin
    bs = [(-tx + (i + 0.5) * (2 * tx / cols), z0 + (j + 0.5) * (z1 - z0) / rows) for i in range(cols) for j in range(rows)]
    return (-tx, tx, z0, z1), bs


# ---- rigid cabinetry helpers (walnut TV console, 2026-09-20) -----------------------------------------------------
def rounded_rect_pts(x0, x1, z0, z1, rl, rr, seg=8):
    """Outline in the XZ plane. rl / rr = corner radius of the left / right pair (0 = sharp, one vertex). Keep seg small (5)
    when the outline will be bevelled later: arc chords shorter than the bevel offset make garbage geometry."""
    pts = []

    def arc(cx, cz, r, a0):
        if r <= 1e-6:
            pts.append((cx, cz))
            return
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))

    arc(x1 - rr, z1 - rr, rr, 0)
    arc(x0 + rl, z1 - rl, rl, 90)
    arc(x0 + rl, z0 + rl, rl, 180)
    arc(x1 - rr, z0 + rr, rr, 270)
    return pts


def prism(name, pts, y0, y1):
    """Extrude an XZ outline between y0 (front) and y1 (back): doors, panels, boolean cutters."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y0, z)) for x, z in pts])
    ret = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]:
        v.co.y = y1
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return new_obj(name, bm)


def weighted_normals(ob):
    """Area-weighted normals: big flat faces stay flat, small bevel/radius faces stay smooth. Without it a large n-gon or
    long thin quad next to a bevel shows diagonal shading streaks (verified on the console doors). Applied at export."""
    m = ob.modifiers.new("wn", "WEIGHTED_NORMAL")
    m.mode, m.weight, m.keep_sharp = "FACE_AREA", 100, True
