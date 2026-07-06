# Perception data strategy — licensing findings & the path to a legally-clean model

_Last updated 2026-07-06. This is the decision doc referenced by the benchmark plan.
It answers one question: which public floorplan data/models can we use in a **commercial**
product, and if the good ones can't be shipped, how do we build our own?_

## The iron constraint

The product is commercial. Anything whose license forbids commercial use is usable **only**
for offline learning/benchmarking/error-analysis — it can **never** be baked into shipped
model weights or redistributed. Every training input must be something we own or are
explicitly licensed to use commercially. The benchmark (how we measure progress) is kept
strictly separate from training data, and reflects the real market.

## Verified licensing (checked against each source's actual LICENSE, 2026-07-06)

| Source | Size / type | License (verified) | Ship in a commercial product? |
|---|---|---|---|
| **ResPlan** (m-agour/ResPlan) | 17k residential, **vector JSON + PNG**, walls/doors/windows/balconies + room labels + connectivity | **MIT** ✅ | **YES** — permissive, commercial OK |
| **ProcTHOR-10k** | procedural 3D scenes (not floorplan images) | Apache 2.0 ✅ | Yes, but not directly a plan-image dataset |
| **Our 3D engine (Phase 4)** | synthetic raster + exact GT, unlimited | we own it ✅ | **YES** — cleanest, unlimited |
| CubiCasa5K | 5k real raster, walls/rooms/icons | **CC BY-NC 4.0** ❌ | No — non-commercial |
| FloorPlanCAD | 15k real vector CAD, 30 symbol classes | **CC BY-NC 4.0** ❌ | No — non-commercial |
| RPLAN | 80k vector layouts | research-only, no redistribution ❌ | No |
| "Architect" YOLOv8 symbol model (HF) | pretrained weights | **CC BY-NC 4.0** ❌ | No |
| zimhe/pseudo-floor-plan-12k | synthetic raster + wall masks | unlisted ⚠️ | Unknown — do not depend on until verified |

## What this means (the headline)

1. **We are NOT forced entirely onto synthetic data.** ResPlan (MIT, 17k plans) is a
   genuinely commercial-usable, richly-labeled dataset. That's the single most useful
   finding — it gives us real-world layout variety we can legally train on and ship.
2. **The richest raster datasets (CubiCasa5K, FloorPlanCAD) are off-limits for shipping.**
   They may still be used *offline* to sanity-check our error analysis, but never as
   training inputs to shipped weights.
3. **ResPlan is vector/clean, not messy raster scans.** Our hard problem is messy raster
   (photos, scans, gray-poché). So ResPlan alone doesn't cover the domain — but combined
   with our own raster pipeline it does (next section).

## Recommended training-data plan (all legally clean)

The eventual learned perception layer (a wall/opening **mask proposer**, kept behind the
iron rule — mask → deterministic vectorize → regularize) should train on a blend we fully
own the rights to:

1. **ResPlan vectors → rendered to raster (MIT).** Render the 17k clean vector plans into
   raster images at varied styles/resolutions using our own renderer; the vectors give
   exact GT for free. This converts a commercial-usable *vector* set into commercial-usable
   labeled *raster* training data — exactly the domain we need.
2. **Synthetic from our 3D engine (owned).** The Phase-4 engine renders unlimited plans
   with exact geometry → exact GT. Vary wall styles (gray-poché, double-line, thin, filled)
   and add scan-like degradation (noise, blur, JPEG) to close the synthetic-to-real gap.
3. **Rights-cleared real plans (owned/licensed).** A growing set of real plans we have
   explicit permission to use — the highest-value but slowest source. Prioritise the
   styles our customers actually upload (gray-poché Israeli apartments first).

Style/degradation augmentation is what bridges "clean vector" and "messy photo" — the
domain gap, not the label quality, is the risk.

## What stays out of training (firewall)
- The **benchmark** split (held-out, honest measure of progress).
- Anything marked `trainable: false` in `eval/corpus.jsonl` (unverified rights).
- CubiCasa5K / FloorPlanCAD / RPLAN / Architect weights — NC or research-only.
Enforced by `npx tsx scripts/eval/bench.ts --check-firewall <train-manifest>` (hash match).

## Open items before committing to a model
- Verify zimhe/pseudo-floor-plan-12k license (only if we want more synthetic raster).
- Confirm ResPlan's raster renders match real-plan appearance closely enough to help the
  raster eyes (a small render+train spike once the benchmark can measure it).
- The hand-tune-vs-train decision itself stays deferred until the benchmark shows the
  raster eyes have plateaued under hand-tuning.

## Sources
- ResPlan: https://github.com/m-agour/ResPlan (MIT), https://arxiv.org/abs/2508.14006
- CubiCasa5K: https://github.com/CubiCasa/CubiCasa5k (CC BY-NC 4.0)
- FloorPlanCAD: https://floorplancad.github.io/ (CC BY-NC 4.0)
- RPLAN: http://staff.ustc.edu.cn/~fuxm/projects/DeepLayout/ (research-only)
- Architect model: https://huggingface.co/SamirShabani/Architect (CC BY-NC 4.0)
