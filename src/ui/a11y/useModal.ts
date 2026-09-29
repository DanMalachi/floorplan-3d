"use client";

// What every modal dialog in the editor needs, in one place: focus moves in
// when it opens, Tab and Shift+Tab stay inside it, Esc closes it (when that
// means something), everything behind it is `inert` so neither the keyboard
// nor a screen reader's browse mode can wander into the page underneath, and
// focus goes back where it came from when it closes.
//
// Before this there were four hand-rolled copies (projects gallery, welcome,
// sign-out confirmation, small-screen notice), each with a different subset:
// two trapped Tab, one returned focus, none made the page behind inert.

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest("[inert]"),
  );
}

/** Mark every sibling of `el` and of each of its ancestors inert, up to
 *  <body>. Returns the ones this call changed, to undo exactly those. */
function inertAround(el: HTMLElement): HTMLElement[] {
  const changed: HTMLElement[] = [];
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sib of Array.from<Element>(parent.children)) {
      if (sib === node || !(sib instanceof HTMLElement) || sib.inert) continue;
      // Scripts, styles and the like have nothing to reach; leave them be.
      if (sib instanceof HTMLScriptElement || sib instanceof HTMLStyleElement) continue;
      sib.inert = true;
      changed.push(sib);
    }
  }
  return changed;
}

export interface ModalOptions {
  /** False while the dialog isn't showing (for components that stay mounted). */
  open?: boolean;
  /** What gets focus on open. Defaults to the first focusable inside. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Esc. Leave out when the dialog has no "dismiss" (Esc then does nothing). */
  onEscape?: () => void;
  /** Where focus goes on close if the element it came from is gone. */
  returnFocusTo?: string;
}

/** `ref` is the element with role="dialog" (or the backdrop that wraps it):
 *  focus is kept inside it, and everything outside it is made inert. */
export function useModal(ref: RefObject<HTMLElement | null>, { open = true, initialFocus, onEscape, returnFocusTo }: ModalOptions = {}) {
  const escRef = useRef(onEscape);
  useEffect(() => {
    escRef.current = onEscape;
  });

  useEffect(() => {
    const root = ref.current;
    if (!open || !root) return;
    const cameFrom = document.activeElement as HTMLElement | null;
    const changed = inertAround(root);
    (initialFocus?.current ?? focusables(root)[0] ?? root).focus();

    // Esc bubbles up to here, so a control inside the dialog that uses Esc
    // itself (a rename field) can answer it first and stop it.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !escRef.current || e.defaultPrevented) return;
      e.preventDefault();
      escRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    // Tab in the capture phase: nothing else gets a say in where focus goes.
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onEscape);
      for (const el of changed) el.inert = false;
      const back =
        cameFrom && cameFrom.isConnected && cameFrom !== document.body
          ? cameFrom
          : returnFocusTo
            ? document.querySelector<HTMLElement>(returnFocusTo)
            : null;
      back?.focus();
    };
  }, [open, ref, initialFocus, returnFocusTo]);
}
