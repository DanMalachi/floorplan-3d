// Build-mode tool gating (Plan Dock P0). While a non-"select" build tool is
// armed (Wall, Opening, Measure, ...), the scene objects underneath it must
// stop reacting to pointer events the way they do under Select — otherwise
// arming Measure and clicking a wall SELECTS the wall instead of taking a
// measurement (the bug this phase fixes; the click event reaches WallMesh's
// handlers first and they don't know a tool is armed). One shared predicate
// so every gate site (9 in WallMesh.tsx, 1 in StairMesh.tsx) reads
// identically instead of re-deriving the same condition by hand each time.

import type { AppMode, BuildTool } from "@/store/useSceneStore";

export function buildToolBlocksSelect(s: { appMode: AppMode; buildTool: BuildTool }): boolean {
  return s.appMode === "build" && s.buildTool !== "select";
}
