import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { wardrobeGenerator } from "./wardrobe";
import { kitchenRunGenerator } from "./kitchenRun";
import { kitchenBaseGenerator } from "./kitchenBase";
import { kitchenWallGenerator } from "./kitchenWall";
import { sofaGenerator } from "./sofa";
import { sinkGenerator } from "./sink";
import { cooktopGenerator } from "./cooktop";
import { toiletGenerator } from "./toilet";
import { bathtubGenerator } from "./bathtub";
import { showerGenerator } from "./shower";
import { vanityGenerator } from "./vanity";
import { bathAccessoryGenerator } from "./bathAccessory";

const ALL: GeneratorDef[] = [
  wardrobeGenerator,
  kitchenRunGenerator,
  kitchenBaseGenerator,
  kitchenWallGenerator,
  sofaGenerator,
  sinkGenerator,
  cooktopGenerator,
  toiletGenerator,
  bathtubGenerator,
  showerGenerator,
  vanityGenerator,
  bathAccessoryGenerator,
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
  // Variant falls back to the generator's first (default) variant; generators
  // without variants carry none.
  const variant = g.variants?.some((v) => v.id === spec.variant)
    ? spec.variant
    : g.variants?.[0]?.id;
  // Multi-leg path (kitchen runs): legs keep sane widths, turns stay ±1.
  const extraLegs = spec.extraLegs
    ?.filter((l) => (l.turn === 1 || l.turn === -1) && l.w > 0.05)
    .map((l) => ({ turn: l.turn, w: clamp(l.w, 0.1, g.dimLimits.w[1]) }));
  const legDir = spec.legDir === -1 ? -1 : undefined;
  // Cutouts pass through clamped to the run's actual PATH length — they are
  // store-maintained (kitchenAttach sync), but a stale save must not cut
  // past an edge. Exact per-leg intervals are the sync's job.
  const totalLen =
    dims.w + (extraLegs?.reduce((acc, l) => acc + dims.d + l.w, 0) ?? 0);
  const cutouts = spec.cutouts
    ?.filter((c) => c.w > 0.01 && c.d > 0.01)
    .map((c) => ({ ...c, along: clamp(c.along, c.w / 2, Math.max(totalLen - c.w / 2, c.w / 2)) }));

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
    ...(variant !== undefined ? { variant } : {}),
    ...(cutouts !== undefined && cutouts.length > 0 ? { cutouts } : {}),
    ...(extraLegs !== undefined && extraLegs.length > 0 ? { extraLegs } : {}),
    ...(legDir !== undefined && extraLegs?.length ? { legDir } : {}),
  };
}
