"""Render the fixed review set (and catalog thumbnail) of a FINAL GLB, any furniture, auto-framed.

  blender -b -P render-views.py -- <model.glb> <outdir> [--samples 40] [--thumb <out.png>]
                                   [--views extra_views.json] [--only front,three_quarter] [--and-set]

Always render the exported GLB, never the Blender source (the exporter changes materials, normals, UVs).
Camera distances come from the model's bounding box, so a lamp, a bed and a wardrobe use the same script.
Space after glTF import: Z up, glTF +Z (front) == Blender -Y.

extra_views.json: [{"name": "close_hinge", "loc": [x,y,z], "target": [x,y,z], "lens": 50}, ...]
  (metres, Blender space; use it for the construction/joint close-up the review gate requires).
"""
import bpy, sys, os, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb, outdir = os.path.abspath(argv[0]), os.path.abspath(argv[1])   # ABSOLUTE: relative paths resolve to C:\ under -b


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


samples = int(opt("--samples", os.environ.get("SAMPLES", 40)))
thumb = opt("--thumb")
only = set(opt("--only", "").split(",")) - {""}
extra = json.load(open(opt("--views"))) if opt("--views") else []
os.makedirs(outdir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.view_settings.view_transform = "AgX"

# bounding box of everything imported
pts = []
for ob in sc.objects:
    if ob.type == "MESH":
        pts += [ob.matrix_world @ Vector(c) for c in ob.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
ctr, size = (lo + hi) / 2, hi - lo
diag = size.length
print("BOUNDS", tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))

# neutral studio: soft world + key/fill area lights + floor (shadow catcher in thumb mode)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.80, 0.82, 0.85, 1); bg.inputs["Strength"].default_value = 0.9
bpy.ops.mesh.primitive_plane_add(size=diag * 6, location=(ctr.x, ctr.y, lo.z))
fl = bpy.context.active_object
fm = bpy.data.materials.new("floor"); fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.62, 0.62, 0.60, 1)
fm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
fl.data.materials.append(fm)
for loc, energy, sz, rot in (
    ((-0.9, -1.1, 1.3), 80, 1.4, (50, 0, -40)),
    ((1.3, 0.8, 0.9), 30, 1.6, (60, 0, 120)),
):
    bpy.ops.object.light_add(type="AREA", location=ctr + Vector(loc) * diag)
    L = bpy.context.active_object
    L.data.energy = energy * diag ** 2
    L.data.size = sz * diag
    L.rotation_euler = tuple(math.radians(a) for a in rot)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
bpy.context.collection.objects.link(cam); sc.camera = cam


def shot(name, direction, dist=2.3, lens=55, target=None, res=(1100, 850), path=None, loc=None):
    cam.data.lens = lens
    tgt = Vector(target) if target is not None else ctr
    cam.location = Vector(loc) if loc is not None else tgt + Vector(direction).normalized() * diag * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = path or os.path.join(outdir, name + ".png")
    bpy.ops.render.render(write_still=True)


if thumb:
    sc.render.film_transparent = True
    fl.is_shadow_catcher = True
    shot("thumb", (-0.62, -0.72, 0.42), dist=2.0, lens=60, res=(512, 512), path=os.path.abspath(thumb))
    print("THUMB", thumb)
    if "--and-set" not in argv:          # default: thumbnail only. Pass --and-set to also render the review set in the same run.
        sys.exit(0)
    sc.render.film_transparent = False
    fl.is_shadow_catcher = False

front_mid = Vector((ctr.x, lo.y, ctr.z))
views = [
    ("front", dict(direction=(0, -1, 0.12))),
    ("three_quarter", dict(direction=(-0.62, -0.72, 0.42), dist=2.0)),
    ("side", dict(direction=(1, 0, 0.12))),
    ("back", dict(direction=(0, 1, 0.15))),
    ("top", dict(direction=(0, -0.05, 1), lens=45)),
    ("underside_contact", dict(loc=(lo.x - 0.5 * diag, lo.y - 0.5 * diag, lo.z + 0.05 * size.z + 0.02),
                               target=(ctr.x, ctr.y, lo.z + 0.1 * size.z), lens=35)),
    # generic close-ups: grazing material on the front face, and the front-left-top corner (edge treatment)
    ("close_material_grazing", dict(loc=(lo.x + 0.3 * size.x, lo.y - 0.45 * diag, lo.z + 0.5 * size.z),
                                    target=(lo.x + 0.3 * size.x, lo.y, lo.z + 0.45 * size.z), lens=50)),
    ("close_corner", dict(loc=(lo.x - 0.25 * diag, lo.y - 0.3 * diag, hi.z * 0.9),
                          target=(lo.x + 0.05 * size.x, lo.y + 0.05 * size.y, hi.z * 0.85), lens=50)),
]
for e in extra:
    views.append((e["name"], dict(loc=e["loc"], target=e["target"], lens=e.get("lens", 50))))
for name, kw in views:
    if only and name not in only:
        continue
    shot(name, kw.pop("direction", (0, -1, 0)), **kw)
print("RENDERED", outdir)
