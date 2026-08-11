"use client";

// Visible snap grids shown ONLY while placing or dragging (Plan Dock P10):
// floor grid under furniture, ceiling grid under ceiling fixtures, wall grid
// on the face a wall fixture is snapping to. All three share the SAME cell
// size (`GRID`, 0.1 m) and the same 0.5 m major rhythm, so the muscle memory
// carries from floor to ceiling to wall. Lines are drawn at world multiples
// of GRID — exactly the positions `snap()` rounds to — so what you see is
// what it locks to.
//
// Rendered inside Viewport's recentred group (all positions are plan coords).

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Scene } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { eligibleLitRooms } from "@/render/roomLighting";
import { FIXTURE_CATALOG_BY_ID } from "@/fixtures/catalog";
import { GRID } from "./snap";
import { ACCENT } from "./WallMesh";

const MAJOR_EVERY = 5; // every 5th line (0.5 m) reads stronger — same on all surfaces
const LIFT = 0.012; // offset off the surface so lines never z-fight it

const isMajor = (k: number) => ((k % MAJOR_EVERY) + MAJOR_EVERY) % MAJOR_EVERY === 0;

/** One transparent line set. Geometry is rebuilt only when `pts` changes. */
function Segs({ pts, opacity }: { pts: Float32Array; opacity: number }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    return g;
  }, [pts]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color={ACCENT} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  );
}

/** Minor + major line pair with the shared look every surface uses. */
function GridPair({ minor, major }: { minor: Float32Array; major: Float32Array }) {
  return (
    <group>
      <Segs pts={minor} opacity={0.14} />
      <Segs pts={major} opacity={0.4} />
    </group>
  );
}

/** Horizontal grid (floor or ceiling) covering [x0,x1]×[z0,z1] at height y.
 *  Lines land on world multiples of GRID — the same values snap() produces. */
function horizontalGrid(x0: number, x1: number, z0: number, z1: number, y: number) {
  const minor: number[] = [];
  const major: number[] = [];
  for (let k = Math.ceil(x0 / GRID); k * GRID <= x1; k++) {
    const x = k * GRID;
    (isMajor(k) ? major : minor).push(x, y, z0, x, y, z1);
  }
  for (let k = Math.ceil(z0 / GRID); k * GRID <= z1; k++) {
    const z = k * GRID;
    (isMajor(k) ? major : minor).push(x0, y, z, x1, y, z);
  }
  return { minor: new Float32Array(minor), major: new Float32Array(major) };
}

function FloorGrid({ scene }: { scene: Scene }) {
  const grid = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of scene.nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    if (!isFinite(minX)) return null;
    return horizontalGrid(minX - 2, maxX + 2, minY - 2, maxY + 2, LIFT);
  }, [scene.nodes]);
  return grid && <GridPair {...grid} />;
}

/** One grid per lit room, at that room's own ceiling height. */
function CeilingGrids({ scene }: { scene: Scene }) {
  const grids = useMemo(() => {
    return eligibleLitRooms(scene).map((er) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of er.loop) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      return {
        id: er.room.id,
        grid: horizontalGrid(minX, maxX, minY, maxY, er.ceilingHeight - LIFT),
      };
    });
  }, [scene]);
  return (
    <group>
      {grids.map((g) => (
        <GridPair key={g.id} {...g.grid} />
      ))}
    </group>
  );
}

/**
 * Grid on ONE wall face — the face a wall fixture is currently snapping to.
 * Verticals at multiples of GRID along the wall from node `a` (the frame
 * `nearestWallMount` measures `offset` in), horizontals at multiples of GRID
 * up from the floor: the exact lattice the mount snaps to.
 */
export function WallSurfaceGrid({ scene, wallId, side }: {
  scene: Scene;
  wallId: string;
  side: "a" | "b";
}) {
  const grid = useMemo(() => {
    const wall = scene.walls.find((w) => w.id === wallId);
    const a = wall && scene.nodes.find((n) => n.id === wall.a);
    const b = wall && scene.nodes.find((n) => n.id === wall.b);
    if (!wall || !a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) return null;
    const ux = dx / L;
    const uy = dy / L;
    // Same "a"-face normal convention as WallMesh/resolveFixtureWorldXY.
    const sign = side === "a" ? 1 : -1;
    const off = (wall.thickness ?? DEFAULT_THICKNESS) / 2 + LIFT;
    const nx = -uy * sign * off;
    const ny = ux * sign * off;
    const H = WALL_HEIGHT;
    const minor: number[] = [];
    const major: number[] = [];
    const at = (t: number, y: number): [number, number, number] =>
      [a.x + ux * t + nx, y, a.y + uy * t + ny];
    for (let k = 0; k * GRID <= L; k++) {
      const t = k * GRID;
      (isMajor(k) ? major : minor).push(...at(t, 0), ...at(t, H));
    }
    for (let k = 0; k * GRID <= H; k++) {
      const y = k * GRID;
      (isMajor(k) ? major : minor).push(...at(0, y), ...at(L, y));
    }
    return { minor: new Float32Array(minor), major: new Float32Array(major) };
  }, [scene, wallId, side]);
  return grid && <GridPair {...grid} />;
}

/**
 * Floor/ceiling overlays, driven purely by store state:
 *  - placing or dragging FURNITURE (incl. kitchen runs) → floor grid;
 *  - placing or dragging a CEILING fixture → per-room ceiling grids.
 * Wall-fixture grids need the live snap target and are rendered by
 * FixtureLayer itself (it owns that state).
 */
export function SnapGridOverlays() {
  const scene = useSceneStore((s) => s.scene);
  const placing = useSceneStore((s) => s.placing);
  const placingRun = useSceneStore((s) => s.placingRun);
  const dragging = useSceneStore((s) => s.gestureBase !== null && !s.doorGestureActive);
  const sel3d = useSceneStore((s) => s.sel3d);

  const fixtureSpec = placing ? FIXTURE_CATALOG_BY_ID.get(placing.assetId) : undefined;
  const placingFurniture = !!placing && !fixtureSpec;
  const selFixture =
    sel3d?.kind === "fixture" ? (scene.fixtures ?? []).find((f) => f.id === sel3d.id) : undefined;

  // Wall-cabinet runs (placingRun kitchenWall) are a WALL interaction — their
  // grid is the wall grid RunDrawGhost shows; the floor grid would only
  // suggest the wrong surface.
  const showFloor =
    placingFurniture ||
    placingRun?.generator === "kitchenBase" ||
    (dragging && sel3d?.kind === "furniture");
  const showCeiling =
    fixtureSpec?.category === "Ceiling" ||
    (dragging && selFixture?.mount.kind === "ceiling");

  return (
    <group>
      {showFloor && <FloorGrid scene={scene} />}
      {showCeiling && <CeilingGrids scene={scene} />}
    </group>
  );
}
