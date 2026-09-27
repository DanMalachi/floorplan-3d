import type { AppMode } from "@/store/useSceneStore";
import { GUIDE_STAGE, type GuideId } from "./guides";

/** The few store facts the guides react to, read once per store change. */
export interface TriggerSnapshot {
  appMode: AppMode;
  /** 1 Plan · 2 Scale · 3 Walls · 4 Openings · 5 Stairs · 6 Build */
  traceStep: number;
  hasImage: boolean;
  scaleSet: boolean;
  calibrationPts: number;
  walkthroughActive: boolean;
  furnitureCount: number;
  /** No walls in the 3D scene: a plan was imported but never generated. */
  sceneEmpty: boolean;
  projectId: string | null;
}

/** Which guides the current state calls for.
 *
 *  Mostly STATE, not edges: "the person is on the Walls step" rather than "the
 *  person just moved to it". The store drops anything already seen, so asking
 *  again is free, and a state rule also covers someone who arrives mid-flow —
 *  an existing user reopening a half-traced plan still gets the Walls guide
 *  once. The one real edge is `placed`, which is about an action. */
export function guidesFor(prev: TriggerSnapshot | null, next: TriggerSnapshot): GuideId[] {
  const out: GuideId[] = [];

  if (next.appMode === "trace") {
    // Step 2 only opens once a plan has loaded; `hasImage` guards a restored
    // project that sits on step 2 with its image still loading.
    if (next.traceStep === 2 && next.hasImage && !next.scaleSet) {
      // Choosing the two points, then typing the distance between them. Two
      // separate states, so the first card closes itself on the second click
      // (see `outgrown`) and the second takes its place.
      out.push(next.calibrationPts >= 2 ? "scale2" : "scale");
    }
    if (next.traceStep === 3) out.push("walls");
    if (next.traceStep === 4) out.push("openings");
    if (next.traceStep === 6) out.push("build");
    return out;
  }

  // An empty 3D view has nothing to practise on or navigate: the not-built
  // notice (NotBuiltNotice.tsx) talks instead, and these wait for walls.
  if (next.sceneEmpty) return out;

  // Any 3D mode: the camera card comes first (queue priority), then the
  // mode's own navigator guide.
  out.push("camera");
  if (next.appMode === "build") out.push("buildnav");
  if (next.appMode === "furnish") out.push("decnav");
  if (next.appMode === "view" && next.walkthroughActive) out.push("walk");

  // Exactly one more piece, in the same project: a placement. A project
  // switch or a restore changes the count by any amount, and isn't one.
  if (
    next.appMode === "furnish" &&
    prev !== null &&
    prev.projectId === next.projectId &&
    next.furnitureCount === prev.furnitureCount + 1
  ) {
    out.push("placed");
  }
  return out;
}

/** Whether the welcome belongs on this visit: nothing of the person's own yet.
 *  Not "no project": the editor creates an empty project #1 on first load.
 *  And not "no walls": that project starts from the sample scene. A plan
 *  image or a single traced point means they have already started. */
export function wantsWelcome(s: { projectCount: number; hasImage: boolean; tracedPoints: number; liveRoomId: string | null }): boolean {
  return s.projectCount <= 1 && !s.hasImage && s.tracedPoints === 0 && s.liveRoomId === null;
}

/** Whether a guide that opened from its trigger no longer fits the state: the
 *  person has moved past its step without closing it, so it closes itself
 *  (and counts as seen) and makes room for the next one. Only the trace step
 *  guides work this way. The 3D guides stay until closed, and so does anything
 *  reopened from the help panel. */
export function outgrown(id: GuideId, next: TriggerSnapshot): boolean {
  if (GUIDE_STAGE[id] !== "trace") return false;
  return !guidesFor(null, next).includes(id);
}
