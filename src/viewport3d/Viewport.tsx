"use client";

import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSceneStore } from "@/store/useSceneStore";
import { Walls } from "./WallMesh";
import { Floors } from "./FloorMesh";

// Compute model center (plan x,y) and span so we can recenter + frame any scene.
function useSceneBounds() {
  const scene = useSceneStore((s) => s.scene);
  return useMemo(() => {
    if (scene.nodes.length === 0) {
      return { cx: 0, cz: 0, span: 6 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of scene.nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    return {
      cx: (minX + maxX) / 2,
      cz: (minY + maxY) / 2, // plan y -> world z
      span: Math.max(maxX - minX, maxY - minY, 1),
    };
  }, [scene]);
}

function FitCamera({ span }: { span: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;
  useEffect(() => {
    const dist = Math.max(span * 1.6, 5) + 3;
    const dir = new THREE.Vector3(0.7, 0.7, 1).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    camera.near = 0.05;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [span, camera, controls]);
  return null;
}

export function Viewport() {
  const scene = useSceneStore((s) => s.scene);
  const { cx, cz, span } = useSceneBounds();

  return (
    <Canvas shadows camera={{ position: [9, 8, 11], fov: 50 }}>
      <color attach="background" args={["#1e1e22"]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[span, span * 1.5, span * 0.8]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />

      {/* Recenter the model over the origin. */}
      <group position={[-cx, 0, -cz]}>
        <Floors scene={scene} />
        <Walls scene={scene} />
      </group>

      <Grid
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.6}
        sectionSize={5}
        sectionThickness={1}
        infiniteGrid
        fadeDistance={Math.max(span * 4, 40)}
        position={[0, -0.01, 0]}
      />
      <OrbitControls makeDefault />
      <FitCamera span={span} />
    </Canvas>
  );
}
