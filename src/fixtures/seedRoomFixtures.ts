import type { Scene, FixtureItem } from "@/schema/scene";
import { eligibleLitRooms } from "@/render/roomLighting";
import { DEFAULT_FIXTURE_ASSET_ID } from "./catalog";

/**
 * Seed one default ceiling fixture per light-eligible room, so a scene reads
 * as "lit" the moment it exists rather than needing a manual placement step
 * first.
 *
 * A no-op whenever `scene.fixtures` is already DEFINED. `undefined` (never
 * seeded — every project saved before fixtures existed, and the very first
 * scene the app ever shows) is the only state this acts on; an empty array
 * means a user has emptied every room on purpose (locked-in product
 * decision: a room a user has cleared of fixtures stays dark, matching
 * furniture's own "empty is a valid state" semantics) and must never be
 * reseeded. This makes the function idempotent by construction — the first
 * call always returns a scene with a defined `fixtures` array, so any later
 * call on that result is a no-op regardless of what it finds.
 *
 * Called from `useSceneStore`'s `setScene` — the single funnel for "whole
 * scene replaced" (fresh trace generate, project restore, opening a saved
 * file) — and from the store's own initial state, so this needs no separate
 * migration step or UI action.
 */
export function seedRoomFixtures(scene: Scene): Scene {
  if (scene.fixtures !== undefined) return scene;

  const seeded: FixtureItem[] = eligibleLitRooms(scene).map((er) => ({
    id: `fx-seed-${er.room.id}`,
    assetId: DEFAULT_FIXTURE_ASSET_ID,
    rotation: 0,
    mount: { kind: "ceiling", x: er.center.x, y: er.center.y },
  }));

  return { ...scene, fixtures: seeded };
}
