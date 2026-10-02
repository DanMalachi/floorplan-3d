"""White lacquer chrome-frame nightstand r001 - Route C (procedural Blender).

Run:  blender -b -P build_nightstand.py -- --out C:/abs/path/x.glb
Blender axes: X width, Y depth (-Y = front), Z up. glTF export makes front +Z, origin centred X/Y, base at 0.
Design vocabulary borrowed (inspiration only): glossy white two-drawer box on an open chrome square-tube base, chrome pull at the drawer split.
Changed: own proportions; the pull is a pair of wide, low chrome plates (one per drawer, meeting at the split with a finger slot) instead of a
tall square plate; the base is a closed top ring + four legs + a low perimeter stretcher ring (no mid posts); top panel overhangs the
sides by 6 mm; softly radiused case edges. All materials plain colour (lacquer, chrome): no texture maps.
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
H = opt("--height", 0.58)
LAC_R = opt("--lac-rough", 0.20)
CH_METAL = opt("--chrome-metal", 0.88)
CH_ROUGH = opt("--chrome-rough", 0.24)
OUT = os.path.abspath(opt("--out", os.path.join(HERE, "exports", "white-lacquer-chrome-nightstand_r001.glb")))
random.seed(91)
reset_scene()

# ---- construction variables (metres); one shared variable per junction -------------------------------------------
FRAME_H = 0.150                  # floor to underside of the case
TUBE = 0.016                     # square chrome tube section
INSET = 0.012                    # base frame inset from the case outline
STRETCH_Z = 0.045                # low perimeter ring, centre height
OV = 0.006                       # top panel overhang over the sides (front flush)
PT = 0.018                       # case panel thickness
CW, CD = W - 2 * OV, D           # case body (sides/bottom) outline
CZ0, CZ1 = FRAME_H, H            # case bottom / top
GAP = 0.003                      # drawer reveals
FRONT_T = 0.018
PLATE_W, PLATE_H, PLATE_T, PLATE_STAND = 0.120, 0.032, 0.004, 0.010
SLOT = 0.005                     # finger slot between the two plates (straddles the drawer split)
TILE = 1.0


# ---- materials: plain colour lacquer (7j.2) + chrome on the app's steel values (7k.2) -----------------------------
def lacquer(name, hexcol):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(x for x in m.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*lin(hexcol), 1.0)
    b.inputs["Roughness"].default_value = LAC_R
    b.inputs["Specular IOR Level"].default_value = 0.5
    b.inputs["Coat Weight"].default_value = 0.5            # exports as KHR_materials_clearcoat: lacquer sheen
    b.inputs["Coat Roughness"].default_value = 0.08
    return m


M_LAC = lacquer("lacquer", "#eceae6")
M_CHROME = metal_material("chrome", "#c6c8ca", CH_ROUGH)
M_CHROME.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = CH_METAL
M_PULL = metal_material("chrome_pull", "#d0d1d3", 0.26)
M_PULL.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.62
M_SLOT = bpy.data.materials.new("slot_shadow")
M_SLOT.use_nodes = True
_b = next(x for x in M_SLOT.node_tree.nodes if x.type == "BSDF_PRINCIPLED")
_b.inputs["Base Color"].default_value = (*lin("#3a3a3a"), 1.0)
_b.inputs["Roughness"].default_value = 0.8


def box(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.0015):
    ob = member(name, (x0 + x1) / 2, (y0 + y1) / 2, z0, x1 - x0, y1 - y0, z1 - z0, 0, mat, mat, TILE, bevel=bevel)
    return ob


# ---- case: top overhangs the sides, sides/bottom/back as panels, drawers inset flush with the front edges --------
yf = -CD / 2
box("top", -W / 2, W / 2, yf, CD / 2, CZ1 - PT, CZ1, M_LAC, bevel=0.0025)
for s in (-1, 1):
    x_out = s * CW / 2
    box(f"side{s}", min(x_out, x_out - s * PT), max(x_out, x_out - s * PT), yf, CD / 2, CZ0, CZ1 - PT + 0.002, M_LAC, bevel=0.0022)
box("bottom", -CW / 2 + PT - 0.002, CW / 2 - PT + 0.002, yf, CD / 2, CZ0, CZ0 + PT, M_LAC, bevel=0.0018)
box("back", -CW / 2 + PT - 0.002, CW / 2 - PT + 0.002, CD / 2 - 0.010, CD / 2, CZ0 + PT - 0.002, CZ1 - PT + 0.002, M_LAC, bevel=0.0008)
# closed drawers need no interior: one fill block behind the fronts, no light leak through the reveals
ox0, ox1 = -CW / 2 + PT, CW / 2 - PT
oz0, oz1 = CZ0 + PT, CZ1 - PT
box("fill", ox0, ox1, yf + FRONT_T, CD / 2 - 0.010, oz0, oz1, M_LAC, bevel=0.0)

dh = (oz1 - oz0 - 3 * GAP) / 2
split = oz0 + GAP + dh + GAP / 2                     # centre of the reveal between the drawers
for i in range(2):
    z0 = oz0 + GAP + i * (dh + GAP)
    box(f"front{i}", ox0 + GAP, ox1 - GAP, yf, yf + FRONT_T, z0, z0 + dh, M_LAC, bevel=0.0015)

# ---- pull: two wide chrome plates on short standoffs, meeting at the split with a finger slot -----------------------
for i, (pz0, pz1) in enumerate(((split - SLOT / 2 - PLATE_H, split - SLOT / 2), (split + SLOT / 2, split + SLOT / 2 + PLATE_H))):
    yp = yf - PLATE_STAND
    box(f"plate{i}", -PLATE_W / 2, PLATE_W / 2, yp - PLATE_T, yp, pz0, pz1, M_PULL, bevel=0.0012)
    # standoff block behind each plate (hidden mostly; closes the view under the plate)
    box(f"stand{i}", -PLATE_W / 2 + 0.012, PLATE_W / 2 - 0.012, yp - 0.0005, yf + 0.0005,
        pz0 + (0.006 if i == 1 else 0.002), pz1 - (0.002 if i == 1 else 0.006), M_PULL, bevel=0.0006)

# ---- base: closed chrome square tubes - top ring under the case, four legs, low perimeter ring ---------------------
fx0, fx1 = -CW / 2 + INSET, CW / 2 - INSET
fy0, fy1 = yf + INSET, CD / 2 - INSET
t = TUBE
bm = bmesh.new()


def bar(x0, x1, y0, y1, z0, z1):
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
                          @ Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1.0)))


for (x, y) in ((fx0, fy0), (fx1, fy0), (fx0, fy1), (fx1, fy1)):  # legs: floor to the case underside
    bar(x - (0 if x == fx0 else t), x + (t if x == fx0 else 0), y - (0 if y == fy0 else t), y + (t if y == fy0 else 0), 0.0, FRAME_H)
for zc in (FRAME_H - t / 2, STRETCH_Z):                         # top ring + low perimeter ring, between the legs
    bar(fx0 + t, fx1 - t, fy0, fy0 + t, zc - t / 2, zc + t / 2)
    bar(fx0 + t, fx1 - t, fy1 - t, fy1, zc - t / 2, zc + t / 2)
    bar(fx0, fx0 + t, fy0 + t, fy1 - t, zc - t / 2, zc + t / 2)
    bar(fx1 - t, fx1, fy0 + t, fy1 - t, zc - t / 2, zc + t / 2)
bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.0018, segments=2, affect="EDGES", clamp_overlap=True)
bm.normal_update()
fabric_uv(bm, TILE)
frame = new_obj("frame", bm)
frame.data.materials.append(M_CHROME)

# ---- shading + centre + export -----------------------------------------------------------------------------------
for ob in bpy.data.objects:
    if ob.type == "MESH":
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
bpy.ops.object.select_all(action="SELECT")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_image_format="JPEG",
                          export_jpeg_quality=85, export_texcoords=True, export_normals=True, export_materials="EXPORT")
print("EXPORTED", OUT)
