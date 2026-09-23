"""Render approved baked GLBs next to their live TS ports, same scene/light/materials.

blender -b --factory-startup -P render-compare.py -- <out_prefix> <matmap> <item> [<item> ...]
  item   = path to a .glb (the approved build) or a .json from dump-port.ts (the port)
  matmap = "port-material=baked-material,..." e.g. "rough-linen=fabric,oak-veneer-01=oak":
           port parts wear the BAKED GLB's own materials, so the comparison is geometry + UV
           scale only (texture sources are identical by construction — see tex/manifest.json).
Writes <out_prefix>_front.png, _side.png, _profile.png. Items are laid out left to right.
"""
import bpy, sys, math, json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
out, matmap, items = argv[0], dict(kv.split("=") for kv in argv[1].split(",")), argv[2:]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
baked_mats = {}


def import_glb(p):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=p)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == "MESH":
            for m in o.data.materials:
                if m:
                    baked_mats.setdefault(m.name.split(".")[0], m)
    return new


def import_port(p):
    data = json.load(open(p))
    objs = []
    for part in data["parts"]:
        pos, nor, uv = part["position"], part["normal"], part["uv"]
        n = len(pos) // 3
        verts = [(pos[i * 3], -pos[i * 3 + 2], pos[i * 3 + 1]) for i in range(n)]  # glTF Y-up -> Blender Z-up
        faces = [(i, i + 1, i + 2) for i in range(0, n, 3)]
        me = bpy.data.meshes.new(part["name"])
        me.from_pydata(verts, [], faces)
        uvl = me.uv_layers.new(name="UVMap")
        for li, loop in enumerate(me.loops):
            v = loop.vertex_index
            uvl.data[li].uv = (uv[v * 2], uv[v * 2 + 1])
        me.normals_split_custom_set_from_vertices([(nor[i * 3], -nor[i * 3 + 2], nor[i * 3 + 1]) for i in range(n)])
        me.shade_smooth()
        # Baked materials that multiply a 'Col' tone attribute (leather, chaise)
        # would read black without one; the port computes tone in its shader.
        ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        for d in ca.data:
            d.color = (1.0, 1.0, 1.0, 1.0)
        ob = bpy.data.objects.new(part["name"], me)
        scene.collection.objects.link(ob)
        ob["port_material"] = part["material"]
        objs.append(ob)
    return objs


groups = []
for p in items:
    groups.append(import_glb(p) if p.endswith(".glb") else import_port(p))
# port parts wear the baked materials
for g in groups:
    for o in g:
        if "port_material" in o.keys():
            o.data.materials.append(baked_mats[matmap[o["port_material"]]])

x, prev = 0.0, 0.0
for g in groups:
    bpy.context.view_layer.update()
    meshes = [o for o in g if o.type == "MESH"]
    xs = [(o.matrix_world @ Vector(c)).x for o in meshes for c in o.bound_box]
    half = (max(xs) - min(xs)) / 2
    x += prev + half + 0.35
    for o in g:
        if o.parent is None:
            o.location.x += x
    prev = half
cx = x / 2

bpy.ops.mesh.primitive_plane_add(size=60, location=(cx, 0, 0))
fm = bpy.data.materials.new("floor"); fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.79, 0.77, 1)
bpy.context.object.data.materials.append(fm)
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.92, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 3.0
so = bpy.data.objects.new("sun", sun); scene.collection.objects.link(so)
so.rotation_euler = (math.radians(50), 0, math.radians(30))

span = x + prev
views = {
    "front": ((cx, -1.9 * span, 0.45 * span), (cx, 0, 0.45)),
    "side": ((cx + 0.6 * span, -1.1 * span, 0.3 * span), (cx, 0, 0.4)),
}
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1800, 700


def shoot(name, loc, tgt, lens=50):
    cam = bpy.data.cameras.new(name); cam.lens = lens
    co = bpy.data.objects.new(name, cam); scene.collection.objects.link(co)
    co.location = loc
    co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.camera = co
    scene.render.filepath = f"{out}_{name}.png"
    bpy.ops.render.render(write_still=True)


for name, (loc, tgt) in views.items():
    shoot(name, loc, tgt)

# Close-up across each neighbouring pair's facing arms — the weave/grain scale check.
centres = [sum((o.matrix_world @ Vector(c)).x for o in g if o.type == "MESH" for c in o.bound_box)
           / (8 * sum(o.type == "MESH" for o in g)) for g in groups]
for i in range(len(groups) - 1):
    m = (centres[i] + centres[i + 1]) / 2
    shoot(f"close{i}", (m, -1.5, 0.95), (m, 0, 0.45), lens=35)

# Profile (the divot/silhouette check): each item alone, seen square from +X.
scene.render.resolution_x, scene.render.resolution_y = 900, 700
for i, g in enumerate(groups):
    for j, other in enumerate(groups):
        for o in other:
            o.hide_render = j != i
    bpy.context.view_layer.update()
    gx = sum((o.matrix_world @ Vector(c)).x for o in g if o.type == "MESH" for c in o.bound_box) / (8 * sum(o.type == "MESH" for o in g))
    shoot(f"profile{i}", (gx + 6.0, 0, 0.5), (gx, 0, 0.45), lens=85)
