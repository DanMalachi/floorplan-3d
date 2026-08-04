// Eyedropper sampling helpers (Plan Dock P7). Each protected-file hook
// (FurnitureLayer/FixtureLayer's click, WallMesh's onClickWall, FloorMesh's
// onClick) calls exactly ONE of these with whatever it already has at hand
// — the clicked item/wall+side/room's floor style — and this module owns
// the actual "what does sampling THIS thing mean" policy, the store write,
// and the toast. That keeps every protected-file hook to a single function
// call instead of duplicating the arm/toast logic at each site.
//
// Furniture/fixtures: arm placement of the SAME asset at the SAME rotation
// the sampled instance has (Sims "clone what's there" — the point of
// sampling a rotated chair is to place another one at that angle, not at 0°).
// Wall faces / floors: arm the matching brush with the sampled finish.
//
// Every sample* function is a no-op (returns false) unless `eyedropper` is
// currently armed, so callers can invoke them unconditionally on every
// click rather than gating on `useSceneStore.getState().eyedropper` at each
// of the four call sites.

import { useSceneStore } from "@/store/useSceneStore";
import { pdToast } from "@/ui/planDock/toast";
import type { FixtureItem, FloorStyle, FurnitureItem, Wall } from "@/schema/scene";

export function sampleFurniture(item: FurnitureItem): boolean {
  if (!useSceneStore.getState().eyedropper) return false;
  useSceneStore.setState({
    placing: { assetId: item.assetId, rotation: item.rotation },
    brush: null,
    sel3d: null,
    eyedropper: false,
  });
  pdToast("Sampled — same item armed, click to place");
  return true;
}

export function sampleFixture(item: FixtureItem): boolean {
  if (!useSceneStore.getState().eyedropper) return false;
  useSceneStore.setState({
    placing: { assetId: item.assetId, rotation: item.rotation },
    brush: null,
    sel3d: null,
    eyedropper: false,
  });
  pdToast("Sampled — same fixture armed, click to place");
  return true;
}

export function sampleWallFace(wall: Wall, side: "a" | "b"): boolean {
  if (!useSceneStore.getState().eyedropper) return false;
  const hex = (side === "a" ? wall.paintA : wall.paintB) ?? null;
  useSceneStore.setState({
    brush: { kind: "paint", hex },
    placing: null,
    sel3d: null,
    eyedropper: false,
  });
  pdToast(hex ? `Sampled Face ${side.toUpperCase()} — paint armed, click a face` : "Sampled plaster — paint armed, click a face");
  return true;
}

export function sampleFloor(style: FloorStyle): boolean {
  if (!useSceneStore.getState().eyedropper) return false;
  useSceneStore.setState({
    brush: { kind: "floor", style },
    placing: null,
    sel3d: null,
    eyedropper: false,
  });
  pdToast("Sampled floor — armed, click a room to apply");
  return true;
}
