import * as THREE from "three";
import type { WallEnds } from "./wallJunctions";

// A wall piece as an actual mesh. This is a BoxGeometry whose four vertical
// edges can slide independently along the wall's length — which is all a mitred
// or butted joint ever is, once you work in wall-local space (x along the wall,
// +z the side-A face). The ends slant; the long faces stay exactly ±z.
//
// It deliberately mimics BoxGeometry: same centred origin, same [+X,-X,+Y,-Y,
// +Z,-Z] group order. So the existing per-face material array still lines up,
// group 4 is still side A and group 5 still side B, and paint keeps working.

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
  const geom = new THREE.BufferGeometry();
  faces.forEach((quad, f) => {
    const base = f * 4;
    for (const v of quad) position.push(v[0], v[1], v[2]);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    geom.addGroup(f * 6, 6, f); // one material slot per face, as BoxGeometry does
  });

  geom.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geom.setIndex(index);
  // No vertex is shared between faces, so this stays flat-shaded — and the long
  // faces come out exactly (0,0,±1), which is what face-picking leans on.
  geom.computeVertexNormals();
  return geom;
}
