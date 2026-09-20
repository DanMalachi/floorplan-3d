"""Walnut / oak TV console r001 - Route C (procedural static Blender), PARAMETRIC in width/depth/height/wood/door count.

Run:  blender -b -P build_console.py -- --width 1.80 --depth 0.42 --height 0.50 --wood walnut|oak --doors 3 --out exports/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): low wrap-around body with large edge radii, flush handle-less doors inside a
slim frame, two slab legs set in from the ends, sequence-matched veneer. Changed: own proportions, frame widths, leg geometry.
Wood = Poly Haven walnut_veneer (CC0, darkened + reddened derivative) or oak_veneer_01 (CC0), see sources.json.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 1.80)
D = opt("--depth", 0.42)
H = opt("--height", 0.50)
WOOD = opt("--wood", "walnut")
NDOOR = opt("--doors", 3)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "walnut-tv-console_r001.glb")))
random.seed(23)
reset_scene()

# ---- construction variables (metres); one shared variable per junction ------------------------------------------
LEG_H = 0.14                    # floor to the underside of the body
BZ0, BZ1 = LEG_H, H             # body underside / top
BH = BZ1 - BZ0
R = 0.045                       # shell edge radius (the "wrap"): top, bottom, ends, all edges
FRAME_TOP, FRAME_BOT, FRAME_END = 0.030, 0.026, 0.060
POCKET_DEPTH = 0.020
POCKET_R = 0.012                # outer corner radius of the door group
GAP = 0.002                     # reveal between doors and to the frame
DOOR_RECESS = 0.0                # door face is exactly flush with the frame face
LEG_T, LEG_INSET, LEG_D = 0.035, 0.24, 0.34   # slab leg thickness, inset from the end, depth
TILE = {"walnut": 1.80, "oak": 1.83}[WOOD]

# ---- materials --------------------------------------------------------------------------------------------------
if WOOD == "walnut":
    src = "walnut_veneer"
    tint = lambda c: c * __import__("numpy").array([0.64, 0.53, 0.52])      # darker, redder: dark chocolate walnut
else:
    src = "oak_veneer_01"
    tint = lambda c: c * 0.95
d0 = load_img("wd0", f"{MAT}/{src}_diff_2k.jpg", "sRGB")
wd = derive_image(d0, f"{WOOD}_console_diff_2k", tint, MAT)
end_d = derive_image(d0, f"{WOOD}_console_end_2k", lambda c: tint(c) * 0.72, MAT)
wr = load_img("wr", f"{MAT}/{src}_rough_2k.jpg", "Non-Color")
wn = load_img("wn", f"{MAT}/{src}_nor_gl_2k.jpg", "Non-Color")
for im, px in ((wd, 2048), (end_d, 512), (wr, 1024), (wn, 1024)):
    im.scale(px, px)
M_WOOD = pbr_material("wood_face", wd, wr, wn, normal_strength=1.0, spec=0.42)
M_END = pbr_material("wood_end", end_d, wr, wn, normal_strength=0.6, spec=0.30)
OU, OV = random.random(), random.random()      # ONE offset for shell + doors: the grain is sequence-matched across them


# ---- shell profile unroll (arc length around the rounded cross-section, keeps grain continuous over the wrap) ------
ZI0, ZI1 = BZ0 + R, BZ1 - R
YI0, YI1 = -D / 2 + R, D / 2 - R
EPS = 1e-5


def unroll(y, z):
    cy, cz = min(max(y, YI0), YI1), min(max(z, ZI0), ZI1)
    dy, dz = y - cy, z - cz
    Lf = ZI1 - ZI0
    q = R * math.pi / 2
    if dy < -EPS and abs(dz) <= EPS:                    # front flat, s = height above the lower tangent line
        return z - ZI0
    if dy < -EPS and dz > EPS:                          # front-top arc
        return Lf + R * math.atan2(dz, -dy)
    if abs(dy) <= EPS and dz > EPS:                     # top flat
        return Lf + q + (y - YI0)
    if dy > EPS and dz > EPS:                           # back-top arc
        return Lf + q + (YI1 - YI0) + R * math.atan2(dy, dz)
    if dy > EPS and abs(dz) <= EPS:                     # back flat
        return Lf + 2 * q + (YI1 - YI0) + (ZI1 - z)
    if dy < -EPS and dz < -EPS:                         # front-bottom arc
        return -R * math.atan2(-dz, -dy)
    if abs(dy) <= EPS and dz < -EPS:                    # bottom flat
        return -q - (y - YI0)
    if dy > EPS and dz < -EPS:                          # back-bottom arc
        return -q - (YI1 - YI0) - R * math.atan2(dy, -dz)
    return z - ZI0


def rounded_rect_pts(x0, x1, z0, z1, rl, rr, seg=8):
    """Outline in the XZ plane, counter-clockwise seen from +Y... corners rounded by rl (left) / rr (right)."""
    pts = []

    def arc(cx, cz, r, a0):
        if r <= 1e-6:
            pts.append((cx, cz))
            return
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))

    arc(x1 - rr, z1 - rr, rr, 0)       # top-right
    arc(x0 + rl, z1 - rl, rl, 90)      # top-left
    arc(x0 + rl, z0 + rl, rl, 180)     # bottom-left
    arc(x1 - rr, z0 + rr, rr, 270)     # bottom-right
    return pts


def prism(name, pts, y0, y1):
    """Extrude an XZ outline between y0 (front) and y1 (back)."""
    bm = bmesh.new()
    f0 = [bm.verts.new((x, y0, z)) for x, z in pts]
    f = bm.faces.new(f0)
    ret = bmesh.ops.extrude_face_region(bm, geom=[f])
    vs = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
    for v in vs:
        v.co.y = y1
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return new_obj(name, bm)


def wood_uv(ob, dv=(0.0, 0.0)):
    """Face-wise UVs: LONG faces unroll around the wrap (V = x along the grain), END faces are planar, V vertical."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        cx = f.calc_center_median().x
        end = abs(cx) > W / 2 - R + 1e-4 and abs(f.normal.x) > 0.5
        for l in f.loops:
            p = l.vert.co
            if end:
                l[uv].uv = (p.y / TILE + OU, p.z / TILE + OV)
            else:
                l[uv].uv = (unroll(p.y, p.z) / TILE + OU + dv[0], p.x / TILE + OV + dv[1])
    bm.to_mesh(ob.data)
    bm.free()


# ---- shell: rounded box, front pocket cut by boolean ------------------------------------------------------------
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts:
    v.co.x *= W; v.co.y *= D; v.co.z *= BH
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=R, segments=8, profile=0.5, affect="EDGES")
for v in bm.verts:
    v.co.z += BZ0 + BH / 2
shell = new_obj("shell", bm)
shell.data.materials.append(M_WOOD)

px0, px1 = -W / 2 + FRAME_END, W / 2 - FRAME_END
pz0, pz1 = BZ0 + FRAME_BOT, BZ1 - FRAME_TOP
cutter = prism("cutter", rounded_rect_pts(px0, px1, pz0, pz1, POCKET_R, POCKET_R), -D / 2 - 0.02, -D / 2 + POCKET_DEPTH)
mod = shell.modifiers.new("pocket", "BOOLEAN")
mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
bpy.context.view_layer.objects.active = shell
bpy.ops.object.modifier_apply(modifier="pocket")
bpy.data.objects.remove(cutter, do_unlink=True)
for p in shell.data.polygons:
    p.use_smooth = True
wood_uv(shell)

# ---- doors: flush panels in the pocket, real reveals; the pocket floor behind closes the cabinet (no light leak) --
dx0, dx1 = px0 + GAP, px1 - GAP
dz0, dz1 = pz0 + GAP, pz1 - GAP
dw = (dx1 - dx0 - GAP * (NDOOR - 1)) / NDOOR
dy0 = -D / 2 + DOOR_RECESS
dy1 = -D / 2 + POCKET_DEPTH - 0.002
for i in range(NDOOR):
    x0 = dx0 + i * (dw + GAP)
    x1 = x0 + dw
    rl = POCKET_R - GAP if i == 0 else 0.0
    rr = POCKET_R - GAP if i == NDOOR - 1 else 0.0
    door = prism(f"door{i}", rounded_rect_pts(x0, x1, dz0, dz1, rl, rr, seg=5), dy0, dy1)
    bpy.context.view_layer.objects.active = door
    bm = bmesh.new()
    bm.from_mesh(door.data)
    front = [e for e in bm.edges if all(abs(v.co.y - dy0) < 1e-6 for v in e.verts)]
    bmesh.ops.bevel(bm, geom=front, offset=0.0008, segments=2, affect="EDGES")
    bm.to_mesh(door.data)
    bm.free()
    door.data.materials.append(M_WOOD)
    for p in door.data.polygons:
        p.use_smooth = True
    wood_uv(door)

# ---- slab legs: contact chain floor -> leg (z 0..LEG_H) -> body underside; grain vertical, end grain on top/bottom ---
for sgn, nm in ((-1, "legL"), (1, "legR")):
    cx = sgn * (W / 2 - LEG_INSET)
    member(nm, cx, 0.0, 0.0, LEG_T, LEG_D, LEG_H + 0.004, 2, M_WOOD, M_END, TILE, bevel=0.003)

# ---- shading: area-weighted normals keep the big flat faces flat while the edge radii stay smooth ------------------
for ob in bpy.data.objects:
    if ob.type == 'MESH' and ob.name.startswith(('shell', 'door')):
        m = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
        m.mode, m.weight, m.keep_sharp = 'FACE_AREA', 100, True
        for p in ob.data.polygons:
            p.use_smooth = True

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
