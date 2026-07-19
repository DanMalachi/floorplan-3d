# Labeling Spec v1

Resolves docs/paper.md §4.3.1's ambiguities for the ground-truth annotator
and, by extension, for what the extraction pipeline itself must decide.
Versioned per CLAUDE.md rule 5 — any of these calls changing after the
Phase 0 gate needs a `docs/schema-change-proposal.md` and Dan's sign-off,
same as a schema field change.

## 1. What counts as a wall

A traced/predicted element is a **wall** (`role` ∈ `external | internal |
partition_low | glazing | demising | rail | unconfirmed`) iff it is a real
built barrier with physical thickness that a person's body cannot pass
through without going around, through an opening, or over/under it. This
excludes:

- **Cabinetry / fitted furniture** (kitchen counters, wardrobe runs) — even
  when wall-thickness and wall-length, these get no wall element at all.
  They are the canonical F1 false-positive case (docs/paper.md §2) and are
  never traced as walls, full stop.
- **Dimension chains / extension lines** — never traced.
- **Glass walls** — traced as a wall with `role: "glazing"`. Still a real
  physical barrier (you cannot walk through it), so it participates in
  `wall_cycle` and junctions exactly like any other wall; `glazing` exists
  so downstream 3D rendering can pick a transparent material.
- **Low partitions / half-walls** (kitchen islands with a knee wall, low
  room dividers under ~1.2m) — traced as a wall with `role:
  "partition_low"`. Still a real physical object with thickness; the role
  exists for rendering height, not for topology — it closes rooms
  identically to a full wall.
- **Demising walls** (the wall between two dwelling units in a multi-unit
  plate) — traced as `role: "demising"` when the unit's own scope includes
  it as a boundary; see §3 below for when it's in-scope at all.
- **Bulkheads / shafts** (elevator shafts, plumbing chases) — traced as
  `role: "internal"` unless a more specific role clearly applies. Not a
  distinct role in v1 — revisit if the corpus shows this matters (Phase 0
  found no examples of this needing to be distinguished from a plain
  internal wall).

**When genuinely ambiguous** (annotator cannot tell wall vs. built-in
furniture from the source, e.g. a low-resolution photo of a kitchen
counter that could be either): trace it as a wall with `role:
"unconfirmed"` and a flag noting the ambiguity, rather than guessing a
specific role or omitting it. This is what `unconfirmed` is for.

## 2. Rails (balconies, terraces, low barriers)

Ported directly from the shipping product's `Wall.kind` convention (see
`src/schema/scene.ts`, `docs/PROTECTED_PATHS.md`) — this is proven,
battle-tested prior art from the same domain, not a new invention:

- `role: "rail"` = a low, see-through boundary (balcony railing, glass
  balustrade, low parapet) that bounds an **outdoor** space rather than
  dividing two indoor rooms.
- Rails participate in `junctions` and `wall_cycle` **exactly like any
  other wall role** — closure is topology, not construction. A balcony is
  modeled as a closed cycle of rail walls plus the building wall(s) it
  attaches to, with the resulting room labeled `"balcony"` (or
  `"terrace"`/`"veranda"` etc. per local convention).
- Never conflate a rail with a `partition_low` wall — a rail bounds
  outdoor space and is typically open-to-sky above; a low partition
  divides two indoor rooms and typically has ceiling above it.

## 3. Passage vs. gap (and the open portal question)

Two genuinely different things share the word "opening":

- **Passage** (`opening.class: "passage"`): a real, unobstructed gap
  *within a wall* — no door leaf, just a walk-through gap (e.g. an
  archway). It still has a host wall, a `center_offset`, and a `width`,
  exactly like a door or window opening. Trace it as an opening on its
  host wall.
- **True absent boundary** (open-plan transition, e.g. kitchen flowing
  into living room with no wall or archway at all): the product schema
  represents this with `Wall.kind === "portal"` — a wall-shaped element
  with **no built structure**, existing purely so the room-closure graph
  has an edge to walk. **The new `extraction_v1` schema (Appendix A) has
  no equivalent.** `walls[].role` only has `external | internal |
  partition_low | glazing | demising | rail | unconfirmed`, and
  `rooms[].wall_cycle` requires every cycle edge to reference a real wall
  with `thickness > 0` — there is currently no way to close a room across
  a true open-plan transition without inventing a fake wall.

  **This is flagged, not resolved, in Phase 0.** It doesn't block this
  phase's deliverables (neither the legacy-GT converter nor the SVG
  authoring converter produce room `wall_cycle`s yet — see their
  docstrings), but it must be resolved before Phase 4 (solver/topology)
  or Phase 5 (openings) can handle open-plan plans correctly, and before
  the schema is treated as fully frozen. See `reports/phase-0-gate.md`
  for the concrete options and the request for Dan's decision. Related:
  the "Open-plan zones idea" memory entry (living/dining/kitchen
  functional-zone tagging) is a different, adjacent problem — zones
  *within* one already-closed room — and doesn't resolve this gap either.

## 4. Unit scope

- **Single dwelling** (`scope_class: "single"`): the plan shows exactly
  one dwelling unit's interior. Default assumption unless the plan is
  clearly a multi-unit floor plate or the corpus registry's `notes`
  column says otherwise.
- **Unit within a plate** (`scope_class: "unit_in_plate"`): the plan shows
  one unit but other units' geometry is visible (demising walls to
  neighbors, corridor, stairwell). Only the target unit's walls get full
  roles; neighbor geometry outside the unit boundary is either cropped
  before tracing or traced with `role: "unconfirmed"` and a flag —
  **never traced as if it were the target unit's own wall.**
- **Whole floor plate** (`scope_class: "plate"`): all units on one floor
  are in scope. Demising walls are shared and traced once (not
  duplicated per unit).
- **Multi-floor sheet** (`scope_class: "multi_floor"`): more than one
  floor is drawn on one sheet (see the `Matterport Sample_BW` plan in the
  corpus registry — Floor 1 + Floor 2 on one page). Each floor is a
  separate extraction target; the router's job (Phase 1+) is to segment
  the sheet before extraction runs, not to merge floors into one plan.

## 5. Corpus application (Phase 0)

`eval/registry/registry.csv` applies this spec to the 16 seeded plans —
see that file for per-plan `encoding_class` / `convention_class` /
`scope_class` labels and confidence. All 15 plans with converted legacy GT
are `gt_status: provisional_unaudited`: they predate this spec (the old
trace tool had no role/scope taxonomy at all — every wall converts to
`role: "unconfirmed"`, see `extraction/synth/convert_legacy_gt.py`) and
have not been re-labeled against it. Re-labeling them, or annotating fresh
plans against this spec via the SVG→schema-v1 converter
(`extraction/synth/svg_gt.py`), is the human-annotation work this phase
scaffolds but does not complete (see `reports/phase-0-gate.md`).
