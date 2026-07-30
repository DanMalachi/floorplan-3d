# Request to Phase 5: Track V pairing needs a rough `mm_per_unit` earlier than Phase 5 currently produces it

**Status: proposal only. Nothing built, nothing simulated. Phase 5's scope to accept, defer, or reject.**
**Raised from:** Phase 2 / Track V milestone 2 step 3a, gate verdict NOT MET (`reports/phase-2-gate.md`).
**Date:** 2026-07-30.

## The problem in one paragraph

`extraction/trackv/pair.py` bounds two physical quantities as fractions of the **page diagonal**:

| constant | intent | actual value on this corpus |
|---|---|---|
| `MAX_THICKNESS_SEARCH_FRAC = 0.25` | how far to look for a wall's opposite face | **4077mm (15x30) / 6327mm (30x50)** against a real wall thickness of ~150mm — 27–42× oversized |
| `MIN_CANDIDATE_LENGTH_FRAC = 0.01` | shortest line that could be a wall face | **163mm (15x30) / 253mm (30x50)** |

A wall is ~150mm thick whether it is drawn on A4 or on a wall-sized plot. **Sizing a physical object as a fraction of sheet geometry cannot be correct across plans of differing scale or zoom.** This is not mistuning — it is wrong by construction, and it is the measured root of the phase's largest fault (the pair-search window admitting distant unrelated parallel lines as wall faces).

## Why Phase 2 could not simply fix it

Because pairing has no scale to reason with. The frozen schema is explicit:

```
units: { system: "plan_units", mm_per_unit: None, scale_confidence: 0.0 }
```

`mm_per_unit` is `None` at pair time by design — **scale recovery is Phase 5's job, entirely downstream of Track V.** Pairing therefore has no choice but to express physical bounds in page-relative terms. This is a genuine cross-phase ordering dependency, not a Phase 2 oversight.

The two factorials that simulated a physical window (`WALL_THICKNESS_MAX_MM = 500`) could only do so by borrowing the GT-derived scale, which a real run does not have. Those simulations are therefore evidence about the *mechanism*, not a shippable fix.

## What is being asked

**Not** full scale recovery, and not earlier than it can be done honestly. Only a **rough** `mm_per_unit` — good to a factor of ~2 would already collapse a 27–42× error — available **before** pairing runs.

## Proposed source, and the legitimacy line that constrains it

The line matters more than the proposal, because Phase 2 has a named anti-pattern that a careless scale proxy would walk straight into (`reports/phase-2-gate.md`, "self-certifying guard": *any threshold calibrated on the population it filters certifies whatever the pipeline produces*).

- **Legitimate — upstream of pairing:** statistics taken from `select.py`'s raw ink, e.g. a **modal stroke width** or a **modal parallel-separation** over the selected axis-aligned population. Pairing has not happened yet, so these cannot be contaminated by pairing's own errors.
- **NOT legitimate — downstream of pairing:** recovered wall thickness, wall-candidate geometry, or anything derived from paired output. Using these to bound pairing would repeat the anti-pattern exactly, and the phase has two live instances of it already.

A modal parallel-separation proxy is the more promising of the two, because a drafted plan's most common parallel-line separation over axis-aligned ink is plausibly the wall thickness itself — but **this is untested, unsimulated, and stated here as a direction, not a design.**

## Interaction Phase 5 should know about

Phase 2's gate verdict is NOT MET regardless of this request (F1 ceiling ~0.65 vs a 0.99 bar even with both in-reach walls fixed perfectly), and **the two walls a window fix recovers are then destroyed downstream by `_collinear_merge`** — see the gate report's window reconciliation section. So an early scale would remove a real structural fault but would **not** on its own move Phase 2's headline metric. It should be judged as architectural debt repayment with cross-phase value, not as a Phase 2 rescue.

## Decision requested

1. Does a rough pre-pairing scale belong in Phase 5's scope, pulled forward into Phase 2, or neither?
2. If it belongs somewhere: does the select-stage proxy above satisfy Phase 5's accuracy needs, or does Phase 5 want to own the estimate itself and expose it earlier?
