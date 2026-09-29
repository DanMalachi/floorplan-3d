// The "single-key shortcuts" setting (WCAG 2.1.4, level A, so inside IS 5568).
//
// A shortcut that is one letter, number or symbol with no Ctrl/Cmd/Alt fires
// whenever someone using voice control says a word containing it. 2.1.4 asks
// for a way to turn such shortcuts off, unless they only work while their own
// control has focus. The editor's window-wide ones are: 1-4 (modes), E
// (eyedropper), ? (help), and W/A/S/D , . T F (camera). R (rotate) and Delete
// are exempt: the 3D view handles them only while it has focus. Walkthrough's
// W/A/S/D are exempt too: they act only while you are walking.
//
// On by default. The choice is per browser (`localStorage`), and reading it
// can fail (private windows), in which case the shortcuts stay on.

import { useSyncExternalStore } from "react";

const KEY = "done:singleKeys:v1";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

let on: boolean | null = null;
const listeners = new Set<() => void>();

/** Whether single-key shortcuts should act. Call inside the key handler, not
 *  at setup, so a change applies at once. */
export function singleKeysOn(): boolean {
  if (on === null) on = typeof window === "undefined" ? true : read();
  return on;
}

export function setSingleKeysOn(next: boolean) {
  on = next;
  try {
    if (next) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    // Kept for this visit only.
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useSingleKeysOn(): boolean {
  return useSyncExternalStore(subscribe, singleKeysOn, () => true);
}
