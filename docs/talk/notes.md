# Talk track — floorplan-3d

Speaker notes for `deck.html`. Eight slides, ~6–8 minutes. Navigate with `←` / `→`
(or space). Two lines to land hardest are marked ★ — slow down and let them sit.

Open the deck full-screen before you start. It works offline.

---

### 1 · Title — "Your home, before you build it."
**~30s. Set the frame.**

> "Imagine uploading a floorplan — the kind an architect or a real-estate listing
> hands you — and a few seconds later you're *walking through that home* in 3D.
> Not a viewer. Something you can reshape, furnish, make yours."

Let the little drawing on the right finish its line-to-room animation before you
move on. That motion *is* the pitch in miniature.

---

### 2 · The vision
**~50s. State the destination, and never let go of it.**

- The one thing to be unambiguous about: **the design experience is the
  destination — not a milestone, not "phase 2."**
- Walk the ribbon left to right: *Upload → Wait → Walk → Start designing.*
- ★ **The invisible-technology line.** Point at the struck-through row and say it
  plainly:
  > "The user should never feel like they're operating an AI system. No 'review
  > detections, accept walls, fix doors.' The technology stays invisible."

That contrast — the clean flow vs. the struck-out one — is the whole product
philosophy. Don't rush it.

---

### 3 · Why it's hard
**~50s. Justify where the effort goes — without moving the goalposts.**

- "So if the design experience is the goal, why do we spend our time on
  *perception*? Because reading an arbitrary floorplan faithfully is the one hard
  blocker between a person and that magical moment."
- Say the discipline line out loud: **"a bottleneck to remove, not a benchmark to
  win — if perception ever hurts the product, the product wins."**
- ★ **The trust line** (the pulled-out quote):
  > "A user should upload a plan and trust the 3D home is faithful — without
  > verifying every wall, door, or window."

This is the emotional core. Everything technical after this is in service of that
sentence.

---

### 4 · What we've built
**~55s. Prove it's real. Four cards, one breath each.**

- **Trace → 3D + early Build Mode** — the destination already has a first taste.
- **Building Knowledge Layer** — rooms carry *meaning*, not just shape.
- **Perception engine** — style router, gray-poché extractor, gap-bridging.
  (If the room is technical: "gray-poché" is the mid-gray wall fill used in CAD
  plans — reading it correctly is what cracked our hardest case.)
- **Discipline** — "we only grade ourselves on plans the system has never seen."

Tie it back: "None of this is the product yet — it's the scaffolding the product
stands on."

---

### 5 · Honest numbers
**~55s. Credibility through honesty. Don't hide the weak bar.**

- Read the strong ones fast: doors 88, walls 83, windows 80.
- Then point at the two soft numbers *yourself* before anyone else can:
  wall-length F1 at 59, and rails at 43 with **no auto-detect yet** (the hatched
  bar). "We show you the weak ones on purpose."
- Right panel — the momentum story: on the hardest plan (gray-poché), walls
  31→33 of 42, windows 3→4 of 5, doors held at 7/7.
- Landing: "These are held-out numbers. The point isn't that they're perfect —
  it's that they're *honest*, and they're moving."

---

### 6 · Roadmap — near (perception)
**~45s. What closes the gap to "trusted."**

- Lead with the one that matters most: **calibrated confidence + intervention
  rate.** "Right now we can't measure how sure the system is, or how often a human
  has to step in. Those are the two numbers trust actually depends on — and
  they're next."
- Then the quick two: rails auto-detect (raise the weakest element), and mask
  healing so rooms close on their own.

---

### 7 · Roadmap — the product
**~45s. Widen back out from perception to the experience.**

- The through-line to say: **"from a tool you operate to a home you receive."**
- Now → the guided trace experience (the fallback, made calm and invisible).
- Next → auto-trace out of the box — "the main selling point of the app."
- Destination → Build Mode deepened: furniture, materials, sunlight, walk-through
  — "the Sims engine as if Apple shipped it in 2026."

---

### 8 · Close
**~25s. One breath. Then stop.**

> "We're not building a floorplan parser. We're building a home you can trust —
> and never feel the machine behind it."

Let the arc read — *a tracing tool ———→ upload & trust* — and hold the silence.
Don't add a sentence after it.

---

## If you have 90 seconds, not 7 minutes
Slides **2 → 3 → 8**: the vision, why perception is the bottleneck, the closing
arc. Those three carry the whole story.

## Numbers cheat-sheet (all held-out / grounded in `docs/VISION.md`)
- Baseline: walls **83** · doors **88** · windows **80** · wallLen F1 **59** · rails **43**
- Hardest plan (gray-poché): walls **31→33 / 42**, windows **3→4 / 5**, doors **7 / 7**
- Missing today: **confidence calibration** and **intervention-rate** metrics
