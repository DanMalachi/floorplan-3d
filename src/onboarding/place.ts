/** Where a guide card goes next to the control it explains. Pure, so the
 *  geometry is tested without a browser (onboarding.test.ts). */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Which side of the anchor the card sits on, in reading terms: `end` is
 *  after the anchor (right in English, left in Hebrew). */
export type CardSide = "end" | "start" | "below" | "above";

export interface Placement {
  left: number;
  top: number;
  side: CardSide;
  /** Where the pointer tip meets the card, in px along the edge that faces
   *  the anchor: from the top for `end`/`start`, from the left otherwise. */
  tip: number;
}

/** Gap between the anchor and the card, room for the tip. */
export const CARD_GAP = 18;
/** Nearest a card gets to the window edge. */
export const VIEW_MARGIN = 12;
/** The tip keeps this far from the card's corners, clear of the rounding. */
const TIP_INSET = 24;
/** A side card starts a little above the anchor's centre, so its title and
 *  the tip line up with the control instead of the card hanging off it. */
const TIP_FROM_TOP = 56;

/** The default order: after the anchor in reading order (the trace rail sits
 *  on the inline-start edge, so the card opens over the plan), then the other
 *  side, then below, then above. */
export const SIDE_ORDER: CardSide[] = ["end", "start", "below", "above"];

/** Like a normal clamp, except an empty range (the card is bigger than the
 *  room it has) resolves to `lo`: pin to the top/start margin. */
const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/**
 * The first side in `order` the card fits on. If it fits nowhere it takes the
 * last side anyway, pinned inside the window; the view caps its height to
 * scroll.
 */
export function placeCard(anchor: Box, card: Size, view: Size, rtl: boolean, order: CardSide[] = SIDE_ORDER): Placement {
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;

  const sideTop = clamp(cy - TIP_FROM_TOP, VIEW_MARGIN, view.height - card.height - VIEW_MARGIN);
  const sideTip = clamp(cy - sideTop, TIP_INSET, card.height - TIP_INSET);
  const flatLeft = clamp(cx - card.width / 2, VIEW_MARGIN, view.width - card.width - VIEW_MARGIN);
  const flatTip = clamp(cx - flatLeft, TIP_INSET, card.width - TIP_INSET);

  const attempt = (side: CardSide): { p: Placement; fits: boolean } => {
    if (side === "end" || side === "start") {
      // `end` is physically right in LTR, left in RTL.
      const toRight = (side === "end") !== rtl;
      const left = toRight ? right + CARD_GAP : anchor.left - CARD_GAP - card.width;
      const fits = toRight ? left + card.width <= view.width - VIEW_MARGIN : left >= VIEW_MARGIN;
      return { p: { left, top: sideTop, side, tip: sideTip }, fits };
    }
    if (side === "below") {
      const top = bottom + CARD_GAP;
      return { p: { left: flatLeft, top, side, tip: flatTip }, fits: top + card.height <= view.height - VIEW_MARGIN };
    }
    const top = anchor.top - CARD_GAP - card.height;
    return { p: { left: flatLeft, top: Math.max(VIEW_MARGIN, top), side, tip: flatTip }, fits: top >= VIEW_MARGIN };
  };

  let last: Placement | null = null;
  for (const side of order) {
    const { p, fits } = attempt(side);
    if (fits) return p;
    last = p;
  }
  return last ?? attempt("above").p;
}

/** A card with nothing to point at: centred, or near the bottom of the
 *  window with `bottom` px clear below it (room for a dock). */
export function parkCard(card: Size, view: Size, at: "centre" | "bottom", bottom = 0): { left: number; top: number } {
  const left = Math.max(VIEW_MARGIN, (view.width - card.width) / 2);
  const top =
    at === "centre"
      ? Math.max(VIEW_MARGIN, (view.height - card.height) / 2)
      : Math.max(VIEW_MARGIN, view.height - card.height - bottom);
  return { left, top };
}
