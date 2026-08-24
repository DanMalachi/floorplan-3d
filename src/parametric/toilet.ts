import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { chromeMat, wasteMat, roundedRect, ellipseRing, extrudeUp, flushPlate } from "./bathParts";

// Toilet — the first of the bathroom fixtures (Phase 1).
//
// The pan is a LATHE, not a box. A body of revolution is what gives ceramic
// its silhouette (flared rim over a pinched pedestal), and one profile array
// yields both the outside and the bowl interior: the profile climbs the
// outside, rolls over the rim and descends back down inside, so the hollow is
// real geometry rather than a dark texture. The lathe is then scaled on X/Z
// into an ellipse, because a real pan's plan is oval, not round.
//
// HEIGHT SEMANTICS differ per variant, which is unavoidable — h is the whole
// object, and the three mounting types put different things at the top:
//   close-coupled  h = floor to top of cistern      (~0.78)
//   back-to-wall   h = floor to top of duct panel   (~0.85)
//   wall-hung      h = floor to top of the SEAT     (~0.42, clamped)
// Ergonomics fix the seat at ~0.40 for the floor-standing variants, so there
// h only drives the cistern/panel above it.

const SEAT_H = 0.405; // rim + seat: standard comfort seat height
const PROFILE_R = 0.19; // max radius in the authored profile, = half the pan's width

/** Pan profile: (radius, height) from the foot up the outside, over the rim,
 *  and back down into the bowl. Authored at a 0.19 max radius and scaled to
 *  the item's real width/length at build time. */
const PAN_PROFILE: [number, number][] = [
  [0.004, 0.0], // closed foot
  [0.105, 0.0],
  [0.11, 0.015],
  [0.098, 0.06],
  [0.092, 0.13], // pinched pedestal waist
  [0.1, 0.2],
  [0.125, 0.27],
  [0.155, 0.325],
  [0.178, 0.36],
  [0.19, 0.385], // rim, widest point
  [0.183, 0.393], // over the top of the rim
  [0.168, 0.388], // inner rim edge — descending into the bowl now
  [0.152, 0.35],
  [0.132, 0.3],
  [0.1, 0.26],
  [0.062, 0.235],
  [0.035, 0.228], // trap throat
  [0.006, 0.234],
];

/** Where the wall-hung profile starts — everything below the trap is the
 *  pedestal, which a cantilevered pan doesn't have. */
const WALL_HUNG_FROM_Y = 0.2;

function panMesh(profile: [number, number][], mat: THREE.Material): THREE.Mesh {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y));
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat);
}

/** Seat ring + lid. The lid leans back against the cistern when open, which
 *  is the reading that makes the object unmistakable in a plan view; closed
 *  is the tidier product look, so it's a module rather than a fixed choice. */
function seatAndLid(rx: number, rz: number, y: number, centerZ: number, open: boolean, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.position.z = centerZ;

  const seat = extrudeUp(ellipseRing(rx, rz, 0.63), 0.022, mat);
  seat.position.y = y;
  g.add(seat);

  const lidShape = new THREE.Shape();
  lidShape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  const lid = extrudeUp(lidShape, 0.02, mat);
  lid.name = "lid"; // bathroom.test.ts measures it against the cistern face
  if (open) {
    // Hinged at the seat's back edge and swung up past vertical, so it leans
    // on the cistern. The swing needs its own pivot group: `lid` already
    // carries extrudeUp's -90° (what makes it lie flat), so rotating the mesh
    // itself would fight that instead of adding to it.
    const pivot = new THREE.Group();
    pivot.position.set(0, y + 0.022, -rz);
    // Barely past vertical: the hinge sits just clear of the cistern face, so
    // this much lean brings the lid's top edge to REST on that face. Any more
    // and it passes through the cistern.
    pivot.rotation.x = -Math.PI / 2 - 0.03;
    lid.position.z = rz; // back edge onto the hinge line
    pivot.add(lid);
    g.add(pivot);
  } else {
    lid.position.y = y + 0.022;
    g.add(lid);
  }

  // Hinge bosses at the back of the seat.
  for (const sx of [-1, 1]) {
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), chromeMat());
    boss.rotation.z = Math.PI / 2;
    boss.position.set(sx * rx * 0.36, y + 0.03, -rz * 0.92);
    g.add(boss);
  }
  return g;
}

export const toiletGenerator: GeneratorDef = {
  id: "toilet",
  label: "Toilet",
  category: "Bathroom",
  rooms: ["bathroom"],
  wallSnap: true,
  dimLimits: { w: [0.3, 0.46], d: [0.5, 0.8], h: [0.38, 1.05] },
  modules: [{ key: "lidOpen", label: "Lid", min: 0, max: 1, default: 1, toggle: { on: "Lid up", off: "Lid down" } }],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["ceramic"],
  variants: [
    { id: "close-coupled", label: "Close-coupled", cardLabel: "Close-coupled toilet" },
    { id: "wall-hung", label: "Wall-hung", cardLabel: "Wall-hung toilet" },
    { id: "back-to-wall", label: "Back-to-wall", cardLabel: "Back-to-wall toilet" },
  ],
  hotspotKeywords: ["toilet"],
  defaultSpec: {
    generator: "toilet",
    dims: { w: 0.36, d: 0.66, h: 0.78 },
    modules: { lidOpen: 1 },
    front: "slab",
    handle: "none",
    finish: "ceramic",
    variant: "close-coupled",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = spec.variant ?? "close-coupled";
    const open = (spec.modules.lidOpen ?? 1) >= 1;
    const mat = finishMaterial(spec.finish);
    const group = new THREE.Group();

    const wallHung = variant === "wall-hung";
    const profile = wallHung ? PAN_PROFILE.filter(([, y]) => y >= WALL_HUNG_FROM_Y) : PAN_PROFILE;

    // The pan occupies the front of the footprint; the cistern or duct panel
    // takes the back. `panInset` is how far the pan's BACK edge sits from the
    // back of the footprint — the pan tucks under the cistern's front lip, so
    // it's less than the cistern's own depth. Deriving the length from the
    // inset (rather than centering a length) is what keeps the pan, and the
    // lid that hinges off it, inside the declared footprint.
    const backDepth = wallHung ? 0.06 : 0.21;
    const panInset = wallHung ? 0.05 : backDepth - 0.03;
    const panLen = Math.max(d - panInset - 0.005, 0.28);
    const panCenterZ = -d / 2 + panInset + panLen / 2;

    // The SEAT is not the same length as the pan. The pan tucks a few cm under
    // the cistern's front lip, but the seat has to start in FRONT of that lip
    // — otherwise its hinge line sits inside the cistern and a raised lid
    // swings straight through it.
    // The gap has to clear the raised lid's own SLAB THICKNESS as well as its
    // lean — standing up, the lid's 20mm depth projects backward from the
    // hinge line, which is what still clipped the cistern at a 15mm gap.
    const seatBackZ = -d / 2 + backDepth + 0.04;
    const seatFrontZ = panCenterZ + panLen / 2 - 0.006;
    const seatRz = Math.max((seatFrontZ - seatBackZ) / 2, 0.12);
    const seatCenterZ = seatBackZ + seatRz;

    const sx = w / (2 * PROFILE_R);
    const sz = panLen / (2 * PROFILE_R);

    const pan = panMesh(profile, mat);
    pan.scale.set(sx, 1, sz);
    const panGroup = new THREE.Group();
    panGroup.add(pan);

    const rimTopY = 0.393;
    // The seat is positioned in footprint space, so it's added relative to the
    // pan group's own offset.
    panGroup.add(seatAndLid(w / 2 - 0.006, seatRz, rimTopY, seatCenterZ - panCenterZ, open, mat));

    // Waste puck in the trap, visible when the lid is up.
    const waste = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * sx, 0.03 * sx, 0.006, 14), wasteMat());
    waste.position.y = 0.236;
    panGroup.add(waste);

    panGroup.position.z = panCenterZ;
    if (wallHung) {
      // Hang the pan so the seat lands at h, leaving real air underneath.
      const seatTarget = Math.min(Math.max(h, 0.38), 0.5);
      panGroup.position.y = seatTarget - SEAT_H;
    }
    group.add(panGroup);

    if (variant === "close-coupled") {
      const cisternH = Math.max(h - SEAT_H, 0.16);
      const cisternD = backDepth;
      const cistern = extrudeUp(roundedRect(w * 0.99, cisternD, 0.03), cisternH, mat);
      cistern.position.set(0, SEAT_H - 0.02, -d / 2 + cisternD / 2);
      group.add(cistern);

      // Dual flush button, recessed into the cistern lid.
      const button = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 16), chromeMat());
      button.position.set(0, SEAT_H - 0.02 + cisternH, -d / 2 + cisternD / 2);
      group.add(button);
    } else if (variant === "back-to-wall") {
      // Slim duct panel hiding a concealed cistern, with the flush plate on it.
      const panelH = Math.max(h, 0.6);
      const panel = extrudeUp(roundedRect(w, backDepth, 0.02), panelH, mat);
      panel.position.set(0, 0, -d / 2 + backDepth / 2);
      group.add(panel);

      const plate = flushPlate(w * 0.62, 0.15);
      plate.position.set(0, panelH - 0.14, -d / 2 + backDepth + 0.001);
      group.add(plate);
    } else {
      // Wall-hung: the cistern is inside the wall. All that shows is the plate,
      // at the standard ~1.0m actuator height.
      const plate = flushPlate(w * 0.62, 0.15);
      plate.position.set(0, 1.0, -d / 2 + 0.001);
      group.add(plate);
    }

    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
