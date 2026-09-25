"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { Opening } from "@/schema/scene";
import { shadowProps } from "@/render/materialClass";
import { isDoubleDoor } from "@/render/doorStyle";
import { useSceneStore } from "@/store/useSceneStore";
import type { JoineryFrame, JoineryPiece } from "@/viewport3d/geometry/buildJoinery";
import { doorRenderKey, leafThickness, DEFAULT_TRIM_SURFACE, type DoorRenderInfo } from "./look";
import { buildLeaf, buildLining, buildTrim, HANDLE_HEIGHT, type LeafParts, type Slot } from "./geometry";
import { doorEnvMap, glassMaterial, metalMaterial, recessMaterial, sealMaterial, surfaceMaterial } from "./materials";

/**
 * A solid door, drawn as real joinery: the leaf in its design and material,
 * real hardware, hinges, jamb lining, casing and stop.
 *
 * It REPLACES the plain boxes WallMesh used to draw for a door's frame, leaf
 * and handle, and is driven by the SAME `buildJoinery` pieces: each leaf
 * piece's live position + rotation (the swing/slide animation) places a leaf
 * here, so the walkthrough, the inspector's swing slider and the sliding gear
 * keep working untouched. Leaf geometry is rebuilt only when the door's size
 * or look changes, never per animation frame.
 */

interface Props {
  opening: Opening;
  frame: JoineryFrame;
  pieces: JoineryPiece[];
  /** Selection/hover glow, 0..1 (WallMesh's emissive intensity). */
  glow: number;
  accent: string;
  /** WallMesh's cutaway fade (1 = opaque). Read every frame. */
  fade: MutableRefObject<number>;
}

type Mats = Record<Slot | "trim", THREE.MeshPhysicalMaterial>;

const sgn = (v: number): 1 | -1 => (v < 0 ? -1 : 1);

/** A hinged leaf hangs with its swing face this far inside the frame edge. */
const FACE_INSET = 0.003;

/** Materials are mutated in place (glow, fade), never re-created on
 *  interaction, same as WallMesh's own joinery materials. */
function setEnvLevel(m: Mats, level: number) {
  for (const x of Object.values(m)) x.envMapIntensity = level * ((x.userData.envScale as number) ?? 1);
}

function setGlow(m: Mats, glow: number) {
  m.body.emissiveIntensity = glow;
  m.trim.emissiveIntensity = glow;
}

export function DoorAssembly({ opening, frame, pieces, glow, accent, fade }: Props) {
  const key = useSceneStore((s) => doorRenderKey(s.scene, opening.id));
  const info = useMemo<DoorRenderInfo | null>(() => (key ? JSON.parse(key) : null), [key]);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const threeScene = useThree((s) => s.scene);

  const lookKey = info ? JSON.stringify(info.look) : "";
  const mats = useMemo<Mats | null>(() => {
    if (!info) return null;
    const { look } = info;
    const body = surfaceMaterial(look.surface);
    const m: Mats = {
      body,
      recess: recessMaterial(body),
      trim: surfaceMaterial(look.trimSurface ?? DEFAULT_TRIM_SURFACE),
      hardware: metalMaterial(look.hardware),
      glass: glassMaterial(look.glass),
      seal: sealMaterial(),
    };
    const env = doorEnvMap(gl);
    for (const x of Object.values(m)) {
      x.envMap = env;
      x.userData.envScale = x.envMapIntensity; // per-material weight (metals > 1)
      x.emissive = new THREE.Color(accent);
      x.emissiveIntensity = 0;
      x.userData.baseOpacity ??= 1;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey, accent, gl]);
  useEffect(() => () => {
    if (mats) Object.values(mats).forEach((m) => m.dispose());
  }, [mats]);

  // Glow on the door's solid parts (not glass, not hardware).
  useEffect(() => {
    if (!mats) return;
    setGlow(mats, glow);
    invalidate();
  }, [mats, glow, invalidate]);

  // Cutaway fade: follow WallMesh's damped value, same blend-pass rule.
  const applied = useRef(-1);
  const envLevel = useRef(-1);
  useFrame(() => {
    if (!mats) return;
    // Track the scene IBL level (time of day, camera preset) so the door's
    // own reflections stay in step with everything else's.
    const level = threeScene.environmentIntensity ?? 1;
    if (level !== envLevel.current) {
      envLevel.current = level;
      setEnvLevel(mats, level);
    }
    const o = fade.current;
    if (o === applied.current) return;
    applied.current = o;
    for (const [slot, m] of Object.entries(mats)) {
      const op = (m.userData.baseOpacity as number) * o;
      m.opacity = op;
      const blend = slot === "glass" || op < 1;
      if (m.transparent !== blend) {
        m.transparent = blend;
        m.needsUpdate = true;
      }
      m.depthWrite = slot === "glass" ? false : o > 0.55;
    }
  });

  // --- Trim, in the wall's local frame --------------------------------------
  const wallRot = -Math.atan2(frame.uy, frame.ux);
  const T = info ? leafThickness(info.look.design) : 0.04;
  const liningPiece = pieces.find((p) => p.key === "jL");
  const liningW = liningPiece?.size[0] ?? 0.06;
  const depth = liningPiece?.size[2] ?? frame.th * 1.06;
  const start = Math.max(0, opening.offset - opening.width / 2);
  const end = Math.min(frame.L, opening.offset + opening.width / 2);
  const top = Math.min(frame.wallH, opening.sill + opening.height);
  const sliding = pieces.some((p) => p.key.startsWith("sl"));
  const hasLining = !!liningPiece;
  // Which face the leaf swings toward, in wall-local Z (see buildJoinery's
  // swingLeaf: a leaf opens toward its own left normal for a positive swing,
  // and a double pair opens both leaves to the same side).
  const swingSign = sgn(opening.swingDeg ?? 0);
  const swingZ: 1 | -1 = isDoubleDoor(opening) ? swingSign : ((swingSign * (opening.hinge === "end" ? -1 : 1)) as 1 | -1);

  const trimGeom = useMemo(() => {
    if (!info || !hasLining) return null;
    const lining = buildLining(start, end, top, depth, liningW);
    // Sliding leaves run in a track, so there is nothing to close against.
    const trim = buildTrim({ start, end, top, faceZ: depth / 2, lining: liningW, swingZ, leafT: T, leafFaceZ: depth / 2 - FACE_INSET, trim: info.look.trim, stop: !sliding });
    return { lining, trim };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey, start, end, top, depth, liningW, swingZ, T, sliding, hasLining]);
  useEffect(() => () => {
    trimGeom?.lining?.dispose();
    trimGeom?.trim?.dispose();
  }, [trimGeom]);

  // --- Leaves ---------------------------------------------------------------
  const leaves = useMemo(() => {
    const out: { key: string; piece: JoineryPiece; sigma: 1 | -1; sliding: boolean; hingeFace: 1 | -1 }[] = [];
    for (const p of pieces) {
      if (p.role !== "leaf") continue;
      const isSlide = p.key.startsWith("sl");
      // Latch side: where this leaf's handle sits, projected on the leaf's +X.
      const h = pieces.find(
        (q) => q.role === "handle" && (q.key.startsWith(`${p.key}h`) || q.key === p.key.replace(/^sl/, "sh") || (p.key === "sl0" && q.key === "hn")),
      );
      const ex = [Math.cos(p.rotationY), -Math.sin(p.rotationY)];
      const sigma = h ? sgn((h.position[0] - p.position[0]) * ex[0] + (h.position[2] - p.position[2]) * ex[1]) : 1;
      // Swing face in the leaf frame: +Z is the left normal of hinge->latch,
      // which is exactly where a positive-rotation leaf opens to. lfB turns
      // the other way (buildJoinery hands it -swing).
      const rot = (p.key === "lfB" ? -1 : 1) * (opening.swingDeg ?? 0);
      out.push({ key: p.key, piece: p, sigma, sliding: isSlide, hingeFace: sgn(rot === 0 ? (p.key === "lfB" ? -1 : 1) : rot) });
    }
    return out;
  }, [pieces, opening.swingDeg]);

  if (!info || !mats) return null;
  return (
    <>
      {trimGeom && (
        <group position={[frame.ax, 0, frame.ay]} rotation={[0, wallRot, 0]}>
          {trimGeom.lining && (
            <mesh geometry={trimGeom.lining} material={mats.trim} raycast={() => null} {...shadowProps("opaqueArchitecture")} />
          )}
          {trimGeom.trim && (
            <mesh geometry={trimGeom.trim} material={mats.trim} raycast={() => null} {...shadowProps("opaqueArchitecture")} />
          )}
        </group>
      )}
      {leaves.map((l) => (
        <Leaf key={l.key} info={info} lookKey={lookKey} mats={mats} leaf={l} T={T} frame={frame} faceZ={depth / 2 - FACE_INSET} swingZ={swingZ} />
      ))}
    </>
  );
}

function Leaf({ info, lookKey, mats, leaf, T, frame, faceZ, swingZ }: {
  info: DoorRenderInfo;
  lookKey: string;
  mats: Mats;
  leaf: { key: string; piece: JoineryPiece; sigma: 1 | -1; sliding: boolean; hingeFace: 1 | -1 };
  T: number;
  frame: JoineryFrame;
  /** Wall-local Z of the frame edge the leaf hangs flush with. */
  faceZ: number;
  swingZ: 1 | -1;
}) {
  const { piece, sigma } = leaf;
  const [W, H] = piece.size;
  // Leaf frame: +X = hinge->latch (sigma along the piece's own +X).
  const rotY = piece.rotationY + (sigma < 0 ? Math.PI : 0);
  // Rounded to the millimetre so float noise in the piece's centre can't
  // rebuild the leaf.
  const handleY = Math.round((HANDLE_HEIGHT - piece.position[1]) * 1000) / 1000;

  // Which leaf face is outside: the leaf's +Z in plan against the wall's
  // left normal, times the wall side that is outside.
  let outsideFace: -1 | 0 | 1 = 0;
  if (info.outside !== 0) {
    const zx = Math.sin(rotY); // leaf +Z in world (X, Z) = plan (x, y)
    const zy = Math.cos(rotY);
    const d = zx * -frame.uy + zy * frame.ux;
    outsideFace = (Math.sign(d) * info.outside) as -1 | 0 | 1;
  }
  // leaf.hingeFace is already in THIS frame (+Z = left normal of
  // hinge->latch), so the PI flip for sigma < 0 needs no correction.
  const hingeFace = leaf.hingeFace;
  const concealed = info.look.trim === "minimal";

  const parts = useMemo<LeafParts>(
    () =>
      buildLeaf(info.look, {
        W, H, T, handleY,
        sliding: leaf.sliding,
        entry: info.kind === "entry",
        outsideFace,
        hingeFace,
        concealedHinges: concealed,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookKey, W, H, T, handleY, leaf.sliding, info.kind, outsideFace, hingeFace, concealed],
  );
  useEffect(() => () => Object.values(parts).forEach((g) => g?.dispose()), [parts]);

  // Hang the leaf the way a real door hangs. buildJoinery pivots every leaf
  // on the wall's CENTRE line, so a 40 mm leaf in a 120 mm wall sat 40 mm
  // back from the frame edge, hiding its hinges behind the casing. A hinged
  // leaf is flush with the frame on the side it opens toward and turns about
  // its knuckle axis K = (hinge point on the centre line) + swing normal *
  // faceZ. Rotating the leaf about K instead of the centre line reduces to
  // this offset of buildJoinery's own centre, exact at every swing angle:
  //   centre = C + swingN * faceZ - R(0, 0, hingeFace * T/2)
  // Sliding leaves ride their tracks at buildJoinery's depths, unchanged.
  let pos = piece.position;
  if (!leaf.sliding) {
    const sx = -frame.uy * swingZ; // swing normal, world (X, Z)
    const sz = frame.ux * swingZ;
    const k = (hingeFace * T) / 2;
    pos = [
      piece.position[0] + sx * faceZ - Math.sin(rotY) * k,
      piece.position[1],
      piece.position[2] + sz * faceZ - Math.cos(rotY) * k,
    ];
  }

  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      {(Object.keys(parts) as Slot[]).map((slot) =>
        parts[slot] ? (
          <mesh
            key={slot}
            geometry={parts[slot]}
            material={mats[slot]}
            raycast={() => null} // visual only: WallMesh's pick box handles input
            {...shadowProps(slot === "glass" ? "glass" : "opaqueArchitecture")}
          />
        ) : null,
      )}
    </group>
  );
}
