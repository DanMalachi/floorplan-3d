# Data rights ledger

_Every plan and dataset we touch, with its rights status and permitted use. This is the
governance record that keeps the shipped product legally clean. See
[perception-data-strategy.md](./perception-data-strategy.md) for the licensing analysis._

## Commercial-use policy (from 2026-09-16)

done. is past proof-of-concept and is being built as a real, paid product. From this
date **everything that ships must be commercially free to use.** This replaces the
POC-era habit of trying things first and checking rights later.

**What it covers:** anything served by or bundled into production — 3D models, textures,
photos and artwork, thumbnails, fonts, icons, colour and material data, sounds, copy,
npm/Python dependencies, and model weights — and anything used to train or tune something
that ships.

**Allowed** (licence verified at the original source and recorded in this file first):

- Public domain / CC0.
- Permissive code and data licences: MIT, Apache 2.0, BSD, ISC.
- CC BY (attribution) — only with a credit on `/legal/credits` (`src/legal/creditsData.ts`).
- Our own original work, including the done. Home Colours fan (`data/fan.done.v1.json`).
- A paid or negotiated licence, held in writing, that explicitly allows redistribution
  inside a commercial app.

**Not allowed:**

- Non-commercial (CC BY-NC), no-derivatives where we modify the asset, research-only, or
  unknown/unverified licences.
- "Royalty-free" terms that forbid redistribution. Serving a file to a browser IS
  redistribution; that is why BlenderKit's royalty-free models were excluded.
- Scraped or copied brand/supplier data: product catalogues, paint fans, names, codes, photos.
  The IKEA furniture catalogue and the Tambour colour fan were both removed on 2026-09-15/16
  for exactly this reason.
- Replicas or "inspired by" copies of branded or designer products, even when the mesh itself
  is CC0. A CC0 mesh licence does not grant rights in someone else's design or trademark.
- Hotlinking third-party CDNs for shipped media. Host our own copy of anything we are allowed to
  redistribute.

**Process:** new sources get a row in this ledger (or in their per-source `ATTRIBUTION.json`
plus the audit in `docs/FURNITURE_LICENSE_AUDIT.md`) *before* merge. Catalog builders must
also honour Dan's visual-review rejections (`scripts/lib/review-rejections.ts`). Dev- or
eval-only material (the `dev` corpus, NC datasets) never goes into a shipped bundle or a
training set. When in doubt, don't ship it; ask Dan.

**Known open items (2026-09-16):**

- Sketchfab picker thumbnails still hotlink `media.sketchfab.com`; they should be copied local.
- Supplier names in code comments of protected `src/viewport3d/WallMesh.tsx` (comments only,
  stripped from the bundle; protected file, so it needs Dan's OK to edit).
- The npm/Python dependency licence set has not been audited against this policy yet.

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

## Shipped media assets

Anything served to a browser is REDISTRIBUTION — the test a licence has to pass here
is "may we host it", not "may we look at it". Same rule that kept royalty-free
BlenderKit models out of the furniture catalog.

| asset | source | license | permitted use here |
|---|---|---|---|
| `public/textures/tv/broadcast-earth.jpg` | NASA, ISS Expedition 71 photograph `iss071e449837` (The Bahamas, 24 July 2024), via images.nasa.gov | Public domain (NASA media usage: NASA content is generally not copyrighted) | ✅ ship + redistribute. Cropped to 16:9 and resized to 1280×720; no NASA logo, insignia or identifiable person appears in it, which is what NASA's guidelines actually restrict |
| `public/textures/wallart/hokusai-great-wave.jpg` | Katsushika Hokusai, *Under the Wave off Kanagawa*, 1830/33 — Art Institute of Chicago, object 24645, via api.artic.edu | Public domain (the museum's own `is_public_domain: true` flag — the test applied to every candidate; works flagged false were dropped even where the artist died a century ago) | ✅ ship + redistribute. Downloaded through the IIIF endpoint at 1000px, re-encoded to 900px longest side |
| `public/textures/wallart/monet-water-lilies.jpg` | Claude Monet, *Water Lilies*, 1906 — Art Institute of Chicago, object 16568, via api.artic.edu | Public domain (the museum's own `is_public_domain: true` flag — the test applied to every candidate; works flagged false were dropped even where the artist died a century ago) | ✅ ship + redistribute. Downloaded through the IIIF endpoint at 1000px, re-encoded to 900px longest side |
| `public/textures/wallart/vangogh-bedroom.jpg` | Vincent van Gogh, *The Bedroom*, 1889 — Art Institute of Chicago, object 28560, via api.artic.edu | Public domain (the museum's own `is_public_domain: true` flag — the test applied to every candidate; works flagged false were dropped even where the artist died a century ago) | ✅ ship + redistribute. Downloaded through the IIIF endpoint at 1000px, re-encoded to 900px longest side |
| `public/textures/wallart/kandinsky-improvisation-30.jpg` | Vasily Kandinsky, *Improvisation No. 30 (Cannons)*, 1913 — Art Institute of Chicago, object 8991, via api.artic.edu | Public domain (the museum's own `is_public_domain: true` flag — the test applied to every candidate; works flagged false were dropped even where the artist died a century ago) | ✅ ship + redistribute. Downloaded through the IIIF endpoint at 1000px, re-encoded to 900px longest side |
| `public/textures/wallart/hiroshige-plum-garden.jpg` | Utagawa Hiroshige, *Plum Garden at Kameido*, 1857 — Art Institute of Chicago, object 26577, via api.artic.edu | Public domain (the museum's own `is_public_domain: true` flag — the test applied to every candidate; works flagged false were dropped even where the artist died a century ago) | ✅ ship + redistribute. Downloaded through the IIIF endpoint at 1000px, re-encoded to 900px longest side |
| `public/textures/wallart/stieglitz-hand-of-man.jpg` | Alfred Stieglitz, *The Hand of Man*, 1902 — Art Institute of Chicago, object 66303, via api.artic.edu | Public domain (the museum's own `is_public_domain: true` flag — the test applied to every candidate; works flagged false were dropped even where the artist died a century ago) | ✅ ship + redistribute. Downloaded through the IIIF endpoint at 1000px, re-encoded to 900px longest side |
| Font: Archivo (hero headline + copy, `src/landing/heroFonts.ts`) | Omnibus-Type, via Google Fonts (`google/fonts` repo, `ofl/archivo`), self-hosted by `next/font` | SIL Open Font License 1.1 (verified 2026-09-19: METADATA.pb `license: "OFL"` + OFL.txt) | ✅ ship + redistribute. OFL permits commercial use and bundling; only selling the font on its own is barred |
| Font: Newsreader Italic (hero serif, English) | Production Type, via Google Fonts (`ofl/newsreader`), self-hosted by `next/font` | SIL Open Font License 1.1 (verified 2026-09-19, same check) | ✅ ship + redistribute |
| Font: Heebo (hero headline + copy, Hebrew) | Oded Ezer, via Google Fonts (`ofl/heebo`), self-hosted by `next/font` | SIL Open Font License 1.1 (verified 2026-09-19, same check) | ✅ ship + redistribute |
| Font: Bona Nova Italic (hero serif, Hebrew) | Capitalics, Mateusz Machalski, Andrzej Heidrich, via Google Fonts (`ofl/bonanova`), self-hosted by `next/font` | SIL Open Font License 1.1 (verified 2026-09-19, same check) | ✅ ship + redistribute |
| Hero floorplan drawing (`src/landing/heroPlanSvg.ts`) | Our own: generated in code by `docs/design/hero-2026-09-19/plan/gen.js` | Owned by us | ✅ ship. No third-party input |
| `public/furniture/factory/oak-platform-bed.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-19/20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/bedroom/oak-platform-bed/r003`, sha256 `3f1a4266…c138f`). Textures: Poly Haven `oak_veneer_01` and `terlenka` (https://polyhaven.com/license, checked 2026-09-19), plus darkened/tinted derivatives of them | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. The reference screenshot the design was inspired by (a search-result image, unknown source) was NOT an input and nothing from it is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan 2026-09-20 for this exact hash |
| `public/furniture/factory/block-arm-sofa.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/seating/block-arm-sofa/r001`, sha256 `0468bc5d…0b4ae`). Textures: Rough Linen (https://polyhaven.com/a/rough_linen); Oak Veneer 01 (https://polyhaven.com/a/oak_veneer_01) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |
| `public/furniture/factory/flare-arm-sofa.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/seating/flare-arm-sofa/r001`, sha256 `f40b291f…3a199`). Textures: Curly Teddy Natural (https://polyhaven.com/a/curly_teddy_natural); Oak Veneer 01 (https://polyhaven.com/a/oak_veneer_01) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |
| `public/furniture/factory/plain-block-sofa.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/seating/plain-block-sofa/r001`, sha256 `bfbf4b68…867e7`). Textures: Hessian 380 (https://polyhaven.com/a/hessian_380); Oak Veneer 01 (https://polyhaven.com/a/oak_veneer_01) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |
| `public/furniture/factory/tufted-sage-sofa.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/seating/tufted-sage-sofa/r001`, sha256 `13876b8d…9f920`). Textures: Velour Velvet (https://polyhaven.com/a/velour_velvet); Oak Veneer 01 (https://polyhaven.com/a/oak_veneer_01) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |
| `public/furniture/factory/beige-leather-sofa.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/seating/beige-leather-sofa/r001`, sha256 `46e1916b…16bfb`). Textures: done. leather grain (self-authored) (assets/furniture/seating/beige-leather-sofa/r001/make_leather_maps.py); Oak Veneer 01 (https://polyhaven.com/a/oak_veneer_01) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: leather grain = own work (owner-controlled), oak = CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |
| `public/furniture/factory/grey-chaise-sectional.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/seating/grey-chaise-sectional/r001`, sha256 `cc13c2b0…bc3f1`). Textures: Hessian 380 (https://polyhaven.com/a/hessian_380); polished nickel (undefined) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |
| `public/furniture/factory/walnut-tv-console.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/storage/walnut-tv-console/r001`, sha256 `938adc2b…67071`). Textures: walnut_veneer (https://polyhaven.com/a/walnut_veneer); oak_veneer_01 (https://polyhaven.com/a/oak_veneer_01) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |
| `public/furniture/factory/black-travertine-tv-console.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/storage/black-travertine-tv-console/r001`, sha256 `eb6d95e8…6093d`). Textures: Travertine009 (https://ambientcg.com/a/Travertine009) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |
| `public/furniture/factory/walnut-mesh-tv-console.glb` (+ `.png` thumbnail) | Done-original: authored 2026-09-20 by Claude for Dan with the done-furniture-factory skill (`assets/furniture/storage/walnut-glass-tv-console/r001`, sha256 `5e67c87a…e7eca`). Textures: walnut_veneer (https://polyhaven.com/a/walnut_veneer) (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan today for this exact hash |

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
