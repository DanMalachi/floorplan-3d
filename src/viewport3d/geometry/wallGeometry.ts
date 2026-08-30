import * as THREE from "three";
import type { WallEnds } from "./wallJunctions";

// A wall piece as an actual mesh. This is a BoxGeometry whose four vertical
// edges can slide independently along the wall's length — which is all a mitred
// or butted joint ever is, once you work in wall-local space (x along the wall,
// +z the side-A face). The ends slant; the long faces stay exactly ±z.
//
// It deliberately mimics BoxGeometry's centred origin and [+X,-X,+Y,-Y,+Z,-Z]
// face winding. Materials only need 3 slots though — the four end/top/bottom
// faces share one `neutral` material and are contiguous in the index buffer,
// so they're emitted as ONE group (perf-drawcalls.md §5.1): group 0 = ends/
// top/bottom (neutral), group 1 = +Z side A, group 2 = -Z side B. WallMesh's
// `mats` array and `faceSide` must stay in that order for paint to work.

type V = [number, number, number];

/**
 * @param size  [length-along-wall, height, thickness] — the un-jointed box.
 * @param ends  per-corner slides along x; SQUARE_ENDS gives a plain box back.
 */
export function buildWallGeometry(size: V, ends: WallEnds): THREE.BufferGeometry {
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;

  // Corner x's: A/B at the node-a end (left/right face), C/D at the node-b end.
  const xA = -hx + ends.x0L;
  const xB = -hx + ends.x0R;
  const xC = hx + ends.x1L;
  const xD = hx + ends.x1R;

  const Ab: V = [xA, -hy, hz];
  const At: V = [xA, hy, hz];
  const Bb: V = [xB, -hy, -hz];
  const Bt: V = [xB, hy, -hz];
  const Cb: V = [xC, -hy, hz];
  const Ct: V = [xC, hy, hz];
  const Db: V = [xD, -hy, -hz];
  const Dt: V = [xD, hy, -hz];

  // Wound so every face points outward. Order matches BoxGeometry's groups.
  const faces: V[][] = [
    [Cb, Db, Dt, Ct], // +X  end at node b (slants with the joint)
    [Ab, At, Bt, Bb], // -X  end at node a
    [At, Ct, Dt, Bt], // +Y  top
    [Ab, Bb, Db, Cb], // -Y  bottom
    [Ab, Cb, Ct, At], // +Z  side A
    [Bb, Bt, Dt, Db], // -Z  side B
  ];

  const position: number[] = [];
  const index: number[] = [];
  // Real-meter UVs on the two painted long faces (Sprint 6: wall paint grain)
  // — one texture repeat spans PAINT_TILE_M, same "physical cover" convention
  // textures.ts uses for floors. Baked into the geometry rather than a
  // material-level texture.repeat because matA/matB are shared across a whole
  // wall's differently-sized pieces (full spans, sills, lintels); a single
  // repeat setting on the material can't adapt per piece, but per-vertex UV
  // can. The other four faces (unpainted `neutral` material, no map) get a
  // plain unit square — their UV values are never sampled.
  const PAINT_TILE_M = 0.15; // smaller tile = smaller-reading paint divots (Dan's ask)
  const uv: number[] = [];
  const UNIT: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const geom = new THREE.BufferGeometry();
  faces.forEach((quad, f) => {
    const base = f * 4;
    for (const v of quad) position.push(v[0], v[1], v[2]);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    if (f === 4) {
      // +Z side A: quad order is Ab(BL), Cb(BR), Ct(TR), At(TL).
      const u1 = (xC - xA) / PAINT_TILE_M;
      const v1 = size[1] / PAINT_TILE_M;
      uv.push(0, 0, u1, 0, u1, v1, 0, v1);
    } else if (f === 5) {
      // -Z side B: quad order is Bb(BL), Bt(TL), Dt(TR), Db(BR).
      const u1 = (xD - xB) / PAINT_TILE_M;
      const v1 = size[1] / PAINT_TILE_M;
      uv.push(0, 0, 0, v1, u1, v1, u1, 0);
    } else {
      for (const [u, v] of UNIT) uv.push(u, v);
    }
  });

  geom.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(index);
  // Faces 0-3 (+X,-X,+Y,-Y — the two ends, top and bottom) are contiguous in
  // the index buffer and all resolve to the same `neutral` material, so they
  // collapse into one group/draw instead of four (perf-drawcalls.md §5.1).
  // Group 1 is +Z (side A, was material slot 4), group 2 is -Z (side B, was
  // slot 5) — WallMesh's `mats` array and `faceSide` must agree with this
  // 3-slot order.
  geom.addGroup(0, 24, 0);
  geom.addGroup(24, 6, 1);
  geom.addGroup(30, 6, 2);
  // No vertex is shared between faces, so this stays flat-shaded — and the long
  // faces come out exactly (0,0,±1), which is what face-picking leans on.
  geom.computeVertexNormals();
  return geom;
}
