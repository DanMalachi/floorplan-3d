import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import {
  ARTWORK_IDS,
  artworkAfter,
  artworkOf,
  backingMaterial,
  canvasMaterial,
  frameMoulding,
  glazing,
  mountMaterial,
  panelWithHole,
  pictureGeometry,
  printMaterial,
  type Artwork,
} from "./wallArtParts";

// Wall art — Phase 3, soft decor.
//
// Every room in the app reads as an empty shell until something hangs on the
// wall, and the thing that hangs is almost never geometry: it is an IMAGE. So
// the generator is mostly a mount-and-moulding builder wrapped around six real
// museum scans (see wallArtParts.ts and docs/DATA_RIGHTS.md), and the picture
// itself is chosen in the inspector's first swatch row.
//
// The picture is a FINISH, not a variant, for the reason the phase's rule 1
// gives: what a placed piece can be re-tuned to is styling, and swapping which
// painting is in a frame is exactly that. What it IS — framed print, canvas,
// gallery wall, picture ledge — is the card.
//
// Aspect is never faked. A print is FITTED inside its mount (the board absorbs
// the mismatch, which is what a mount is for) and a gallery-wrapped canvas is
// CROPPED to fill its face. Neither path stretches a painting, because a
// stretched Hokusai is the one thing here that would look worse than a
// procedural rectangle.

/** Face-of-frame to back-of-frame, and how much of that sits proud of the
 *  mount. Frames are shallow; the depth is mostly rebate. */
const FRAME_W = 0.028;
const LARGE_FRAME_W = 0.042;
/** Canvas stretcher bar depth — a gallery wrap stands off the wall. */
const CANVAS_D = 0.038;

type Kind = "framed" | "canvas" | "gallery" | "ledge";

const KIND: Record<string, Kind> = {
  "framed-portrait": "framed",
  "framed-landscape": "framed",
  "framed-large": "framed",
  canvas: "canvas",
  "gallery-3": "gallery",
  ledge: "ledge",
};

function variantOf(spec: ParametricSpec): string {
  return spec.variant ?? "framed-portrait";
}

function kindOf(spec: ParametricSpec): Kind {
  return KIND[variantOf(spec)] ?? "framed";
}

function hasMount(spec: ParametricSpec): boolean {
  return (spec.modules.mount ?? 1) > 0;
}

/** Largest w×h with the artwork's aspect that fits inside `maxW`×`maxH`. The
 *  whole point of a mount: the opening takes the painting's shape and the
 *  board takes the leftover, so nothing is ever scaled unevenly. */
function fitted(art: Artwork, maxW: number, maxH: number): { w: number; h: number } {
  const byW = { w: maxW, h: maxW / art.aspect };
  return byW.h <= maxH ? byW : { w: maxH * art.aspect, h: maxH };
}

/** One framed picture, bottom edge at y=0, glass toward +Z.
 *
 *  `face` is where the front of the moulding sits in local Z — an item is
 *  authored CENTRED on its declared depth, so placement can back it onto a
 *  wall without burying it in the plaster. */
function buildFramed(
  w: number,
  h: number,
  d: number,
  art: Artwork,
  frameMat: THREE.Material,
  frameW: number,
  mount: boolean,
  face: number,
): THREE.Group {
  const g = new THREE.Group();
  const back = face - d;

  // The moulding. Its front face is the frontmost surface of the whole piece;
  // the glazing and everything under it are recessed into the rebate.
  const frame = frameMoulding(w, h, frameW, d * 0.92, frameMat);
  frame.position.set(0, h / 2, back + 0.004);
  g.add(frame);

  // Sight size: what the moulding leaves visible. The board and the picture
  // are 2mm oversized behind it so no gap opens at the rebate.
  const sightW = Math.max(0.03, w - 2 * frameW);
  const sightH = Math.max(0.03, h - 2 * frameW);

  const zGlass = face - d * 0.28;
  const zMount = zGlass - 0.004;
  const zPic = zMount - 0.0035;

  // Fit the picture: inside the mount's own margin when there is a mount, into
  // the full sight size when there is not.
  const margin = mount ? Math.max(0.035, Math.min(sightW, sightH) * 0.12) : 0;
  const pic = fitted(art, sightW - 2 * margin, sightH - 2 * margin);

  const picture = new THREE.Mesh(pictureGeometry(pic.w, pic.h), printMaterial(art));
  picture.position.set(0, h / 2, zPic);
  g.add(picture);

  if (mount) {
    // The board is a ring, not a rectangle behind the print: cut to the
    // picture's own aspect, with the extrude bevel standing in for the 45°
    // cut edge of real mount board.
    const board = panelWithHole(sightW + 0.004, sightH + 0.004, pic.w - 0.004, pic.h - 0.004, 0.0025, 0.0018, mountMaterial());
    board.position.set(0, h / 2, zMount);
    g.add(board);
  }

  // Glazing last, in front of everything it is glazing.
  const glass = glazing(sightW, sightH);
  glass.position.set(0, h / 2, zGlass);
  g.add(glass);

  // Backing board seals the frame — a low camera looking up at a wall sees
  // straight into an open one.
  const backing = new THREE.Mesh(new THREE.BoxGeometry(w - frameW, h - frameW, 0.004), backingMaterial());
  backing.position.set(0, h / 2, back + 0.002);
  g.add(backing);

  return g;
}

/** Gallery-wrapped canvas: no frame, no glass, the picture cropped to the face
 *  and the stretcher standing the whole thing off the wall. */
function buildCanvas(w: number, h: number, d: number, art: Artwork, face: number): THREE.Group {
  const g = new THREE.Group();

  const front = new THREE.Mesh(pictureGeometry(w, h), canvasMaterial(art, w / h));
  front.position.set(0, h / 2, face - 0.0005);
  g.add(front);

  // The returns and the back. Left plain rather than wrapped with the picture:
  // a box's UVs put the whole painting on every side face, which reads as four
  // extra small paintings around the edge.
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d - 0.001), canvasMaterial(art, 1).clone());
  (body.material as THREE.MeshStandardMaterial).map = null;
  (body.material as THREE.MeshStandardMaterial).color.set("#efe9df");
  body.position.set(0, h / 2, face - 0.001 - (d - 0.001) / 2);
  g.add(body);

  return g;
}

/** Three frames hung as a set: one large, two stacked beside it. The second
 *  and third pictures come from the next artworks in the list, so a gallery
 *  wall is a gallery wall and not the same painting printed three times. */
function buildGallery(
  w: number,
  h: number,
  d: number,
  art: Artwork,
  frameMat: THREE.Material,
  mount: boolean,
  face: number,
): THREE.Group {
  const g = new THREE.Group();
  const gap = 0.045;
  const bigW = (w - gap) * 0.58;
  const smallW = w - gap - bigW;
  const smallH = (h - gap) / 2;

  const big = buildFramed(bigW, h, d, art, frameMat, 0.024, mount, face);
  big.position.x = -(w - bigW) / 2;
  g.add(big);

  const second = buildFramed(smallW, smallH, d, artworkAfter(art.id, 1), frameMat, 0.02, mount, face);
  second.position.set((w - smallW) / 2, h - smallH, 0);
  g.add(second);

  const third = buildFramed(smallW, smallH, d, artworkAfter(art.id, 2), frameMat, 0.02, mount, face);
  third.position.set((w - smallW) / 2, 0, 0);
  g.add(third);

  return g;
}

/** Picture ledge: a shelf with a lip, two frames LEANING back against the wall
 *  and a small stack of books holding the end.
 *
 *  A leaning frame is the reason this card exists — it is the one piece of
 *  wall decor that is unmistakably an object in a room rather than a decal,
 *  because it casts a shadow onto the wall behind it and the shelf under it. */
function buildLedge(
  w: number,
  h: number,
  d: number,
  art: Artwork,
  frameMat: THREE.Material,
  mount: boolean,
  face: number,
): THREE.Group {
  const g = new THREE.Group();
  const shelfT = 0.022;
  const lipH = 0.016;

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(w, shelfT, d), frameMat);
  shelf.position.set(0, shelfT / 2, face - d / 2);
  g.add(shelf);

  // The lip: what stops a leaning frame sliding off, and the profile that says
  // "picture ledge" and not "shelf".
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w, lipH, 0.01), frameMat);
  lip.position.set(0, shelfT + lipH / 2, face - 0.005);
  g.add(lip);

  const lean = 0.13; // radians back into the wall
  const tallH = Math.min(h - shelfT - 0.02, 0.42);
  const tall = buildFramed(tallH * 0.74, tallH, 0.03, art, frameMat, 0.022, mount, 0.015);
  tall.position.set(-w * 0.2, shelfT, face - d * 0.42);
  tall.rotation.x = lean;
  g.add(tall);

  const shortH = tallH * 0.72;
  const short = buildFramed(shortH * 1.3, shortH, 0.028, artworkAfter(art.id, 1), frameMat, 0.02, mount, 0.014);
  short.position.set(w * 0.12, shelfT, face - d * 0.3);
  short.rotation.x = lean;
  g.add(short);

  // Books: three, stacked, slightly out of square. A prop, but the ledge reads
  // as staged furniture without one and as a room with one.
  const books = new THREE.Group();
  const tones = ["#8a5a44", "#4a5a63", "#c9c0ad"];
  let y = 0;
  for (let i = 0; i < 3; i++) {
    const t = 0.028 - i * 0.004;
    const bw = 0.15 - i * 0.012;
    const m = new THREE.MeshStandardMaterial({ color: tones[i], roughness: 0.85 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, t, Math.min(d * 0.72, 0.1)), m);
    b.position.set(0, y + t / 2, 0);
    b.rotation.y = (i - 1) * 0.06;
    books.add(b);
    y += t;
  }
  books.position.set(w * 0.38, shelfT, face - d * 0.5);
  g.add(books);

  return g;
}

export const wallArtGenerator: GeneratorDef = {
  id: "wallArt",
  label: "Wall art",
  category: "Decor",
  // The wide roll-out list: art belongs on a wall in every room people spend
  // time in, and the hallway-sized rooms (laundry, kitchen) are exactly where
  // one small framed print does the most work.
  rooms: ["living", "bedroom", "dining", "study", "kids", "kitchen", "bathroom", "laundry"],
  wallSnap: true,
  dimLimits: { w: [0.15, 2.4], d: [0.02, 0.22], h: [0.15, 1.6] },
  modules: [
    {
      key: "mount",
      label: "Mount",
      min: 0,
      max: 1,
      default: 1,
      toggle: { on: "With mount", off: "Print to edge" },
      // A gallery wrap has no mount board and no glass to put one behind.
      appliesTo: (spec) => kindOf(spec) !== "canvas",
    },
  ],
  fronts: ["slab"],
  handles: ["none"],
  // The first swatch row picks the PICTURE. On a framed print that is the
  // choice being made; the moulding is the accessory.
  finishes: ARTWORK_IDS,
  finishesLabel: "Picture",
  finishes2: ["oak", "walnut", "painted", "steel"],
  finishes2Label: "Frame",
  // Nothing to paint on a frameless canvas — a control that does nothing
  // teaches people the inspector lies.
  showFinishes2: (spec) => kindOf(spec) !== "canvas",
  wallMounted: () => true,
  // Hung at eye level: 1.55m to the CENTRE of the piece is the standard
  // gallery hang, and y=0 is the item's base, so the base drops by half its
  // own height. A ledge hangs lower — it is a surface, and a surface at eye
  // level is a surface nobody can put anything on.
  defaultElevation: (spec) =>
    Math.max(0.6, (KIND[spec.variant ?? "framed-portrait"] === "ledge" ? 1.35 : 1.55) - spec.dims.h / 2),
  hotspotKeywords: ["wall art", "artwork", "picture", "print", "poster", "canvas"],
  // Six products, not six styles of one: a picture ledge and a gallery wall
  // share nothing but a wall.
  variantIsProduct: true,
  variants: [
    {
      id: "framed-portrait",
      label: "Portrait",
      cardLabel: "Framed print, portrait",
      defaults: { dims: { w: 0.5, d: 0.045, h: 0.7 }, finish: "art-plum", finish2: "oak" },
    },
    {
      id: "framed-landscape",
      label: "Landscape",
      cardLabel: "Framed print, landscape",
      defaults: { dims: { w: 0.72, d: 0.045, h: 0.52 }, finish: "art-wave", finish2: "walnut" },
    },
    {
      id: "framed-large",
      label: "Statement",
      cardLabel: "Large framed art",
      defaults: { dims: { w: 1.1, d: 0.055, h: 0.85 }, finish: "art-bedroom", finish2: "painted", color2: "#23252b" },
    },
    {
      id: "canvas",
      label: "Canvas",
      cardLabel: "Canvas print",
      defaults: { dims: { w: 0.9, d: CANVAS_D, h: 0.6 }, finish: "art-lilies" },
    },
    {
      id: "gallery-3",
      label: "Gallery set",
      cardLabel: "Gallery wall, set of 3",
      defaults: { dims: { w: 1.35, d: 0.042, h: 0.78 }, finish: "art-cannons", finish2: "painted", color2: "#23252b" },
    },
    {
      id: "ledge",
      label: "Ledge",
      cardLabel: "Picture ledge with frames",
      defaults: { dims: { w: 0.9, d: 0.12, h: 0.52 }, finish: "art-mono", finish2: "oak" },
    },
  ],
  defaultSpec: {
    generator: "wallArt",
    dims: { w: 0.5, d: 0.045, h: 0.7 },
    modules: { mount: 1 },
    front: "slab",
    handle: "none",
    finish: "art-plum",
    finish2: "oak",
    variant: "framed-portrait",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const kind = kindOf(spec);
    const art = artworkOf(spec.finish);
    const frameMat = finishMaterial(spec.finish2 ?? "oak");
    const face = d / 2;
    const group = new THREE.Group();

    if (kind === "canvas") {
      group.add(buildCanvas(w, h, d, art, face));
    } else if (kind === "gallery") {
      group.add(buildGallery(w, h, Math.min(d, 0.05), art, frameMat, hasMount(spec), face));
    } else if (kind === "ledge") {
      group.add(buildLedge(w, h, d, art, frameMat, hasMount(spec), face));
    } else {
      const frameW = w > 0.9 ? LARGE_FRAME_W : FRAME_W;
      group.add(buildFramed(w, h, d, art, frameMat, frameW, hasMount(spec), face));
    }

    // Only the moulding wears the wheel's colour. Tinting the group would put
    // the frame's paint over the painting.
    tagTintOfMaterial(group, spec.finish2 ?? "oak", spec.color2, frameMat);
    return group;
  },
};
