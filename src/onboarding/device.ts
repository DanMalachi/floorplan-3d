import { classifyWheelSource, type WheelSignal } from "@/viewport3d/camera/inputVocabulary";

/** What the person moves the view with. Decides which gestures the guides and
 *  the help panel teach: right-drag and the wheel, or two-finger swipe and
 *  pinch. */
export type InputDevice = "mouse" | "trackpad";

/** First guess before any input: a Mac most likely means a trackpad. The
 *  first scroll corrects it (see `deviceFromWheel`), and the person can always
 *  switch it themselves on the card. */
export function guessDevice(platform: string): InputDevice {
  return /mac/i.test(platform) ? "trackpad" : "mouse";
}

export function browserPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform ?? navigator.platform ?? "";
}

/** Reuses the camera's own classifier, so the guide and the camera always
 *  agree on what a scroll was. A pinch (ctrlKey) is a trackpad whatever its
 *  deltas look like — Ctrl+wheel on a mouse is rare enough not to matter. */
export function deviceFromWheel(e: WheelSignal): InputDevice {
  if (e.ctrlKey) return "trackpad";
  return classifyWheelSource(e);
}
