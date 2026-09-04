import type { Opening, SlideSpec } from "@/schema/scene";
import { PATIO_MIN_WIDTH } from "@/schema/constants";

/**
 * How a door opens, and how an opening's width divides between its leaves.
 *
 * The one place these rules live. `buildJoinery.ts` renders through them and
 * `OpeningSection.tsx` (the inspector) reads the same functions to decide
 * which chip shows as active and which controls appear — so the panel can
 * never disagree with what is actually on screen.
 */

/** Two glazed panels sliding past each other — the balcony door. */
export const PATIO_SLIDE: SlideSpec = {
  style: "bypass",
  panels: 2,
  glazed: true,
  open: 0,
  side: "end",
};

/**
 * Has this door's style ever been chosen by hand?
 *
 * `slide` and `double` are only ever written by the inspector. `swingDeg` is
 * the third: it is absent on every door any creation path produces (the
 * opening tool, the trace importer, the sample scene), so the inspector
 * writing `swingDeg: 0` is an unambiguous "I want a swing door here" — which
 * is what lets the width default below be overridden rather than fought.
 */
export function hasAuthoredDoorStyle(o: Opening): boolean {
  return o.slide != null || o.double === true || o.swingDeg != null;
}

/**
 * The sliding gear a door actually renders with — the authored `slide` if
 * there is one, otherwise the patio default for anything at or past
 * PATIO_MIN_WIDTH that was never styled by hand.
 *
 * A DERIVED default, not a data migration: nothing is written to the scene, so
 * narrowing a door back below the threshold returns it to a swing leaf, and
 * projects saved before this rule existed pick it up on load.
 */
export function effectiveSlide(o: Opening): SlideSpec | undefined {
  if (o.type !== "door") return undefined;
  if (o.slide) return o.slide;
  if (hasAuthoredDoorStyle(o)) return undefined;
  return o.width >= PATIO_MIN_WIDTH ? PATIO_SLIDE : undefined;
}

/**
 * Does this door slide only because of the rule above — is its sliding gear
 * DERIVED rather than stored?
 *
 * The walkthrough needs the distinction because opening a door WRITES to the
 * scene, and both fields it could write (`slide`, `swingDeg`) are exactly what
 * `hasAuthoredDoorStyle` reads. Without this, a patio door the player merely
 * walked through comes out the other side hand-styled: frozen as whatever the
 * animation last wrote, and no longer answering to its width.
 */
export function hasDerivedSlide(o: Opening): boolean {
  return o.slide == null && effectiveSlide(o) != null;
}

/**
 * The same opening with every hand-authored style field REMOVED, so the width
 * default above gets to decide again.
 *
 * The keys are deleted rather than set to `undefined`: an explicit undefined
 * still travels as a field through the Yjs scene diff and the IndexedDB clone,
 * and a door restored to "never styled" has to be indistinguishable from one
 * that never was.
 */
export function withoutAuthoredDoorStyle(o: Opening): Opening {
  if (o.slide === undefined && o.swingDeg === undefined) return o;
  const next = { ...o };
  delete next.slide;
  delete next.swingDeg;
  return next;
}

/** A pair of hinged leaves meeting mid-opening. `slide` wins if both are set. */
export function isDoubleDoor(o: Opening): boolean {
  return o.type === "door" && o.double === true && o.slide == null;
}

/**
 * A door whose leaves are glass — a patio slider, derived or authored.
 *
 * Glass is what decides the finish: a glazed door is joinery of the same
 * family as a window (frame + sash + pane), so it takes the window frame
 * materials and shares the one frame colour, while a solid leaf takes the
 * door materials.
 */
export function isGlazedDoor(o: Opening): boolean {
  return effectiveSlide(o)?.glazed === true;
}

/** Every opening that carries the window frame finish: windows + patio doors.
 *  What that finish IS lives in `frameFinish.ts` — this only decides which
 *  openings are glazed joinery, which is a question about door style. */
export function takesWindowFinish(o: Opening): boolean {
  return o.type === "window" || isGlazedDoor(o);
}

/**
 * What to CALL this opening in the UI — the one place that decides.
 *
 * Never print `opening.type`. The stored enum is three words long
 * ("door" | "window" | "passage") and one of them lies: `effectiveSlide`
 * above turns any unstyled door at or past PATIO_MIN_WIDTH into a glazed
 * patio slider, DERIVED and never written back. So a badge or a panel title
 * reading the raw enum says "door" while the renderer is drawing a balcony
 * slider, and it says it in lowercase.
 *
 * The inspector panel title and the 3D selection badge both come through
 * here so they cannot drift apart, and so the derived-patio rule is stated
 * once alongside the function that derives it.
 *
 * Returns exactly one of: "Double door", "Patio door", "Door", "Window",
 * "Passage". This is the name of THIS element; the name of the type a user
 * picks or places is "Door / Patio" and lives in the toolbar/type chips.
 */
export function openingDisplayName(o: Opening): string {
  if (o.type === "window") return "Window";
  if (o.type === "passage") return "Passage";
  if (isDoubleDoor(o)) return "Double door";
  if (isGlazedDoor(o)) return "Patio door";
  return "Door";
}

/** How many leaves/panels an opening divides into (1 = a single leaf). */
export function leafCount(o: Opening): number {
  const slide = effectiveSlide(o);
  if (slide) return slide.style === "surface" ? 1 : Math.max(2, Math.round(slide.panels || 2));
  return isDoubleDoor(o) ? 2 : 1;
}

/**
 * Split `total` across `count` leaves using `split` as fractions.
 *
 * Normalised rather than trusted: the fractions are what the inspector edits,
 * and a stale/short/zeroed array (a panel count changed after the widths were
 * set, an old project) has to degrade to an even split instead of collapsing a
 * leaf to nothing.
 */
export function leafWidths(total: number, count: number, split?: number[]): number[] {
  const n = Math.max(1, Math.round(count));
  const even = () => Array.from({ length: n }, () => total / n);
  if (!split || split.length !== n) return even();
  const clean = split.map((f) => (Number.isFinite(f) && f > 0 ? f : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  if (sum <= 1e-6 || clean.some((f) => f <= 0)) return even();
  return clean.map((f) => (f / sum) * total);
}

/**
 * The fractions that make leaf `index` measure `width`, with the rest of the
 * opening redistributed among the other leaves in their current proportions.
 *
 * Clamped so no leaf can be driven to zero (or to swallow the whole opening) —
 * a leaf with no width has no geometry, and the inspector must not be able to
 * type one out of existence.
 */
export function withLeafWidth(
  current: number[] | undefined,
  count: number,
  total: number,
  index: number,
  width: number,
): number[] {
  const n = Math.max(1, Math.round(count));
  if (n < 2 || total <= 0) return Array.from({ length: n }, () => 1 / n);
  const base = leafWidths(1, n, current); // current fractions, normalised
  const min = 0.05;
  const want = Math.min(1 - min * (n - 1), Math.max(min, width / total));
  const restNow = base.reduce((a, f, i) => a + (i === index ? 0 : f), 0);
  const rest = 1 - want;
  return base.map((f, i) => {
    if (i === index) return want;
    // Proportional share of what's left; an all-zero remainder splits evenly.
    return restNow > 1e-6 ? (f / restNow) * rest : rest / (n - 1);
  });
}
