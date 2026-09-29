/** OS "reduce motion" setting. Camera flights jump instead of animating when
 *  it is on (WCAG 2.3.3). Read at call time, so no listener is needed: every
 *  caller asks at the moment it is about to move the camera. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let query: MediaQueryList | null = null;

/** Same setting, for code that asks every frame (rain, wind, walkthrough):
 *  one MediaQueryList kept and read, instead of a new query per frame. Still
 *  live — changing the OS setting takes effect on the next frame. */
export function reducedMotionNow(): boolean {
  if (typeof window === "undefined") return false;
  query ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return query.matches;
}
