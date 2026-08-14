"use client";

import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { makeCanvas } from "@/decorate/proceduralTexture";

// Wall clock — Phase 3, soft decor, the one wall-hung piece that is NOT a
// picture. It gets its own generator rather than a sixth wallArt card because
// nothing it needs is shared: a clock has no artwork, no mount, no glazing
// worth faking, and its first swatch row paints the CASE. Folding it into
// wallArt would have meant one generator whose primary finish list means two
// different things depending on the card, which is the "dead control" rule
// from the other side.
//
// Everything is geometry, not a painted dial: at eye level a printed clock
// face reads as a sticker, and the hands are what make it read as a clock at
// all. Roman numerals on the station card are the single exception — those are
// canvas-drawn, so that card falls back to a ticks-only dial headlessly.

const hasDOM = () => typeof document !== "undefined";

type Face = "minimal" | "wood" | "station";

const FACE: Record<string, Face> = {
  minimal: "minimal",
  wood: "wood",
  station: "station",
};

function variantOf(spec: ParametricSpec): string {
  return spec.variant ?? "minimal";
}

function faceOf(spec: ParametricSpec): Face {
  return FACE[variantOf(spec)] ?? "minimal";
}

function showsSeconds(spec: ParametricSpec): boolean {
  return (spec.modules.secondHand ?? 1) > 0;
}

/** Ten past ten. Every clock in every catalogue photograph in the world shows
 *  it, because the hands frame the dial instead of covering it — and a clock
 *  reading 12:00 has its two hands stacked into one stick. */
const HOUR_ANGLE = -((10 + 10 / 60) / 12) * Math.PI * 2;
const MINUTE_ANGLE = -(10 / 60) * Math.PI * 2;
const SECOND_ANGLE = -(30 / 60) * Math.PI * 2;

/** Warm off-white: paper, not printer white. Shared by the plain dial and the
 *  numeral canvas, so a station dial and a baton dial are the same tone. */
const DIAL_TONE = "#f6f3ec";

function dialMaterial(mapped: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  // A mapped dial carries its tone in the canvas; leaving the tint here would
  // multiply the two and darken every numeral dial by a stop.
  m.color.set(mapped ? "#ffffff" : DIAL_TONE);
  m.roughness = 0.88;
  return m;
}

function handMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial();
  m.color.set("#23262b");
  m.roughness = 0.42;
  m.metalness = 0.15;
  return m;
}

/** Roman numerals, drawn once and mapped onto the dial. Channel 0: a
 *  CircleGeometry carries its own 0..1 UVs there and nothing else, and a
 *  texture pointed at a channel the mesh does not have reads one texel. */
function numeralTexture(): THREE.Texture | null {
  if (!hasDOM()) return null;
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  // The dial tone is PAINTED IN, not left transparent. A cleared canvas has
  // rgb(0,0,0) wherever alpha is 0, and an opaque material multiplies that
  // straight through — the first pass rendered a black hole with faint
  // numerals in it, which at a glance read as a broken clock.
  ctx.fillStyle = DIAL_TONE;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "#23262b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(S * 0.085)}px Georgia, "Times New Roman", serif`;
  const numerals = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r = S * 0.385;
    ctx.save();
    ctx.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    // Upright, not radial: a station dial's numerals all read the same way up.
    ctx.fillText(numerals[i], 0, 0);
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.channel = 0;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A tapered hand: wide at the boss, narrow at the tip, pivoting on one end.
 *  `len` reaches from the centre outward; the short tail past the centre is
 *  what keeps a hand from looking glued on. */
function hand(len: number, width: number, thick: number, mat: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  const tail = len * 0.16;
  shape.moveTo(-width / 2, -tail);
  shape.lineTo(width / 2, -tail);
  shape.lineTo(width * 0.28, len);
  shape.lineTo(-width * 0.28, len);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  return new THREE.Mesh(geo, mat);
}

export const wallClockGenerator: GeneratorDef = {
  id: "wallClock",
  label: "Wall clock",
  category: "Decor",
  rooms: ["kitchen", "living", "dining", "study", "kids"],
  wallSnap: true,
  dimLimits: { w: [0.18, 0.7], d: [0.03, 0.12], h: [0.18, 0.7] },
  modules: [
    {
      key: "secondHand",
      label: "Second hand",
      min: 0,
      max: 1,
      default: 1,
      toggle: { on: "Second hand", off: "Hours only" },
    },
  ],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["painted", "oak", "walnut", "steel"],
  wallMounted: () => true,
  // Above head height, where a clock goes: 1.9m to the centre.
  defaultElevation: (spec) => Math.max(0.6, 1.9 - spec.dims.h / 2),
  hotspotKeywords: ["clock"],
  variantIsProduct: true,
  variants: [
    {
      id: "minimal",
      label: "Minimal",
      cardLabel: "Round wall clock",
      defaults: { dims: { w: 0.3, d: 0.05, h: 0.3 }, finish: "painted", color: "#23262b" },
    },
    {
      id: "wood",
      label: "Wood",
      cardLabel: "Wooden wall clock",
      defaults: { dims: { w: 0.34, d: 0.055, h: 0.34 }, finish: "oak" },
    },
    {
      id: "station",
      label: "Station",
      cardLabel: "Station clock, roman dial",
      defaults: { dims: { w: 0.42, d: 0.062, h: 0.42 }, finish: "painted", color: "#f2efe8" },
    },
  ],
  defaultSpec: {
    generator: "wallClock",
    dims: { w: 0.3, d: 0.05, h: 0.3 },
    modules: { secondHand: 1 },
    front: "slab",
    handle: "none",
    finish: "painted",
    color: "#23262b",
    variant: "minimal",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const face = faceOf(spec);
    // Round: the case takes the smaller of the two, so a mis-set width cannot
    // produce an oval clock.
    const r = Math.max(0.05, Math.min(w, h) / 2);
    const caseMat = finishMaterial(spec.finish);
    const g = new THREE.Group();

    // Everything hangs off a group centred on the dial, and the whole clock is
    // authored centred on its declared depth (z from -d/2 to +d/2) so a flush
    // wall placement leaves the case proud of the plaster.
    const c = new THREE.Group();
    c.position.set(0, h / 2, 0);
    g.add(c);
    const front = d / 2;

    // Case: an open RING with a back plate, not a solid drum.
    //
    // Built solid first, and at eye level the clock was a blank disc: the dial
    // sits recessed behind the rim like a real clock's does, so a closed front
    // face buries the dial, the ticks and all three hands inside the case.
    // Nothing headless could see it — every part was present, correctly sized,
    // and invisible.
    const caseD = d * 0.92;
    const caseFront = front - 0.002;
    const caseMid = caseFront - caseD / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, caseD, 48, 1, true), caseMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.z = caseMid;
    // Seen from inside the room the rim shows its inner wall at the top, so it
    // must render from both sides or the case reads as a broken hoop.
    (rim.material as THREE.Material).side = THREE.DoubleSide;
    c.add(rim);

    const backPlate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.006, 48), caseMat);
    backPlate.rotation.x = Math.PI / 2;
    backPlate.position.z = caseFront - caseD + 0.003;
    c.add(backPlate);

    // Dial, recessed inside the rim — the shadow the rim casts on it is what
    // gives a flat disc any depth at all.
    const dialR = r * (face === "station" ? 0.9 : 0.92);
    const numerals = face === "station" ? numeralTexture() : null;
    const dialMat = dialMaterial(!!numerals);
    if (numerals) dialMat.map = numerals;
    // Recessed by about a third of the case depth: enough for the rim to cast
    // a crescent of shadow across the dial, not so deep that the hands
    // disappear when the clock is seen from an angle.
    const dial = new THREE.Mesh(new THREE.CircleGeometry(dialR, 48), dialMat);
    dial.position.z = caseFront - caseD * 0.34;
    c.add(dial);

    const markMat = handMaterial();
    const tickZ = dial.position.z + 0.0015;
    for (let i = 0; i < 60; i++) {
      const hour = i % 5 === 0;
      // A station dial carries numerals AND minute ticks; the minimal one is
      // batons only, which is the whole difference between the two products.
      if (!hour && face !== "station") continue;
      const len = hour ? dialR * (face === "station" ? 0.1 : 0.14) : dialR * 0.045;
      const wide = hour ? r * 0.028 : r * 0.012;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(wide, len, 0.002), markMat);
      const a = (i / 60) * Math.PI * 2;
      const rad = dialR * (face === "station" ? 0.94 : 0.86) - len / 2;
      tick.position.set(Math.sin(a) * rad, Math.cos(a) * rad, tickZ);
      tick.rotation.z = -a;
      c.add(tick);
    }

    const handZ = tickZ + 0.002;
    const hourHand = hand(dialR * 0.55, r * 0.05, 0.0025, markMat);
    hourHand.position.z = handZ;
    hourHand.rotation.z = HOUR_ANGLE;
    c.add(hourHand);

    const minuteHand = hand(dialR * 0.82, r * 0.035, 0.0025, markMat);
    minuteHand.position.z = handZ + 0.003;
    minuteHand.rotation.z = MINUTE_ANGLE;
    c.add(minuteHand);

    if (showsSeconds(spec)) {
      const secMat = new THREE.MeshStandardMaterial({ color: "#b5342e", roughness: 0.4 });
      const sec = hand(dialR * 0.88, r * 0.014, 0.002, secMat);
      sec.position.z = handZ + 0.006;
      sec.rotation.z = SECOND_ANGLE;
      c.add(sec);
    }

    // Boss: the cap over the arbor, without which three hands appear to pass
    // through each other.
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.045, r * 0.045, 0.006, 20), markMat);
    boss.rotation.x = Math.PI / 2;
    boss.position.z = handZ + 0.009;
    c.add(boss);

    tagTintOfMaterial(g, spec.finish, spec.color, caseMat);
    return g;
  },
};
