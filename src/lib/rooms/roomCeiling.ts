import type { Id, Room, Wall } from "../../schema/scene";

/** Roofed by design, or open to the sky by design (balcony/terrace/deck). */
export type CeilingState = "roofed" | "open";

/**
 * Geometric fallback for `Room.ceiling` when a room has never been authored
 * (no ceiling-authoring UI ships in M2). Mirrors the rail-edge check
 * `FloorMesh.tsx`'s `Ceilings` component already does to decide whether to
 * mount ceiling geometry at all — reproduced here as the ONE place outside
 * that mesh-builder allowed to make this inference, so lighting code never
 * has to (render-contract.md §8.3 forbids re-deriving rail adjacency inside
 * lighting code, because a second copy of this check is exactly the kind of
 * thing that diverges from the render layer's over time).
 *
 * A future covered-balcony field (§8.4, explicitly deferred) is a reason this
 * stays a guess rather than a promotion to authored truth — it will get this
 * one case wrong (roofed-but-open-sided reads as "open") until someone
 * authors it, same as the render layer does today.
 */
export function inferCeilingState(loop: Id[], walls: Wall[]): CeilingState {
  if (loop.length < 3) return "roofed";
  const railEdges = new Set(
    walls.filter((w) => w.kind === "rail").map((w) => [w.a, w.b].sort().join("|")),
  );
  for (let i = 0; i < loop.length; i++) {
    const edge = [loop[i], loop[(i + 1) % loop.length]].sort().join("|");
    if (railEdges.has(edge)) return "open";
  }
  return "roofed";
}

/** A room's effective ceiling state: the authored field wins; the geometric
 *  guess only fills in when nothing has been authored. */
export function resolveCeilingState(room: Pick<Room, "loop" | "ceiling">, walls: Wall[]): CeilingState {
  return room.ceiling ?? inferCeilingState(room.loop, walls);
}
