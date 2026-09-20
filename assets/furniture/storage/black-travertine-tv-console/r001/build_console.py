"""Black-frame travertine TV console r001 - Route C (procedural static Blender), parametric in width/depth/height.

Run:  blender -b -P build_console.py -- --width 2.0 --depth 0.40 --height 0.50 --out exports/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): low black frame with square edges, three flush stone panels with dark reveals,
splayed thin blade legs in pairs at each end, push-to-open (no hardware). Changed: own proportions, frame widths, leg geometry.
Stone = ambientCG Travertine009 (CC0, warm-taupe derivative), see sources.json.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 2.0)
D = opt("--depth", 0.40)
H = opt("--height", 0.50)
NPANEL = opt("--panels", 3)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "black-travertine-tv-console_r001.glb")))
random.seed(31)
reset_scene()

# ---- construction variables (metres); one shared variable per junction ------------------------------------------
LEG_H = 0.20                    # floor to the underside of the body
BZ0, BZ1 = LEG_H, H
BH = BZ1 - BZ0
FRAME_TOP, FRAME_BOT, FRAME_END = 0.030, 0.030, 0.030
POCKET_DEPTH = 0.022
GAP = 0.004                     # dark reveal between panels and to the frame
EDGE = 0.0022                   # frame edge bevel: square, not rounded
TILE = 1.60                     # physical size of one stone tile, metres

# ---- materials --------------------------------------------------------------------------------------------------
def tint(c):
    """Desaturate toward grey, then a slight warm-pink multiply: the raw set is cream-yellow, the reference is taupe."""
    g = c.mean(axis=1, keepdims=True)
    return (g + (c - g) * 0.45) * __import__("numpy").array([1.16, 1.09, 1.06])
d0 = load_img("sd0", f"{MAT}/travertine009_diff_2k.jpg", "sRGB")
sd = derive_image(d0, "travertine_console_diff_2k", tint, MAT)
sr = load_img("sr", f"{MAT}/travertine009_rough_2k.jpg", "Non-Color")
sn = load_img("sn", f"{MAT}/travertine009_nor_gl_2k.jpg", "Non-Color")
for im, px in ((sd, 2048), (sr, 1024), (sn, 1024)):
    im.scale(px, px)
M_STONE = pbr_material("travertine", sd, sr, sn, normal_strength=0.9, spec=0.45)

# Powder-coat black: matte charcoal (not pure black), high roughness, low specular, so it reads as a sprayed finish and not a sealed glossy box.
PC_TILE = 0.25
M_FRAME = bpy.data.materials.new("black_frame")
M_FRAME.use_nodes = True
b = next(x for x in M_FRAME.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
b.inputs["Base Color"].default_value = (*lin("#2e2f32"), 1.0)
b.inputs["Metallic"].default_value = 0.0
b.inputs["Roughness"].default_value = 0.84
b.inputs["Specular IOR Level"].default_value = 0.22

M_BLADE = metal_material("blade_steel", "#5a5c60", 0.52)
next(x for x in M_BLADE.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.65

OU, OV = random.random(), random.random()      # ONE offset for all panels: the veining runs on across the reveals


def flat_uv(ob):
    """Panels: planar (x, z) UVs, u along the length so the horizontal veining is continuous across the three panels.
    Front face = stone (slot 0), everything else = black frame paint (slot 1), the edges show only as the reveal."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.material_index = 0 if f.normal.y < -0.9 else 1
        for l in f.loops:
            p = l.vert.co
            l[uv].uv = (p.x / TILE + OU, p.z / TILE + OV) if f.material_index == 0 else (p.x / PC_TILE, p.z / PC_TILE)
    bm.to_mesh(ob.data)
    bm.free()


# ---- frame: one solid box with square edges, front pocket cut by boolean (pocket floor closes the cabinet) ---------
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts:
    v.co.x *= W; v.co.y *= D; v.co.z *= BH
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=EDGE, segments=2, profile=0.5, affect="EDGES")
for v in bm.verts:
    v.co.z += BZ0 + BH / 2
frame = new_obj("frame", bm)
frame.data.materials.append(M_FRAME)

px0, px1 = -W / 2 + FRAME_END, W / 2 - FRAME_END
pz0, pz1 = BZ0 + FRAME_BOT, BZ1 - FRAME_TOP
cutter = prism("cutter", rounded_rect_pts(px0, px1, pz0, pz1, 0.0, 0.0), -D / 2 - 0.02, -D / 2 + POCKET_DEPTH)
mod = frame.modifiers.new("pocket", "BOOLEAN")
mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
bpy.context.view_layer.objects.active = frame
bpy.ops.object.modifier_apply(modifier="pocket")
bpy.data.objects.remove(cutter, do_unlink=True)


def planar_uv(ob, tile):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        ax = max(range(3), key=lambda i: abs(f.normal[i]))
        a, b2 = [i for i in range(3) if i != ax]
        for l in f.loops:
            l[uv].uv = (l.vert.co[a] / tile, l.vert.co[b2] / tile)
    bm.to_mesh(ob.data)
    bm.free()


# ---- stone panels: coplanar with the frame face, a 4 mm dark reveal is the only feature ---------------------------
dx0, dx1 = px0 + GAP, px1 - GAP
dz0, dz1 = pz0 + GAP, pz1 - GAP
dw = (dx1 - dx0 - GAP * (NPANEL - 1)) / NPANEL
dy0 = -D / 2
dy1 = -D / 2 + POCKET_DEPTH - 0.002
for i in range(NPANEL):
    x0 = dx0 + i * (dw + GAP)
    panel = prism(f"panel{i}", rounded_rect_pts(x0, x0 + dw, dz0, dz1, 0.0, 0.0), dy0, dy1)
    panel.data.materials.append(M_STONE)
    panel.data.materials.append(M_FRAME)
    flat_uv(panel)


# ---- blade legs: thin tapered flat steel, a splayed pair at each end (one kicks to the front, one to the back) ------
def blade(name, top, foot, w0=0.046, t0=0.011, w1=0.022, t1=0.008):
    T, F = Vector(top), Vector(foot)
    d = F - T
    wide = Vector((-d.y, d.x, 0)).normalized()
    thick = d.cross(wide).normalized()

    def ring(c, w, t):
        return [c + wide * sw * w / 2 + thick * st * t / 2 for sw, st in ((-1, -1), (1, -1), (1, 1), (-1, 1))]

    a, bb = ring(T, w0, t0), ring(F, w1, t1)
    for p in bb:
        p.z = F.z                                             # foot is flat on the floor
    bm = bmesh.new()
    for quad in ((a[0], a[1], a[2], a[3]), (bb[3], bb[2], bb[1], bb[0]),
                 (a[0], bb[0], bb[1], a[1]), (a[1], bb[1], bb[2], a[2]), (a[2], bb[2], bb[3], a[3]), (a[3], bb[3], bb[0], a[0])):
        bm.faces.new([bm.verts.new(p) for p in quad])          # own verts per face: hard edges survive smooth export
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    ob = new_obj(name, bm)
    ob.data.materials.append(M_BLADE)
    return ob


LEG_X, LEG_Y = W / 2 - 0.16, 0.06          # where the pair meets the body underside
SPLAY_X, SPLAY_Y = 0.14, 0.10              # how far each foot lands outward (length) and away (depth)
for sx in (-1, 1):
    for sy in (-1, 1):
        blade(f"leg_{sx}_{sy}",
              (sx * LEG_X, sy * LEG_Y, BZ0 + 0.004),
              (sx * (LEG_X + SPLAY_X), sy * (LEG_Y + SPLAY_Y), 0.0))

# ---- shading ----------------------------------------------------------------------------------------------------
for ob in bpy.data.objects:
    if ob.type == 'MESH' and ob.name.startswith(('frame', 'panel')):
        weighted_normals(ob)

# ---- centre + export --------------------------------------------------------------------------------------------
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
export_glb(OUT)
