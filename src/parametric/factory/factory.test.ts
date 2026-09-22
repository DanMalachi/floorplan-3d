// Headless: the v3 factory ports against their approved Blender builds.
// Run: npx tsx src/parametric/factory/factory.test.ts
//
// Every fixture in ./__fixtures__ was exported by the ORIGINAL build script at
// the same arguments (scripts/factory-parity/extract-parts.mjs). The port is
// right when every named part lands where the script put it — within 5mm, at
// the smallest, default and largest size the inspector allows.

import * as fs from "node:fs";
import * as path from "node:path";
import * as THREE from "three";
import { GENERATORS, sanitizeSpec } from "@/parametric";
import type { ParametricSpec } from "@/schema/scene";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

interface Fixture {
  slug: string;
  set: string;
  args: { width: number; depth: number; height?: number; color: string };
  bbox: { min: number[]; max: number[] };
  triangles: number;
  parts: { name: string; bbox: { min: number[]; max: number[] }; triangles: number }[];
}

const FIX = path.join(__dirname, "__fixtures__");
const load = (slug: string, set: string): Fixture => JSON.parse(fs.readFileSync(path.join(FIX, `${slug}.${set}.json`), "utf8"));

const TOL = 0.005; // metres
const BUILD_MS = 50;

function worst(a: THREE.Box3, b: { min: number[]; max: number[] }): number {
  return Math.max(
    ...[0, 1, 2].map((i) => Math.abs(a.min.getComponent(i) - b.min[i])),
    ...[0, 1, 2].map((i) => Math.abs(a.max.getComponent(i) - b.max[i])),
  );
}

function tris(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) n += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3;
  });
  return n;
}

const PORTS: { generator: ParametricSpec["generator"]; slug: string; sets: string[] }[] = [
  { generator: "sofaBlockArm", slug: "block-arm-sofa", sets: ["min", "default", "max"] },
];

for (const port of PORTS) {
  const g = GENERATORS[port.generator];
  const shipped = load(port.slug, "default");
  for (const set of port.sets) {
    const fx = load(port.slug, set);
    console.log(`\n${port.generator} vs ${port.slug} @ ${set} (${fx.args.width} × ${fx.args.depth}${fx.args.height ? ` × ${fx.args.height}` : ""})`);
    const spec = sanitizeSpec({
      ...g.defaultSpec,
      dims: { w: fx.args.width, d: fx.args.depth, h: fx.args.height ?? g.defaultSpec.dims.h },
    });
    check("fixture size is inside the inspector's limits (sanitize left it alone)",
      spec.dims.w === fx.args.width && spec.dims.d === fx.args.depth && (fx.args.height === undefined || spec.dims.h === fx.args.height),
      JSON.stringify(spec.dims));

    const t0 = performance.now();
    const group = g.build(spec);
    const ms = performance.now() - t0;
    group.updateMatrixWorld(true);

    const all = new THREE.Box3().setFromObject(group);
    check(`overall bbox within ${TOL * 1000}mm`, worst(all, fx.bbox) <= TOL, `off by ${(worst(all, fx.bbox) * 1000).toFixed(1)}mm`);

    const byName = new Map<string, THREE.Object3D>();
    group.traverse((o) => o.name && byName.set(o.name, o));
    const missing = fx.parts.filter((p) => !byName.has(p.name)).map((p) => p.name);
    const extra = [...byName.keys()].filter((n) => !fx.parts.some((p) => p.name === n));
    check("same named parts as the Blender build", missing.length === 0 && extra.length === 0,
      `missing [${missing.join(",")}] extra [${extra.join(",")}]`);
    const off = fx.parts
      .filter((p) => byName.has(p.name))
      .map((p) => ({ name: p.name, e: worst(new THREE.Box3().setFromObject(byName.get(p.name)!), p.bbox) }))
      .filter((r) => r.e > TOL);
    check(`every part within ${TOL * 1000}mm`, off.length === 0, off.map((r) => `${r.name} ${(r.e * 1000).toFixed(1)}mm`).join(", "));

    const n = tris(group);
    check(`triangles ≤ shipped GLB (${shipped.triangles})`, n <= shipped.triangles, `${n}`);
    // First build pays JIT warm-up; time a second one.
    const t1 = performance.now();
    g.build(spec);
    const ms2 = performance.now() - t1;
    check(`rebuild under ${BUILD_MS}ms`, ms2 < BUILD_MS, `${ms2.toFixed(1)}ms (cold ${ms.toFixed(1)}ms)`);
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
