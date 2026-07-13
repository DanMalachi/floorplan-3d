"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

// A light procedural rain layer: many short vertical streaks falling in a
// column around the model, wrapped in a vertex shader so they loop seamlessly.
// Each streak is a 2-vertex line segment; both vertices share a per-streak
// anchor (aBase) so the segment stays rigid as it falls and wraps — offsetting
// per-vertex by its own y would tear the streak apart at the wrap point.

const COUNT = 2600;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Rain({ span }: { span: number }) {
  const R = Math.max(span * 2.6, 22); // column radius around the model
  const H = Math.max(span * 2.2, 14); // fall height
  const speed = Math.max(span * 1.4, 12);

  const geo = useMemo(() => {
    const rnd = mulberry32(717);
    const streak = 0.38; // streak length (m)
    const pos = new Float32Array(COUNT * 2 * 3);
    const base = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) {
      const rad = Math.sqrt(rnd()) * R;
      const ang = rnd() * Math.PI * 2;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y0 = rnd() * H; // wrap anchor
      const k = i * 6;
      pos[k] = x; pos[k + 1] = 0; pos[k + 2] = z; // bottom vertex (local y = 0)
      pos[k + 3] = x; pos[k + 4] = streak; pos[k + 5] = z; // top vertex (local y = streak)
      base[i * 2] = y0; base[i * 2 + 1] = y0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aBase", new THREE.BufferAttribute(base, 1));
    return g;
  }, [R, H]);

  const uniforms = useRef({ uTime: { value: 0 }, uH: { value: H }, uSpeed: { value: speed } });

  const mat = useMemo(() => {
    const m = new THREE.LineBasicMaterial({ color: "#aebccc", transparent: true, opacity: 0.34, fog: true });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.current.uTime;
      shader.uniforms.uH = uniforms.current.uH;
      shader.uniforms.uSpeed = uniforms.current.uSpeed;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float aBase;\nuniform float uTime;\nuniform float uH;\nuniform float uSpeed;",
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float fall = mod(aBase - uTime * uSpeed, uH);
          transformed.y += fall;`,
        );
    };
    return m;
  }, []);

  useFrame((_, dt) => {
    uniforms.current.uTime.value += Math.min(dt, 0.05);
  });

  return <lineSegments geometry={geo} material={mat} frustumCulled={false} />;
}
