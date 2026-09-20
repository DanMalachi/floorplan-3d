"""Walnut TV console with smoked-glass doors r001 - Route C (procedural static Blender), parametric in width/depth/height.

Run:  blender -b -P build_console.py -- --width 2.0 --depth 0.42 --height 0.52 --out exports/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): low walnut case with bullnose ends and a slightly overhanging top, two dark
smoked-glass bays in slim walnut frames, an open cubby above one handle-less drawer in the centre, four splayed round tapered
legs. Changed: own proportions, frame widths, leg geometry. Wood = Poly Haven walnut_veneer (CC0, tinted derivative).
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
D = opt("--depth", 0.42)
H = opt("--height", 0.52)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "walnut-glass-tv-console_r001.glb")))
random.seed(47)
reset_scene()

# ---- construction variables (metres); one shared variable per junction ------------------------------------------
LEG_H = 0.16                    # floor to the underside of the body
TOP_T = 0.028                   # top slab thickness
OVER = 0.010                    # top overhang on every side
BZ0 = LEG_H
BZ1 = H - TOP_T                 # body top = underside of the slab
WB, DB = W - 2 * OVER, D - 2 * OVER       # body plan size
RP = 0.050                      # bullnose radius of the body's four vertical plan corners
POCKET = 0.030                  # front pocket depth of the glass bays and the drawer
GAP = 0.003                     # reveal between drawer / doors and the frame
FW = 0.022                      # glass door frame width
MESH_SET = 0.007                # mesh recessed behind the frame face
DIV = 0.035                     # divider between the bays and the centre column
RAIL_B = 0.032                  # bottom rail under the pockets
TILE = 1.80

# ---- materials --------------------------------------------------------------------------------------------------
def tint(c):
    g = c.mean(axis=1, keepdims=True)
    return (g + (c - g) * 0.50) * __import__("numpy").array([1.16, 1.04, 0.95])
d0 = load_img("wd0", f"{MAT}/walnut_veneer_diff_2k.jpg", "sRGB")
wd = derive_image(d0, "walnut_glass_console_diff_2k", tint, MAT)
wr = load_img("wr", f"{MAT}/walnut_veneer_rough_2k.jpg", "Non-Color")
wn = load_img("wn", f"{MAT}/walnut_veneer_nor_gl_2k.jpg", "Non-Color")
for im, px in ((wd, 2048), (wr, 1024), (wn, 1024)):
    im.scale(px, px)
M_WOOD = pbr_material("walnut", wd, wr, wn, normal_strength=1.0, spec=0.42)


def plain(name, hexc, rough, alpha=1.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*lin(hexc), 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m


M_MESH = metal_material("black_mesh", "#3a3b3d", 0.50)
next(x for x in M_MESH.node_tree.nodes if x.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.55
M_INSIDE = plain("dark_interior", "#2b2c2e", 0.85)
OU, OV = random.random(), random.random()      # ONE offset for every walnut part: the grain is sequence-matched across them


def wood_uv(ob):
    """Planar UVs by dominant normal, V = x along the grain. Front faces (doors, drawer, frame) all use (z, x) so the figure
    runs on across the reveals; the bullnose arcs and end faces use (y, z)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        for l in f.loops:
            p = l.vert.co
            if abs(n.x) > 0.7:
                a, b = p.y, p.z
            elif abs(n.z) > 0.7:
                a, b = p.y, p.x
            else:
                a, b = p.z, p.x
            l[uv].uv = (a / TILE + OU, b / TILE + OV)
    bm.to_mesh(ob.data)
    bm.free()


def plan_solid(name, w, d, r, z0, z1, bev_top, bev_bot):
    """A slab with a rounded-rectangle plan (bullnose vertical corners), small softened top and bottom edges."""
    pts = rounded_rect_pts(-w / 2, w / 2, -d / 2, d / 2, r, r, seg=8)
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, z0)) for x, y in pts])
    ret = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]:
        v.co.z = z1
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for z, off in ((z1, bev_top), (z0, bev_bot)):
        if off <= 0:
            continue
        es = [e for e in bm.edges if all(abs(v.co.z - z) < 1e-6 for v in e.verts)]
        bmesh.ops.bevel(bm, geom=es, offset=off, segments=2, affect="EDGES")
    return new_obj(name, bm)


def cut(ob, x0, x1, z0, z1, depth, r=0.0):
    cutter = prism("cutter", rounded_rect_pts(x0, x1, z0, z1, r, r, seg=5), -DB / 2 - 0.02, -DB / 2 + depth)
    m = ob.modifiers.new("cut", "BOOLEAN")
    m.operation, m.solver, m.object = "DIFFERENCE", "EXACT", cutter
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter, do_unlink=True)


def box(name, x0, x1, z0, z1, y0, y1, mat):
    ob = prism(name, rounded_rect_pts(x0, x1, z0, z1, 0.0, 0.0), y0, y1)
    ob.data.materials.append(mat)
    return ob


def mesh_panel(name, x0, x1, z0, z1, y0, pitch=0.009, wire=0.0018):
    """Black woven wire mesh as REAL geometry: vertical wires in front, horizontal wires just behind, one mesh, hard-edged bars.
    Nothing is alpha-tested, so it cannot moire-flicker the way a transparent grid texture does."""
    bm = bmesh.new()
    nx, nz = int((x1 - x0) / pitch), int((z1 - z0) / pitch)
    ox, oz = (x0 + x1) / 2 - (nx - 1) * pitch / 2, (z0 + z1) / 2 - (nz - 1) * pitch / 2
    for i in range(nx):
        m = Matrix.Translation((ox + i * pitch, y0 + wire / 2, (z0 + z1) / 2)) @ Matrix.Diagonal((wire, wire, z1 - z0, 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    for j in range(nz):
        m = Matrix.Translation(((x0 + x1) / 2, y0 + wire * 1.5, oz + j * pitch)) @ Matrix.Diagonal((x1 - x0, wire, wire, 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    ob = new_obj(name, bm)
    ob.data.materials.append(M_MESH)
    return ob


# ---- layout along X: end frame | glass bay | divider | centre column | divider | glass bay | end frame ----------------
PX0 = -WB / 2 + RP + 0.030
PX1 = -PX0
BAY = 0.60
CEN = (PX1 - PX0) - 2 * BAY - 2 * DIV
bayL = (PX0, PX0 + BAY)
cenX = (bayL[1] + DIV, bayL[1] + DIV + CEN)
bayR = (cenX[1] + DIV, PX1)
PZ0, PZ1 = BZ0 + RAIL_B, BZ1 - 0.020
CUBBY_H = 0.105
DRAWER_TOP = PZ1 - CUBBY_H - 0.036          # 36 mm shelf between the cubby floor and the drawer front

# ---- body + top ---------------------------------------------------------------------------------------------------
body = plan_solid("body", WB, DB, RP, BZ0, BZ1 + 0.002, 0.0, 0.005)      # 2 mm into the slab: no coplanar seam
body.data.materials.append(M_WOOD)
for x0, x1 in (bayL, bayR):
    cut(body, x0, x1, PZ0, PZ1, POCKET)
cut(body, cenX[0], cenX[1], PZ1 - CUBBY_H, PZ1, 0.300, 0.004)         # open cubby: a real cavity, walnut inside
cut(body, cenX[0], cenX[1], PZ0, DRAWER_TOP, POCKET)                   # drawer pocket, floor closes it
wood_uv(body)
top = plan_solid("top", W, D, RP + OVER, BZ1, H, 0.005, 0.002)
top.data.materials.append(M_WOOD)
wood_uv(top)

# ---- drawer front: coplanar with the body front, 2 mm reveal ---------------------------------------------------------
FY = -DB / 2
dr = box("drawer", cenX[0] + GAP, cenX[1] - GAP, PZ0 + GAP, DRAWER_TOP - GAP, FY, FY + POCKET - 0.002, M_WOOD)
wood_uv(dr)

# ---- mesh bays: slim walnut frame (four strips, coplanar), black wire mesh set back, dark interior behind -------------------
for tag, (x0, x1) in (("L", bayL), ("R", bayR)):
    a0, a1 = x0 + GAP, x1 - GAP
    z0, z1 = PZ0 + GAP, PZ1 - GAP
    fy1 = FY + POCKET - 0.002
    for nm, (bx0, bx1, bz0, bz1) in (
        ("stile_a", (a0, a0 + FW, z0, z1)), ("stile_b", (a1 - FW, a1, z0, z1)),
        ("rail_lo", (a0 + FW, a1 - FW, z0, z0 + FW)), ("rail_hi", (a0 + FW, a1 - FW, z1 - FW, z1)),
    ):
        wood_uv(box(f"{tag}_{nm}", bx0, bx1, bz0, bz1, FY, fy1, M_WOOD))
    ix0, ix1, iz0, iz1 = a0 + FW, a1 - FW, z0 + FW, z1 - FW
    mesh_panel(f"{tag}_mesh", ix0 - 0.004, ix1 + 0.004, iz0 - 0.004, iz1 + 0.004, FY + MESH_SET)   # ends tuck behind the frame
    box(f"{tag}_inside", ix0, ix1, iz0, iz1, FY + 0.016, FY + 0.026, M_INSIDE)


# ---- legs: four round tapered, splayed outward, grain along the axis ------------------------------------------------------
def tapered_leg(name, top_c, foot_c, r0, r1, seg=24):
    T, F = Vector(top_c), Vector(foot_c)
    ax = (F - T)
    L = ax.length
    a = ax.normalized()
    ref = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
    e1 = a.cross(ref).normalized()
    e2 = a.cross(e1)

    def ring(c, r, zplane):
        out = []
        for i in range(seg):
            th = 2 * math.pi * i / seg
            p = c + (e1 * math.cos(th) + e2 * math.sin(th)) * r
            out.append(p + a * ((zplane - p.z) / a.z))          # slice flat: flush under the body, flat on the floor
        return out

    rt, rf = ring(T, r0, T.z), ring(F, r1, F.z)
    bm = bmesh.new()
    vt = [bm.verts.new(p) for p in rt]
    vf = [bm.verts.new(p) for p in rf]
    uv = bm.loops.layers.uv.verify()
    circ = 2 * math.pi * (r0 + r1) / 2
    ou, ov = random.random(), random.random()
    for i in range(seg):
        j = (i + 1) % seg
        f = bm.faces.new((vt[i], vt[j], vf[j], vf[i]))
        us = (i, i + 1, i + 1, i)
        vs = (0.0, 0.0, L, L)
        for l, ui, vv in zip(f.loops, us, vs):
            l[uv].uv = (ui / seg * circ / TILE + ou, vv / TILE + ov)
    for ringp, flip in ((rt, True), (rf, False)):
        pts = ringp[::-1] if flip else ringp
        f = bm.faces.new([bm.verts.new(p) for p in pts])
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / TILE + ou, l.vert.co.y / TILE + ov)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    ob = new_obj(name, bm)
    ob.data.materials.append(M_WOOD)
    return ob


LX, LY = W / 2 - 0.14, DB / 2 - 0.09
SPX, SPY = 0.060, 0.038
for sx in (-1, 1):
    for sy in (-1, 1):
        tapered_leg(f"leg_{sx}_{sy}", (sx * LX, sy * LY, BZ0 + 0.004), (sx * (LX + SPX), sy * (LY + SPY), 0.0), 0.021, 0.012)

# ---- shading ----------------------------------------------------------------------------------------------------
for ob in bpy.data.objects:
    if ob.type == 'MESH' and ob.name in ("body", "top", "drawer"):
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
