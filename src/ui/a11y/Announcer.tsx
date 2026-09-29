"use client";

// One polite live region for the editor, and `announce()` to speak into it.
//
// A `role="status"` element that mounts WITH its text is often not read at
// all: screen readers watch a live region for changes, and one that appears
// already full has not changed. The guide cards, the struggle hints and the
// eyedropper pill all appear that way, so they speak through this region
// instead, which is mounted empty once and stays. Text stays in the region
// after the thing that said it goes, so a hint that fades after a few seconds
// is still read to the end.

import { useEffect, useState } from "react";

let speak: ((text: string) => void) | null = null;

/** Say `text` politely (after whatever is being read now). Repeating the same
 *  text is read again. A no-op when no `<Announcer>` is mounted. */
export function announce(text: string) {
  speak?.(text);
}

export function Announcer() {
  const [text, setText] = useState("");
  useEffect(() => {
    let timer = 0;
    speak = (next) => {
      // Clear, then set a moment later: the same text twice in a row is
      // otherwise no change and is not read. A timer, not a frame: a busy 3D
      // view can hold the next frame back long enough to lose the words.
      setText("");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setText(next), 50);
    };
    return () => {
      speak = null;
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" className="fp-sr-only">
      {text}
    </div>
  );
}
