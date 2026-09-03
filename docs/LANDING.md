# The done.design marketing site

Written 2026-08-31, branch `feat/landing-page`. Nothing here is merged.

## What shipped on this branch

A public marketing site at `/`, `/about` and `/faq`, and the editor moved off
the site root to `/design`.

| Path | What it is |
|---|---|
| `/` | Homepage: hero with the live 3D demo room, how-it-works, positioning, short FAQ, closing CTA |
| `/about` | Long-form: why the product asks you to draw rather than skip |
| `/faq` | The full FAQ (the homepage shows the first five of the same table) |
| `/design` | The editor. Unchanged code — the file moved, nothing inside it did |

## The flag

`NEXT_PUBLIC_LANDING_ENABLED` (see `src/lib/featureFlags.ts`). **Off by
default.** While off, every marketing route redirects to `/design`, so a
deployment behaves exactly as it did before this branch existed: done.design
puts you straight into the editor.

This matters more here than for most flags: a push to `main` **is** a
production deploy on this project, so the flag is the only thing between an
unfinished marketing page and done.design's front door. Verified in both
positions — off gives `/about → 307 → /design`, on gives `200`.

The editor is served from `/design` **regardless** of the flag, so the new URL
is real and warm before it becomes the only one.

## Where to change things

| To change | Edit |
|---|---|
| Colours, type scale, spacing, motion, CTA styling | `src/brand/tokens.ts` — the whole look is this one file |
| The logo | `src/brand/Wordmark.tsx` |
| Every visible string on the homepage + the FAQ | `src/landing/content.ts` |
| The menu | `src/landing/nav.ts` |
| The demo apartment's furniture and layout | `src/landing/demoScene.ts` |
| The two hero controls | `src/landing/DemoStage.tsx` |

### The brand is deliberately provisional

Brand Book Rev C recommends Study 03 (Manrope 800 lowercase, copper square
period) but explicitly says to live with it before deciding, and that the logo
is the *last* thing to draw. `Wordmark.tsx` documents how to swap to the
alternative (Study 02) if 03 reads as too soft after a week.

The brand tokens are **scoped to the marketing routes**. They do not touch
`src/ui/tokens.ts` (`T`) or `src/ui/planDock/tokens.ts` (`PD`), both of which
still carry the pre-naming blue accent. The app-wide copper migration is one
separate job — including the two contrast bugs the brand book caught, which are
still live: `PD.textTertiary` measures 3.78:1 (under the 4.5:1 floor) and
`PD.accentText` is outside sRGB and silently clipping.

Also still stale and left alone on purpose: `src/app/legal/layout.tsx`'s back
link reads "← Floorplan → 3D".

## The hero sequence: "see how it's done."

The hero's secondary button no longer goes anywhere. It plays the product's
core loop in place: the plan is traced by hand, four windows and two doors are
placed, "Generate model" is pressed, and the room stands up. Roughly 9 s of
tracing and 3 s of building, ~12 s in all.

**The build is real.** `Wall.height` is a per-wall schema field
(`src/schema/scene.ts`), so growing a wall is an ordinary scene patch — the same
kind of write the five controls already make. Nothing in the protected
`viewport3d/` tree is touched. Three ordering rules, each a bug avoided: walls
start at 0.02 m (zero is degenerate geometry); openings arrive only once the
walls are full height (W2's head is at 2.20 m, and a hole taller than its wall
is undefined); ceiling fixtures arrive with them, because they hang at ceiling
height and while the walls are 2 cm tall that is the floor.

| File | Role |
|---|---|
| `src/landing/heroPlan.ts` | The geometry, **once**. `demoScene` derives from it. |
| `src/landing/heroSequence.ts` | `idle → tracing → building → done`. |
| `src/landing/TraceOverlay.tsx` | The SVG trace. Pure — no store, no three. |

### Three traps this sequence sits on

**A module singleton cannot cross the dynamic import.** `heroSequence` was first
imported by both the page's main chunk and `DemoStage`'s lazy chunk. A module
imported by two chunks is instantiated **once per chunk**, so `stage` was two
variables: the button wrote one, the animation read the other, and nothing
threw — the label changed while the trace sat still. `DemoRoom` now subscribes
on the light side and passes `stage` and the setter across as props. Note that
`viewport3d/autoOrbitPlayback.ts` gets away with being a singleton *only*
because both of its ends live inside the lazy chunk. Do not generalise from it.

**The button is above the fold; the plan is below it.** Pressing it therefore
has to mount the stage itself (the `IntersectionObserver` has not fired yet at
the top of the page) and scroll the plan into view. `scrollIntoView` finds the
marketing layout's own fixed `overflow-y` region — never aim this at `window`.

**You cannot watch this in an automated browser.** An occluded or background tab
gets **zero** `requestAnimationFrame` callbacks, so the trace sits at t=0 and
looks broken while being perfectly correct; a screenshot forces a paint but not
a frame. `TraceOverlay` therefore exposes a dev-only `__doneTraceSeek(seconds)`.
`draw()` is a pure function of time, so seeking renders any instant exactly as
the loop would:

```js
__doneTraceSeek(7.4)   // then screenshot
```

### Known limits

- **Replay lands the tilt less precisely than the first play.** The orbit is
  stopped while tracing so the tilt has a fixed pose to meet, but on a replay
  the camera resumes from wherever the orbit left it. `AutoOrbitRig` frames once
  on mount and exposes no way to re-frame; giving it one is an additive change
  to a protected file, so it needs Dan.
- **The wall growth has not been seen running.** It is written and typechecks,
  but the two constraints above meant it could not be watched locally. Its
  frame function quantises heights to 2 cm and skips writes when nothing
  changed, because every write re-runs `computeWallEffectiveHeights` and
  re-meshes; that cost is the thing to watch first on a preview deploy.

## The demo room

A live render of the real product — the actual `Viewport`, the actual scene
store — not a screenshot or a video. It is mounted as
`<Viewport chrome={false} autoOrbit />`, which hides the app's own `ScenePanel`,
`WallModeToggle` and CAD grid, and replaces the camera with a slow automatic
orbit.

**The room sits in the left column and five controls in the right** (revised
2026-09-01): **Walls** solid/see-through, **Ceiling** on/off, **Light**
white/warm, **Floor** oak/concrete/terrazzo, **Windows** white/grey/black. Every
one writes straight onto the scene rather than through `commitScene`, so idly
trying floors on a marketing page does not build an undo stack in the store the
editor shares. Ceilings start OFF, so the visitor arrives at an open doll's
house and turning them on is the reveal.

### Why the visitor cannot drive the camera

This is a scroll fix, not a style choice, and it was Dan's call after seeing the
first version. `CameraControls` binds the wheel on the canvas, so a hero that
owns the camera also owns the page's scroll — you scroll, the model dollies, and
the page stays where it is. The middle mouse button collides the same way: TRUCK
in the app's input map, autoscroll in every browser.

So the hero stops competing for the pointer at all. The camera moves itself, the
canvas is `pointer-events: none`, and every gesture over the hero belongs to the
page. What the visitor drives instead is the *state* of the room, which is the
better demo anyway: five controls that each visibly change the thing they are
looking at. This replaced a `touch-action: pan-y` compromise that only ever
fixed the touch half of the problem and left the wheel captured on desktop.

Walkthrough is deliberately absent: it takes the page over with pointer lock and
needs an obvious way back out, which is a product decision rather than a hero
one.

Constraints it was built under:

- **`Viewport.tsx` WAS modified**, with Dan's approval, twice — the additive
  `chrome?: boolean` prop and, on 2026-09-01, `autoOrbit?: boolean`. See the
  "Approved exceptions" section of `docs/PROTECTED_PATHS.md` for what each one
  gates and why. Nothing else protected was touched.
- **Only BlenderKit assets**, served from `public/furniture/blenderkit/opt/`.
  No IKEA asset appears: those GLBs live on Vercel Blob, are excluded from the
  git deploy, and 404'd in production once already (2026-08-31). All 18 asset
  ids used were verified present in both the catalog and on disk.
- **Furniture swaps are built but NOT rendered.** `demoSwaps.ts` is kept and
  marked dormant: every id in it was verified against the catalog and collision-
  checked at its target's pose, so re-enabling a swap strip is a UI change, not
  a data exercise. Note furniture is not click-selectable in `view` mode
  (`FurnitureLayer.tsx` bails unless `appMode` is `"furnish"`), so any such strip
  has to drive `replaceFurnitureAsset` itself rather than fight that gate.
- Initial payload is ~2.0 MB of GLB across 11 models, fetched only once the
  hero scrolls into view.

### Pixel density is not capped here

`Viewport` exposes no `dpr` prop; the only override channel is the `?dpr=` URL
query hatch. Driving that from the marketing page would mean mutating the
address bar so the homepage reads `/?dpr=1` — a debug flag in every URL a
visitor copies. The default `DPR=[1,2]` already clamps to the device's ratio
and is what the app ships for far heavier scenes. If this hero ever measures
too expensive, the fix is a real prop on the render contract (Dan's call, since
`src/render/contract.ts` is protected), not a query-string hack.

## Why the page ground is #101014

The hero canvas CANNOT be transparent: `src/render/contract.ts` sets `alpha:
false` on the GL context deliberately, and `Environment3d.tsx` paints an opaque
`studioBg` = `#101014` behind the model whenever `envPreset` is "none". So the
only way the room sits ON the page instead of inside a visible rectangle is for
the page to be that exact colour. `B.ground` is therefore `#101014`, not the
brand book's `#111315` — an imperceptible shift that removes a full-width seam,
and it needs no change to protected render code. If `studioBg` ever moves, move
`B.ground` with it.

**Known limitation: this only works in the dark theme.** In light theme the page
is `#F8F7F4` and the canvas still paints `#101014`, so the hero would show a
dark band. There is no light-theme toggle shipped yet, so nothing exposes this
today. Fixing it properly needs either a light `studioBg` or a transparent
canvas, both of which are protected-file changes.

## Open finding: the render contract is failing, and local dev shows it

Found 2026-09-03 while running the page in a real browser for the first time.
Present on `main` before any hero work — **not** introduced by it.

```
Render contract violated — see docs/render-contract.md
  gl.context.alpha: expected false, got true
```

`Viewport.tsx` asks for `gl={{ alpha: CONTEXT.alpha }}` and `CONTEXT.alpha` is
`false`, but the context that comes back reports `alpha: true`. This is exactly
the class of drift §1.1 exists to catch — a construction-time context attribute
that a dependency bump stopped honouring — and the contract caught it.

What it costs, in two very different amounts:

- **Production: mild.** `assertRenderContract` throws in development but only
  *logs once* in production (`contract.ts`), so the hero renders. The real cost
  is the one the contract's own comment names: an alpha canvas is composited by
  the browser as a blended layer whether or not anything is drawn through it.
- **Local dev: the hero's 3D does not render at all.** The throw kills the frame
  loop and the room falls back to the placeholder, which reads as
  "Loading the plan" forever. Anyone developing this page locally sees no room.

**Not fixed here.** Both candidate fixes — changing how the canvas is
constructed, or amending the contract — land in `src/render/` and
`src/viewport3d/`, which CLAUDE.md rule 1 protects. Dan's call.

## Open finding: 408 KB of three.js on every page

**Not introduced by this branch — it is already true on `main`, and it is the
single biggest thing standing between this and a fast marketing page.**

    src/app/layout.tsx  (root layout, every route)
      → ConsentNotice
        → useSceneStore
          → @/parametric        (furniture generators)
            → three

`ConsentNotice` reads exactly one value from the store —
`const appMode = useSceneStore((s) => s.appMode)` at
`src/ui/consent/ConsentNotice.tsx:42` — used once, at line 71, to hide the
banner in furnish mode. That single import puts the whole 3D layer into a
shared chunk loaded by every route in the app.

Measured on the production build of this branch:

| Route | Initial JS (gzipped) |
|---|---|
| `/` (homepage) | 738 KB, of which **408 KB is the three-bearing shared chunk** |
| `/about`, `/faq` | ~735 KB — same chunk, and these pages have no 3D at all |
| `/legal/privacy` | same chunk, and it predates this branch entirely |

Splitting the hero's own 3D behind a dynamic import (`DemoRoom` →
`DemoStage`) was necessary and done — the homepage is only ~7 KB heavier than
`/about` — but it cannot help with this, because the cost arrives through the
root layout rather than through the hero.

**Not fixed here, deliberately.** Every available fix changes app-wide,
legally-relevant consent UI: dropping the `appMode` dependency changes when the
banner shows, and lazy-loading `ConsentNotice` delays when it appears. That is
Dan's call, not a landing-page change. Candidate fixes, cheapest first:

1. Give `appMode` a home outside the three-coupled store, or read it through a
   narrow selector module that doesn't import `@/parametric`.
2. `next/dynamic` the `ConsentNotice` in the root layout — smallest diff, but
   it delays the banner, which may matter for consent timing.
3. Render `ConsentNotice` from the editor's layout and the marketing layout
   separately, so each imports only what it needs.

## Not done

- **Pricing.** `/pricing` and `/legal/refunds` are built and working on the
  unmerged `feat/pricing-ui` branch. The menu item and the footer link are
  already written and gate themselves on that branch's own
  `NEXT_PUBLIC_PRICING_UI_ENABLED`, so they appear by themselves once the two
  branches meet — no follow-up edit needed.
- **Visual review.** Verified over HTTP and by production build; the Chrome
  extension was not connected, so no screenshots were taken. Nobody has looked
  at this page yet.
- **No catalogue brand is named anywhere public.** The copy says "a real
  furniture catalogue", never IKEA, and never a paint brand — the brand book
  flags IKEA licensing as unresolved *and* load-bearing for the "what you
  choose, you can buy" pillar. Settle that before writing the brand name onto a
  public page.
