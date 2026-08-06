import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { wardrobeGenerator } from "./wardrobe";
import { kitchenRunGenerator } from "./kitchenRun";
import { kitchenBaseGenerator } from "./kitchenBase";
import { kitchenWallGenerator } from "./kitchenWall";
import { sofaGenerator } from "./sofa";
import { sinkGenerator } from "./sink";
import { cooktopGenerator } from "./cooktop";

const ALL: GeneratorDef[] = [
  wardrobeGenerator,
  kitchenRunGenerator,
  kitchenBaseGenerator,
  kitchenWallGenerator,
  sofaGenerator,
  sinkGenerator,
  cooktopGenerator,
];

export const GENERATORS: Record<ParametricSpec["generator"], GeneratorDef> = Object.fromEntries(
  ALL.map((g) => [g.id, g]),
) as Record<ParametricSpec["generator"], GeneratorDef>;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// v1 finish ids retired from the pickable lists in R1 (painted split into a
// colorable "painted" + wheel, fabric-linen renamed to "fabric") but still
// valid on old saved items — sanitizeSpec must not silently reset them to
// the new default, or every pre-R1 item would visually change on next load.
const LEGACY_FINISH_ALIASES: Partial<Record<ParametricSpec["generator"], string[]>> = {
  wardrobe: ["painted-white", "painted-charcoal"],
  kitchenRun: ["painted-white", "painted-charcoal"],
  sofa: ["fabric-linen", "fabric-charcoal", "fabric-sage"],
};

/** Clamp + fill: any partial/out-of-range spec becomes a valid one. Applied
 *  by the inspector on every edit and by build() on entry (defense in depth). */
export function sanitizeSpec(spec: ParametricSpec): ParametricSpec {
  const g = GENERATORS[spec.generator];
  const legacy = LEGACY_FINISH_ALIASES[spec.generator] ?? [];
  const finishValid = (v: string | undefined) => v !== undefined && (g.finishes.includes(v) || legacy.includes(v));
  const finish2Valid = (v: string | undefined) => v !== undefined && (!!g.finishes2?.includes(v) || legacy.includes(v));

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
  const finish = finishValid(spec.finish) ? spec.finish : g.finishes[0];
  const finish2 = g.finishes2 ? (finish2Valid(spec.finish2) ? spec.finish2 : g.finishes2[0]) : undefined;

  return {
    generator: spec.generator,
    dims,
    modules,
    front,
    handle,
    finish,
    ...(finish2 !== undefined ? { finish2 } : {}),
    ...(spec.color !== undefined ? { color: spec.color } : {}),
    ...(spec.color2 !== undefined ? { color2: spec.color2 } : {}),
  };
}
