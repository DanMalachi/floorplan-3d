/**
 * The unified KTX2 material registry — M3d/D4. Reads `data/materials-
 * ingest.manifest.json` (the real M3b/M3c/M3d pipeline's output, 18 assets
 * across all five architecture classes), as opposed to `registry.ts`'s
 * `data/materials-floors.manifest.json` (the legacy WebP floor-only catalog,
 * still the fallback — see `loaderKtx2.ts`).
 *
 * ── Reachability is derived from class, never a hardcoded id list ──────────
 * Only `floors` has a product picker today (`Viewport.tsx`'s floor brush);
 * render-contract.md §8 already records that per-surface material UI for
 * walls/ceilings/doors/windows is product work nobody has built yet. Rather
 * than register 14 floor ids and silently drop the other 4, every asset in
 * the manifest is registered, and which ones a picker can reach is a query
 * (`consumingUIFor`) over the real `class` field — so the day wall-material
 * UI ships, those assets appear with zero registry changes, not a hand-edited
 * list.
 *
 * ── The bypass this guards against ──────────────────────────────────────────
 * `Room.floor` (schema/scene.ts) is a plain `string`, not an enum — nothing
 * at the type level stops it holding a non-floor id. `getFloorMaterial`
 * below filters by `class === "floors"` at resolution time for exactly this
 * reason: a non-floor id must never resolve as a floor texture, even if it
 * ends up in `Room.floor` by a path other than the picker (a fixture, a
 * future migration). Found as a real structural risk while building this,
 * not a hypothetical — the naive version of this file was a single flat
 * id→material map with no class check, which would have had exactly that
 * hole.
 */
import manifest from "../../data/materials-ingest.manifest.json";

export type Ktx2RenderClass = "floors" | "walls" | "ceilings" | "doors" | "windows";

export interface Ktx2EncoderProfile {
  codec: "basis-lz" | "uastc";
  flags: string[];
}

export type Ktx2EncoderIdentity = {
  tool: string;
  version: string;
  provenance: string;
  profiles: { albedo: Ktx2EncoderProfile; orm: Ktx2EncoderProfile; normal: Ktx2EncoderProfile };
} | null;

export interface Ktx2Material {
  id: string;
  name: string;
  family: string;
  class: Ktx2RenderClass;
  surfaceClass: string;
  /** Metres one texture repeat spans — same convention `FloorMaterial.coverM`
   *  already uses (material-spec.md §3.1). */
  coverM: number;
  /** Measured mean, from the map — see material-spec.md §2.1a: this is the
   *  map's own value, not a scalar that multiplies it (the packed ORM ships
   *  the real per-pixel map; there is no separate roughness scalar to apply
   *  on top, unlike the legacy `FloorMaterial.roughness` field). */
  roughness: number;
  metalness: number;
  maps: { albedo: string; normal: string; orm: string };
  thumb: string;
  license: string;
  source: string;
  encoder: Ktx2EncoderIdentity;
}

export const KTX2_MATERIALS = manifest as Ktx2Material[];

const BY_ID = new Map(KTX2_MATERIALS.map((m) => [m.id, m]));

/** Machine-readable, queryable — not a comment. A later session (or a UI
 *  admin view) can ask "what's registered but has nowhere to render yet"
 *  and get a real answer, the same pattern `docs/calibration/manifest.json`
 *  uses for its `provisional` cells. */
export type ConsumingUI = "floor-picker" | "none";

export function consumingUIFor(m: Pick<Ktx2Material, "class">): ConsumingUI {
  return m.class === "floors" ? "floor-picker" : "none";
}

/** Every asset with no consuming UI yet — registered for class coverage
 *  (material-spec.md's conformance gate runs against real assets from every
 *  class, not just floors), reachable by nothing in the product today. */
export function unreachableMaterials(): Ktx2Material[] {
  return KTX2_MATERIALS.filter((m) => consumingUIFor(m) === "none");
}

export function materialsByClass(cls: Ktx2RenderClass): Ktx2Material[] {
  return KTX2_MATERIALS.filter((m) => m.class === cls);
}

/** The render-path resolver. Filters by class at resolution time — the
 *  enforcement point described in this file's header comment. Returns
 *  `undefined` for a non-floor id even though `BY_ID` itself would find it,
 *  which is the point. */
export function getKtx2FloorMaterial(id: string): Ktx2Material | undefined {
  const m = BY_ID.get(id);
  return m && m.class === "floors" ? m : undefined;
}
