import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { GUIDE_PRIORITY, isGuideId, type GuideId } from "./guides";
import { browserPlatform, guessDevice, type InputDevice } from "./device";

/** localStorage key. Bump the suffix only if the stored shape changes in a way
 *  old data can't be read as; a new guide id needs no bump (unknown ids are
 *  dropped on read, missing ones are simply unseen). */
export const GUIDES_STORAGE_KEY = "done:guides:v1";

interface Persisted {
  seen: GuideId[];
  /** Only a device the person picked themselves is remembered. A guess or a
   *  wheel classification is re-derived every visit. */
  device?: InputDevice;
  /** The help panel has been opened at least once: its button stops
   *  pulsing for good. */
  helpOpened?: boolean;
}

/** The slice of `Storage` this module uses, so tests can pass a fake. */
export type GuideStorage = Pick<Storage, "getItem" | "setItem">;

export function readPersisted(storage: GuideStorage | null): Persisted {
  try {
    const raw = storage?.getItem(GUIDES_STORAGE_KEY);
    if (!raw) return { seen: [] };
    const parsed = JSON.parse(raw) as Partial<Persisted> | null;
    const seen = Array.isArray(parsed?.seen) ? parsed.seen.filter(isGuideId) : [];
    const device = parsed?.device === "mouse" || parsed?.device === "trackpad" ? parsed.device : undefined;
    return { seen: [...new Set(seen)], device, helpOpened: parsed?.helpOpened === true || undefined };
  } catch {
    // Private browsing, blocked site data, or a hand-edited value: start clean.
    return { seen: [] };
  }
}

function writePersisted(storage: GuideStorage | null, data: Persisted) {
  try {
    storage?.setItem(GUIDES_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Can't persist: guides still close for this session (the in-memory
    // `seen` is what decides), they just come back on the next visit.
  }
}

export type DeviceSource = "guess" | "input" | "user";

export interface GuideState {
  /** Shown and closed at least once. Persisted. */
  seen: GuideId[];
  /** Waiting for the current guide to close, highest priority first. */
  queue: GuideId[];
  /** The guide on screen, if any. Only one at a time. */
  active: GuideId | null;
  /** How the active guide opened. A step guide opened by its trigger closes
   *  itself once the person moves past the step; one reopened from the help
   *  panel stays until they close it. */
  activeSource: "trigger" | "replay";
  /** Guides that have a view to render. A request for anything else is
   *  ignored, so a trigger can be wired before its card exists without
   *  queueing an invisible guide that blocks the rest. */
  available: GuideId[];
  /** False on small screens and in live rooms: nothing is requested or shown. */
  enabled: boolean;
  device: InputDevice;
  deviceSource: DeviceSource;
  /** The help panel is open. Not persisted. */
  helpOpen: boolean;
  helpOpened: boolean;

  request: (ids: GuideId | GuideId[]) => void;
  /** Close the active guide and mark it seen; the next queued one opens. */
  dismiss: () => void;
  /** Open a guide from the help panel, seen or not. */
  replay: (id: GuideId) => void;
  setAvailable: (ids: GuideId[]) => void;
  setEnabled: (enabled: boolean) => void;
  setDevice: (device: InputDevice, source: DeviceSource) => void;
  setHelpOpen: (open: boolean) => void;
}

export function createGuideStore(storage: GuideStorage | null, guessedDevice: InputDevice) {
  const initial = readPersisted(storage);
  const persist = (s: Pick<GuideState, "seen" | "device" | "deviceSource" | "helpOpened">) =>
    writePersisted(storage, {
      seen: s.seen,
      device: s.deviceSource === "user" ? s.device : undefined,
      helpOpened: s.helpOpened || undefined,
    });

  const byPriority = (a: GuideId, b: GuideId) => GUIDE_PRIORITY[a] - GUIDE_PRIORITY[b];

  return createStore<GuideState>()((set, get) => ({
    seen: initial.seen,
    queue: [],
    active: null,
    activeSource: "trigger",
    available: [],
    enabled: true,
    device: initial.device ?? guessedDevice,
    deviceSource: initial.device ? "user" : "guess",
    helpOpen: false,
    helpOpened: initial.helpOpened === true,

    request: (ids) => {
      const s = get();
      if (!s.enabled) return;
      const wanted = (Array.isArray(ids) ? ids : [ids]).filter(
        (id) => s.available.includes(id) && !s.seen.includes(id) && s.active !== id && !s.queue.includes(id),
      );
      if (wanted.length === 0) return;
      const queue = [...s.queue, ...new Set(wanted)].sort(byPriority);
      if (s.active) set({ queue });
      else set({ active: queue[0], activeSource: "trigger", queue: queue.slice(1) });
    },

    dismiss: () => {
      const s = get();
      if (!s.active) return;
      const seen = s.seen.includes(s.active) ? s.seen : [...s.seen, s.active];
      // A queued guide may have been seen meanwhile (replayed from help).
      const queue = s.queue.filter((id) => !seen.includes(id));
      set({ seen, active: queue[0] ?? null, activeSource: "trigger", queue: queue.slice(1) });
      persist({ ...get() });
    },

    replay: (id) => {
      const s = get();
      if (s.active === id) return;
      // Whatever was open goes back to the front of the line, unseen.
      const queue = s.active ? [s.active, ...s.queue.filter((q) => q !== id)] : s.queue.filter((q) => q !== id);
      set({ active: id, activeSource: "replay", queue });
    },

    setAvailable: (ids) => set({ available: [...new Set(ids)] }),

    setEnabled: (enabled) => {
      if (enabled === get().enabled) return;
      // Disabling drops what's pending rather than holding it: those triggers
      // fire again the next time their step starts.
      set(enabled ? { enabled } : { enabled, active: null, queue: [] });
    },

    setDevice: (device, source) => {
      const s = get();
      // The person's own choice always wins. The first real scroll corrects a
      // guess once; after that the classifier doesn't flip it back and forth
      // (a smooth-scroll mouse can read as either).
      if (source !== "user" && s.deviceSource !== "guess") return;
      if (device === s.device && source === s.deviceSource) return;
      set({ device, deviceSource: source });
      if (source === "user") persist({ ...get() });
    },

    setHelpOpen: (open) => {
      const s = get();
      if (open === s.helpOpen) return;
      if (open && !s.helpOpened) {
        set({ helpOpen: true, helpOpened: true });
        persist({ ...get() });
      } else {
        set({ helpOpen: open });
      }
    },
  }));
}

function browserStorage(): GuideStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let singleton: ReturnType<typeof createGuideStore> | null = null;

/** The app's guide store. Created on first use in the browser, so the device
 *  guess and the stored flags are read client-side, never during SSR. */
export function guideStore() {
  if (!singleton) {
    singleton = createGuideStore(browserStorage(), guessDevice(browserPlatform()));
  }
  return singleton;
}


export function useGuides<T>(selector: (s: GuideState) => T): T {
  return useStore(guideStore(), selector);
}
