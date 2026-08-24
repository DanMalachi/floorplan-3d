"use client";

// Hover label for icon-only controls — per Dan's Phase-B review ("hovering
// over something states what it is"), needed now that room/section labels
// are icons instead of text. A native `title` attribute works but is slow
// and browser-styled; this renders instantly and matches the dock's glass
// look.

import { cloneElement, isValidElement, useState, type ReactNode } from "react";
import { PD } from "./tokens";

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  // A11y: the bubble below is a HOVER affordance only — it never appears for a
  // keyboard user and, being rendered as a sibling, never becomes the wrapped
  // control's accessible name. So the same `label` is also stamped onto the
  // child as `aria-label` (unless the call site already set one). Without this
  // every icon-only control in the dock — the eleven room tabs, the four
  // section tabs, the eyedropper, the Build tools — is announced as bare
  // "button". Purely additive: nothing about how it renders changes.
  const labelled =
    isValidElement<{ "aria-label"?: string }>(children) && !children.props["aria-label"]
      ? cloneElement(children, { "aria-label": label })
      : children;
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: "relative", display: "inline-flex" }}
    >
      {labelled}
      {show && (
        <span
          // The text is already the child's accessible name (above); announcing
          // it a second time on hover would just duplicate it.
          aria-hidden
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "3px 8px",
            borderRadius: 6,
            background: "oklch(0.12 0.01 260 / 0.92)",
            color: PD.textPrimary,
            fontFamily: PD.fontUi,
            fontSize: 10.5,
            fontWeight: 500,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 50,
            boxShadow: "0 4px 12px oklch(0 0 0 / 0.4)",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
