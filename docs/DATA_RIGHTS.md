# Data rights ledger

_Every plan and dataset we touch, with its rights status and permitted use. This is the
governance record that keeps the shipped product legally clean. See
[perception-data-strategy.md](./perception-data-strategy.md) for the licensing analysis._

## Rules

1. **Two splits, strictly separated.** `benchmark` = held-out, rights-owned, the honest
   measure of progress; it is NEVER used to tune or train. `dev` = plans we iterate
   against by hand (already "contaminated" — cannot be an honest benchmark).
2. **`trainable` flag.** A plan may enter a training set only if `trainable: true`
   (we own it or hold a commercial license). Everything else is eval-only.
3. **Firewall (enforced).** `npx tsx scripts/eval/bench.ts --check-firewall <train.jsonl>`
   fails if any `benchmark` or `trainable:false` plan (by sha256) appears in a training
   manifest. Run it before any training job.
4. **External datasets** are recorded below with their license and permitted use. A
   non-commercial dataset may be used for offline analysis only — never as a training
   input to shipped weights, never redistributed.

## Corpus plans (`eval/corpus.jsonl`)

| id | source | split | rights | trainable | note |
|---|---|---|---|---|---|
| 20x45-cad | house-plan PDF found online | dev | unverified | ❌ | eval only |
| 15x30-cad | house-plan PDF found online | dev | unverified | ❌ | eval only |
| 30x50-cad | house-plan PDF found online | dev | unverified | ❌ | eval only |
| matterport-scan | Matterport sample plan | dev | unverified | ❌ | eval only |
| 1350-scan | house-plan scan found online | dev | unverified | ❌ | eval only |
| 732-graypoche | social-media photo, user-supplied | dev | unverified | ❌ | eval only |

All six current plans are `dev` and `trainable:false`: they were collected ad-hoc (found
online / social media) with no verified rights, and all have been hand-tuned against. They
are fine as a working dev signal but are **not** an honest benchmark and must not train a
shipped model. The real `benchmark` split starts empty and is grown with rights-owned plans
(Workstream 4): real plans representing customer uploads, for which we record explicit
permission here before adding.

## External datasets

| dataset | license | permitted use here |
|---|---|---|
| ResPlan | MIT | ✅ trainable (commercial) + benchmark-analysis |
| ProcTHOR-10k | Apache 2.0 | ✅ trainable (3D scenes, not plan images) |
| CubiCasa5K | CC BY-NC 4.0 | offline analysis only — NOT trainable, not shipped |
| FloorPlanCAD | CC BY-NC 4.0 | offline analysis only — NOT trainable, not shipped |
| RPLAN | research-only, no redistribution | do not use |
| Architect (YOLOv8 weights) | CC BY-NC 4.0 | do not ship |
| zimhe/pseudo-floor-plan-12k | unverified | do not use until license confirmed |

## Tracing conventions

- **Balcony / terrace railings → trace as `rail`** (the Rail tool in the Walls step),
  not as walls or openings. A rail is a low, see-through barrier that bounds an OUTDOOR
  space. Trace the exposed balcony edges as rails; the wall SHARED with the apartment
  stays a `wall`, with its sliding glass door traced as a normal door/window opening on
  it. Rails bound rooms exactly like walls, so this closes the balcony as a room.
  (Matches ResPlan's `balcony` element class → schema-compatible with our training data.)

## Adding a rights-owned real plan to the benchmark
1. Obtain and record explicit permission (owner, date, scope) in this file.
2. Trace its GT in-app (TraceRail → Ground truth) → `floorplan-gt/<name>.gt.json`.
3. Add a line to `eval/corpus.jsonl` with `split:"benchmark"`, `rights:"owned"`,
   `trainable:false` (benchmark is never trained on), and the file's `sha256`.
4. Never expose benchmark plans to any training pipeline (the firewall enforces this).
