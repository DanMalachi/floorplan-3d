"use client";

// Runtime catalog thumbnails: each furniture GLB is rendered ONCE from a
// pleasant 3/4 angle into a small transparent PNG by a single shared
// offscreen renderer, then cached as a data URL. No pre-render pipeline to
// maintain, and tiles always match the shipped models.

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const SIZE = 160;

let renderer: THREE.WebGLRenderer | null = null;
let loader: GLTFLoader | null = null;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function ensureRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

async function render(assetId: string): Promise<string> {
  const r = ensureRenderer();
  loader ??= new GLTFLoader();
  const gltf = await loader.loadAsync(`/furniture/${assetId}.glb`);

  const scene = new THREE.Scene();
  const model = gltf.scene;
  scene.add(model);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8892a6, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 2.2);
  scene.add(sun);

  // Frame the model: 3/4 hero angle, fit by bounding sphere.
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const dist = (sphere.radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.12;
  cam.position
    .set(1, 0.85, 1.25)
    .normalize()
    .multiplyScalar(dist)
    .add(center);
  cam.lookAt(center);

  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");

  // Free GPU resources; the data URL is all we keep.
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
  return url;
}

export function getThumbnail(assetId: string): Promise<string> {
  const hit = cache.get(assetId);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(assetId);
  if (!p) {
    p = render(assetId)
      .then((url) => {
        cache.set(assetId, url);
        inflight.delete(assetId);
        return url;
      })
      .catch((err) => {
        inflight.delete(assetId);
        throw err;
      });
    inflight.set(assetId, p);
  }
  return p;
}

/** Data URL for an asset's thumbnail; null while rendering. */
export function useThumbnail(assetId: string): string | null {
  const [url, setUrl] = useState<string | null>(cache.get(assetId) ?? null);
  useEffect(() => {
    let alive = true;
    getThumbnail(assetId)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [assetId]);
  return url;
}
