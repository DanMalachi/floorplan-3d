"use client";

// Hover label for icon-only controls — per Dan's Phase-B review ("hovering
// over something states what it is"), needed now that room/section labels
// are icons instead of text.
//
// ── Why this replaced every `title` attribute (2026-09-04) ──────────────────
// This component always argued that a native `title` is "slow and
// browser-styled", but it only ever wrapped the dock's navigator, so ~30
// native titles kept shipping alongside it. Dan hit exactly the two failures
// that predicts: a white Chrome window that matches nothing in the app, and
// tooltips that say nothing ("View" telling you it is View). The redundant
// ones are now deleted outright and the informative ones come through here,
// so no `title` survives in app UI and no white window can appear.
//
// Three things had to change to carry that traffic:
//
//   1. A DELAY. Popping instantly is right for a navigator you are aiming at
//      and wrong for a dense inspector you are crossing — without it, sweeping
//      the panel strobes tooltips. 350ms is the compromise: fast enough to
//      still read as the control's label, slow enough that passing over
//      something never triggers it.
//   2. PLACEMENT. It was hard-coded above the control. The inspector is docked
//      at top:64 and the mode switcher at top:14, so "above" puts the tooltip
//      off the top of the window. `placement="bottom"` is for those.
//   3. LONG TEXT. `whiteSpace: nowrap` is fine for "Kitchen" and runs a
//      sentence off the side of the screen. The informative titles this now
//      carries are sentences, so it wraps at a measured width instead.
//
// It also adopts the child's accessible name. Deleting a `title` from an
// icon-only button would otherwise take that button's name away from screen
// readers — a silent accessibility regression — so the label is cloned onto
// the child as `aria-label` unless the child already names itself.

import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { PD } from "./tokens";

// No fade on appearance, deliberately. The delay below is what stops tooltips
// flashing as the cursor crosses a panel; once the user has actually waited
// 350ms, an animation only delays the answer further. It also keeps this
// component free of a @keyframes dependency in globals.css and means there is
// no `prefers-reduced-motion` case to handle.
const DEFAULT_DELAY = 350;

export function Tooltip({
  label,
  children,
  placement = "top",
  delay = DEFAULT_DELAY,
  maxWidth = 240,
}: {
  label: string;
  children: ReactNode;
  /** `bottom` for controls near the top of the window, where a tooltip above
   *  would be clipped — the inspector panel and the mode switcher. */
  placement?: "top" | "bottom";
  /** ms before showing. 0 shows immediately. */
  delay?: number;
  maxWidth?: number;
}) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const open = () => {
    cancel();
    if (delay <= 0) {
      setShow(true);
      return;
    }
    timer.current = setTimeout(() => setShow(true), delay);
  };
  const close = () => {
    cancel();
    setShow(false);
  };

  // A tooltip left hanging after the control unmounts (or after a click that
  // swaps the panel out) is the classic stuck-tooltip bug.
  useEffect(() => cancel, []);

  // Wrap rather than nowrap once the label is a sentence rather than a name.
  const isSentence = label.length > 28;

  // Keep the accessible name that the deleted `title` used to provide.
  const child =
    isValidElement(children) &&
    !(children.props as Record<string, unknown>)["aria-label"] &&
    !(children.props as Record<string, unknown>)["aria-labelledby"]
      ? cloneElement(children as React.ReactElement<Record<string, unknown>>, { "aria-label": label })
      : children;

  return (
    <span
      onMouseEnter={open}
      onMouseLeave={close}
      // Focus opens it with no delay: a keyboard user has already committed to
      // the control, so there is nothing to debounce.
      onFocus={() => setShow(true)}
      onBlur={close}
      // Clicking has answered the question the tooltip was going to answer, and
      // on a control that unmounts its own panel it would otherwise stick.
      onPointerDown={close}
      style={{ position: "relative", display: "inline-flex" }}
    >
      {child}
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            ...(placement === "top"
              ? { bottom: "calc(100% + 6px)" }
              : { top: "calc(100% + 6px)" }),
            left: "50%",
            transform: "translateX(-50%)",
            padding: isSentence ? "5px 9px" : "3px 8px",
            borderRadius: 6,
            background: "oklch(0.12 0.01 260 / 0.92)",
            backdropFilter: PD.glassBlur,
            WebkitBackdropFilter: PD.glassBlur,
            border: PD.glassBorder,
            color: PD.textPrimary,
            fontFamily: PD.fontUi,
            fontSize: 10.5,
            fontWeight: 500,
            lineHeight: isSentence ? 1.45 : 1,
            textAlign: isSentence ? "start" : "center",
            whiteSpace: isSentence ? "normal" : "nowrap",
            width: isSentence ? maxWidth : undefined,
            pointerEvents: "none",
            zIndex: 70, // above the inspector (60) and the camera offer (61)
            boxShadow: "0 4px 12px oklch(0 0 0 / 0.4)",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
