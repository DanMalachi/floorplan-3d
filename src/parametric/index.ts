import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { wardrobeGenerator } from "./wardrobe";
import { kitchenRunGenerator } from "./kitchenRun";
import { sofaGenerator } from "./sofa";

const ALL: GeneratorDef[] = [wardrobeGenerator, kitchenRunGenerator, sofaGenerator];

export const GENERATORS: Record<ParametricSpec["generator"], GeneratorDef> = Object.fromEntries(
  ALL.map((g) => [g.id, g]),
) as Record<ParametricSpec["generator"], GeneratorDef>;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Clamp + fill: any partial/out-of-range spec becomes a valid one. Applied
 *  by the inspector on every edit and by build() on entry (defense in depth). */
export function sanitizeSpec(spec: ParametricSpec): ParametricSpec {
  const g = GENERATORS[spec.generator];

  const dims = {
    w: clamp(spec.dims.w, g.dimLimits.w[0], g.dimLimits.w[1]),
    d: clamp(spec.dims.d, g.dimLimits.d[0], g.dimLimits.d[1]),
    h: clamp(spec.dims.h, g.dimLimits.h[0], g.dimLimits.h[1]),
  };

  const modules: Record<string, number> = {};
  for (const m of g.modules) {
    const v = spec.modules[m.key] ?? m.default;
    modules[m.key] = Math.round(clamp(v, m.min, m.max));
  }

  const front = g.fronts.includes(spec.front) ? spec.front : g.fronts[0];
  const handle = g.handles.includes(spec.handle) ? spec.handle : g.handles[0];
  const finish = g.finishes.includes(spec.finish) ? spec.finish : g.finishes[0];
  const finish2 = g.finishes2
    ? g.finishes2.includes(spec.finish2 ?? "")
      ? spec.finish2
      : g.finishes2[0]
    : undefined;

  return {
    generator: spec.generator,
    dims,
    modules,
    front,
    handle,
    finish,
    ...(finish2 !== undefined ? { finish2 } : {}),
  };
}
