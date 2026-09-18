/** OS "reduce motion" setting. Camera flights jump instead of animating when
 *  it is on (WCAG 2.3.3). Read at call time, so no listener is needed: every
 *  caller asks at the moment it is about to move the camera. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
