"use client";

// One hover implementation for the whole app.
//
// The Plan Dock is styled with inline style objects, so `:hover` is simply not
// available — a style object cannot express a pseudo-class. Before this hook
// exactly ONE control in the product had hover feedback (the back-to-library
// button in src/ui/ProjectBar.tsx), because it was the only one that had gone
// to the trouble of holding the state by hand. Everything else was inert under
// the cursor.
//
// So the hook is that button's pattern, extracted verbatim rather than
// redesigned: hold a boolean, and let the caller pick two coordinated values
// from it. `pdIconBtn` / `pdChip` / `pdGhostBtn` in tokens.ts already declare
// the transition, so a caller usually only has to thread `hovered` in.
//
// Focus is folded into the same boolean on purpose. A keyboard user tabbing
// through the dock should get the same affordance a mouse user gets, and
// keeping it as one flag means call sites cannot accidentally style one and
// forget the other.

import { useMemo, useState } from "react";

export interface HoverBind {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * `const [hovered, hoverBind] = useHover();`
 *
 * Spread `hoverBind` onto the interactive element and pass `hovered` to
 * whichever token helper is styling it.
 */
export function useHover(): [boolean, HoverBind] {
  const [hovered, setHovered] = useState(false);
  // Stable identity so spreading this onto an element does not hand it four
  // new function props on every render of the parent.
  const bind = useMemo<HoverBind>(
    () => ({
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setHovered(true),
      onBlur: () => setHovered(false),
    }),
    [],
  );
  return [hovered, bind];
}
