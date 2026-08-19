import type { Opening, Scene } from "@/schema/scene";
import { takesWindowFinish } from "./doorStyle";

/**
 * The frame finish of every window and patio door in the project.
 *
 * BOTH halves of a frame's look — the finish and the colour — are whole-house
 * properties. A house does not have windows in two different colours, and it
 * does not have half its windows in matte and half in polished aluminium
 * either: frames are one joinery package, ordered once. So neither is editable
 * per opening; the inspector shows what the house currently has and changes it
 * everywhere.
 *
 * The patches live here rather than in the store so the fan-out is testable
 * without a React tree — see `frameFinish.test.ts`. The way this goes wrong is
 * that it reaches SOME of the glazing, which looks like nothing happened,
 * because the opening you were looking at did change.
 */

/**
 * The two finishes the product actually offers.
 *
 * "painted" was a third chip that duplicated tinted matte, so it shipped as a
 * choice that changed nothing. It stays in the schema union because saved
 * projects contain it, and resolves to matte here — one place, so no renderer
 * or panel has to know the legacy value exists.
 */
export type FrameFinish = "matte" | "glossy";

export function frameFinishOf(o: Opening): FrameFinish {
  return o.frameMaterial === "aluminum-glossy" ? "glossy" : "matte";
}

/** Apply `patch` to every opening that carries a window frame. */
function patchGlazed(scene: Scene, patch: Partial<Opening>): Scene {
  return {
    ...scene,
    openings: scene.openings.map((o) => (takesWindowFinish(o) ? { ...o, ...patch } : o)),
  };
}

/**
 * Retint every frame in the project.
 *
 * `null` (the palette's "natural" swatch) lands as ABSENT, not as a literal
 * null — the renderer branches on `tint ?? default`, and a null would read as
 * a colour rather than as "no tint".
 */
export function frameColorPatch(scene: Scene, hex: string | null): Scene {
  return patchGlazed(scene, { frameColor: hex ?? undefined });
}

/** Re-finish every frame in the project. Also normalises the legacy "painted"
 *  value away on anything it touches, so a project stops carrying it once a
 *  finish has been chosen. */
export function frameMaterialPatch(scene: Scene, finish: FrameFinish): Scene {
  return patchGlazed(scene, {
    frameMaterial: finish === "glossy" ? "aluminum-glossy" : "aluminum-matte",
  });
}
