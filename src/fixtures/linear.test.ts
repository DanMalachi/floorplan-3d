// Run: node --import tsx src/fixtures/linear.test.ts
import assert from "node:assert/strict";
import { extendLightPath, stripLightSegments, stripOutline, pathInsideRoom, toFixtureLocal, toFixtureWorld, fixtureDropM } from "./linear";
import { FIXTURE_CATALOG } from "./catalog";
import { computeRoomLights } from "@/render/roomLighting";
import { ROOM_LIGHT } from "@/render/contract";
import type { FixtureItem, Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { Ray, Vector3 } from "three";
import { ceilingPlacement, fixturePlacementDropM } from "./placement";
import { eligibleLitRooms } from "@/render/roomLighting";
import { stripDistribution } from "@/render/stripDistribution";

const anchor = [{ x: 0, y: 0 }];
const squareGhost = stripOutline(anchor, 0.06);
assert.equal(squareGhost.length, 4);
assert.equal(Math.max(...squareGhost.map(p=>p.x))-Math.min(...squareGhost.map(p=>p.x)), 0.06);
assert.equal(Math.max(...squareGhost.map(p=>p.y))-Math.min(...squareGhost.map(p=>p.y)), 0.06);
const diffuser = stripDistribution(4, 2.85);
assert.ok(diffuser.sample(0, 2) > 0.3, "soft room fill well beyond the profile");
assert.ok(diffuser.sample(0, 5) > 0.05, "broad diffuser wings light the rest of the room");
assert.ok(diffuser.sample(3, 0) > diffuser.sample(0, 3), "emission follows the long axis");
for (let y = 0.1; y <= 8; y += 0.1) {
  assert.ok(diffuser.sample(0, y) <= diffuser.sample(0, y - 0.1) + 1e-6, "smooth falloff without separate pools");
  assert.ok(Math.abs(diffuser.sample(0,y)-diffuser.sample(0,y-0.1)) < 0.05, "no hard rectangular edge");
}
assert.equal(diffuser.sample(diffuser.radius, 0), 0);
const straight = extendLightPath(anchor, { x: 3.01, y: 0.4 });
assert.deepEqual(straight, [...anchor, { x: 3, y: 0 }]);
const right = extendLightPath(straight, { x: 4, y: 2 });
const left = extendLightPath(straight, { x: 4, y: -2 });
assert.deepEqual(right[2], { x: 3, y: 2 });
assert.deepEqual(left[2], { x: 3, y: -2 });
assert.deepEqual(extendLightPath(right, { x: 1, y: 4 })[3], { x: 1, y: 2 });
assert.strictEqual(extendLightPath(straight, { x: 5, y: 0.01 }), straight, "no tiny/zero phantom corner");
assert.deepEqual(extendLightPath(anchor, { x: -2, y: 0.2 })[1], { x: -2, y: 0 });
assert.deepEqual(extendLightPath(anchor, { x: 0.2, y: -2 })[1], { x: 0, y: -2 });
const origin = { x: 4, y: 3 };
const point = { x: 2, y: -1 };
const world = toFixtureWorld(point, origin, Math.PI / 2);
const local = toFixtureLocal(world, origin, Math.PI / 2);
assert.ok(Math.hypot(local.x - point.x, local.y - point.y) < 1e-9);
const outline = stripOutline(straight, 0.06);
assert.ok(Math.abs(Math.max(...outline.map(p => p.y)) - Math.min(...outline.map(p => p.y)) - 0.06) < 1e-9);
const concave = [{x:0,y:0},{x:6,y:0},{x:6,y:6},{x:4,y:6},{x:4,y:2},{x:2,y:2},{x:2,y:6},{x:0,y:6}];
assert.equal(pathInsideRoom([{x:1,y:4},{x:5,y:4}], concave), false, "concave gap cannot be crossed with endpoints inside");
assert.equal(pathInsideRoom([{x:1,y:1},{x:5,y:1}], concave), true);

const scene: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [{id:"a",x:0,y:0},{id:"b",x:10,y:0},{id:"c",x:10,y:10},{id:"d",x:0,y:10}],
  walls: [{id:"ab",a:"a",b:"b",thickness:0.1},{id:"bc",a:"b",b:"c",thickness:0.1},{id:"cd",a:"c",b:"d",thickness:0.1},{id:"da",a:"d",b:"a",thickness:0.1}],
  rooms: [{id:"room",loop:["a","b","c","d"],ceilingHeight:3}], openings: [], furniture: [], fixtures: [],
};
const item: FixtureItem = {id:"strip",assetId:"fx:linear",rotation:0,mount:{kind:"ceiling",x:1,y:1},path:right,targetLux:3000,colorK:2700};
for (const assetId of ["fx:globePendant", "fx:drumPendant", "fx:flushSquare", "fx:flushDisc", "fx:pendant"]) {
  for (const cameraY of [12, 1.5]) {
    const offset = { cx: 2, cz: 3 };
    const aim = new Vector3(7 - offset.cx, 3 - fixturePlacementDropM(assetId), 6 - offset.cz);
    const eye = new Vector3(3, cameraY, 9);
    const ray = new Ray(eye, aim.clone().sub(eye).normalize());
    const hit = ceilingPlacement(ray, offset, eligibleLitRooms(scene), assetId);
    assert.ok(hit && Math.hypot(hit.x - 7, hit.y - 6) < 1e-9, `${assetId} tracks its visible height from above and below`);
    assert.equal(ceilingPlacement(ray, offset, [], assetId), null);
  }
}
const samples = stripLightSegments(item);
assert.equal(samples.length, 2);
assert.deepEqual(samples.map(s=>s.length), [3,2]);
assert.ok(Math.abs(samples.reduce((sum,s)=>sum+s.weight,0)-1)<1e-9);
assert.ok(samples.every(p => p.x >= 1 && p.x <= 4 && p.y >= 1 && p.y <= 3));
assert.equal(stripLightSegments({...item,path:[{x:0,y:0},{x:1000,y:0}]}).length, 1, "long segments stay continuous, not a row of point sources");
assert.equal(stripLightSegments({...item,path:[{x:0,y:0},{x:NaN,y:0}]}).length, 0);
const lights = computeRoomLights({...scene,fixtures:[item]});
assert.ok(lights.every(l=>l.beam), "every strip section uses a directional rectangular beam");
const single = computeRoomLights({...scene,fixtures:[{...item,assetId:"fx:flushDisc",path:undefined}]})[0];
assert.ok(Math.abs(lights.reduce((sum,l) => sum+l.intensity,0) - single.intensity) < 1e-8, "one strip shares one fixture's light budget");
assert.ok(lights.every(l => Math.abs(l.position[1] - (3 - ROOM_LIGHT.dropBelowCeilingM)) < 1e-9 && l.color === single.color));
assert.equal(new Set(lights.map(l=>l.id)).size, lights.length);
const double = computeRoomLights({...scene,fixtures:[{...item,targetLux:6000,colorK:6500}]});
assert.ok(double.every((l,i) => Math.abs(l.intensity/lights[i].intensity - 2) < 1e-9 && l.color !== lights[i].color));
assert.equal(computeRoomLights({...scene, rooms: [{...scene.rooms[0], ceiling:"open"}],fixtures:[item]}).length,0);
for (const asset of FIXTURE_CATALOG) {
  const fixture: FixtureItem = {...item,assetId:asset.assetId,path:asset.shape === "linear" ? right : undefined,
    mount:asset.category === "Wall" ? {kind:"wall",wallId:"ab",side:"a",sill:1.8,offset:2} : item.mount};
  const result = computeRoomLights({...scene,fixtures:[fixture]});
  assert.ok(result.length > 0, `${asset.assetId} emits through the room resolver`);
  assert.ok(result.every(l => l.color === single.color));
}
assert.equal(fixtureDropM("fx:flushDisc"), ROOM_LIGHT.dropBelowCeilingM);
assert.equal(fixtureDropM("fx:pendant"), ROOM_LIGHT.dropBelowCeilingM);

// Real store commit/undo/redo and JSON persistence keep the entire run atomic.
useSceneStore.setState({scene});
useSceneStore.getState().setPlacing("fx:linear");
useSceneStore.getState().placeFixture(item.mount, item.rotation, item.path);
const placed = useSceneStore.getState().scene.fixtures![0];
assert.deepEqual(placed.path,right);
assert.deepEqual(JSON.parse(JSON.stringify(placed)).path,right);
useSceneStore.getState().undoScene();
assert.equal(useSceneStore.getState().scene.fixtures!.length,0);
useSceneStore.getState().redoScene();
assert.deepEqual(useSceneStore.getState().scene.fixtures![0].path,right);
useSceneStore.getState().setSel3d({kind:"fixture",id:placed.id});
useSceneStore.getState().rotateSelectedFixture(Math.PI / 2);
assert.deepEqual(useSceneStore.getState().scene.fixtures![0].path,right);
console.log("Lighting: turns, profile, room containment, samples, all variants, controls, persistence, undo/redo and rotation passed.");
