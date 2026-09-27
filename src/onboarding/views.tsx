import type { ComponentType } from "react";
import type { GuideId } from "./guides";

export interface GuideViewProps {
  /** Close the guide and mark it seen. */
  onDone: () => void;
}

/** One view per guide. A guide without an entry here is never requested (see
 *  `GuideState.available`), so cards can land one at a time. */
export const GUIDE_VIEWS: Partial<Record<GuideId, ComponentType<GuideViewProps>>> = {};
