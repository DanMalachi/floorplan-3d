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
  args: { width: number; depth: number; height?: number; color: string; "chaise-len"?: number; "chaise-side"?: string };
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

interface Port {
  generator: ParametricSpec["generator"];
  slug: string;
  sets: string[];
  /** Script arguments → spec, when the script's CLI isn't just w/d/h. */
  toSpec?: (a: Fixture["args"]) => Pick<ParametricSpec, "dims" | "modules">;
}

const PORTS: Port[] = [
  { generator: "sofaBlockArm", slug: "block-arm-sofa", sets: ["min", "default", "max"] },
  { generator: "sofaFlareArm", slug: "flare-arm-sofa", sets: ["min", "default", "max"] },
  { generator: "sofaPlainBlock", slug: "plain-block-sofa", sets: ["min", "default", "max"] },
  { generator: "sofaTuftedSage", slug: "tufted-sage-sofa", sets: ["min", "default", "max"] },
  { generator: "sofaBeigeLeather", slug: "beige-leather-sofa", sets: ["min", "default", "max"] },
  {
    generator: "sofaGreyChaise", slug: "grey-chaise-sectional", sets: ["min", "default", "max", "default_mirror"],
    // --depth is the RUN; the inspector's depth is the whole footprint.
    toSpec: (a) => ({
      dims: { w: a.width, d: a.depth + (a["chaise-len"] ?? 0), h: a.height ?? 0 },
      modules: { chaiseLen: Math.round((a["chaise-len"] ?? 0) * 100), chaiseRight: a["chaise-side"] === "right" ? 1 : 0 },
    }),
  },
];

for (const port of PORTS) {
  const g = GENERATORS[port.generator];
  for (const set of port.sets) {
    const fx = load(port.slug, set);
    console.log(`\n${port.generator} vs ${port.slug} @ ${set} (${fx.args.width} × ${fx.args.depth}${fx.args.height ? ` × ${fx.args.height}` : ""})`);
    const want = port.toSpec?.(fx.args) ?? {
      dims: { w: fx.args.width, d: fx.args.depth, h: fx.args.height ?? g.defaultSpec.dims.h },
      modules: g.defaultSpec.modules,
    };
    const spec = sanitizeSpec({ ...g.defaultSpec, ...want });
    check("fixture size is inside the inspector's limits (sanitize left it alone)",
      JSON.stringify(spec.dims) === JSON.stringify(want.dims) && JSON.stringify(spec.modules) === JSON.stringify(want.modules),
      JSON.stringify({ dims: spec.dims, modules: spec.modules }));

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
    // Against the Blender build at THIS size: the shipped GLB is the default
    // set, and a piece whose detail follows the size (leather stitches at a
    // fixed pitch) legitimately carries more of it when it is bigger.
    check(`triangles ≤ Blender build (${fx.triangles})`, n <= fx.triangles, `${n}`);
    // First build pays JIT warm-up. One warm sample is at the mercy of GC
    // (the same build measured 34-60ms run to run), so gate the median of 5.
    const warm = Array.from({ length: 5 }, () => {
      const t1 = performance.now();
      g.build(spec);
      return performance.now() - t1;
    }).sort((x, y) => x - y);
    const ms2 = warm[2];
    check(`rebuild under ${BUILD_MS}ms (median of 5: ${ms2.toFixed(1)}ms)`, ms2 < BUILD_MS, `${ms2.toFixed(1)}ms (cold ${ms.toFixed(1)}ms)`);
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
