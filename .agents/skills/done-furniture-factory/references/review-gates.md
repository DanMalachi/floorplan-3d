# Review gates

Technical checks can reject; they cannot approve appearance.

## Technical gate

- Final GLB loads with no missing files, decode errors, NaNs, broken normals, or unintended external dependencies.
- Measured dimensions match the resolved brief; base is grounded; X/Z are centered; local front is +Z.
- Required negative spaces remain open. No detached islands, floating fragments, invisible duplicate shells, z-fighting, or unclassified visible penetration.
- Every visually important material has the required PBR channels. Base color contains no studio shadows or highlights. Wood grain, fabric weave, brushed metal, and stone direction/scale follow the manufactured part.
- Thumbnail and review views come from the exact audited GLB hash.
- Final room derivative retains the accepted source silhouette and material identity. Optimization must not erase thin legs, gaps, seams, piping, or hardware.

## Visual gate

Judge these separately from 1–5: design/silhouette, proportions/construction, material realism, contact/physics, detail restraint, and reference fidelity. A candidate needs at least 4 in every category, no critical defect, and explicit user approval.

Critical defects include:

- cheap/generic material response, baked lighting, procedural-noise wood, or texture scale that changes by part;
- a furniture silhouette that reads as a toy, blockout, or near-copy of a branded reference;
- fused holes, missing back-side construction, impossible joints, floating pieces, or visibly intersecting cushions/cloth;
- cloth that reads as hard plastic, random corrugation, or noise rather than gravity, seams, stuffing, and contact;
- an asset that only looks acceptable in the provider thumbnail or studio light but fails in a normal Done room.

## Required evidence

Use the final GLB in identical conditions for the candidate and benchmark:

- front and three-quarter hero views;
- left/right side and back;
- top plus underside/floor contact;
- one construction/joint close-up;
- one material close-up under grazing light;
- one ordinary Done room at realistic scale.

The user is the final visual judge. Bind approval or rejection to the SHA-256, revision, and render set. Keep rejected revisions as evidence.

## First-draft and soft-goods checks

- Before showing the user, run the self-review in `lessons-learned.md` section 5 and fix anything you would reject.
- Load the first draft in the app viewer. Colour, lighting and footprint normalisation differ from Blender.
- Soft goods are judged separately: rounded (not pointed) pillow ends, cloth resting on the piece without penetrating it, no paper-thin sheets, no fold artifacts, plausible weight and gravity.
- One visible surface must not show a repeated texture figure. Compare neighbouring parts in raking light.

## Application gate

Verify load, placement, selection, drag, rotation, collision footprint, duplicate, undo/redo, save/reopen, search/category reachability, normal lighting, and multiple instances. For parametric assets also test every advertised control and topology boundary.

When agents are available, do not let the builder be the only visual judge. Use a separate strong visual review pass; use cheaper automation only for deterministic measurements.
