"use client";

// Plan Dock toast system (P0). A one-line hint or rejection ("Wall tool isn't
// built yet", "Gap too small for a door", "Jumped to Decorate / Floors") that
// any new build-mode tool can fire without owning UI of its own and without a
// hook (arming code often runs from a plain click handler, not always inside
// a component). Module-level pub/sub instead of a store slice — toasts are
// transient UI noise, not scene state, and don't belong in undo/redo history
// or persistence.

import { useEffect, useState } from "react";
import { PD, pdGlass } from "./tokens";

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

const DURATION_MS = 2200;

/** Fire a transient PD-styled toast from anywhere: build tools, the eyedropper,
 *  the house-cutaway navigator, BuildToolbar. No-op if no <PdToastHost/> is
 *  mounted (there is exactly one, in Viewport). */
export function pdToast(msg: string) {
  for (const l of listeners) l(msg);
}

/** Bottom-center glass pill, above the dock. Mount once near the Canvas root. */
export function PdToastHost() {
  const [entry, setEntry] = useState<{ msg: string; key: number } | null>(null);

  useEffect(() => {
    let n = 0;
    const onMsg: Listener = (msg) => {
      n += 1;
      setEntry({ msg, key: n });
    };
    listeners.add(onMsg);
    return () => {
      listeners.delete(onMsg);
    };
  }, []);

  useEffect(() => {
    if (!entry) return;
    const t = window.setTimeout(() => setEntry(null), DURATION_MS);
    return () => window.clearTimeout(t);
  }, [entry]);

  if (!entry) return null;

  return (
    <div
      key={entry.key}
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
