/**
 * Window frame material registry — mirrors registryDoors.ts exactly (see its
 * header for why this is hardcoded rather than manifest-generated). One real
 * ingested CC0 asset today: ambientCG's Metal049A, curated as brushed-metal
 * anodised aluminium with no ambientCG-published repeat dimension (curated
 * `coverM`, same reasoning as floors' carpet/concrete entries).
 *
 * "Matte" and "glossy" are NOT two separate assets — per Dan's ruling, both
 * reuse this SAME texture set with a different roughness override (see
 * WINDOW_FRAME_ROUGHNESS in WallMesh.tsx's consumer), the cheap way to get
 * real variety without a second scraping pass.
 */

export interface WindowMaterial {
  id: "aluminum";
  name: string;
  coverM: number;
  /** Curated base roughness — matte/glossy override this per-instance. */
  roughness: number;
  metalness: number;
  maps: { color: string; normal: string; orm: string };
}

export const WINDOW_MATERIALS: WindowMaterial[] = [
  {
    id: "aluminum",
    name: "Anodised aluminium",
    coverM: 0.5,
    roughness: 0.42,
    metalness: 1,
    maps: {
      color: "/materials/windows/window-aluminium-anodised/albedo.webp",
      normal: "/materials/windows/window-aluminium-anodised/normal.webp",
      orm: "/materials/windows/window-aluminium-anodised/orm.webp",
    },
  },
];

const BY_ID = new Map<string, WindowMaterial>(WINDOW_MATERIALS.map((m) => [m.id, m]));

export function getWindowMaterial(id: string): WindowMaterial | undefined {
  return BY_ID.get(id);
}
