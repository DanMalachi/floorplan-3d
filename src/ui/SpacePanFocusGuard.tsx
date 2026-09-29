"use client";

import { useEffect } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import { PAN_MODIFIER_CODE } from "@/viewport3d/camera/inputVocabulary";

/** Marks the element that hosts the 3D viewport's <canvas>. */
export const VIEWPORT_HOST_ATTR = "data-viewport-host";

const BUTTON = "button, [role='button']";

/**
 * Space+left-drag pans the 3D camera, but CameraRig (protected) ignores Space
 * whose target is a button — correctly, since Space activates a focused
 * button. The trap: click a mode or dock button with the mouse, move onto the
 * view, hold Space, and the button still has focus. The pan never starts and
 * the button fires instead. First-time users hit this in usability sims.
 *
 * This guard runs before CameraRig (window CAPTURE vs bubble) and only when
 * all of these hold, so keyboard users keep Space-activates-button:
 *   - the pointer is over the 3D canvas itself, not over a dock or panel;
 *   - the focused element is the button the POINTER last pressed, and no
 *     other key has been pressed since. `:focus-visible` can't tell us this:
 *     Chrome turns it on for the focused button on the keydown itself;
 *   - the camera would accept a pan (not trace, walkthrough or a gesture).
 * It then cancels the key, drops focus, and re-sends Space from <body>, which
 * CameraRig accepts. The key-up and repeats land on <body> naturally.
 */
export function SpacePanFocusGuard() {
  useEffect(() => {
    let pointerPressed: Element | null = null;
    const onPointerDown = (event: PointerEvent) => {
      pointerPressed = (event.target as Element | null)?.closest(BUTTON) ?? null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== PAN_MODIFIER_CODE || !event.isTrusted) {
        pointerPressed = null;
        return;
      }
      const button = (event.target as Element | null)?.closest(BUTTON) as HTMLElement | null;
      if (!button || button !== pointerPressed) return;
      const canvas = document.querySelector(`[${VIEWPORT_HOST_ATTR}] canvas`);
      if (!canvas?.matches(":hover")) return;
      const scene = useSceneStore.getState();
      if (scene.gestureBase || scene.walkthroughActive || scene.appMode === "trace") return;

      event.preventDefault();
      event.stopImmediatePropagation();
      pointerPressed = null;
      button.blur();
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: event.code,
          key: event.key,
          repeat: event.repeat,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);
  return null;
}
