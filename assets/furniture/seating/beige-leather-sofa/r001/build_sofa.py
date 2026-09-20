"""Beige leather 3-seat sofa, r002 - Route C (procedural static Blender), PARAMETRIC in width/depth/height/colour.

Run:  blender -b -P build_sofa.py -- --width 2.10 --depth 0.92 --height 0.84 --color "#cdb794" --out exports/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): contemporary 3-seater, slim curved arms leaning outward with rolled tops,
split back with a fold line, two seat cushions, splayed tapered wood legs.
Changed: own proportions, stuffed-roll arm, stitched pinch seam, own tileable leather grain (make_leather_maps.py), oak legs.

Physics modelled (v2): a cushion is foam wrapped in a leather cover. The cover is sewn tight across the seam, so the foam
bulges into a pillow on each side and the leather pinches into a narrow V at the stitch line, with wrinkles fanning out from
the seam ends where the hide is gathered. Seat corners gather the same way. Stitches are real thread on the real surface.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "done-furniture-factory", "scripts", "blender"))
from furniture_lib import *
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = os.path.join(HERE, "inputs", "materials")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(n, d):
    return type(d)(argv[argv.index(n) + 1]) if n in argv else d


W = opt("--width", 2.10)
D = opt("--depth", 0.92)
H = opt("--height", 0.84)
COLOR = opt("--color", "#cdb794")
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "beige-leather-sofa_r002.glb")))
random.seed(17)

# ---- derived construction (metres) -------------------------------------------------------------------------------
LEG_H = 0.17
BASE_Z = LEG_H
FZ = 0.30
SEAT_T = 0.17
AT = 0.16
AH = min(0.62, H * 0.74)
FLARE = 0.09
SLOPE = 0.05
TILT = math.radians(9)
FAB_TILE = 0.25                 # leather_grain tile, 2048 px = 0.25 m
OAK_TILE = 1.83
INNER_W = W - 2 * (AT + 0.4 * FLARE)
PANEL_T = 0.09
BACK_T = 0.17
PITCH = 0.0125                  # stitch pitch (stitch 8.5 mm + 4 mm gap)


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def small(img, px):
    img.scale(px, px)
    return img


def oak_material():
    d = load_img("oak_d", os.path.join(MAT, "oak_veneer_01_diff_2k.jpg"), "sRGB"); small(d, 1024)
    r = load_img("oak_r", os.path.join(MAT, "oak_veneer_01_rough_2k.jpg"), "Non-Color"); small(r, 1024)
    n = load_img("oak_n", os.path.join(MAT, "oak_veneer_01_nor_gl_2k.jpg"), "Non-Color"); small(n, 1024)
    return pbr_material("oak", d, r, n, spec=0.4)


def thread_material(colour_hex, dark=0.58):
    """Tone-on-tone polyester thread: a shade darker than the hide, matte, no texture."""
    m = bpy.data.materials.new("thread")
    m.use_nodes = True
    b = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*[c * dark for c in lin(colour_hex)], 1.0)
    b.inputs["Roughness"].default_value = 0.6
    b.inputs["Specular IOR Level"].default_value = 0.3
    return m


def leg(name, x, y, mat, top=0.031, bot=0.019, splay=0.06, sx=1, sy=1):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=bot, radius2=top, depth=1.0)
    for v in bm.verts:
        t = 1.0 if v.co.z > 0 else 0.0
        v.co.z = (v.co.z + 0.5) * (LEG_H + 0.012)
        v.co.x += sx * splay * (1 - t)
        v.co.y += sy * splay * 0.9 * (1 - t)
    for v in bm.verts:
        v.co.x += x
        v.co.y += y
    bm.normal_update()
    fabric_uv(bm, OAK_TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    return ob


def flare(ob, s, amount):
    zs = [v.co.z for v in ob.data.vertices]
    z0, z1 = min(zs), max(zs)
    for v in ob.data.vertices:
        v.co.x += s * amount * (v.co.z - z0) / (z1 - z0)


def slope_arm(ob, drop):
    ys = [v.co.y for v in ob.data.vertices]; zs = [v.co.z for v in ob.data.vertices]
    y0, y1, z0, z1 = min(ys), max(ys), min(zs), max(zs)
    for v in ob.data.vertices:
        v.co.z -= drop * (1 - (v.co.y - y0) / (y1 - y0)) * (v.co.z - z0) / (z1 - z0)


# ---- dense, graded cushion mesh -----------------------------------------------------------------------------------
def frange(a, b, step):
    out, x = [], a
    while x < b:
        out.append(x); x += step
    return out


def graded(lo, hi, centre=None, fine=0.003, mid=0.008, coarse=0.02):
    """Edge-loop positions from lo to hi, dense within 3 cm of `centre`, medium within 8 cm, coarse elsewhere."""
    out, x = [], lo
    while x < hi:
        out.append(x)
        d = abs(x - centre) if centre is not None else 1.0
        x += fine if d < 0.03 else (mid if d < 0.08 else coarse)
    if centre is not None:
        out.append(centre)
    return sorted(set(round(p, 5) for p in out))


def cushion_mesh(sx, sy, sz, r, loops, seg=8):
    """Bevelled block (centre origin in X/Y, base at z=0) cut with clean edge loops at the given positions per axis
    (x, y in the centred frame; z measured from the base)."""
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
    """Rotate + offset the planar UVs of one part at random so identical grain never lines up between parts."""
    th, ox, oy = random.random() * 6.283, random.random(), random.random()
    c, sn = math.cos(th), math.sin(th)
    for l in ob.data.uv_layers.active.data:
        x, y = l.uv
        l.uv = (c * x - sn * y + ox, sn * x + c * y + oy)


def finish(bm, name, mat):
    fabric_uv(bm, FAB_TILE)
    ob = new_obj(name, bm)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    randomise_uv(ob)
    return ob


# ---- split back: two chambers of foam pinched by one stitched seam ------------------------------------------------
def back_cushion(name, sx, sy, sz, r, zseam, mat):
    xs = frange(-sx / 2 + r, sx / 2 - r + 1e-6, 0.013)
    zs = graded(r, sz - r, zseam)
    bm = cushion_mesh(sx, sy, sz, r, {0: xs, 2: zs})
    ob = finish(bm, name, mat)
    me = ob.data
    front = [v.index for v in me.vertices if v.co.y < -sy / 2 + 1e-4]      # flat front face, before any shaping
    puff(ob, 0.010, 0.005, 0)                                             # barely-there crown: the cushion outline stays clean
    x0, x1, z0, z1 = -sx / 2 + r, sx / 2 - r, r, sz - r
    PLUMP, DIV, SG = 0.010, 0.030, 0.019                                  # padding dome height, seam pull depth, seam width
    ph = random.random() * 6.28
    cxm, hxm, hzm, czm = (x0 + x1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, (z0 + z1) / 2

    def bulge(x, z):
        """ONE padded face (only a faint softening dome); the seam is a stitch that pulls the leather INWARD (a divot with a
        sharp V) and does not extrude anything, tapering out at the cushion ends where the hide gathers into wrinkles."""
        edge = min(x - x0, x1 - x, z - z0, z1 - z)
        if edge <= 0:
            return 0.0
        win = smoothstep(edge / 0.06)
        u, w = (x - cxm) / hxm, (z - czm) / hzm
        dome = PLUMP * (1.0 - 0.30 * u * u - 0.22 * w * w)
        dz = z - zseam
        pull = DIV * (1.0 + (dz / SG) ** 2) ** -1.5 * smoothstep((x - x0) / 0.035) * smoothstep((x1 - x) / 0.035)
        val = dome * win - pull                                            # a divot INTO the face; nothing is pushed out
        for ex in (x0 + 0.03, x1 - 0.03):
            dx = x - ex
            rr = math.hypot(dx, dz)
            val += 0.0028 * math.cos(9 * math.atan2(dz, dx) + ph) * math.exp(-(rr / 0.07) ** 2) * smoothstep(rr / 0.015) * smoothstep(edge / 0.025)
        val += 0.0006 * math.cos(2 * math.pi * x / 0.0315) * math.exp(-((z - zseam) / 0.011) ** 2)   # puckers between stitches
        return val

    for i in front:
        v = me.vertices[i]
        v.co.y -= bulge(v.co.x, v.co.z)
    return ob


# ---- seat cushion: pillow top, hide gathered at the corners ------------------------------------------------------
def seat_cushion(name, sx, sy, sz, r, mat):
    xs = frange(-sx / 2 + r, sx / 2 - r + 1e-6, 0.014)
    ys = frange(-sy / 2 + r, sy / 2 - r + 1e-6, 0.014)
    zs = frange(0.02, sz - 0.01, 0.014)
    bm = cushion_mesh(sx, sy, sz, r, {0: xs, 1: ys, 2: zs})
    ob = finish(bm, name, mat)
    me = ob.data
    top = [v.index for v in me.vertices if v.co.z > sz - 1e-4]
    puff(ob, 0.030, 0.018, 0)
    cx0, cx1, cy0, cy1 = -sx / 2 + r, sx / 2 - r, -sy / 2 + r, sy / 2 - r
    corners = [(cx0, cy0), (cx1, cy0), (cx0, cy1), (cx1, cy1)]
    phs = [random.random() * 6.28 for _ in corners]
    for i in top:
        v = me.vertices[i]
        edge = min(v.co.x - cx0, cx1 - v.co.x, v.co.y - cy0, cy1 - v.co.y)
        if edge <= 0:
            continue
        w = smoothstep(edge / 0.03)
        dz = 0.0
        for (px, py), ph in zip(corners, phs):
            rr = math.hypot(v.co.x - px, v.co.y - py)
            dz += 0.0026 * math.cos(8 * math.atan2(v.co.y - py, v.co.x - px) + ph) * math.exp(-(rr / 0.10) ** 2) * smoothstep(rr / 0.018)
        v.co.z += dz * w
    return ob


# ---- stitches: real thread raycast onto the real surface ---------------------------------------------------------
def surface(ob):
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


def stitch_mesh(name, rows, mat, L=0.0085, w=0.0021, h=0.0018):
    """rows: list of [(point, normal)] along a path. One tiny lens per stitch, axis along the path, half sunk in the hide."""
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


def row_along_x(bvh, x0, x1, z, y_from=-1.0):
    row, x = [], x0
    while x <= x1:
        hit = bvh.ray_cast(Vector((x, y_from, z)), Vector((0, 1, 0)))
        if hit[0] is not None:
            row.append((hit[0], hit[1]))
        x += PITCH
    return row


def row_around(bvh, hx, hy, rc, z, out=0.4):
    row = []
    for (x, y, nx, ny) in resample(rr_path(hx, hy, rc), PITCH):
        hit = bvh.ray_cast(Vector((x + nx * out, y + ny * out, z)), Vector((-nx, -ny, 0)))
        if hit[0] is not None:
            row.append((hit[0], hit[1]))
    return row


# ---- build -------------------------------------------------------------------------------------------------------
reset_scene()
fab = tinted_fabric("leather", os.path.join(MAT, "leather_grain_diff_2k.png"), os.path.join(MAT, "leather_grain_rough_2k.png"),
                    os.path.join(MAT, "leather_grain_nor_gl_2k.png"), COLOR, MAT, normal_strength=1.0, spec=0.55)
oak = oak_material()
thread = thread_material(COLOR)

# large-scale tone variation must never repeat, so it is a vertex colour (world-space noise), not part of the tiled map
nt = fab.node_tree
_bsdf = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED')
_link = next(l for l in nt.links if l.to_socket == _bsdf.inputs['Base Color'])
_vc = nt.nodes.new('ShaderNodeVertexColor'); _vc.layer_name = 'Col'
_mx = nt.nodes.new('ShaderNodeMix'); _mx.data_type, _mx.blend_type = 'RGBA', 'MULTIPLY'; _mx.inputs[0].default_value = 1.0
nt.links.new(_link.from_socket, _mx.inputs[6]); nt.links.new(_vc.outputs['Color'], _mx.inputs[7]); nt.links.new(_mx.outputs[2], _bsdf.inputs['Base Color'])

y_front, y_back = -D / 2, D / 2

FX = W / 2 - FLARE
for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
    leg(f"leg{i}", sx * (FX - 0.10), sy * (D / 2 - 0.11), oak, sx=sx, sy=sy)

base = rounded_box("base", INNER_W + 0.06, D - 0.04, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, seg=8)
randomise_uv(base)
place_mesh(base, 0, 0, BASE_Z)

for s, nm in ((-1, "armL"), (1, "armR")):
    arm = rounded_box(nm, AT, D - 0.01, AH - BASE_Z, 0, 0.068, 2, fab, FAB_TILE, seg=8)
    puff(arm, 0.014, 0.006, 0.003)
    randomise_uv(arm)
    place_mesh(arm, 0, 0, BASE_Z)
    slope_arm(arm, SLOPE)
    flare(arm, s, FLARE)
    arm.data.transform(Matrix.Translation((s * (W / 2 - AT / 2 - FLARE), 0, 0)))

pz0 = FZ - 0.02
panel = rounded_box("backpanel", INNER_W + 0.04, PANEL_T, (H - 0.10) - pz0, 0, 0.03, 1, fab, FAB_TILE, seg=8)
randomise_uv(panel)
place_mesh(panel, 0, y_back - PANEL_T / 2 - 0.005, pz0)

n_stitch = 0
cw = (INNER_W - 0.008) / 2
bh = (H - pz0 - 0.030) / math.cos(TILT)
zseam = bh * 0.60
for i, s in enumerate((-1, 1)):
    bw = cw - 0.006
    c = back_cushion(f"back{i}", bw, BACK_T, bh, 0.065, zseam, fab)
    bvh = surface(c)
    rows = [row_along_x(bvh, -bw / 2 + 0.09, bw / 2 - 0.09, zseam + dz) for dz in (-0.0075, 0.0075)]
    st, k = stitch_mesh(f"backstitch{i}", rows, thread)
    n_stitch += k
    bz0 = min(v.co.z for v in c.data.vertices)
    for o in (c, st):
        place_mesh(o, s * (cw / 2 + 0.002), y_back - PANEL_T - BACK_T / 2 - 0.015, pz0, rx=-TILT, bz=bz0)

seat_d = D - 0.30
for i, s in enumerate((-1, 1)):
    sw = cw - 0.004
    c = seat_cushion(f"seat{i}", sw, seat_d, SEAT_T, 0.05, fab)
    bz0 = min(v.co.z for v in c.data.vertices)
    zw = SEAT_T - 0.026
    ps = [piping(f"seatpipe{i}{k}", sw / 2 - 0.003, seat_d / 2 - 0.003, bz0 + z, 0.05, 0.0045, fab, FAB_TILE)
          for k, z in enumerate((0.02, zw))]
    bvh = surface(c)
    rows = [row_around(bvh, sw / 2, seat_d / 2, 0.05, bz0 + zw + dz) for dz in (-0.011, 0.011)]
    st, k = stitch_mesh(f"seatstitch{i}", rows, thread)
    n_stitch += k
    for o in [c, st] + ps:
        place_mesh(o, s * (cw / 2 + 0.001), y_front + seat_d / 2 + 0.02, FZ - 0.02, bz=bz0)
print("STITCHES", n_stitch)

# ---- centre + export ---------------------------------------------------------------------------------------------
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
# ---- tone: smooth random light/dark patches in world space (hide varies in tone; nothing tiles) -------------------
from mathutils import noise as mnoise
for ob in bpy.data.objects:
    if ob.type == 'MESH' and any(m is fab for m in ob.data.materials):
        ca = ob.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        for v in ob.data.vertices:
            p = v.co
            t = 1.0 + 0.115 * mnoise.noise(p * 7.0 + Vector((3.1, 1.7, 5.3))) + 0.06 * mnoise.noise(p * 19.0 + Vector((9.2, 4.4, 1.1)))                 + 0.02 * mnoise.noise(p * 47.0 + Vector((2.6, 7.7, 3.9)))
            ca.data[v.index].color = (t, t, t, 1.0)
print("BOUNDS", [round(hi[k] - lo[k], 3) for k in range(3)])
export_glb(OUT)
