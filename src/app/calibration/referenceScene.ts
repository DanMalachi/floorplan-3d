import type { Scene } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";

/**
 * The M1c calibration fixture — the room every future asset is judged in.
 *
 * Built from the product's OWN schema and mesh builders, not from hand-placed
 * primitives, so what it shows is the real wall body, the real reveal depth,
 * the real glazing bars and the real shadow classes. A rig assembled from
 * bespoke boxes would certify a renderer nothing ships through.
 *
 *   y (plan, depth)
 *   6  f ---- PORTAL ---- e ---- PORTAL ---- d
 *      |                  ‖                  ¦
 *      | ROOFED           ‖ GLAZED           ¦ rail
 *      | (ceiling)        ‖ SLIDER           ¦
 *   0  a ---- WINDOW ---- b ---- rail ------ c
 *      0                  5                 11.5   x (plan, width)
 *
 * ## Why it is two rooms and not one
 *
 * A roofed interior is DARK, and stays dark until M2 gives rooms their own
 * fixtures — the contract says so and forbids fixing it with light values
 * (§4.2, §5.4). But a chart you cannot read is not a reference. So the fixture
 * carries both regimes side by side:
 *
 *   - the TERRACE (right) is bounded by rails, which means open to the sky BY
 *     DESIGN, so it gets full sun and full sky. The material chart lives there,
 *     where a material can actually be judged;
 *   - the ROOFED room (left) has the ceiling, and with it every shadow
 *     convention worth checking: the sun stopping at the ceiling, the shade
 *     line on the floor, and the beam through the slider.
 *
 * That pairing is not a convenience. It is the §8 distinction — ceilingless by
 * DESIGN versus ceiling hidden for VIEWING — standing in one frame, so a
 * regression in either is visible against the baseline.
 *
 * ## Why the openings sit where they do
 *
 * `computeSkyLighting` gives the sun a fixed small +z lean and an x component
 * that swings with the hour, so at the canonical hour it comes from +x — from
 * the terrace side, across the frame. That is deliberate: the FIRST version of
 * this fixture faced its open side at +x, which put the sun directly behind the
 * camera and produced flat frontal light with every shadow hidden behind the
 * object casting it. Cross-lighting is what makes a shadow convention visible.
 *
 * The slider sits in the wall between the two rooms, so the sun that lights the
 * chart is the same sun that throws a glazing-bar-striped beam onto the roofed
 * floor. It is left HALF OPEN on purpose: the same hole then admits sun through
 * glass on one side and through nothing on the other, which is what makes §6.1
 * visible rather than merely documented — the glass casts no shadow, the frame
 * and bars beside it do.
 *
 * The window faces -y and so never takes direct sun at any hour. That is the
 * sky-lit case, kept on purpose.
 */

const t = DEFAULT_THICKNESS;

/** Plan extents. x is width (screen-horizontal in the hero shot), y is depth. */
export const ROOM = {
  x0: 0,
  xMid: 5, // the shared wall carrying the slider
  x1: 11.5,
  y0: 0,
  y1: 6,
} as const;

/** What the hero cameras are aimed at, and what the group offset centres on. */
export const ROOM_CENTRE = { cx: (ROOM.x0 + ROOM.x1) / 2, cz: (ROOM.y0 + ROOM.y1) / 2 };

export const REFERENCE_CEILING_HEIGHT = WALL_HEIGHT;

/**
 * The hour every baseline is captured at, and part of the baseline: a different
 * sun angle is a different image.
 *
 * 10.0 is derived, not preferred. It has to clear three thresholds at once:
 * above elevation ~16° the sky model stops warming the sun (`lowSun` reaches 0
 * at day > 0.28), so the chart's colour is its own and not the sunset's; high
 * enough that direct sun dominates diffuse sky (85 klx against 18 klx) or the
 * frame has no directional information in it; and low enough that the beam
 * through the slider still reaches ~1.3 m into the roofed room instead of
 * dying at the reveal.
 */
export const CANONICAL_HOUR = 10;

/**
 * Sun illuminance at the canonical hour, as `computeSkyLighting` derives it:
 * `REFERENCE_SUN_LUX * day^1.15` with `day = sin(((10-6)/12)*PI) = 0.866`.
 *
 * Recorded here because it makes the grey card in the chart a CHECKABLE number
 * rather than a vibe — see `GreyCard` in ReferenceRig.tsx.
 */
export const CANONICAL_SUN_FRACTION = Math.pow(Math.sin(((CANONICAL_HOUR - 6) / 12) * Math.PI), 1.15);

export const referenceScene: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "a", x: ROOM.x0, y: ROOM.y0 },
    { id: "b", x: ROOM.xMid, y: ROOM.y0 },
    { id: "c", x: ROOM.x1, y: ROOM.y0 },
    { id: "d", x: ROOM.x1, y: ROOM.y1 },
    { id: "e", x: ROOM.xMid, y: ROOM.y1 },
    { id: "f", x: ROOM.x0, y: ROOM.y1 },
  ],
  walls: [
    { id: "wBack", a: "a", b: "b", thickness: t },
    // Rails, not walls: a rail means open to the SKY, and that is the whole
    // reason the terrace has no ceiling. A portal here would leave it roofed.
    { id: "wRailN", a: "b", b: "c", thickness: t, kind: "rail" },
    { id: "wRailE", a: "c", b: "d", thickness: t, kind: "rail" },
    // The camera side of both rooms. Portals render nothing and never take part
    // in a corner join, so the walls running into them get square-capped jambs.
    { id: "wOpenT", a: "d", b: "e", thickness: t, kind: "portal" },
    // Shared wall. Being shared, it does not set either room's ceiling height —
    // both sit at WALL_HEIGHT and no riser is generated.
    { id: "wMid", a: "e", b: "b", thickness: t },
    { id: "wOpenR", a: "e", b: "f", thickness: t, kind: "portal" },
    { id: "wLeft", a: "f", b: "a", thickness: t },
  ],
  openings: [
    {
      id: "oWindow",
      type: "window",
      wallId: "wBack",
      offset: 2.5,
      width: 1.8,
      height: 1.4,
      sill: 0.9,
      mullions: { cols: 3, rows: 2 },
    },
    {
      id: "oSlider",
      type: "door",
      wallId: "wMid",
      offset: 3, // from node e (5, 6) toward b (5, 0) -> centred at y = 3
      width: 3,
      height: 2.2,
      sill: 0,
      slide: { style: "bypass", panels: 2, glazed: true, open: 0.5, side: "end" },
    },
  ],
  rooms: [
    { id: "rRoofed", name: "Roofed", loop: ["a", "b", "e", "f"], floor: "concrete" },
    { id: "rTerrace", name: "Terrace", loop: ["b", "c", "d", "e"], floor: "concrete" },
  ],
  // Empty by design. The only object that ever enters this fixture is the
  // candidate asset under review, and it arrives through the drop slot.
  furniture: [],
};
