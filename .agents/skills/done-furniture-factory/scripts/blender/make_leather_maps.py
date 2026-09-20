"""Self-authored tileable leather grain (diffuse-grey, roughness, normal), 2048 px = 0.25 m. CC0 (own work, no third-party input).

Run:  blender -b -P make_leather_maps.py -- --out <candidate>/inputs/materials   (default: ./inputs/materials next to this script)
Produces leather_grain_{diff,rough,nor_gl}_2k.png (10 s). Tile = 0.25 m. Load with tinted_fabric(..., normal_strength=1.0, spec=0.55).
MEASURED WHY: the Poly Haven leather samples are smooth satin (leather_white: mean roughness 0.615, normal std 0.024) and
render as clay; this grain has mean roughness 0.47 and normal std 0.075. Keep it STATIONARY: no low-frequency patches in a
tiled map (they repeat as a checkerboard); large-scale tone comes from tone_setup/tone_apply vertex colours.
Structure of real leather: a pebble grain of ~2.5 mm cells separated by fine crevices (Worley F2-F1), a fainter 1.5 cm
crease network on top, and a slow patchy roughness/tone variation from finishing. Crevices are rougher and slightly darker,
cell tops are smoother (they polish with use), so highlights break up instead of reading as one flat plastic surface.
"""
import bpy, os, math
import numpy as np

import sys
_a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(_a[_a.index("--out") + 1]) if "--out" in _a else os.path.join(os.path.dirname(os.path.abspath(__file__)), "inputs", "materials")
os.makedirs(OUT, exist_ok=True)
N = 2048
TILE_M = 0.25
rng = np.random.default_rng(7)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def periodic_noise(u, v, ks, amp_seed):
    """Sum of integer-frequency sines: tileable, band-limited, cheap."""
    r = np.random.default_rng(amp_seed)
    out = np.zeros_like(u)
    for k in ks:
        for _ in range(3):
            a, b = r.integers(-k, k + 1, 2)
            ph = r.uniform(0, 2 * np.pi)
            out += np.sin(2 * np.pi * (a * u + b * v) + ph) / (1 + 0.15 * math.hypot(a, b))
    return out / (len(ks) * 3) ** 0.5


def worley(u, v, C, seed):
    """Tileable Worley on a C x C jittered grid. Returns F1, F2 in units of one cell."""
    r = np.random.default_rng(seed)
    jx, jy = r.random((C, C), dtype=np.float32), r.random((C, C), dtype=np.float32)
    ci, cj = np.floor(u * C).astype(np.int32), np.floor(v * C).astype(np.int32)
    f1 = np.full(u.shape, 9.0, np.float32)
    f2 = np.full(u.shape, 9.0, np.float32)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            ii, jj = ci + di, cj + dj
            px = (ii + jx[ii % C, jj % C]) / C
            py = (jj + jy[ii % C, jj % C]) / C
            d = np.hypot(px - u, py - v) * C
            m = d < f1
            f2 = np.where(m, f1, np.minimum(f2, d))
            f1 = np.where(m, d, f1)
    return f1, f2


ys, xs = np.mgrid[0:N, 0:N].astype(np.float32)
u, v = xs / N, ys / N
# domain warp so the cells are irregular polygons, not a regular jitter grid
wu = u + 0.0060 * periodic_noise(u, v, (6, 10), 1)
wv = v + 0.0060 * periodic_noise(u, v, (6, 10), 2)

f1, f2 = worley(wu % 1.0, wv % 1.0, 100, 11)               # 2.5 mm pebbles
edge = f2 - f1
crevice = 1.0 - smooth(0.0, 0.55, edge)                    # soft, shallow crevice (real grain is rounded)                     # 1 in the crevice, 0 on a cell top
dome = 1.0 - np.clip(f1 * 1.25, 0, 1)
m1, m2 = worley(wu % 1.0, wv % 1.0, 210, 31)                  # 1.2 mm micro-grain inside the pebbles
micro = smooth(0.0, 0.5, m2 - m1)
h = 0.55 * (1.0 - crevice) + 0.35 * dome + 0.18 * micro

g1, g2 = worley(wu % 1.0, wv % 1.0, 16, 23)                 # 1.5 cm crease network, faint
crease = 1.0 - smooth(0.0, 0.22, g2 - g1)
h = h - 0.10 * crease

mottle = periodic_noise(u, v, (3, 5, 8), 5)                 # 3 to 8 cm patchiness
mottle = mottle / (np.abs(mottle).max() + 1e-6)

# ---- normal (glTF / OpenGL: +Y up; image rows increase upward in Blender) ----------------------------------------
AMP_M = 0.00017                                            # relief depth in metres (0.17 mm)
px_m = TILE_M / N
gy, gx = np.gradient(h * AMP_M / px_m)                      # d(height)/d(pixel step) as slope
k = 2.2
nx, ny, nz = -gx * k, -gy * k, np.ones_like(h)
ln = np.sqrt(nx * nx + ny * ny + nz * nz)
nor = np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], -1)

# ---- roughness: satin finish 0.40, crevices duller, cell tops polished, patchy finish ----------------------------
rough = 0.41 + 0.13 * crevice + 0.015 * crease - 0.035 * dome           # stationary only: no tiled patches
rough = np.clip(rough, 0.28, 0.62)

# ---- diffuse (grey, luminance-normalised again at build time; colour is a multiplier) -----------------------------
dif = 0.72 * (1.0 - 0.13 * crevice)                         # stationary grain only; large-scale tone is vertex colour (never repeats)
dif = np.clip(dif, 0, 1)


def save(name, arr3, colourspace):
    img = bpy.data.images.new(name, N, N, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colourspace
    a = np.concatenate([arr3, np.ones((N, N, 1), np.float32)], -1).astype(np.float32)
    img.pixels.foreach_set(a.ravel())
    img.filepath_raw = os.path.join(OUT, name + ".png")
    img.file_format = "PNG"
    img.save()
    print("saved", img.filepath_raw)


save("leather_grain_nor_gl_2k", nor.astype(np.float32), "Non-Color")
save("leather_grain_rough_2k", np.stack([rough] * 3, -1).astype(np.float32), "Non-Color")
save("leather_grain_diff_2k", np.stack([dif] * 3, -1).astype(np.float32), "Non-Color")   # grey values kept exact
print("rough mean", float(rough.mean()), "nor std", float(nor.std(axis=(0, 1)).mean()))
