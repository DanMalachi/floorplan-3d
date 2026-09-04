"use client";

// The camera offer chip (P3a): when the armed tool's surface is unworkable
// from the current view, one pill offers to fix it. Nothing moves until the
// user clicks it or presses Enter — see camera/offerPolicy.ts for the rules
// this renders, and why "offer, never seize" is load-bearing rather than
// decorative.
//
// Module-level pub/sub rather than a store slice, exactly like toast.tsx next
// door and for the same reason: this is transient UI state, not scene state,
// and it has no business in undo/redo or persistence. The publisher lives
// inside the Canvas (CameraOfferRig, which is where `controls` is reachable);
// this host renders in the DOM overlay beside PdToastHost.

import { useEffect, useState } from "react";
import { PD, pdGlass, pdIconBtn } from "./tokens";
import { useHover } from "./useHover";
import { CloseIcon } from "./icons";
import { ACCEPT_KEY } from "@/viewport3d/camera/offerPolicy";

export interface CameraOffer {
  label: string;
  reason: string;
  /** Applies the remedy. Closes over the live `controls`, which is why the
   *  rig publishes this rather than the host reaching for it. */
  accept: () => void;
  dismiss: () => void;
}

type Listener = (o: CameraOffer | null) => void;
const listeners = new Set<Listener>();
let current: CameraOffer | null = null;

/** Publish (or clear) the offer. No-op if no host is mounted. */
export function setCameraOffer(o: CameraOffer | null) {
  current = o;
  for (const l of listeners) l(o);
}

/** Bottom-center pill, sitting directly above PdToastHost's slot.
 *
 *  Same glass recipe and the same corner of the screen as the toast — the eye
 *  is already there, because the user just clicked a dock card to arm the
 *  tool. Not the toast component itself, though: a toast auto-dismisses after
 *  2.2s and ignores the pointer, and this one has to persist and be clickable.
 *  Sibling, not variant. */
export function CameraOfferChip() {
  const [offer, setOffer] = useState<CameraOffer | null>(current);
  // Two independent flags rather than one per-button component: this chip
  // renders nothing but the two buttons, so a re-render here is the buttons.
  const [acceptHovered, acceptHover] = useHover();
  const [dismissHovered, dismissHover] = useHover();

  useEffect(() => {
    listeners.add(setOffer);
    return () => {
      listeners.delete(setOffer);
    };
  }, []);

  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.code !== ACCEPT_KEY) return;
      e.preventDefault();
      offer.accept();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offer]);

  if (!offer) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 140, // above PdToastHost's 96, so a toast never covers this
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 61,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px 8px 16px",
        whiteSpace: "nowrap",
        ...pdGlass({ borderRadius: 999 }),
      }}
    >
      {/* The obstacle on the left, the action on the right. The label is not
          repeated here — the button is the thing that says what happens, and
          printing the verb twice makes a two-word chip read like a warning. */}
      <span style={{ fontSize: 12.5, color: PD.textPrimary }}>{offer.reason}</span>
      <button
        {...acceptHover}
        onClick={offer.accept}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          border: "none",
          cursor: "pointer",
          borderRadius: 999,
          padding: "6px 12px",
          fontFamily: PD.fontUi,
          fontSize: 12,
          fontWeight: 600,
          background: PD.accentTint,
          color: PD.accentText,
          // The accent tint is already the rest state, so hover rings it
          // rather than deepening it — a deeper tint on an already-tinted
          // primary action reads as "pressed", not "under the cursor".
          boxShadow: acceptHovered ? `0 0 0 1.5px ${PD.accent}` : "none",
          transition: "box-shadow 140ms ease",
        }}
      >
        {offer.label}
        <kbd
          style={{
            fontFamily: PD.fontUi,
            fontSize: 10.5,
            opacity: 0.75,
            border: `1px solid ${PD.accentText}`,
            borderRadius: 4,
            padding: "0 4px",
          }}
        >
          ⏎
        </kbd>
      </button>
      <button {...dismissHover} onClick={offer.dismiss} aria-label="Dismiss" title="Dismiss" style={pdIconBtn(false, 26, dismissHovered)}>
        <CloseIcon size={13} />
      </button>
    </div>
  );
}
