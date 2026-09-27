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

/** Like a normal clamp, except an empty range (the card is bigger than the
 *  room it has) resolves to `lo`: pin to the top/start margin. */
const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/**
 * Prefers the side AFTER the anchor in reading order (the trace rail sits on
 * the inline-start edge, so the card opens over the plan), then the other
 * side, then below, then above. A card taller than the window pins to the top
 * margin; the view caps its height to scroll.
 */
export function placeCard(anchor: Box, card: Size, view: Size, rtl: boolean): Placement {
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;

  const toRight = right + CARD_GAP;
  const toLeft = anchor.left - CARD_GAP - card.width;
  const fitsRight = toRight + card.width <= view.width - VIEW_MARGIN;
  const fitsLeft = toLeft >= VIEW_MARGIN;

  const sideTop = clamp(cy - TIP_FROM_TOP, VIEW_MARGIN, view.height - card.height - VIEW_MARGIN);
  const sideTip = clamp(cy - sideTop, TIP_INSET, card.height - TIP_INSET);
  const order: Array<"right" | "left"> = rtl ? ["left", "right"] : ["right", "left"];
  for (const phys of order) {
    if (phys === "right" && fitsRight) {
      return { left: toRight, top: sideTop, side: rtl ? "start" : "end", tip: sideTip };
    }
    if (phys === "left" && fitsLeft) {
      return { left: toLeft, top: sideTop, side: rtl ? "end" : "start", tip: sideTip };
    }
  }

  const left = clamp(cx - card.width / 2, VIEW_MARGIN, view.width - card.width - VIEW_MARGIN);
  const tip = clamp(cx - left, TIP_INSET, card.width - TIP_INSET);
  const below = bottom + CARD_GAP;
  if (below + card.height <= view.height - VIEW_MARGIN) return { left, top: below, side: "below", tip };
  const above = anchor.top - CARD_GAP - card.height;
  return { left, top: Math.max(VIEW_MARGIN, above), side: "above", tip };
}
