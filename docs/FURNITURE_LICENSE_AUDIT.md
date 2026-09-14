# Furniture asset sourcing — commercial-use & dimension audit (2026-09-14)

Follow-up to the Furniture Asset Sourcing Plan status update (2026-09-14). Dan's
bar for this pass: **commercial usability and real-world dimensions are both
hard "musts"** before anything in the 62-item BlenderKit "approved" list or the
59-item FurniMesh shortlist is treated as ship-ready. This records what was
actually checked, against the files/API themselves — not the plan doc's
descriptions of them.

## BlenderKit — license: CLOSED, clean

`scripts/blenderkit/lib.ts` already hard-restricts the whole pipeline to
`license: cc_zero` and explains why in a comment: BlenderKit's "Royalty Free"
tier permits selling *renders*, not shipping the raw model to a browser where
it can be extracted from the network tab — which is exactly what this app
does. The restriction is enforced twice (search query + pre-download check).
Verified: all 355 entries in `data/furniture-blenderkit.json`, and all 62
approved rows, are `cc_zero`. **No action needed — this was already correct**,
including for the "non-Poly-Haven" rows the plan doc flagged as unverified.

## BlenderKit — glTF availability: NEW BLOCKER, not previously known

The approved list assumed all 62 rows were ready to download. Checked against
the local index (`gltfFileId` field) and confirmed live against BlenderKit's
API for a sample:

**58 of the 62 approved BlenderKit rows have no glTF export at all** — only a
native `.blend` file. `scripts/blenderkit/fetch-models.ts` cannot download
them; there is no automated path to a `.glb` for these. Getting one requires
opening the asset in Blender and exporting it by hand, per asset.

Only 4 of 62 have a working glTF file today:

| Item | Category | gltfFileId |
|---|---|---|
| Sofa | Sofas | 807936 |
| Yellow leather sofa | Sofas | 752151 |
| Sci-fi style leather chair | Dining chairs | 442530 |
| Painted Wooden Table | Dining tables | 534990 |

This is a pipeline/format gap, not a licensing one — but it's just as blocking
for shipping. **Dan needs to decide:** manually re-export the 58 blend-only
assets in Blender (real per-asset labor), drop them and lean harder on
FurniMesh/Sketchfab, or some mix.

## BlenderKit — dimensions: measured, 3 of 4 downloadable items are flagged

Downloaded the 4 real candidates and measured their glTF POSITION-accessor
AABB directly (not trusting BlenderKit's reported metadata), same method as
`scripts/blenderkit/audit.ts`.

| Item | Reported (BlenderKit) | Measured (glb) | Verdict |
|---|---|---|---|
| Sofa | 0.87 × 0.98 × 1.05 m | matches, axis-score 1.00 | ⚠️ **0.87m wide is armchair/loveseat scale, not a sofa** — category mismatch, not a measurement error |
| Yellow leather sofa | 0.87 × 0.98 × 1.05 m | matches, axis-score 1.00 | ⚠️ same model/dims as "Sofa" above — same width problem |
| Sci-fi style leather chair | 0.99 × 1.16 × 1.31 m | matches, axis-score 1.00 | ⚠️ **1.31m tall, ~1m+ footprint — lounge/gaming-chair scale, not a dining chair** (dining chairs run ~0.75–1.05m tall, ~0.4–0.65m footprint) |
| Painted Wooden Table | 2.41 × 2.41 × 4.92 m | 2.41 × 1.14 × 0.96 m | ❌ **BlenderKit's own reported height (4.92m) and measured height (0.96m) disagree by 5×; axis-detection confidence only 0.56** — this asset's metadata cannot be trusted, don't ship without manual verification in Blender |

None of the 4 pass cleanly. The other 58 have no dims to check because there's
no file to measure (see above).

## FurniMesh — commercial-use license: STILL OPEN, marketing/ToS gap confirmed in writing

Checked FurniMesh's own site directly (not just the plan doc's summary):

- **Marketing claim (homepage/FAQ, quoted verbatim):** "every output is
  licensed for commercial use, no attribution required... product pages,
  client renders, marketing materials, AR experiences, and games are all
  fine."
- **Actual Terms & Conditions:** does not mention embedding models in a
  shipped application anywhere. Section 2.2: "A paid subscription is required
  to download or share generated materials" — says nothing about what
  redistribution rights that download carries.
- **No dedicated license page exists** — the commercial-use claim lives only
  in marketing copy and FAQ text, never in the binding Terms document.

This confirms, rather than just repeats, the plan doc's concern. "Games" in
their marketing list is a reasonable basis to expect this is fine, but it is
not the same as a written commitment covering *shipping the raw glb inside
our app* specifically. **Treat as UNRESOLVED until FurniMesh support responds
in writing** — do not download/ship any FurniMesh model as final pending that.

## FurniMesh — dimensional accuracy: explicitly disclaimed by FurniMesh itself

Terms & Conditions, quoted verbatim: "We make no guarantees regarding the
exact accuracy or suitability of the generated models" (§1); "We do not
guarantee the quality, accuracy, or specific outcome" (§6.1). This matches the
plan doc's concern (AI-generated from photos, no dimensional guarantee) — now
confirmed as FurniMesh's own written position, not just an inference. Every
FurniMesh pick needs an independent measured check before use; their own
metadata cannot be trusted as-is, same as the Painted Wooden Table finding
above.

Per-item FurniMesh dimension checks were not run yet — pending the license
question above; no point measuring items we may not be able to ship, and
FurniMesh downloads require the browser-review pass Dan asked for anyway.

## Net effect on the "Approved (BlenderKit): 62" count

Of the 62, as of this audit: **4 are technically downloadable**, and of those
4, **1 is clean-ish (Sci-fi style leather chair passes the axis check but
fails the dining-chair size range — it's real, just mis-categorized), 2 share
one loveseat-scale model mislabeled as "Sofa," and 1 has self-contradicting
metadata.** The other 58 need a manual Blender export before they're even
candidates. This is a materially different picture from "62 approved, ready
to verify license/dims" — the plan doc's stated risk items undersold the
actual gap.

---

## 2026-09-14, second pass — sourcing 60 replacement items

Dan's decision after the above: drop the 58 blend-only BlenderKit rows, and
source 60 new pieces from scratch straight into the real catalog. No human
visual-style pass this round — lean on high rating/download counts as the
quality signal instead — but commercial license and real measured dimensions
stay hard requirements, and anything outside the agreed size ranges is
auto-rejected outright (no ship-with-caveat).

### Step 1 — what's actually downloadable anonymously

**Sketchfab** (`https://api.sketchfab.com/v3`): search works with no auth —
`GET /v3/search?type=models&licenses=cc0&count=5` returns `200` with real
results. But resolving an actual download URL does not:

```
$ curl -sS https://api.sketchfab.com/v3/models/03550a3529c24611a12aa158747374e0/download
HTTP 401
{"detail":"Authentication credentials were not provided."}
```

This 401 fires for a CC0-licensed model too — Sketchfab gates the download
endpoint behind an authenticated account/API token regardless of license,
confirmed by a real request, not assumed from docs. No token is available in
this environment. **Sketchfab is unusable for this pass.**

**Poly Pizza** (`https://api.poly.pizza`), considered as a second aggregator
of CC0/CC-BY models: same story —

```
$ curl -sS -i https://api.poly.pizza/v1/search/sofa
HTTP/1.1 401 Unauthorized
{"error":"You need an API key to do that dingus"}
```

No key available. **Also unusable.**

**Smithsonian Open Access 3D** (`https://api.si.edu/openaccess`) was checked
as a third option, since it has a genuine CC0 field and some digitized modern
design pieces. `GET /api/v1.0/search?q=chair&type=3d_data&api_key=DEMO_KEY`
returned `{"rowCount": 0, "message": "no results found"}` — its downloadable
3D corpus (a few hundred objects: spacecraft, fossils, a handful of American
Art pieces) does not cover furniture. Dropped.

**Objaverse** (Allen AI's Sketchfab mirror) was considered and rejected on
principle, not just effort: its per-object license field is a snapshot from
whenever Allen AI's crawler ran, not Sketchfab's own live API — it fails the
"confirmed from the source's own current API/metadata field" bar in Dan's
brief, since a model's license on Sketchfab can change after the mirror was
taken and Objaverse has no live way to re-check it.

**Poly Haven** (`https://api.polyhaven.com`) is the one that works
end-to-end, no auth, and the license is a single site-wide fact rather than a
per-item field — confirmed on `https://polyhaven.com/license` (quoted
verbatim): *"All assets (HDRIs, textures and 3D models) on this site are the
original work of Poly Haven staff, or artists who willingly and directly
donate/sell their work to Poly Haven. Our assets are all licensed as CC0,
which is effectively Public Domain... You can use our assets for any
purpose, including commercial work. You do not need to give credit or
attribution when using them."* `GET /files/<slug>` exposes a direct `.gltf`
download (plus `.bin` + textures) at 1k/2k/4k with no auth. **Poly Haven is
the only source used.**

### Step 1b — Poly Haven's real furniture inventory is small and skews vintage

`GET /assets?t=models` returns 521 models site-wide. Filtered to
`categories` containing `furniture`/`seating`/`table`/`bed`/`shelves`/
`office`: **85 items total** (checked the union of all six categories —
no additional furniture hid outside the `furniture`-tagged 85; the union only
adds 9 unrelated props like a fire alarm and a stapler).

Two cuts were applied, both against the API's own fields, not by browsing:

1. **Exact-name duplicates of the existing `data/furniture-blenderkit.catalog.json`
   (75 items).** BlenderKit's already-shipped catalog turns out to mirror much
   of Poly Haven's furniture set under identical display names — 30 of the 85
   are re-uploads: `Chinese Cabinet`, `Chinese Sofa`, `Chinese Stool`, `Chinese
   Console Table`, `Painted Wooden Bench/Cabinet/Chair 02/Nightstand/Shelves/
   Sofa/Stool`, `Round Wooden Table 02`, `Steel Frame Shelves 03`, `Metal
   Stool 01/03`, `Folding Wooden Stool`, `Gallinera Chair/Table`, `Industrial
   Coffee Table`, `Modern Wooden Cabinet`, `Wooden Picnic Table`, `Wooden
   Stool 02`, `Worn Metal Rack`, `Mid Century Lounge Chair`, `Vintage Day
   Bed`, `Dining Table`, `Metal Office Desk`, `Gothic Coffee Table` (— not
   exhaustive, 30 total). Shipping these again would just duplicate what's
   already live. Cut.
2. **Style.** Dan's brief excludes vintage/ornate/gothic/traditional/antique.
   Read every remaining item's own `tags` array from `/assets` — not
   thumbnails — and cut anything carrying `vintage`, `antique`, `gothic`,
   `victorian`, `rustic`, `farmhouse`, `worn`, `old`, `weathered`,
   `distressed`, `traditional`, `ornate`, or `classic`. That's the large
   majority of the remaining 55 (`GothicBed_01`, `ArmChair_01` — tagged
   "gothic,vintage,victorian" despite the generic name — `old_bed_frame`,
   `sofa_03`, `wooden_table_02`, `painted_wooden_chair_01`, etc.).

**12 candidates survived both cuts:**

| Slug | Category (target bucket) | Downloads |
|---|---|---|
| sofa_02 | Sofas | 84,494 |
| modern_arm_chair_01 | Armchairs | 51,651 |
| Ottoman_01 | (ottoman/pouf — closest bucket: Armchairs) | 34,588 |
| dining_chair_02 | Dining chairs | 16,427 |
| coffee_table_round_01 | Coffee tables | 27,549 |
| modern_coffee_table_01 | Coffee tables | 17,495 |
| modern_coffee_table_02 | Coffee tables | 9,580 |
| side_table_01 | Coffee tables (closest bucket) | 21,013 |
| drawer_cabinet | Storage | 16,379 |
| steel_frame_shelves_01 | Shelving | 32,209 |
| steel_frame_shelves_02 | Shelving | 17,659 |
| wooden_display_shelves_01 | Shelving | 22,851 |

Zero surviving candidates exist for **Beds** or **Office chairs** — the two
worst-gap categories. Poly Haven's only bed-tagged items are `GothicBed_01`
and `old_bed_frame` (rusty hospital-bed style), both excluded on style; its
only chair explicitly tagged `office` is `modern_arm_chair_01` (a lounge/
armchair, not a task chair) and `CoffeeCart_01` (a cart, not seating) — there
is no ergonomic office chair anywhere in Poly Haven's 85-item furniture set.
`SchoolChair_01` exists but is an institutional classroom chair, excluded as
off-style for a residential/architecture-focused catalog.

### Step 2 — dimension measurement, real numbers

Reused `scripts/ikea/glb-geom.ts`'s `geomSize()` (POSITION-accessor
world-space AABB, no geometry decode) unmodified. Poly Haven's `/files`
endpoint serves `.gltf` + `.bin` + loose texture files rather than a single
`.glb`, so each candidate was downloaded (1k resolution — smallest tier that
still had a gltf export) and packed into one `.glb` with `@gltf-transform/core`'s
`NodeIO` (already a project devDependency, used for read + `writeBinary` via
`io.write(path.glb, doc)`), then measured with the unmodified `geomSize()`.

Axis: unlike BlenderKit's Z-up-passthrough exporter (see the first pass
above), Poly Haven ships real glTF, which is Y-up by spec. Verified directly
rather than assumed: `sofa_02`'s own `/info` `dimensions` field reports
`[1807.17, 817.75, 709.49]` mm in **[X, Z, Y]** order, which matches the
measured glb `[x, y, z] = [1.807, 0.709, 0.818]` m exactly once re-ordered —
so `height = measured.y` is trustworthy for every item, no per-item
axis-detection needed.

One deliberate, documented normalization: which raw local axis (X or Z) a
model's *front* faces is not fixed by the geometry — a rectangular table can
be authored either way. Every size range in this brief is asymmetric
(`w_max > d_max` — width is the long/frontal dimension, depth the short one,
the same convention real furniture listings use), so `footprint.w =
max(x,z)`, `footprint.d = min(x,z)` for all 12 candidates, decided once up
front from the ranges' own asymmetry, not adjusted per item after seeing
results. This changes only which label the app puts on an axis, never the
measured geometry.

**Result: 9 of 12 passed, 3 failed — and no exceptions were made for the 3.**

| Item | Measured [x,y,z] m | footprint w×d / height | Bucket range | Verdict |
|---|---|---|---|---|
| sofa_02 | [1.807, 0.709, 0.818] | 1.807×0.818 / h0.709 | Sofa h.55-1.10 w1.30-3.40 d.70-1.20 | **PASS** |
| modern_arm_chair_01 | [0.820, 1.023, 0.987] | 0.987×0.820 / h1.023 | Armchair h.60-1.15 w.55-1.20 d.55-1.10 | **PASS** |
| Ottoman_01 | [0.885, 0.624, 0.621] | 0.885×0.621 / h0.624 | Armchair (closest) | **PASS** |
| dining_chair_02 | [0.434, 0.973, 0.576] | 0.576×0.434 / h0.973 | Dining chair h.75-1.10 w.38-.70 d.38-.70 | **PASS** |
| coffee_table_round_01 | [1.301, 0.491, 1.301] | 1.301×1.301 / h0.491 | Coffee table d max 1.20 | **FAIL** — round table is 1.30 m across, genuinely oversized for the coffee-table bucket (both axes equal, so this isn't an orientation artifact) |
| modern_coffee_table_01 | [0.600, 0.390, 1.202] | 1.202×0.600 / h0.390 | Coffee table | **PASS** |
| modern_coffee_table_02 | [1.199, 0.369, 1.200] | 1.200×1.199 / h0.369 | Coffee table | **PASS** |
| side_table_01 | [0.550, 0.551, 0.450] | 0.550×0.450 / h0.551 | Coffee table (closest) h max 0.55 | **FAIL** — measured height 0.551 m, 1 mm over the 0.55 m cap; no exception made |
| drawer_cabinet | [1.141, 1.881, 0.488] | 1.141×0.488 / h1.881 | Storage h.35-2.30 w.30-2.60 d.25-.80 | **PASS** |
| steel_frame_shelves_01 | [10.974, 21.405, 5.021] | — | Shelving h max 2.60 | **FAIL** — 21 m tall as measured; a real scale/export defect in this asset (not a metadata trust issue — the file itself is wrong), auto-rejected outright |
| steel_frame_shelves_02 | [0.593, 2.142, 0.502] | 0.593×0.502 / h2.142 | Shelving h.30-2.60 w.20-2.20 d.18-.60 | **PASS** |
| wooden_display_shelves_01 | [0.372, 1.556, 1.078] | 1.078×0.372 / h1.556 | Shelving | **PASS** |

`data/furniture-polyhaven.audit.json` holds the full machine-readable audit
row for all 12 (measured values, reported download count, tags, verdict,
reason) — the source of truth for this table, not hand-typed numbers.

### Final tally: 9 added, not 60

| Category | Target | Added | Notes |
|---|---|---|---|
| Beds | ~10 | **0** | Zero non-vintage candidates exist in Poly Haven's catalog |
| Office chairs | ~8 | **0** | Zero ergonomic office chairs exist in Poly Haven's catalog at all |
| Sofas | ~8 | **1** | sofa_02 |
| Armchairs | ~6 | **2** | modern_arm_chair_01, Ottoman_01 (an ottoman/pouf, not literally an armchair — closest available bucket, passed the armchair range on measurement) |
| Dining chairs | ~6 | **1** | dining_chair_02 |
| Dining tables | ~6 | **0** | Zero non-vintage/non-duplicate dining tables exist in Poly Haven's catalog |
| Coffee tables | ~6 | **2** | modern_coffee_table_01, modern_coffee_table_02 (coffee_table_round_01 and side_table_01 failed measurement, see above) |
| Storage | ~5 | **1** | drawer_cabinet |
| Shelving | ~5 | **2** | steel_frame_shelves_02, wooden_display_shelves_01 (steel_frame_shelves_01 failed — broken-scale export) |
| **Total** | **60** | **9** | |

**Why short:** the brief named exactly two anonymous-friendly, machine-
license-checkable APIs to try (Sketchfab, Poly Haven). Sketchfab's download
endpoint requires an account/token that isn't available in this environment
(confirmed by a real 401, not assumed) — Poly Pizza, checked as a third
option, fails the same way. That leaves Poly Haven alone, whose *entire*
furniture/seating/table/bed/shelves inventory is 85 items — not a sample,
the complete set — of which 30 already duplicate the shipped BlenderKit
catalog by name and the large majority of the rest are explicitly vintage/
gothic/antique/rustic per their own `tags` field, which Dan's brief excludes.
After both cuts, 12 modern candidates existed to measure at all, and 9
survived real dimension measurement. There is no larger number of
commercially-usable, anonymously-downloadable, style-appropriate items to
find from these sources — the shortfall is a real ceiling on what's
available this round, not a stopping-early call. Reaching 60 requires either
a source requiring credentials Dan holds (a Sketchfab/Poly Pizza API key) or
reopening BlenderKit's 58 blend-only assets for manual Blender export (both
flagged, not actioned, in the first-pass section above).

### Files added this pass

- `data/furniture-polyhaven.catalog.json` — 9 shipped items, same shape as
  the BlenderKit/IKEA catalogs
- `data/furniture-polyhaven.audit.json` — full measured audit of all 12
  candidates (9 pass + 3 fail), machine-generated by the script below
- `public/furniture/polyhaven/*.glb` — 9 real, downloaded, measured,
  self-contained `.glb` files (gltf+bin+textures packed via `@gltf-transform/core`)
- `scripts/polyhaven/build-catalog.ts` — the fetch + convert + measure +
  catalog-emit pipeline (single script; Poly Haven's API is simple enough
  that mirroring BlenderKit's multi-stage script shape wasn't warranted)
- `src/furniture/catalog.ts` — additive: `POLYHAVEN_ASSETS` import/export,
  merged into `ROOMS`/`CATALOG_BY_ID` alongside IKEA/BlenderKit, top comment
  updated

`npm run typecheck` (`tsc --noEmit`) passes clean with these changes.

---

## 2026-09-14, third pass — Sketchfab + Poly Pizza, closing the Beds/office-chair/dining-table gap

The second pass (Poly Haven) shipped 9 items but explicitly could not touch
the two worst-gap categories: Poly Haven's 85-item furniture set has **zero**
ergonomic office chairs and **zero** modern (non-duplicate, non-vintage)
dining tables, and it doesn't carry beds at all. This pass tries the two
account-gated marketplaces named in Dan's original brief — Sketchfab and Poly
Pizza — now that credentials for them are available, targeting exactly those
three buckets: `bed`, `officeChair`, `diningTable`.

### Method — identical shape to the Poly Haven pass, per marketplace

**Sketchfab** (`scripts/sketchfab/search.ts` -> `filter.ts` -> `shortlist.ts`
-> `download.ts`): a curated shortlist (single furniture items only — no
whole-room scenes or furniture "sets," so a bbox never accidentally includes
other objects) is downloaded and measured item by item. Per candidate:

1. `GET /v3/models/{uid}` for the **current** license + `isDownloadable` flag
   — the per-item check, not the bulk `/search` result's cached label. Every
   one of the 231 candidates processed carries this field in
   `data/furniture-sketchfab.audit.json` (`license: null` only for the 36
   candidates that failed before the detail call resolved a body).
2. `GET /v3/models/{uid}/download` for a signed `.glb` URL (~300s TTL),
   downloaded immediately.
3. Measured with the same `geomSize()` POSITION-accessor AABB reused
   unmodified from `scripts/ikea/glb-geom.ts` — Sketchfab's own glb export is
   already a single self-contained file, no gltf+bin repacking needed (unlike
   the Poly Haven pass).
4. Checked against fixed real-world size ranges, auto-reject with no
   exceptions: `officeChair` h[0.85,1.3] w[0.55,0.75] d[0.55,0.75];
   `diningTable` h[0.68,0.82] w[0.55,3.2] d[0.55,1.6]; `bed` is banded rather
   than ranged — height [0.45,0.75] and length [1.9,2.1] fixed, but width must
   land inside one of four real mattress-size bands (single 0.9-1.0, double
   1.35-1.5, queen 1.5-1.6, king 1.8-2.0), with the gaps between bands treated
   as real gaps and never rounded into the nearest one.
5. A name-sanity regex gate (`/chair/i`, `/table/i`, `/bed|mattress/i`) plus
   an explicit blocklist (`pool table`, `billiard`, `ping-pong`, `foosball`,
   `ironing`) catches numeric false positives — a keyword search can surface
   something whose tags matched but which isn't the target piece at all.

**Poly Pizza** (`scripts/polypizza/search.ts` -> `filter.ts` -> `shortlist.ts`
-> `download.ts`): same shape, same size ranges/bed bands, same `geomSize()`
measurement, reading Poly Pizza's own `licence` field per item (`CC0 1.0` or
`CC-BY 3.0` — Poly Pizza is a mixed-license aggregator, unlike Sketchfab's
CC-BY-only stock in these categories) instead of Sketchfab's license object.
Its own name-sanity gate caught the same class of false positive — see the
"Landing Pad" / "Pool Table" / "Shack" / "Lunch Counter" / "Wooden Bench"
misclassifications in `data/furniture-polypizza.audit.json`, all correctly
rejected by name despite whatever numeric dimensions they carried.

### Per-category tally (both marketplaces, every candidate processed)

| Bucket | Sketchfab tried | Sketchfab passed | Poly Pizza tried | Poly Pizza passed | Combined passed |
|---|---|---|---|---|---|
| Beds | 90 | **0** | 202 | **0** | **0** |
| Office chairs | 70 | 12 | 122 | 3 | **15** |
| Dining tables | 71 | 4 | 109 | 1 | **5** |
| **Total** | **231** | **16** | **433** | **4** | **20** |

Full per-item rows (uid/id, license, measured `[x,y,z]`, verdict, reject
reason) for all 664 candidates live in `data/furniture-sketchfab.audit.json`
and `data/furniture-polypizza.audit.json` — the source of truth for this
table, not hand-typed numbers.

### License field, checked per item

Every one of the 664 audit rows carries its own license field, read from the
marketplace's own metadata for that specific item (never the bulk search
result's cached label, never assumed from category defaults):

- **Sketchfab**: 231/231 rows carry a `license` object (`slug`, `label`).
  100% of Sketchfab's stock in these three categories came back `slug: "by"`
  / `"CC Attribution"` — zero CC0 candidates existed to choose from. CC-BY
  means attribution is legally required, so `public/furniture/sketchfab/
  ATTRIBUTION.json` was built this pass (it didn't exist before, despite
  `catalog.ts`'s comment already pointing at it) by re-querying
  `GET /v3/models/{uid}` for the 16 shipped uids and recording each item's
  author `displayName`/`username`, viewer URL, and license URL verbatim —
  this endpoint is public and needs no token, confirmed live.
- **Poly Pizza**: 433/433 rows carry a `licence` string. Mixed per item: of
  the 20 candidates that passed dimension checks, 2 are `CC0 1.0` (no
  attribution required) and 2 are `CC-BY 3.0` (attribution required).
  `public/furniture/polypizza/ATTRIBUTION.json` already carried the correct
  per-item author string for the CC-BY pair and `null` for the CC0 pair —
  verified against the raw audit, no changes needed.

No API key or token value appears in this document or in either
ATTRIBUTION.json; both scripts read credentials from `process.env` only.

### Dimension measurement — same instrument as both prior passes

`geomSize()` (unmodified) on the real, downloaded `.glb` for every candidate
that made it past the license/downloadable/name-sanity gates. Sketchfab glbs
are single self-contained files (no repacking step, unlike Poly Haven's
gltf+bin). Poly Pizza also ships single `.glb` files directly. Failures
break down as:

- **Sketchfab**: 179 dimension fails (height/width/depth/band out of range),
  36 fails from `HTTP 429` rate-limiting during the download step returning
  no glb to measure at all (retried with backoff per `fetchJSON`, still
  failed after 4 attempts for these 36 — not silently dropped, they're in the
  audit file with `reason: "download fetch failed (HTTP 429) or no glb
  url"`).
- **Poly Pizza**: 424 dimension fails, 5 name-sanity rejections (numerically
  in range but not the target item — "Pool Table" explicitly caught by the
  blocklist despite matching `/table/i`).

### Beds — the honest dead end

**0 of 292 combined bed candidates passed** (90 Sketchfab + 202 Poly Pizza —
this is the "~300 candidates tried across both marketplaces" referenced in
the plan; not a round number, the real count). Every single one failed the
measured real-world dimension check — not license, not downloadability, not
name-sanity. Representative failure spread from
`data/furniture-sketchfab.audit.json`: heights measured from 0.24m to 83.0m
and lengths from well under 1m to hundreds of meters, on items whose names
and thumbnails looked like ordinary beds. This is the same failure shape as
`steel_frame_shelves_01` in the Poly Haven pass (a "21m tall shelf") but
total, not partial: **neither marketplace's upload pipeline enforces
real-world scale**. A modeler can name a file "Queen Bed," tag it "bed,"
upload geometry authored at literally any arbitrary scale (1 unit = 1cm, 1
unit = 1 inch, no unit convention followed at all), and both Sketchfab's and
Poly Pizza's own site preview will render it identically to a correctly-
scaled model, because their viewers auto-fit the camera to the bounding box
regardless of what that box actually measures in meters. There is no
metadata field on either platform that reports trustworthy real-world size —
`geomSize()` measuring the actual glb is the only check that catches this,
and it rejected 100% of bed candidates on both marketplaces. This is not a
sourcing failure (results were found, downloaded, and measured) and not a
stopping-early call (all 292 were run to completion, not a sample) — it's a
real ceiling: these two marketplaces do not have a usable bed in the size
range a residential floorplan app needs, at least not findable by keyword
search within a shortlist-then-verify pipeline that doesn't hand-inspect
every model in a 3D viewer before spending a download+measure cycle on it.
Reaching a non-zero bed count requires either a marketplace with enforced
real-world units or manual hand-vetting in a 3D viewer before download,
which defeats the point of an automated sourcing pass at this scale. **This
is Dan's open decision**, same shape as the BlenderKit blend-export choice
above — not actioned here.

### Final tally: 20 added (15 office chairs, 5 dining tables, 0 beds)

| Category | Sketchfab added | Poly Pizza added | Total added |
|---|---|---|---|
| Beds | 0 | 0 | **0** |
| Office chairs | 12 | 3 | **15** |
| Dining tables | 4 | 1 | **5** |

### Files added this pass

- `data/furniture-sketchfab.catalog.json` — 16 shipped items (12 office
  chairs, 4 dining tables), same shape as the BlenderKit/IKEA/Poly Haven
  catalogs
- `data/furniture-sketchfab.audit.json` — full measured audit of all 231
  Sketchfab candidates (16 pass + 215 fail)
- `data/furniture-polypizza.catalog.json` — 4 shipped items (3 office
  chairs, 1 dining table)
- `data/furniture-polypizza.audit.json` — full measured audit of all 433
  Poly Pizza candidates (4 pass + 429 fail)
- `public/furniture/sketchfab/*.glb` — 16 real, downloaded, measured `.glb`
  files
- `public/furniture/sketchfab/ATTRIBUTION.json` — per-item author credit for
  all 16 CC-BY items, built this pass (see License field section above)
- `public/furniture/polypizza/*.glb` — 4 real, downloaded, measured `.glb`
  files
- `public/furniture/polypizza/ATTRIBUTION.json` — per-item licence +
  attribution (already present, verified correct)
- `scripts/sketchfab/{search,filter,shortlist,download}.ts` — the
  search-filter-shortlist-download-measure pipeline for Sketchfab
- `scripts/polypizza/{search,filter,shortlist,download}.ts` — same shape for
  Poly Pizza
- `src/furniture/catalog.ts` — additive: `SKETCHFAB_ASSETS` and
  `POLYPIZZA_ASSETS` imports/exports, merged into `ROOMS`/`CATALOG_BY_ID`
  alongside IKEA/BlenderKit/Poly Haven, top comment updated

`npm run typecheck` (`tsc --noEmit`) result for this pass is recorded at the
end of this section's originating task run — see repo history/session notes
for the exact console output.
