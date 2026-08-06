import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { cushion, GAP } from "./parts";
import { finishMaterial } from "./materials";

const BASE_H = 0.22;
const FEET_H = 0.06;
const FEET_R = 0.02;
const ARM_W = 0.18;
const SEAT_H = 0.16;
const BACK_T = 0.14;
const BACK_TILT = THREE.MathUtils.degToRad(-8);
const PILLOW_W = 0.45;
const PILLOW_T = 0.12;
const PILLOW_H = 0.45;
const PILLOW_TILT = THREE.MathUtils.degToRad(-15);
const PILLOW_MARGIN = 0.15; // inset from the arm's inner face
const PILLOW_STEP = 0.35; // spacing between successive same-side pillows

export const sofaGenerator: GeneratorDef = {
  id: "sofa",
  label: "Custom sofa",
  category: "Seating",
  rooms: ["living", "study", "kids"],
  wallSnap: true,
  dimLimits: { w: [0.8, 4.0], d: [0.8, 1.2], h: [0.65, 1.0] },
  modules: [
    { key: "seats", label: "Seats", min: 1, max: 5, default: 3 },
    { key: "pillows", label: "Pillows", min: 0, max: 6, default: 2 },
  ],
  // No doors/handles on a sofa — a single-option list hides the picker in the
  // configurator (ParametricSection.tsx renders it only when length > 1).
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["fabric-linen", "fabric-charcoal", "fabric-sage"],
  finishes2: ["fabric-linen", "fabric-charcoal", "fabric-sage"],
  defaultSpec: {
    generator: "sofa",
    dims: { w: 2.2, d: 0.95, h: 0.8 },
    modules: { seats: 3, pillows: 2 },
    front: "slab",
    handle: "none",
    finish: "fabric-linen",
    finish2: "fabric-charcoal",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const seats = Math.max(1, Math.round(spec.modules.seats ?? 3));
    const pillows = Math.max(0, Math.round(spec.modules.pillows ?? 2));
    const mat = finishMaterial(spec.finish);
    const pillowMat = finishMaterial(spec.finish2 ?? "fabric-charcoal");

    const group = new THREE.Group();

    const baseD = d * 0.85;
    const baseBackZ = -d / 2;
    const baseFrontZ = baseBackZ + baseD;
    const baseCenterZ = baseBackZ + baseD / 2;
    const baseCenterY = FEET_H + BASE_H / 2;

    const base = cushion(w, baseD, BASE_H, mat);
    base.position.set(0, baseCenterY, baseCenterZ);
    group.add(base);

    // 4 feet, inset from the base footprint's corners.
    const footInset = 0.04;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(FEET_R, FEET_R, FEET_H, 12), mat);
        foot.position.set(sx * (w / 2 - footInset), FEET_H / 2, baseCenterZ + sz * (baseD / 2 - footInset));
        group.add(foot);
      }
    }

    // Arms: flush to the outer edges, spanning the base's full depth.
    const armH = h * 0.75;
    for (const sx of [-1, 1]) {
      const arm = cushion(ARM_W, baseD, armH, mat);
      arm.position.set(sx * (w / 2 - ARM_W / 2), armH / 2, baseCenterZ);
      group.add(arm);
    }

    // Seat cushions: fill the space between the arms, front-aligned to the base.
    const seatAvailW = Math.max(w - 2 * ARM_W, 0.1);
    const seatSlotW = seatAvailW / seats;
    const seatW = seatSlotW - GAP;
    const seatD = d * 0.62;
    const seatTopY = FEET_H + BASE_H + SEAT_H;
    const seatCenterZ = baseFrontZ - seatD / 2;
    for (let i = 0; i < seats; i++) {
      const x = -seatAvailW / 2 + seatSlotW * (i + 0.5);
      const seat = cushion(seatW, seatD, SEAT_H, mat);
      seat.position.set(x, seatTopY - SEAT_H / 2, seatCenterZ);
      group.add(seat);
    }

    // Back cushions: same grid as the seats, leaning against the back edge.
    const backH = Math.max(h - 0.28 - 0.16, 0.25);
    const backCenterY = FEET_H + BASE_H + backH / 2;
    const backCenterZ = baseBackZ + BACK_T / 2;
    for (let i = 0; i < seats; i++) {
      const x = -seatAvailW / 2 + seatSlotW * (i + 0.5);
      const back = cushion(seatW, BACK_T, backH, mat);
      back.position.set(x, backCenterY, backCenterZ);
      back.rotation.x = BACK_TILT;
      group.add(back);
    }

    // Pillows: alternate from the two arms inward, resting on the seats just
    // in front of the back cushions.
    const armInnerX = w / 2 - ARM_W;
    const pillowY = seatTopY + PILLOW_H / 2;
    const pillowZ = baseBackZ + BACK_T + PILLOW_T / 2 + GAP;
    for (let i = 0; i < pillows; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      const x = side * Math.max(armInnerX - PILLOW_MARGIN - k * PILLOW_STEP, PILLOW_W / 2);
      const pillow = cushion(PILLOW_W, PILLOW_T, PILLOW_H, pillowMat);
      pillow.position.set(x, pillowY, pillowZ);
      pillow.rotation.x = PILLOW_TILT;
      group.add(pillow);
    }

    return group;
  },
};
