# Project Vision

> This is the north star for the project. Every architectural and research
> decision should be justified against it. It sits **above** the tactical
> docs (`perception-data-strategy.md`, `technical-summary.md`, etc.) — those
> describe *how we are currently pursuing* this goal, not the goal itself.

## Goal

**Build a system that can automatically understand architectural floorplans
with near-human accuracy.**

The system should generalize across **drawing styles, countries, languages, and
scan quality** without relying on plan-specific tuning or templates.

Given a floorplan, it should:

1. **Detect** architectural elements automatically.
2. **Understand** their geometric and semantic relationships.
3. **Reconstruct** an accurate digital representation of the building.
4. **Produce** reliable downstream outputs (3D models, BIM, measurements, etc.).
5. **Require human input only when confidence is genuinely low.**

## Definition of success

> Success is **not** measured by how well the system performs on known plans.
> It is measured by how accurately it understands **previously unseen**
> floorplans while requiring **progressively less human intervention**.

Two consequences of this definition shape everything we build:

- **Generalization over tuning.** We never optimize against a plan we have
  already seen. The held-out benchmark (`eval/corpus.jsonl`, `split=benchmark`)
  is the only score that counts. Plan-specific heuristics that don't transfer
  are regressions, not progress.
- **Measured autonomy.** "Less human intervention" is a number, not a vibe.
  The system must expose a **calibrated per-element confidence**, and we must
  track **how often a human has to intervene** — not just element recall/F1.
  Building these two signals (confidence + intervention rate) is a first-class
  goal, because without them the second half of our success criterion is
  unmeasurable.

## How today's work maps to the vision

The app is currently **trace-first**: a human traces walls, doors, windows, and
rails, and we reconstruct 3D. Under this vision, that reframes:

| Vision layer | Today | Direction |
|---|---|---|
| Detect elements | Human traces them | Auto-detect; tracing becomes the *low-confidence fallback* |
| Understand relationships | Building Knowledge Layer v1 (rooms get meaning) | Deepen semantic + geometric reasoning |
| Reconstruct | 2D trace → 3D scene | Keep, but drive it from auto-detection |
| Downstream outputs | 3D model | One of several: 3D **+** BIM, measurements, … |
| Human-in-the-loop | Human does everything | Human corrects only when confidence is low |

So **3D is not the product — understanding is.** 3D is one downstream output of
an accurate digital reconstruction.

## Guardrails already in place

- **Benchmark firewall** (`bench.ts --check-firewall`): benchmark and
  non-trainable plans can never leak into a training set. Protects the
  integrity of the "unseen accuracy" measurement.
- **Data-rights governance** (`docs/DATA_RIGHTS.md`): provenance and training
  rights are tracked per plan.

## Current honest baseline (held-out, 4 plans)

```
walls 83%   rails 43%   doors 88%   windows 80%   wallLenF1(H) 59%
```

Weakest links: **rails (no auto-detect yet)** and **wall-length precision**.
Missing entirely: **confidence calibration** and **intervention-rate** metrics.
