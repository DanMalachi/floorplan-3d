import type { Scene, FixtureItem } from "@/schema/scene";
import { eligibleLitRooms, type EligibleRoom } from "@/render/roomLighting";
import { pointInPolygon } from "@/lib/rooms/roomArea";
import type { Point2 } from "@/lib/rooms/poleOfInaccessibility";
import { FIXTURE_LUX_MAX, GENERATED_FIXTURE_COLOR_K } from "@/render/lightPresets";
import { DEFAULT_FIXTURE_ASSET_ID } from "./catalog";

/**
 * Area past which a single ceiling fixture starts visibly underlighting a
 * room's far end — the exact number `docs/render-contract.md` §10 already
 * flagged ("a single fixture starts visibly underlighting the far end...
 * future work if a room's area exceeds roughly 40 m²") as the point a
 * second fixture becomes worth it. Reused here rather than re-guessed.
 */
const LARGE_ROOM_SPLIT_M2 = 40;

/** Hard cap on fixtures-per-room — a very large open-plan floor still gets a
 *  bounded, sane number rather than one lamp per 40m² forever. */
const MAX_FIXTURES_PER_ROOM = 4;

/**
 * Where to seed fixtures in one room: just the pole for a normal room, or
 * `count` points spread along the longer axis of its bounding box for a
 * large one — evenly lighting an elongated open-plan space instead of
 * dumping every lamp on the same spot. Each candidate is checked against the
 * room's actual polygon (concave/L-shaped rooms can have a bounding-box
 * point that falls outside the room itself) and falls back to the pole,
 * which is always inside by construction, when it doesn't.
 */
function seedPositions(er: EligibleRoom): Point2[] {
  const count = Math.min(MAX_FIXTURES_PER_ROOM, Math.max(1, Math.round(er.area / LARGE_ROOM_SPLIT_M2)));
  if (count <= 1) return [er.center];

  const xs = er.loop.map((p) => p.x);
  const ys = er.loop.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const alongX = maxX - minX >= maxY - minY;

  const points: Point2[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const candidate = alongX
      ? { x: minX + t * (maxX - minX), y: (minY + maxY) / 2 }
      : { x: (minX + maxX) / 2, y: minY + t * (maxY - minY) };
    points.push(pointInPolygon(candidate.x, candidate.y, er.loop) ? candidate : er.center);
  }
  return points;
}

/**
 * Seed default ceiling fixture(s) per light-eligible room, so a scene reads
 * as "lit" the moment it exists rather than needing a manual placement step
 * first. Generated fixtures start at peak brightness/neutral-white
 * (`FIXTURE_LUX_MAX`/`GENERATED_FIXTURE_COLOR_K`) — Dan's explicit ruling
 * for what a freshly generated room should look like, deliberately brighter
 * and cooler than a hand-placed fixture's own defaults (`lightPresets.ts`).
 * Rooms past `LARGE_ROOM_SPLIT_M2` get more than one, spread across the
 * room rather than stacked at its pole.
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

  const seeded: FixtureItem[] = eligibleLitRooms(scene).flatMap((er) =>
    seedPositions(er).map((p, i) => ({
      id: `fx-seed-${er.room.id}-${i}`,
      assetId: DEFAULT_FIXTURE_ASSET_ID,
      rotation: 0,
      mount: { kind: "ceiling", x: p.x, y: p.y },
      targetLux: FIXTURE_LUX_MAX,
      colorK: GENERATED_FIXTURE_COLOR_K,
    })),
  );

  return { ...scene, fixtures: seeded };
}
