# Promotion: shipping an approved candidate into Done

Promotion is allowed only after the user's visual approval **bound to the candidate's SHA-256**. Approval of one revision
does not carry to another. CC0 dedication is a separate owner act; promotion does not require it (the owner controls
original work), and you never record it yourself.

Repository facts (floorplan-3d):

- The catalog is `src/furniture/catalog.ts`, fed by per-source JSON in `data/`. The in-house source is
  `data/furniture-factory.catalog.json`, exported as `FACTORY_ASSETS` and wired into `ROOMS`, room tags and `CATALOG_BY_ID`.
- Shipped files live in `public/furniture/factory/`.
- A `git push origin main` is a production deploy. Do not commit or push unless the user asks. Never `git add -A`.
- Another tool (Codex) may have uncommitted edits in the same tree. Touch only the files listed here.

## One command (steps 2 to 7)

```
node .agents/skills/done-furniture-factory/scripts/promote-candidate.mjs --repo . --candidate assets/furniture/<family>/<asset>/r001   --slug <slug> --name "<Display Name>" --kind "<what it is: sofa | sectional sofa | bed | tv console>" [--tags a,b] --category Seating --subtitle "<style, material>" --rooms living --approved-on YYYY-MM-DD
```

It verifies the audit hash against the GLB, copies GLB and `renders/thumb.png`, writes the catalog entry (footprint from the audit),
ATTRIBUTION.json, the DATA_RIGHTS row and flips rights.json/review.json. **`--kind` is required and must contain the Plan Dock hotspot keyword** (sofa/couch, bed, tv, lamp, rug ...): hotspots match name + kind + typeTags only, never the subtitle, so an item whose name lacks the keyword ("Grey Chaise Sectional") silently disappears from its room card. `src/furniture/factoryCatalog.test.ts` fails if a factory item is unreachable. Then do step 8 (verify) yourself. Used for the block-arm
sofa (2026-09-20, worked first time). Render `renders/thumb.png` from the FINAL GLB first (`render-views.py ... --thumb renders/thumb.png`).

## Steps (manual reference)

1. Confirm the approval names the exact revision and SHA-256 (`review.json.artifactSha256`).
2. Copy the audited GLB to `public/furniture/factory/<slug>.glb` and re-hash it; the hashes must match.
3. Thumbnail: `blender -b -P scripts/blender/render-views.py -- <glb> <scratch-dir> --thumb public/furniture/factory/<slug>.png`.
4. Append to `data/furniture-factory.catalog.json`:

   ```json
   {
     "assetId": "factory:<slug>",
     "name": "<Display Name>",
     "category": "Beds | Seating | Tables | Storage | Kitchen | Bathroom | Decor",
     "footprint": { "w": 0.0, "d": 0.0 },
     "wallSnap": true,
     "realModel": "/furniture/factory/<slug>.glb",
     "thumbnail": "/furniture/factory/<slug>.png",
     "brand": "Done",
     "subtitle": "<style, material>",
     "rooms": ["bedroom"]
   }
   ```

   Footprint comes from the final audit bounds (`dimensionsXYZM[0]` and `[2]`), including overhangs and drape.
   Optional fields (`noCollide`, `defaultElevation`, `modelRotation`) follow `FurnitureAsset` in `catalog.ts`.
5. `public/furniture/factory/ATTRIBUTION.json`: add the item with sha256, candidate path, owner, geometry licence
   ("original, owner-controlled; CC0 dedication not recorded" unless recorded) and every texture source with URL and licence.
6. `docs/DATA_RIGHTS.md`, "Shipped media assets" table: add a row (asset, source, licence, permitted use). Everything shipped
   must be commercially free to use (repo CLAUDE.md rule 8). State that inspiration-only references were not inputs.
7. Candidate records: `rights.json.status = "approved-original"` (or `cc0-dedicated` only if the owner recorded it),
   `review.json.user = "approved"`, `promotion = "promoted"`, keep `artifactSha256`.
8. Verify: run a small `npx tsx` script that imports `catalog.ts` and checks `CATALOG_BY_ID.get("factory:<slug>")`, its
   `roomTags`, and its presence in the room section; then look at it in the app (`/dev/furniture`, or place it in a room).
9. Report exactly what changed; leave changes uncommitted unless asked.

## Dev review before approval

`/dev/furniture` is a dev-only page and may be served from a different worktree than the one you edit; check the listener's
working directory. It lists catalog sources only. To review a candidate before it is approved, register it at runtime in that
page (a `FACTORY_ASSETS`-style list plus `CATALOG_BY_ID.set`) and copy the GLB into that tree's `public/furniture/factory/`.
The renderer draws a placeholder box for any id missing from `CATALOG_BY_ID`. Remove the dev registration once the asset is
promoted, or leave it clearly marked as dev-only.
