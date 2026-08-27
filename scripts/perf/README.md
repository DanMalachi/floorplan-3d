# Perf measurement harness

Automated, repeatable, vsync-free frame measurement against a running dev server.

```bash
npm run dev                                              # in another terminal
npm run perf:measure -- --room de882e79                  # baseline, DPR 1
npm run perf:measure -- --room de882e79 --dpr 2          # 4x the fragments
npm run perf:measure -- --room de882e79 --only walk:still,walk:look
npm run perf:measure -- --room de882e79 --vsync          # control run
```

`--room` is the id from the project's `/v/<id>` URL. Results are written to
`scripts/perf/results/` as JSON and printed as a table.

`results/` is gitignored — every run lands there and most runs are scratch.
Reference runs worth keeping get promoted by hand into `baselines/`, which is
committed. Two are there now, both on the **unfurnished** house at 1730x883:
`2026-08-27-dpr1-unfurnished.json` and its DPR 2 twin. Diff a new run against
those to see what a change actually cost.

## Why it exists

The first hand readings of this workstream were taken on a 75 Hz display and
every one came back pinned to 13.3 ms — the refresh interval, not the app. With
vsync on and the deadline being met, `frameMs` cannot rank fill against draw
calls against CPU, which is the whole question Phase 0 exists to answer.

The harness launches Chromium with `--disable-gpu-vsync --disable-frame-rate-limit`
so frame period measures work again.

## Four things that will silently produce wrong numbers

1. **`headless: false` is not optional.** Headless Chromium falls back to
   SwiftShader and reports plausible numbers from a software rasteriser. The run
   asserts the unmasked renderer string and aborts on SwiftShader/llvmpipe.

2. **Do not cover the browser window mid-run.** A backgrounded tab has rAF
   throttled to zero. The launch flags disable the usual backgrounding paths,
   but an occluded window can still stall sampling.

3. **`frameloop="demand"` means an idle editor renders nothing.** Supplying
   synthetic input to provoke frames measures the *input cadence*, not the
   renderer — an early version of this script reported a confident 30 ms frame
   time that was really the interval between two dispatched mouse moves. The
   harness instead sets `?loop=always`, which mounts `PerfContinuousLoop`
   (`src/render/perf/PerfRig.tsx`) to re-invalidate every frame. Pass `--demand`
   to observe the app exactly as it ships, and treat frame timing as invalid
   there.

4. **Every scenario reloads the page first.** Walkthrough cannot be reliably
   exited by automation: the canvas covers the Scene panel and swallows pointer
   events aimed at the exit button, and Escape is consumed by the browser
   releasing pointer lock before the app's handler sees it. A scenario that
   silently ran in the wrong mode would report editor numbers under a
   walkthrough label, so the harness reloads rather than unwinds.

## Testing fill without a Mac

`--dpr 2` sets `deviceScaleFactor`, so `devicePixelRatio` reads 2 and the app's
own clamp (`contract.ts` `DPR = [1, 2]`) resolves to 2. No app change, no
protected-path edit. CSS layout is unchanged and the drawing buffer quadruples —
1.53 MP to 6.11 MP at the default viewport. Diff a `--dpr 1` run against a
`--dpr 2` run and the delta is fill cost, isolated.

## Reading the output

| column | meaning |
|---|---|
| `frame p50/p95` | rAF-to-rAF period. Valid only with a continuous loop. |
| `js p50` | main thread inside the R3F frame: every `useFrame` subscriber, the composer's pass chain, and GL submission. Excludes React render/commit and all GPU execution. |
| `js %` | `js p50 / frame p50`. Near 100% means CPU-bound; a small share means GPU-bound. |
| `renders` | `gl.render()` invocations per displayed frame — the composer's pass count. |
| `calls` / `tris` | draw calls and triangles per displayed frame. |
| `tri/call` | batching efficiency. Low values mean submission-bound by construction. |
| `heap swing` | peak-to-trough JS heap across the scenario — GC sawtooth, not a leak measure. |

## Scenarios

`editor:city`, `editor:studio`, `editor:suburb` orbit the camera in each
environment. `walk:still`, `walk:forward`, `walk:look` run first-person from the
spawn pose.

**Known gap:** the walkthrough scenarios spawn facing a short sightline and
report 38–62 draw calls, where a hand reading looking across the whole house
reported 687. They do not currently reproduce the worst case. Posing the
walkthrough camera deterministically at a wide sightline is the next thing this
harness needs.
