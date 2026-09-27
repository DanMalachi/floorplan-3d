// The onboarding guides, in the order a first-time user meets them.
//
// Design: docs/ONBOARDING-HANDOFF.md and the north-star artifact it links.
// Every guide is tied to a STEP (a trace step, the first 3D view, the first
// piece placed), never to a tab, and each one shows once. All of them can be
// reopened from the help panel.

export const GUIDE_IDS = [
  "welcome",
  "scale",
  "scale2",
  "walls",
  "openings",
  "build",
  "camera",
  "buildnav",
  "decnav",
  "placed",
  "walk",
] as const;

export type GuideId = (typeof GUIDE_IDS)[number];

export function isGuideId(v: unknown): v is GuideId {
  return typeof v === "string" && (GUIDE_IDS as readonly string[]).includes(v);
}

/** Where a guide belongs, for the help panel's "guides for this step" list. */
export type GuideStage = "start" | "trace" | "build" | "furnish" | "view";

export const GUIDE_STAGE: Record<GuideId, GuideStage> = {
  welcome: "start",
  scale: "trace",
  scale2: "trace",
  walls: "trace",
  openings: "trace",
  build: "trace",
  camera: "build",
  buildnav: "build",
  decnav: "furnish",
  placed: "furnish",
  walk: "view",
};

/** Queue order when several guides are requested by the same change: the
 *  welcome before anything, and "move around in 3D" before the navigator
 *  guides that assume you can already look around. */
export const GUIDE_PRIORITY: Record<GuideId, number> = Object.fromEntries(
  GUIDE_IDS.map((id, i) => [id, i]),
) as Record<GuideId, number>;
