# Project Vision

> This is the north star for the project. Every architectural and research
> decision should be justified against it. It sits **above** the tactical
> docs (`perception-data-strategy.md`, `technical-summary.md`, etc.) — those
> describe *how we are currently pursuing* this goal, not the goal itself.

## The vision (this never changes)

**Create the best editable 3D home design experience — one a user can trust.**

You upload a floorplan, and moments later you are walking around your own home in
3D, reshaping it, furnishing it, making it yours. The destination is the *design
experience* itself — direct-manipulation Build Mode, calm and precise, joyful to
use. That experience is specified concretely in
[`phase4-3d-sims-engine.md`](phase4-3d-sims-engine.md) (Build Mode) and
[`phase5-trace-experience.md`](phase5-trace-experience.md).

This is the destination. It is **not** a milestone, and it is **not** "Phase 2."
Everything else in this repo exists to serve it.

## The current bottleneck (this is today's mission)

**Automatically and faithfully understand the uploaded floorplan.**

Perception is where we spend our effort right now — not because it is the product,
but because it is the hardest blocker between a user and a magical experience.
Without automatic understanding, the product isn't magical; it's a tracing tool.

So we treat perception as a **bottleneck to remove, not a benchmark to win**:

- Perception serves the product. If perception work ever *degrades* the product —
  e.g. it takes 30 seconds longer to save a trivial amount of manual correction —
  we optimize for the product, not the perception score.
- **We define the design experience in parallel with the perception work**, so
  that perception decisions are always driven by product needs. The failure mode
  we are guarding against is building "the world's best wall detector" while
  forgetting the actual product.

Given a floorplan, the system should:

1. **Detect** architectural elements automatically.
2. **Understand** their geometric and semantic relationships.
3. **Reconstruct** an accurate, editable 3D home.
4. **Ask for human input only when confidence is genuinely low.**

## The real bar: trust, not just automation

Automation is the means. **Trust is the goal.**

> A user should be able to upload a floorplan and trust that the generated 3D home
> is a faithful representation of the real one — **without having to verify every
> wall, door, or window.**

That is what all of the discipline below is really about. We are not chasing
automation for its own sake; we want the user to feel confident that what they
see is *their home*.

Two consequences of that trust bar shape everything we build:

- **Generalization over tuning.** We never optimize against a plan we have
  already seen. The held-out benchmark (`eval/corpus.jsonl`, `split=benchmark`)
  is the only score that counts. Plan-specific heuristics that don't transfer
  are regressions, not progress — because a system that only works on plans it
  has seen cannot be trusted on the plan the user actually uploads.
- **Measured autonomy.** "Less human intervention" is a number, not a vibe.
  The system must expose a **calibrated per-element confidence**, and we must
  track **how often a human has to intervene** — not just element recall/F1.
  These two signals (confidence + intervention rate) are a first-class goal,
  because trust you can't measure is trust you can't ship.

## The technology is invisible

The user should **never feel like they are operating an AI system.** The
experience is:

> Upload plan. → Wait a moment. → Walk around your home. → Start designing.

It is emphatically **not**:

> Review detections. → Accept walls. → Fix doors. → Confirm windows. → Generate model.

Those are two completely different products. When perception is uncertain, the
correction should feel like editing your home — not auditing a machine. The
trace/repair tools are a *fallback that stays out of the way*, not the main event.

## How today's work maps to the vision

The app is currently **trace-first**: a human traces walls, doors, windows, and
rails, and we reconstruct 3D. That is scaffolding for the destination, not the
destination itself. Under this vision it reframes:

| Vision layer | Today | Direction |
|---|---|---|
| **The product** — editable 3D home design | 3D scene you can edit (early Build Mode) | Deepen into the full Build Mode experience (phase 4/5) |
| Detect elements (bottleneck) | Human traces them | Auto-detect; tracing becomes the *invisible, low-confidence fallback* |
| Understand relationships | Building Knowledge Layer v1 (rooms get meaning) | Deepen semantic + geometric reasoning |
| Reconstruct | 2D trace → 3D scene | Keep, but drive it from trustworthy auto-detection |
| Human-in-the-loop | Human does everything | Human corrects only when confidence is low — and it feels like designing, not auditing |

So **the editable 3D home design experience is the product; automatic
understanding is the enabling technology that makes it trustworthy and magical.**
Perception feeds the product — the product is not a downstream output of
perception.

## Guardrails already in place

- **Benchmark firewall** (`bench.ts --check-firewall`): benchmark and
  non-trainable plans can never leak into a training set. Protects the
  integrity of the "unseen accuracy" measurement — and therefore the trust bar.
- **Data-rights governance** (`docs/DATA_RIGHTS.md`): provenance and training
  rights are tracked per plan.

## Current honest baseline (held-out, 4 plans)

```
walls 83%   rails 43%   doors 88%   windows 80%   wallLenF1(H) 59%
```

Weakest links: **rails (no auto-detect yet)** and **wall-length precision**.
Missing entirely: **confidence calibration** and **intervention-rate** metrics —
the two signals the trust bar depends on.
