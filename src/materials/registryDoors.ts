/**
 * Door material registry — the real-photo-texture half of `doorMaterial`
 * (the other half, "painted-white"/"painted-charcoal"/"oak", is procedural —
 * see src/viewport3d/doorTexture.ts). Mirrors registry.ts's floor-catalog
 * pattern, but hardcoded rather than manifest-generated: there is exactly
 * one real, ingested CC0 asset for doors today (curated in
 * scripts/materials/ingest/curated-m3c.ts, ambientCG's Wood051, 80x80cm
 * published dimension). A manifest + generation script is unwarranted
 * machinery for a one-item catalog — worth building if a real scraping pass
 * ever grows this to several.
 */

export interface DoorMaterial {
  id: "walnut";
  name: string;
  /** Metres one texture repeat spans — ambientCG publishes 80x80cm for this
   *  asset (verified against the API before curating). */
  coverM: number;
  roughness: number;
  maps: { color: string; normal: string; orm: string };
}

export const DOOR_MATERIALS: DoorMaterial[] = [
  {
    id: "walnut",
    name: "Lacquered dark walnut",
    coverM: 0.8,
    roughness: 0.25,
    maps: {
      color: "/materials/doors/door-walnut-lacquered/albedo.webp",
      normal: "/materials/doors/door-walnut-lacquered/normal.webp",
      orm: "/materials/doors/door-walnut-lacquered/orm.webp",
    },
  },
];

const BY_ID = new Map<string, DoorMaterial>(DOOR_MATERIALS.map((m) => [m.id, m]));

export function getDoorMaterial(id: string): DoorMaterial | undefined {
  return BY_ID.get(id);
}
