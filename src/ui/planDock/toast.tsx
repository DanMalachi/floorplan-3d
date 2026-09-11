"use client";

// Plan Dock toast system (P0). A one-line hint or rejection ("Wall tool isn't
// built yet", "Gap too small for a door", "Jumped to Decorate / Floors") that
// any new build-mode tool can fire without owning UI of its own and without a
// hook (arming code often runs from a plain click handler, not always inside
// a component). Module-level pub/sub instead of a store slice — toasts are
// transient UI noise, not scene state, and don't belong in undo/redo history
// or persistence.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PD, pdGlass } from "./tokens";

/** A toast is either words already resolved by its (React) caller, or a
 *  translation key for a caller that has no `t` of its own — see `pdToastKey`. */
type ToastEntry = { text: string } | { key: string; params?: Record<string, string | number> };
type Listener = (entry: ToastEntry) => void;
const listeners = new Set<Listener>();

const DURATION_MS = 2200;

/** Fire a transient PD-styled toast from anywhere: build tools, the eyedropper,
 *  the house-cutaway navigator, BuildToolbar. No-op if no <PdToastHost/> is
 *  mounted (there is exactly one, in Viewport). `msg` is already-translated
 *  words — the caller resolved them with its own `useTranslations`. */
export function pdToast(msg: string) {
  for (const l of listeners) l({ text: msg });
}

/** Same as `pdToast`, for callers that CANNOT call `useTranslations` because
 *  they aren't React components (the store, the eyedropper module) — same
 *  reasoning as useSceneStore's `ImportMsgKey`/`resolveImportMsg`: the caller
 *  names a key instead of words, and whatever has `t` (here, `PdToastHost`
 *  itself, which is already a component) turns it into words at render time.
 *  `key` is relative to the `editor.toast` namespace. */
export function pdToastKey(key: string, params?: Record<string, string | number>) {
  for (const l of listeners) l({ key, params });
}

/** Bottom-center glass pill, above the dock. Mount once near the Canvas root. */
export function PdToastHost() {
  const t = useTranslations("editor.toast");
  const [entry, setEntry] = useState<{ msg: string; key: number } | null>(null);

  useEffect(() => {
    let n = 0;
    const onMsg: Listener = (e) => {
      n += 1;
      setEntry({ msg: "text" in e ? e.text : t(e.key, e.params), key: n });
    };
    listeners.add(onMsg);
    return () => {
      listeners.delete(onMsg);
    };
  }, [t]);

  useEffect(() => {
    if (!entry) return;
    const t = window.setTimeout(() => setEntry(null), DURATION_MS);
    return () => window.clearTimeout(t);
  }, [entry]);

  if (!entry) return null;

  return (
    <div
      key={entry.key}
      // A11y: the toast is this app's whole confirmation channel — "Wall tool
      // armed", "Duplicated", "Jumped to Decorate · Floors", "Gap too small
      // for a door". It appeared and vanished with no announcement, so a
      // screen-reader user got no confirmation and, worse, no rejection
      // message. role="status" (implicitly aria-live="polite") reads it once
      // without interrupting. It stays pointer-events:none and unchanged
      // visually.
      role="status"
      style={{
        position: "absolute",
        bottom: 96, // clears BottomDock's 224px card rail and BuildToolbar
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        padding: "8px 16px",
        fontSize: 12.5,
        fontWeight: 500,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        ...pdGlass({ borderRadius: 999 }),
      }}
    >
      {entry.msg}
    </div>
  );
}
