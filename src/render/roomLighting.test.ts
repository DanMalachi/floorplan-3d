// Headless: pole-of-inaccessibility placement + fixture-driven room-light
// derivation. Run: npx tsx src/render/roomLighting.test.ts

import type { FixtureItem, Node, Room, Scene, Wall } from "@/schema/scene";
import { poleOfInaccessibility } from "@/lib/rooms/poleOfInaccessibility";
import { pointInPolygon } from "@/lib/rooms/roomArea";
import { computeRoomLights, WALL_FIXTURE_REFERENCE_AREA_M2 } from "./roomLighting";
import {
  resolveCeilingHeights,
  computeWallEffectiveHeights,
  computeWallRenderHeights,
  roomsWithCeiling,
} from "./ceilingHeight";
import { ROOM_LIGHT, MIN_CASTER_THICKNESS } from "./contract";
import { WALL_HEIGHT } from "@/schema/constants";
import { DEFAULT_FIXTURE_LUX, roomFixtureCandela, toRenderIntensity } from "./lightPresets";
import { seedRoomFixtures } from "@/fixtures/seedRoomFixtures";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const n = (id: string, x: number, y: number): Node => ({ id, x, y });
const wall = (id: string, a: string, b: string, extra: Partial<Wall> = {}): Wall => ({
  id, a, b, thickness: 0.1, ...extra,
});
const ceilingFixture = (id: string, x: number, y: number): FixtureItem => ({
  id, assetId: "fx:flushDisc", rotation: 0, mount: { kind: "ceiling", x, y },
});

// ---------------------------------------------------------------------------
console.log("\npole of inaccessibility");
{
  const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  const p = poleOfInaccessibility(square);
  check("square room centers near (2,2)", Math.hypot(p.x - 2, p.y - 2) < 0.05, `got (${p.x},${p.y})`);

  // An L: a 6x6 square with a 3x3 bite out of the top-right corner. The
  // vertex-average centroid of this loop lands at (2.57, 2.57) — inside the
  // missing bite, i.e. OUTSIDE the room. The pole must not.
  const L = [
    { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 },
    { x: 3, y: 3 }, { x: 3, y: 6 }, { x: 0, y: 6 },
  ];
  const naiveCentroidX = L.reduce((s, p) => s + p.x, 0) / L.length;
  const naiveCentroidY = L.reduce((s, p) => s + p.y, 0) / L.length;
  check("naive centroid of this L falls outside it (sanity check on the fixture)",
    !pointInPolygon(naiveCentroidX, naiveCentroidY, L));

  const pole = poleOfInaccessibility(L);
  check("pole of the L lands inside the room", pointInPolygon(pole.x, pole.y, L), `got (${pole.x},${pole.y})`);
}

// ---------------------------------------------------------------------------
console.log("\ncomputeRoomLights — driven by fixtures, no built-in fallback");
{
  // Two 4x4 rooms sharing an edge; a third, rail-bounded (balcony) room; a
  // fourth, tiny sliver under the area floor; a fifth, normal-sized but
  // explicitly authored ceiling:"open". Same fixture as the L above, folded
  // in as room F, to exercise a fixture placed away from the pole.
  const nodes: Node[] = [
    n("a0", 0, 0), n("a1", 4, 0), n("a2", 4, 4), n("a3", 0, 4), // room A
    n("b2", 8, 4), n("b1", 8, 0), // room B (shares a1-a2 edge conceptually via own loop)
    n("c0", 0, -4), n("c1", 4, -4), // rail-bounded balcony, shares a0-a1
    n("d0", 20, 20), n("d1", 20.6, 20), n("d2", 20.6, 20.6), n("d3", 20, 20.6), // sliver
    n("e0", 30, 0), n("e1", 34, 0), n("e2", 34, 4), n("e3", 30, 4), // authored-open
    n("f0", 40, 0), n("f1", 46, 0), n("f2", 46, 3), n("f3", 43, 3), n("f4", 43, 6), n("f5", 40, 6), // L room
    n("x0", 60, 0), n("x1", 64, 0), // exterior/facade wall — no Room loop ever references it
  ];
  const walls: Wall[] = [
    wall("wa0", "a0", "a1"), wall("wa1", "a1", "a2"), wall("wa2", "a2", "a3"), wall("wa3", "a3", "a0"),
    wall("wb0", "a1", "b1"), wall("wb1", "b1", "b2"), wall("wb2", "b2", "a2"), // reuses a1-a2 as shared
    wall("wc0", "a0", "c0"), wall("wc1", "c0", "c1"), wall("wc2", "c1", "a1", { kind: "rail" }),
    wall("wd0", "d0", "d1"), wall("wd1", "d1", "d2"), wall("wd2", "d2", "d3"), wall("wd3", "d3", "d0"),
    wall("we0", "e0", "e1"), wall("we1", "e1", "e2"), wall("we2", "e2", "e3"), wall("we3", "e3", "e0"),
    wall("wf0", "f0", "f1"), wall("wf1", "f1", "f2"), wall("wf2", "f2", "f3"),
    wall("wf3", "f3", "f4"), wall("wf4", "f4", "f5"), wall("wf5", "f5", "f0"),
    wall("wx0", "x0", "x1"), // exterior facade — not part of any Room
  ];
  const rooms: Room[] = [
    { id: "A", loop: ["a0", "a1", "a2", "a3"] },
    { id: "B", loop: ["a1", "b1", "b2", "a2"] },
    { id: "balcony", loop: ["a0", "c0", "c1", "a1"] }, // bounded by a rail edge (c1-a1)
    { id: "sliver", loop: ["d0", "d1", "d2", "d3"] },
    { id: "authoredOpen", loop: ["e0", "e1", "e2", "e3"], ceiling: "open" },
    { id: "F", loop: ["f0", "f1", "f2", "f3", "f4", "f5"] }, // L-shaped, 6x6 minus 3x3 bite, offset +40
  ];
  const baseScene: Scene = {
    schemaVersion: 2, units: "meters", nodes, walls, openings: [], rooms, furniture: [],
  };

  // --- default (seeded) behavior: matches the old M2 always-lit guarantee,
  // but now via seedRoomFixtures rather than a fallback inside computeRoomLights.
  const seeded = seedRoomFixtures(baseScene);
  const lights = computeRoomLights(seeded);
  const byRoom = new Map(lights.map((l) => [l.roomId, l]));

  check("room A gets a light once seeded", byRoom.has("A"));
  check("room B gets a light once seeded", byRoom.has("B"));
  check("rail-bounded balcony never gets seeded a light", !byRoom.has("balcony"));
  check(
    `sliver room (${(0.6 * 0.6).toFixed(2)} m2 < ${ROOM_LIGHT.minAreaM2} m2 min) never gets seeded a light`,
    !byRoom.has("sliver"),
  );
  check("authored ceiling:\"open\" room never gets seeded a light even though it's not rail-bounded", !byRoom.has("authoredOpen"));

  // B is a 4x4 room too (8-4=4 wide, 0-4 tall) — same area as A, so same intensity.
  const a = byRoom.get("A")!;
  const b = byRoom.get("B")!;
  check("equal-area rooms get equal intensity, not hand-tuned per room",
    Math.abs(a.intensity - b.intensity) < 1e-9, `A=${a.intensity} B=${b.intensity}`);
  check("light sits below the ceiling, not at floor level", a.position[1] > 1.5 && a.position[1] < 2.4,
    `y=${a.position[1]}`);

  // Double the floor area (8x4=32 vs 4x4=16) and check intensity scales
  // linearly with it, per the documented flux/area derivation.
  const bigRoomScene = seedRoomFixtures({
    ...baseScene,
    rooms: [{ id: "big", loop: ["a0", "a1", "b1", "b2", "a2", "a3"] }],
  });
  const combined = computeRoomLights(bigRoomScene)[0];
  check("intensity scales linearly with area (2x area -> 2x intensity)",
    Math.abs(combined.intensity / a.intensity - 2) < 1e-6,
    `ratio=${combined.intensity / a.intensity}`);

  // --- fixture-driven positioning: a fixture off the pole is what renders,
  // not the pole itself.
  const offPole = { x: 41, y: 5.5 }; // inside the L's lower-left leg, away from the pole
  const withOffPoleFixture: Scene = {
    ...baseScene,
    fixtures: [ceilingFixture("fx1", offPole.x, offPole.y)],
  };
  const fLight = computeRoomLights(withOffPoleFixture).find((l) => l.roomId === "F");
  check("a fixture placed off the pole is what actually lights the room", !!fLight);
  check("that light sits at the fixture's own position, not the pole",
    fLight != null && Math.abs(fLight.position[0] - offPole.x) < 1e-9 && Math.abs(fLight.position[2] - offPole.y) < 1e-9,
    fLight ? `got (${fLight.position[0]},${fLight.position[2]})` : "no light");

  // --- multiple fixtures in one room: one RoomLight per fixture, each at
  // full candela (locked-in decision: brightness scales with fixture count,
  // not split across them).
  const pole = poleOfInaccessibility([
    { x: 40, y: 0 }, { x: 46, y: 0 }, { x: 46, y: 3 }, { x: 43, y: 3 }, { x: 43, y: 6 }, { x: 40, y: 6 },
  ]);
  const twoFixtures: Scene = {
    ...baseScene,
    fixtures: [ceilingFixture("fx1", offPole.x, offPole.y), ceilingFixture("fx2", pole.x, pole.y)],
  };
  const fLights = computeRoomLights(twoFixtures).filter((l) => l.roomId === "F");
  check("two fixtures in one room produce two lights", fLights.length === 2, `got ${fLights.length}`);
  check("both lights have unique ids", fLights[0]?.id !== fLights[1]?.id);
  const soloCandela = computeRoomLights(withOffPoleFixture).find((l) => l.roomId === "F")!.intensity;
  check("each fixture is independently at full candela (scales up, not split)",
    fLights.every((l) => Math.abs(l.intensity - soloCandela) < 1e-9));

  // --- a fixture whose point falls outside every room polygon (e.g. dropped
  // in wall thickness or open space) contributes nothing and doesn't crash.
  const orphan: Scene = { ...baseScene, fixtures: [ceilingFixture("fxOrphan", 1000, 1000)] };
  check("a fixture outside every room polygon contributes no light, no crash",
    computeRoomLights(orphan).length === 0);

  // --- the actual behavior change this milestone makes: zero fixtures means
  // zero light, full stop — no silent pole-of-inaccessibility fallback.
  // (Locked-in product decision: an emptied room stays dark, "just like
  // furniture" — the always-lit guarantee now lives in seedRoomFixtures, not
  // here.)
  const noFixtures: Scene = { ...baseScene, fixtures: [] };
  check("a scene with fixtures explicitly cleared to [] has no lights at all",
    computeRoomLights(noFixtures).length === 0);

  // -------------------------------------------------------------------------
  console.log("\nwall-mounted fixtures");
  {
    // wa1 (a1->a2, x=4 from y=0 to y=4) is the shared wall between room A
    // (x<4, west) and room B (x>4, east) — its outward normal (-uy,ux) with
    // dx=0,dy=4 is (-1,0), pointing INTO A. Side "a" (sign +1) should
    // therefore light A; side "b" (sign -1) should light B instead.
    const onSideA: FixtureItem = {
      id: "wallA", assetId: "fx:sconce", rotation: 0,
      mount: { kind: "wall", wallId: "wa1", offset: 2, sill: 1.8, side: "a" },
    };
    const onSideB: FixtureItem = {
      id: "wallB", assetId: "fx:sconce", rotation: 0,
      mount: { kind: "wall", wallId: "wa1", offset: 2, sill: 1.8, side: "b" },
    };

    const litA = computeRoomLights({ ...baseScene, fixtures: [onSideA] });
    check("a wall fixture on side 'a' lights room A", litA.some((l) => l.id === "wallA" && l.roomId === "A"));
    check("wall fixture render height is its own sill, not a ceiling height",
      Math.abs(litA.find((l) => l.id === "wallA")!.position[1] - 1.8) < 1e-9);

    const litB = computeRoomLights({ ...baseScene, fixtures: [onSideB] });
    check("the SAME wall, side 'b', lights room B instead", litB.some((l) => l.id === "wallB" && l.roomId === "B"));
    check("side 'b' does not also light room A", !litB.some((l) => l.roomId === "A"));

    // --- Sprint 3a: a wall fixture lights its room even when that room is
    // excluded from eligibleLitRooms (open-ceiling / undersized) — only a
    // CEILING fixture's default is gated on those.
    const balconyWallLight: FixtureItem = {
      id: "wallBalcony", assetId: "fx:sconce", rotation: 0,
      mount: { kind: "wall", wallId: "wc1", offset: 2, sill: 1.8, side: "a" },
    };
    const balconyLit = computeRoomLights({ ...baseScene, fixtures: [balconyWallLight] });
    check("a wall fixture still lights a rail-bounded (open-ceiling) balcony",
      balconyLit.some((l) => l.id === "wallBalcony" && l.roomId === "balcony"));
    check("...but a ceiling fixture in that same balcony still gets no light",
      computeRoomLights({ ...baseScene, fixtures: [ceilingFixture("fxBalconyCeiling", 2, -2)] }).length === 0);

    const sliverWallLight: FixtureItem = {
      id: "wallSliver", assetId: "fx:sconce", rotation: 0,
      mount: { kind: "wall", wallId: "wd0", offset: 0.3, sill: 1.8, side: "a" },
    };
    check("a wall fixture also lights an undersized sliver room",
      computeRoomLights({ ...baseScene, fixtures: [sliverWallLight] })
        .some((l) => l.id === "wallSliver" && l.roomId === "sliver"));

    // --- Sprint 3c: wall fixtures size themselves off a fixed reference
    // area, not the actual (very different) room areas above.
    const wallIntensityA = litA.find((l) => l.id === "wallA")!.intensity;
    const wallIntensitySliver = computeRoomLights({ ...baseScene, fixtures: [sliverWallLight] })[0].intensity;
    check("wall fixture intensity is the same fixed-area value regardless of room size",
      Math.abs(wallIntensityA - wallIntensitySliver) < 1e-9,
      `A(16m²)=${wallIntensityA} sliver(0.36m²)=${wallIntensitySliver}`);
    check("...and matches the documented WALL_FIXTURE_REFERENCE_AREA_M2 formula",
      Math.abs(wallIntensityA - toRenderIntensity(roomFixtureCandela(WALL_FIXTURE_REFERENCE_AREA_M2, DEFAULT_FIXTURE_LUX))) < 1e-9);
  }

  // -------------------------------------------------------------------------
  console.log("\nexterior/unenclosed wall fixtures (Sprint 5)");
  {
    // wx0 (x0->x1) borders no Room at all — a facade/entrance sconce, exactly
    // Dan's screenshot: a fixture that renders but was previously left dark.
    const facadeLight: FixtureItem = {
      id: "wallFacade", assetId: "fx:sconce", rotation: 0,
      mount: { kind: "wall", wallId: "wx0", offset: 2, sill: 1.8, side: "a" },
    };
    const lit = computeRoomLights({ ...baseScene, fixtures: [facadeLight] });
    check("a wall fixture with no bordering Room at all still gets a light",
      lit.some((l) => l.id === "wallFacade"));
    check("...at its own sill height, not a room ceiling",
      Math.abs(lit.find((l) => l.id === "wallFacade")!.position[1] - 1.8) < 1e-9);
    check("...at the same fixed-area candela other wall fixtures use",
      Math.abs(lit.find((l) => l.id === "wallFacade")!.intensity
        - toRenderIntensity(roomFixtureCandela(WALL_FIXTURE_REFERENCE_AREA_M2, DEFAULT_FIXTURE_LUX))) < 1e-9);

    // A CEILING fixture with nothing under it is still a genuine no-light
    // case — unchanged from Sprint 3a. Only wall mounts get the fallback.
    const orphanCeiling = computeRoomLights({ ...baseScene, fixtures: [ceilingFixture("fxOrphan2", 62, 5)] });
    check("a ceiling fixture with no room at all still gets nothing (unchanged)",
      orphanCeiling.length === 0);
  }

  // -------------------------------------------------------------------------
  console.log("\nper-room authored ceiling height (Sprint 4)");
  {
    const authored: Scene = { ...baseScene, rooms: baseScene.rooms.map((r) => (r.id === "A" ? { ...r, ceilingHeight: 3.6 } : r)) };
    check("resolveCeilingHeights honors an authored room.ceilingHeight",
      resolveCeilingHeights(authored).get("A") === 3.6);
    check("...and leaves an unauthored room on the derived rule",
      resolveCeilingHeights(authored).get("B") === WALL_HEIGHT);

    const aCeilingLight = computeRoomLights({ ...authored, fixtures: [ceilingFixture("fxA", 2, 2)] })[0];
    check("a ceiling fixture's height follows the authored ceilingHeight, not the wall default",
      Math.abs(aCeilingLight.position[1] - (3.6 - ROOM_LIGHT.dropBelowCeilingM)) < 1e-9,
      `y=${aCeilingLight.position[1]}`);

    // The shared wall (wa1) borders A (authored 3.6) and B (derived WALL_HEIGHT,
    // shorter) — it must rise to the taller room's height so B's riser rule
    // (FloorMesh.tsx) can seal the gap on B's side.
    const wallHeights = computeWallEffectiveHeights(authored, resolveCeilingHeights(authored));
    check("a wall shared with a taller authored-ceiling room rises to match it",
      wallHeights.get("wa1") === 3.6, `got ${wallHeights.get("wa1")}`);
  }

  // -------------------------------------------------------------------------
  console.log("\nthe wall head hides the ceiling slab");
  {
    const roomH = resolveCeilingHeights(baseScene);
    const effective = computeWallEffectiveHeights(baseScene, roomH);
    const render = computeWallRenderHeights(baseScene, roomH, effective);

    // The slab is a solid, its underside IS the ceiling plane, so its thickness
    // lands in the airspace above the wall top unless the wall carries it.
    check("a roofed room's wall is drawn a slab taller than its ceiling",
      Math.abs((render.get("wa0") ?? 0) - (WALL_HEIGHT + MIN_CASTER_THICKNESS)) < 1e-9,
      `got ${render.get("wa0")}`);
    check("...while the ceiling plane itself does not move",
      roomH.get("A") === WALL_HEIGHT, `got ${roomH.get("A")}`);

    // The riser rule compares walls against ceiling planes. If the +slab leaked
    // into the effective heights, EVERY wall would suddenly read as taller than
    // its room's ceiling and grow a 12 cm riser it does not need.
    check("the ceiling/riser contract is untouched by it",
      effective.get("wa0") === WALL_HEIGHT, `got ${effective.get("wa0")}`);

    // A balcony is open to the sky: no slab exists, so there is nothing to hide
    // and its walls must not sprout a parapet.
    check("balcony walls stay at their own height", render.get("wc1") === WALL_HEIGHT,
      `got ${render.get("wc1")}`);
    check("...and the balcony is correctly counted as roofless",
      !roomsWithCeiling(baseScene).has("balcony") && roomsWithCeiling(baseScene).has("A"));
    // Resolved through roomCeiling.ts, so an AUTHORED "open" wins over the
    // geometry. `Ceilings` used to read rail edges itself and would roof a
    // room explicitly marked open to the sky (§8.3's warning, in the wild).
    check("an authored ceiling:\"open\" room is roofless even with no rail on it",
      !roomsWithCeiling(baseScene).has("authoredOpen"));
    check("...so its walls get no parapet either", render.get("we0") === WALL_HEIGHT,
      `got ${render.get("we0")}`);

    // A wall no room references has no slab bearing on it either.
    check("a facade wall bordering no room is left alone", render.get("wx0") === WALL_HEIGHT,
      `got ${render.get("wx0")}`);
  }

  // -------------------------------------------------------------------------
  console.log("\nper-fixture brightness/color overrides");
  {
    const scene: Scene = {
      ...baseScene,
      fixtures: [
        ceilingFixture("fxDefault", 2, 2),
        { id: "fxBright", assetId: "fx:flushDisc", rotation: 0, mount: { kind: "ceiling", x: 2, y: 2 }, targetLux: 3000 },
        { id: "fxWarm", assetId: "fx:flushDisc", rotation: 0, mount: { kind: "ceiling", x: 2, y: 2 }, colorK: 2000 },
        { id: "fxCool", assetId: "fx:flushDisc", rotation: 0, mount: { kind: "ceiling", x: 2, y: 2 }, colorK: 6500 },
      ],
    };
    const byId = new Map(computeRoomLights(scene).map((l) => [l.id, l]));
    const areaA = 16; // room A, 4x4

    const oldBaselineIntensity = toRenderIntensity(roomFixtureCandela(areaA, 300)); // the old frozen M2 default
    const newDefaultIntensity = toRenderIntensity(roomFixtureCandela(areaA, DEFAULT_FIXTURE_LUX));
    check("a fixture with no targetLux override uses DEFAULT_FIXTURE_LUX",
      Math.abs(byId.get("fxDefault")!.intensity - newDefaultIntensity) < 1e-9);
    check("that default is meaningfully brighter than the old frozen 300lx baseline (\"much brighter\", as asked)",
      newDefaultIntensity / oldBaselineIntensity >= 4,
      `ratio=${(newDefaultIntensity / oldBaselineIntensity).toFixed(2)}`);

    check("a targetLux override scales intensity proportionally to the default",
      Math.abs(byId.get("fxBright")!.intensity / byId.get("fxDefault")!.intensity - 3000 / DEFAULT_FIXTURE_LUX) < 1e-6);

    const warmHex = byId.get("fxWarm")!.color;
    const coolHex = byId.get("fxCool")!.color;
    check("different colorK overrides produce different colors", warmHex !== coolHex);
    const redOf = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const blueOf = (hex: string) => parseInt(hex.slice(5, 7), 16);
    check("2000K reads warmer (more red, less blue) than 6500K",
      redOf(warmHex) - blueOf(warmHex) > redOf(coolHex) - blueOf(coolHex),
      `warm=${warmHex} cool=${coolHex}`);
  }
}

console.log(failures === 0 ? "\nall room-lighting checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
