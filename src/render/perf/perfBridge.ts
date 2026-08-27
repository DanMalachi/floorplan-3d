"use client";

import type { PerfSample } from "./perfStore";
import { perfEnabled } from "./usePerfEnabled";

/**
 * Automation tap for the Phase 0 HUD.
 *
 * The HUD renders every published sample as formatted text at 4 Hz, which is
 * right for a human reading a panel and wrong for a measurement harness: to get
 * numbers back out you would have to scrape rendered strings, re-parse "1.24M"
 * back into 1_240_000, and hope nobody ever changes a label. This exposes the
 * sample OBJECTS instead, so `scripts/perf/measure.ts` reads the same values the
 * panel does, unformatted and unrounded.
 *
 * Gated on the same `?perf=1` flag as the HUD itself, for the same reason stated
 * in `usePerfEnabled.ts` — an instrument that can be left switched on becomes
 * part of what later phases measure. With the flag absent this module installs
 * nothing and `window.__PERF__` stays undefined.
 *
 * Deliberately NOT the same channel as `perfStore`. The store is a
 * `useSyncExternalStore` source with one subscriber and a hard requirement that
 * its snapshot be reference-stable between notifications; an appending array
 * hung off it would violate that and freeze the HUD. This is a separate,
 * write-only ring that nothing in the app reads.
 */

export interface PerfBridge {
  /** Oldest-first, capped at `MAX_SAMPLES`. */
  samples: PerfSample[];
  /** Take everything buffered and reset. The harness calls this to discard the
   *  settling period between scenarios. */
  drain(): PerfSample[];
  clear(): void;
}

declare global {
  interface Window {
    __PERF__?: PerfBridge;
  }
}

/** ~17 minutes at the store's 4 Hz publish rate. Long enough that no realistic
 *  scenario overruns it, bounded so a harness left running overnight cannot
 *  turn the tap into the memory leak it exists to help find. */
const MAX_SAMPLES = 4000;

let installed = false;

function bridge(): PerfBridge | null {
  if (typeof window === "undefined") return null;
  if (!perfEnabled()) return null;

  if (!installed) {
    const samples: PerfSample[] = [];
    window.__PERF__ = {
      samples,
      drain() {
        const out = samples.slice();
        samples.length = 0;
        return out;
      },
      clear() {
        samples.length = 0;
      },
    };
    installed = true;
  }

  return window.__PERF__ ?? null;
}

/** Called from `publishPerfSample`, i.e. at the publish rate and never per
 *  frame — the cost of this is not in the frame budget being measured. */
export function pushBridgeSample(sample: PerfSample): void {
  const tap = bridge();
  if (!tap) return;

  tap.samples.push(sample);
  if (tap.samples.length > MAX_SAMPLES) {
    tap.samples.splice(0, tap.samples.length - MAX_SAMPLES);
  }
}
