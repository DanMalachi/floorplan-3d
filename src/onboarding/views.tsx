import type { ComponentType } from "react";
import type { GuideId } from "./guides";
import { BuildGuide, OpeningsGuide, Scale2Guide, ScaleGuide, WallsGuide } from "./traceGuides";
import { BuildNavGuide, CameraGuide, DecNavGuide, PlacedGuide, WalkGuide } from "./threeDGuides";
import { WelcomeGuide } from "./WelcomeGuide";

export interface GuideViewProps {
  /** Close the guide and mark it seen. */
  onDone: () => void;
}

/** One view per guide. A guide without an entry here is never requested (see
 *  `GuideState.available`), so cards can land one at a time. */
export const GUIDE_VIEWS: Partial<Record<GuideId, ComponentType<GuideViewProps>>> = {
  welcome: WelcomeGuide,
  scale: ScaleGuide,
  scale2: Scale2Guide,
  walls: WallsGuide,
  openings: OpeningsGuide,
  build: BuildGuide,
  camera: CameraGuide,
  buildnav: BuildNavGuide,
  decnav: DecNavGuide,
  placed: PlacedGuide,
  walk: WalkGuide,
};
