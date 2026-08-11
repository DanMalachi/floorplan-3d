"use client";

// Eyedropper key handling + armed-state hint (Plan Dock P7). `E` toggles;
// Esc disarms. Capture-phase, same reason as WallTool/OpeningTool/
// MeasureTool's own listeners: Viewport's wrapper div handles Escape itself
// (and stops it from bubbling once it does), so a bubble-phase listener here
// could miss presses depending on focus. Inert while typing in an input/
// textarea — `E` is a letter someone types in the search box constantly.
//
// Mounted once from BottomDock (Decorate-only — Build has its own toolbar
// and no paint/floor brushes to sample into).

import { useEffect } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import { PD, pdGlass } from "@/ui/planDock/tokens";

export function EyedropperController() {
  const eyedropper = useSceneStore((s) => s.eyedropper);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (eyedropper) useSceneStore.getState().setEyedropper(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing) return;
      // e.code (physical key), not e.key: non-Latin layouts type a different
      // character on the same key and e.key matching dead-keys the shortcut.
      if (e.code === "KeyE") {
        const s = useSceneStore.getState();
        s.setEyedropper(!s.eyedropper);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [eyedropper]);

  if (!eyedropper) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 182, // clears BottomDock's 150px card rail + its 16px gap
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        padding: "6px 14px",
        fontSize: 11.5,
        fontFamily: PD.fontMono,
        color: PD.accentText,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        ...pdGlass({ borderRadius: 999 }),
      }}
    >
      Eyedropper armed — click furniture, a painted wall face, or a floor · Esc cancels
    </div>
  );
}
