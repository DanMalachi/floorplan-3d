// Which surface is the currently-armed tool aiming at?
//
// The impure half of targetPlane.ts: this reads the store and the catalogs,
// reduces what it finds to the small `ArmedTarget` descriptor, and hands off.
// Split that way on purpose — the rules for how a target maps to a plane are
// worth testing and the store lookup is not, so the rules live somewhere a
// headless suite can reach them.

import { GENERATORS } from "@/parametric";
import { CATALOG_BY_ID } from "@/furniture/catalog";
import { FIXTURE_CATALOG } from "@/fixtures/catalog";
import { resolveTargetPlane, type TargetPlane, type ArmedTarget } from "./targetPlane";
import type { useSceneStore } from "@/store/useSceneStore";

type SceneState = ReturnType<typeof useSceneStore.getState>;

const FIXTURE_BY_ID = new Map(FIXTURE_CATALOG.map((f) => [f.assetId, f]));

/** The armed tool as a plane descriptor, or null when nothing is armed.
 *
 *  `placing` is shared between furniture and fixtures (FixtureCatalog calls the
 *  same setPlacing), so the fixture catalog is consulted first — an "fx:*"
 *  assetId is never in CATALOG_BY_ID, and treating it as a catalog miss would
 *  silently file every ceiling light under "floor". */
export function armedTarget(s: SceneState): ArmedTarget | null {
  // The frame brush is the one brush with no surface to click — it retints
  // every window and patio door at once — so there is nothing for the camera
  // to aim at and it must not offer to reframe.
  if (s.brush) {
    return s.brush.kind === "frame" ? null : { source: "brush", kind: s.brush.kind };
  }
  if (s.appMode === "build" && s.buildTool === "opening") return { source: "opening" };

  const run = s.placingRun ?? s.placingCounter;
  if (run) {
    const def = GENERATORS[run.spec.generator];
    return {
      source: "parametric",
      wallMounted: def?.wallMounted?.(run.spec) ?? false,
      counterItem: def?.counterItem?.(run.spec) ?? false,
    };
  }

  if (s.placing) {
    const fixture = FIXTURE_BY_ID.get(s.placing.assetId);
    if (fixture) return { source: "fixture", category: fixture.category };
    if (s.placing.parametric) {
      const def = GENERATORS[s.placing.parametric.generator];
      return {
        source: "parametric",
        wallMounted: def?.wallMounted?.(s.placing.parametric) ?? false,
        counterItem: def?.counterItem?.(s.placing.parametric) ?? false,
      };
    }
    return { source: "catalog", defaultElevation: CATALOG_BY_ID.get(s.placing.assetId)?.defaultElevation };
  }

  return null;
}

/** Convenience: the armed tool's plane, or null when nothing is armed. */
export function armedPlane(s: SceneState): TargetPlane | null {
  const t = armedTarget(s);
  return t ? resolveTargetPlane(t) : null;
}
