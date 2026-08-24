import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { frontOf, FRONT_T } from "./parts";
import {
  applianceBody,
  hollowBody,
  doorPanel,
  barPull,
  porthole,
  controlStrip,
  grille,
  burner,
  machineFeet,
  wireRack,
  hingeSwing,
  hingeDrop,
  lampLens,
  sealMat,
  glassMat,
  displayMat,
  linerMat,
} from "./applianceParts";

// Appliances — Phase 2 of the catalog gap plan. ONE generator, twelve cards.
//
// They share a generator because they share a construction: a body, a door
// proud of it, a pull, a control strip. They are separate CARDS because a
// shopper does not browse "appliance" — they browse for a dishwasher. That is
// the Phase 1 rule and it is what fills the Kitchen and Laundry tabs.
//
// The three placement modes are the load-bearing distinction here, and they
// follow the variant, never the generator:
//   FLOOR    fridges, cookers, dishwashers, washers, dryers — a floor ghost.
//   COUNTER  the worktop microwave — bonds to a kitchenBase run and rides it.
//   WALL     the over-range microwave — wall-grid ghost, height from the click.
// Getting this wrong is what makes an appliance float or bury itself, so every
// variant is listed against its mode in MOUNT below rather than being decided
// by scattered ifs.

const DOOR_T = 0.024; // how far a door front stands proud of the body
const GAP = 0.008; // shadow gap between two doors

// Depth reserved IN FRONT of the carcass for everything the front carries. The
// declared footprint is what the item occupies in the plan, so the handle has
// to live inside it — a fridge whose pull sticks 6cm past its own depth passes
// straight through the island you parked it opposite.
const PULL_PROUD = 0.075; // door panel + bar pull
const FACE_PROUD = 0.05; // fascia + porthole, no pull (washers, dryers)

type Mount = "floor" | "counter" | "wall";
const MOUNT: Record<string, Mount> = {
  "fridge-2door": "floor",
  "fridge-side-by-side": "floor",
  "fridge-under-counter": "floor",
  oven: "floor",
  "range-cooker": "floor",
  "dishwasher-integrated": "floor",
  "dishwasher-steel": "floor",
  washer: "floor",
  dryer: "floor",
  "washer-dryer-stack": "floor",
  microwave: "counter",
  "microwave-over-range": "wall",
};

const variantOf = (spec: ParametricSpec) => spec.variant ?? "fridge-2door";
const openOf = (spec: ParametricSpec) => (spec.modules.doorOpen ?? 0) >= 1;

/** Doors that a spec can actually open — the ones with an interior worth
 *  showing. A washing machine's porthole already shows its drum, so swinging
 *  it open just hides the machine behind a disc. */
const CAN_OPEN = new Set(["fridge-2door", "fridge-side-by-side", "fridge-under-counter", "oven", "dishwasher-integrated", "dishwasher-steel"]);

/** Body + the z of its front face. Solid when shut (cheaper, identical to
 *  look at); a shell with a lined cavity when a door is going to open on it.
 *  `proud` is the depth held back for the door and its hardware — the body
 *  gets the rest, and the back stays flat against the wall either way. */
function bodyOf(
  w: number,
  d: number,
  h: number,
  mat: THREE.Material,
  yBase: number,
  open: boolean,
  proud = PULL_PROUD,
) {
  const bodyD = Math.max(d - proud, 0.08);
  const g = open ? hollowBody(w, bodyD, h, mat) : new THREE.Group().add(applianceBody(w, bodyD, h, mat));
  g.position.set(0, yBase, -proud / 2);
  return { group: g, frontZ: bodyD / 2 - proud / 2 };
}

/** Glass shelves + a crisper drawer: what an open fridge is FOR. */
function fridgeInterior(w: number, d: number, h: number, yBase: number): THREE.Group {
  const g = new THREE.Group();
  const liner = linerMat();
  const iw = w - 0.13;
  const shelfMat = new THREE.MeshStandardMaterial({ color: "#cdd6da", roughness: 0.15, metalness: 0.1 });
  const shelves = Math.max(2, Math.round(h / 0.34));
  for (let i = 1; i <= shelves; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.008, d * 0.72), shelfMat);
    shelf.position.set(0, yBase + (h * i) / (shelves + 1), -0.02);
    g.add(shelf);
  }
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(iw, h * 0.16, d * 0.68), liner);
  drawer.position.set(0, yBase + h * 0.13, -0.02);
  g.add(drawer);
  return g;
}

/** One fridge door: panel, hinge side, and a vertical pull inset from the
 *  opening edge (the edge opposite the hinge — where a hand actually goes). */
function fridgeDoor(
  w: number,
  h: number,
  mat: THREE.Material,
  o: { hinge: -1 | 1; frontZ: number; y: number; open: boolean; pullFrac?: number },
): THREE.Group {
  const door = new THREE.Group();
  door.add(doorPanel(w, h, mat));
  const pull = barPull(Math.min(h * (o.pullFrac ?? 0.55), 0.5), true);
  pull.position.set(-o.hinge * (w / 2 - 0.055), o.hinge > 0 ? -h * 0.12 : h * 0.12, DOOR_T);
  door.add(pull);
  const swung = hingeSwing(door, (o.hinge * w) / 2, o.open ? 1 : 0);
  swung.position.set(0, o.y, o.frontZ);
  return swung;
}

function buildFridge(spec: ParametricSpec, mat: THREE.Material, sideBySide: boolean): THREE.Group {
  const { w, d, h } = spec.dims;
  const g = new THREE.Group();
  const open = openOf(spec);
  const LIFT = 0.035;
  const bodyH = h - LIFT;
  g.add(machineFeet(w, d - PULL_PROUD, LIFT));
  const body = bodyOf(w, d, bodyH, mat, LIFT, open);
  g.add(body.group);

  if (open) g.add(fridgeInterior(w, d - PULL_PROUD, bodyH, LIFT));

  if (sideBySide) {
    // Freezer left, fridge right, split down the middle; both hinge outward.
    const leafW = (w - GAP) / 2;
    for (const s of [-1, 1] as const) {
      const leaf = fridgeDoor(leafW, bodyH - 0.01, mat, {
        hinge: s,
        frontZ: body.frontZ,
        y: LIFT + bodyH / 2,
        open,
        pullFrac: 0.42,
      });
      leaf.position.x = (s * (leafW + GAP)) / 2;
      g.add(leaf);
    }
    // Water/ice dispenser recessed into the freezer door — the detail that
    // makes a side-by-side read as one instead of as a wide two-door.
    const dw = Math.min(leafW * 0.55, 0.26);
    const recess = new THREE.Mesh(new THREE.BoxGeometry(dw, dw * 1.15, 0.05), sealMat());
    recess.position.set(-(leafW + GAP) / 2, LIFT + bodyH * 0.66, body.frontZ + DOOR_T - 0.01);
    g.add(recess);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(dw * 0.8, 0.035), displayMat());
    panel.position.set(-(leafW + GAP) / 2, LIFT + bodyH * 0.66 + dw * 0.72, body.frontZ + DOOR_T + 0.016);
    g.add(panel);
  } else {
    // Fridge over freezer, both hinged left.
    const freezerH = bodyH * 0.34;
    const fridgeH = bodyH - freezerH - GAP;
    const upper = fridgeDoor(w, fridgeH, mat, { hinge: -1, frontZ: body.frontZ, y: LIFT + freezerH + GAP + fridgeH / 2, open });
    const lower = fridgeDoor(w, freezerH, mat, { hinge: -1, frontZ: body.frontZ, y: LIFT + freezerH / 2, open, pullFrac: 0.5 });
    g.add(upper, lower);
  }
  return g;
}

function buildUnderCounterFridge(spec: ParametricSpec, mat: THREE.Material): THREE.Group {
  const { w, d, h } = spec.dims;
  const g = new THREE.Group();
  const open = openOf(spec);
  const KICK = 0.09;
  const bodyH = h - KICK;
  const body = bodyOf(w, d, bodyH, mat, KICK, open);
  g.add(body.group);
  if (open) g.add(fridgeInterior(w, d - PULL_PROUD, bodyH, KICK));

  const door = new THREE.Group();
  door.add(doorPanel(w, bodyH - 0.01, mat));
  const pull = barPull(Math.min(w * 0.6, 0.36));
  pull.position.set(0, (bodyH - 0.01) / 2 - 0.05, DOOR_T);
  door.add(pull);
  const swung = hingeSwing(door, -w / 2, open ? 1 : 0);
  swung.position.set(0, KICK + bodyH / 2, body.frontZ);
  g.add(swung);

  // Toe grille: an under-counter unit vents at the plinth, and the dark band
  // also stops the body reading as a box sitting flat on the floor.
  const vent = grille(w - 0.06, KICK - 0.02, 3, mat);
  vent.position.set(0, KICK / 2, body.frontZ + 0.004);
  g.add(vent);
  return g;
}

/** Oven front: dark glass in a frame, a full-width pull, and a control strip
 *  above it. Shared by the built-in oven and the range cooker's ovens. */
function ovenDoor(w: number, h: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(doorPanel(w, h, mat));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w - 0.09, 0.05), Math.max(h - 0.11, 0.04), 0.01), glassMat());
  glass.position.z = DOOR_T + 0.004;
  g.add(glass);
  // A second, smaller pane inset in the first reads as the double glazing you
  // see through a real oven door.
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w - 0.16, 0.03), Math.max(h - 0.2, 0.02)), sealMat());
  inner.position.z = DOOR_T + 0.011;
  g.add(inner);
  const pull = barPull(Math.min(w - 0.06, 0.62));
  pull.position.set(0, h / 2 - 0.045, DOOR_T);
  g.add(pull);
  return g;
}

function buildOven(spec: ParametricSpec, mat: THREE.Material): THREE.Group {
  const { w, d, h } = spec.dims;
  const g = new THREE.Group();
  const open = openOf(spec);
  // A built-in oven sits in a housing, on a plinth. It also has to: with the
  // door hinged at y=0 the handle swings BELOW the floor when the door drops
  // open, because an open door's outer face ends up pointing down.
  const BASE = 0.09;
  const FASCIA = Math.min(0.1, h * 0.18);
  const bodyH = h - BASE;
  const doorH = bodyH - FASCIA - 0.01;
  const body = bodyOf(w, d, bodyH, mat, BASE, open);
  g.add(body.group);

  if (open) {
    for (const f of [0.34, 0.62]) {
      const rack = wireRack(w - 0.13, (d - PULL_PROUD) * 0.78);
      rack.position.set(0, BASE + bodyH * f, -PULL_PROUD / 2);
      g.add(rack);
    }
  }

  const strip = controlStrip(w - 0.04, FASCIA - 0.02, { knobs: 2, display: true });
  strip.position.set(0, h - FASCIA / 2, body.frontZ + 0.008);
  g.add(strip);

  const door = ovenDoor(w, doorH, mat);
  const dropped = hingeDrop(door, doorH / 2, open ? 1 : 0);
  dropped.position.set(0, BASE + doorH / 2, body.frontZ);
  g.add(dropped);

  const plinth = grille(w - 0.06, BASE - 0.02, 2, mat);
  plinth.position.set(0, BASE / 2, body.frontZ + 0.004);
  g.add(plinth);
  return g;
}

function buildRangeCooker(spec: ParametricSpec, mat: THREE.Material): THREE.Group {
  const { w, d, h } = spec.dims;
  const g = new THREE.Group();
  const HOB_T = 0.03;
  const BURNER_H = 0.04; // the trivets stand up off the hob and count toward h
  const bodyH = h - HOB_T - BURNER_H;
  const FASCIA = 0.1;
  const body = bodyOf(w, d, bodyH, mat, 0, false);
  g.add(body.group);

  // Hob: a black slab overhanging the body slightly, as a cooker's top does.
  const hob = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, HOB_T, d - PULL_PROUD + 0.01), finishMaterial("glass-black"));
  hob.position.set(0, bodyH + HOB_T / 2, -PULL_PROUD / 2);
  g.add(hob);

  const n = Math.max(4, Math.min(6, Math.round(spec.modules.burners ?? 5)));
  // Burners sit well INSIDE the hob: a pan on the outer ring has to clear the
  // edge, so the trivets are inset by roughly their own radius plus a margin
  // rather than pushed out to the corners.
  const r = Math.min(0.085, w * 0.1, (d - PULL_PROUD) * 0.14);
  const bx = Math.max(w / 2 - r - 0.075, 0.01);
  const bz = Math.max((d - PULL_PROUD) / 2 - r - 0.06, 0.01);
  const spots: [number, number][] =
    n === 4
      ? [[-bx, -bz], [bx, -bz], [-bx, bz], [bx, bz]]
      : n === 5
        ? [[-bx, -bz], [bx, -bz], [-bx, bz], [bx, bz], [0, 0]]
        : [[-bx, -bz], [0, -bz], [bx, -bz], [-bx, bz], [0, bz], [bx, bz]];
  for (const [x, z] of spots) {
    const b = burner(r);
    b.position.set(x, bodyH + HOB_T, z - PULL_PROUD / 2);
    g.add(b);
  }

  // Knob fascia across the top of the doors: one knob per burner plus the oven.
  const strip = controlStrip(w - 0.04, FASCIA - 0.02, { knobs: n + 1, display: true, knobR: 0.019 });
  strip.position.set(0, bodyH - FASCIA / 2, body.frontZ + 0.008);
  g.add(strip);

  // A 90cm range is a main oven plus a tall narrow one; a 60 is a single oven.
  const doorH = bodyH - FASCIA - 0.02;
  const twin = w > 0.72;
  if (twin) {
    const mainW = w * 0.63;
    const sideW = w - mainW - GAP;
    const main = ovenDoor(mainW, doorH, mat);
    main.position.set(-w / 2 + mainW / 2, doorH / 2 + 0.01, body.frontZ);
    g.add(main);
    const side = ovenDoor(sideW, doorH, mat);
    side.position.set(w / 2 - sideW / 2, doorH / 2 + 0.01, body.frontZ);
    g.add(side);
  } else {
    const main = ovenDoor(w - 0.01, doorH, mat);
    main.position.set(0, doorH / 2 + 0.01, body.frontZ);
    g.add(main);
  }
  return g;
}

function buildDishwasher(spec: ParametricSpec, mat: THREE.Material, integrated: boolean): THREE.Group {
  const { w, d, h } = spec.dims;
  const g = new THREE.Group();
  const open = openOf(spec);
  const KICK = 0.09;
  const bodyH = h - KICK;
  const body = bodyOf(w, d, bodyH, mat, KICK, open);
  g.add(body.group);

  if (open) {
    for (const f of [0.3, 0.66]) {
      const basket = wireRack(w - 0.13, (d - PULL_PROUD) * 0.76, 9);
      basket.position.set(0, KICK + bodyH * f, -PULL_PROUD / 2);
      g.add(basket);
    }
  }

  const doorH = bodyH - 0.01;
  const door = new THREE.Group();
  if (integrated) {
    // Wears the kitchen's own door front and finish — the whole point of an
    // integrated machine is that it disappears into the run.
    const panel = frontOf(spec.front, w, doorH, mat);
    panel.position.z = FRONT_T / 2 + 0.004;
    door.add(panel);
    // Its controls live on the TOP edge, hidden until the door is open.
    const strip = controlStrip(w * 0.6, 0.03, { display: true });
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, doorH / 2 - 0.016, 0.012);
    door.add(strip);
    const pull = barPull(Math.min(w * 0.55, 0.34));
    pull.position.set(0, doorH / 2 - 0.06, FRONT_T + 0.006);
    door.add(pull);
  } else {
    door.add(doorPanel(w, doorH, mat));
    const strip = controlStrip(w - 0.05, 0.055, { knobs: 0, display: true });
    strip.position.set(0, doorH / 2 - 0.045, DOOR_T + 0.004);
    door.add(strip);
    const pull = barPull(Math.min(w - 0.06, 0.5));
    pull.position.set(0, doorH / 2 - 0.115, DOOR_T);
    door.add(pull);
  }
  const dropped = hingeDrop(door, doorH / 2, open ? 1 : 0);
  dropped.position.set(0, KICK + doorH / 2, body.frontZ);
  g.add(dropped);

  const vent = grille(w - 0.06, KICK - 0.02, 2, mat);
  vent.position.set(0, KICK / 2, body.frontZ + 0.004);
  g.add(vent);
  return g;
}

/** Washer/dryer share everything but the detergent drawer and the vent. Built
 *  with its base at y=0 so the stacked variant can just translate a second
 *  copy up. */
function buildLaundryMachine(w: number, d: number, h: number, mat: THREE.Material, kind: "washer" | "dryer"): THREE.Group {
  const g = new THREE.Group();
  const LIFT = 0.03;
  const bodyH = h - LIFT;
  // No pull on these — the porthole rim and the fascia knobs are the frontmost
  // parts — so they only hold back the smaller face clearance.
  const bodyD = d - FACE_PROUD;
  g.add(machineFeet(w, bodyD, LIFT));
  const body = applianceBody(w, bodyD, bodyH, mat);
  body.position.y += LIFT;
  body.position.z = -FACE_PROUD / 2;
  g.add(body);
  const frontZ = d / 2 - FACE_PROUD;

  const FASCIA = Math.min(0.11, bodyH * 0.16);
  const strip = controlStrip(w - 0.05, FASCIA - 0.025, { knobs: 1, display: true, knobR: 0.026 });
  strip.position.set(0, LIFT + bodyH - FASCIA / 2, frontZ + 0.006);
  g.add(strip);

  if (kind === "washer") {
    // Detergent drawer: a shallow box standing proud with a lip to pull.
    const dw = w * 0.36;
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.075, 0.03), mat);
    drawer.position.set(-w / 2 + dw / 2 + 0.03, LIFT + bodyH - FASCIA - 0.055, frontZ + 0.014);
    g.add(drawer);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(dw * 0.9, 0.012, 0.016), sealMat());
    lip.position.set(-w / 2 + dw / 2 + 0.03, LIFT + bodyH - FASCIA - 0.085, frontZ + 0.022);
    g.add(lip);
  } else {
    // Dryers exhaust at the plinth and have no drawer, so the low grille is
    // what tells the two machines apart at a glance.
    const vent = grille(w * 0.5, 0.05, 3, mat);
    vent.position.set(0, LIFT + 0.06, frontZ + 0.006);
    g.add(vent);
  }

  // Door: a proud disc carrying the porthole, so it reads as a door and not a
  // hole cut in the front panel.
  const r = Math.min(w, bodyH - FASCIA) * 0.33;
  const doorY = LIFT + (bodyH - FASCIA) * 0.46;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.032, r + 0.032, 0.016, 30), mat);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(0, doorY, frontZ + 0.008);
  g.add(disc);
  const win = porthole(r);
  win.position.set(0, doorY, frontZ + 0.014);
  g.add(win);
  return g;
}

function buildStack(spec: ParametricSpec, mat: THREE.Material): THREE.Group {
  const { w, d, h } = spec.dims;
  const g = new THREE.Group();
  const BRIDGE = 0.02;
  const unitH = (h - BRIDGE) / 2;
  g.add(buildLaundryMachine(w, d, unitH, mat, "washer"));
  const dryer = buildLaundryMachine(w, d, unitH, mat, "dryer");
  dryer.position.y = unitH + BRIDGE;
  g.add(dryer);
  // Stacking kit: the dark band that holds the dryer on the washer.
  const kit = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, BRIDGE, d - 0.01), sealMat());
  kit.position.set(0, unitH + BRIDGE / 2, 0);
  g.add(kit);
  return g;
}

/** Microwave body, shared by the worktop and over-range variants: glass door
 *  on the left, control column on the right. */
function microwaveShell(w: number, d: number, h: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const body = applianceBody(w, d - PULL_PROUD, h, mat);
  body.position.z = -PULL_PROUD / 2;
  g.add(body);
  const frontZ = d / 2 - PULL_PROUD;

  const colW = Math.min(w * 0.28, 0.15);
  const doorW = w - colW - GAP;
  const doorH = h - 0.02;

  const door = new THREE.Group();
  door.add(doorPanel(doorW, doorH, mat));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.05, doorH - 0.05, 0.008), glassMat());
  glass.position.z = DOOR_T + 0.003;
  door.add(glass);
  // The perforated screen: a few fine bars over the glass. A flat dark pane
  // alone reads as a black sticker.
  const bars = 7;
  for (let i = 1; i < bars; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.002, doorH - 0.06, 0.004), sealMat());
    bar.position.set(-(doorW - 0.05) / 2 + ((doorW - 0.05) * i) / bars, 0, DOOR_T + 0.009);
    door.add(bar);
  }
  const pull = barPull(doorH * 0.6, true);
  pull.position.set(doorW / 2 - 0.03, 0, DOOR_T);
  door.add(pull);
  door.position.set(-w / 2 + doorW / 2, h / 2, frontZ);
  g.add(door);

  const col = controlStrip(colW, doorH, { knobs: 2, display: true, knobR: 0.017 });
  col.position.set(w / 2 - colW / 2, h / 2, frontZ + 0.008);
  g.add(col);
  return g;
}

function buildMicrowave(spec: ParametricSpec, mat: THREE.Material): THREE.Group {
  const { w, d, h } = spec.dims;
  const g = new THREE.Group();
  const FOOT = 0.014;
  const shell = microwaveShell(w, d, h - FOOT, mat);
  shell.position.y = FOOT;
  g.add(shell);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, FOOT, 8), sealMat());
      foot.position.set((sx * (w - 0.06)) / 2, FOOT / 2, (sz * (d - 0.08)) / 2);
      g.add(foot);
    }
  }
  return g;
}

function buildOverRangeMicrowave(spec: ParametricSpec, mat: THREE.Material): THREE.Group {
  const { w, d, h } = spec.dims;
  const g = new THREE.Group();
  // Everything that makes this one different is on the UNDERSIDE — that's the
  // face you actually see, standing at the cooker below it. So the shell is
  // lifted by a service band and the extractor grille and lamps live in it,
  // inside the item's own height rather than hanging out under it.
  const UNDER = 0.026;
  const shell = microwaveShell(w, d, h - UNDER, mat);
  shell.position.y = UNDER;
  g.add(shell);

  const vent = grille(w * 0.44, (d - PULL_PROUD) * 0.5, 4, mat);
  vent.rotation.x = Math.PI / 2; // stand the grille down, facing the hob
  vent.position.set(0, UNDER - 0.006, -PULL_PROUD / 2);
  g.add(vent);
  for (const sx of [-1, 1]) {
    const lens = lampLens(Math.min(w, d) * 0.085, true);
    lens.position.set((sx * w) / 3.4, UNDER - 0.008, d * 0.13);
    g.add(lens);
  }
  return g;
}

export const applianceGenerator: GeneratorDef = {
  id: "appliance",
  label: "Appliance",
  category: "Kitchen",
  rooms: ["kitchen", "laundry", "bathroom"],
  wallSnap: true,
  dimLimits: { w: [0.35, 1.2], d: [0.28, 0.85], h: [0.24, 2.05] },
  modules: [
    {
      key: "doorOpen",
      label: "Door",
      min: 0,
      max: 1,
      default: 0,
      toggle: { on: "Door open", off: "Door closed" },
      appliesTo: (spec) => CAN_OPEN.has(variantOf(spec)),
    },
    {
      key: "burners",
      label: "Burners",
      min: 4,
      max: 6,
      default: 5,
      appliesTo: (spec) => variantOf(spec) === "range-cooker",
    },
  ],
  // Only the integrated dishwasher wears a door PROFILE — every other variant
  // is a steel or painted slab, so the front row would be a dead control.
  fronts: ["slab", "shaker", "farmhouse"],
  showFronts: (spec) => variantOf(spec) === "dishwasher-integrated",
  handles: ["none"],
  finishes: ["steel", "painted", "glass-black", "oak", "walnut", "laminate-matte"],
  wallMounted: (spec) => MOUNT[variantOf(spec)] === "wall",
  counterItem: (spec) => MOUNT[variantOf(spec)] === "counter",
  cutoutSize: () => null, // a microwave stands ON the worktop; it cuts nothing
  // No defaultElevation on purpose. A wall variant takes its height from the
  // wall-ray click and a counter variant from its host, so the only thing a
  // number here could do is lift the FLOOR variants off the ground — see
  // `elevationOf` in index.ts.
  hotspotKeywords: ["fridge", "refrigerator", "oven", "stove", "cooker", "dishwasher", "washer", "washing machine", "dryer", "microwave", "appliance"],
  // A fridge and an oven are not two styles of one appliance. Each card places
  // its own size, so switching variant on a PLACED item would leave the new
  // one wearing the old one's dimensions — a fridge-sized oven.
  variantIsProduct: true,
  variants: [
    {
      id: "fridge-2door",
      label: "Fridge",
      cardLabel: "Fridge freezer",
      hotspotKeywords: ["fridge", "refrigerator"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.6, d: 0.66, h: 1.85 }, finish: "steel" },
    },
    {
      id: "fridge-side-by-side",
      label: "Side-by-side",
      cardLabel: "Side-by-side fridge",
      hotspotKeywords: ["fridge", "refrigerator"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.91, d: 0.72, h: 1.78 }, finish: "steel" },
    },
    {
      id: "fridge-under-counter",
      label: "Under-counter",
      cardLabel: "Under-counter fridge",
      hotspotKeywords: ["fridge", "refrigerator"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.6, d: 0.58, h: 0.82 }, finish: "steel" },
    },
    {
      id: "oven",
      label: "Oven",
      cardLabel: "Built-in oven",
      hotspotKeywords: ["oven", "stove"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.6, d: 0.57, h: 0.6 }, finish: "glass-black" },
    },
    {
      id: "range-cooker",
      label: "Range",
      cardLabel: "Range cooker",
      hotspotKeywords: ["cooker", "stove", "oven", "range"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.9, d: 0.65, h: 0.92 }, finish: "steel", modules: { burners: 5 } },
    },
    {
      id: "dishwasher-integrated",
      label: "Integrated",
      cardLabel: "Integrated dishwasher",
      hotspotKeywords: ["dishwasher"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.6, d: 0.57, h: 0.82 }, finish: "painted", front: "slab" },
    },
    {
      id: "dishwasher-steel",
      label: "Steel front",
      cardLabel: "Steel dishwasher",
      hotspotKeywords: ["dishwasher"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.6, d: 0.57, h: 0.82 }, finish: "steel" },
    },
    {
      id: "washer",
      label: "Washer",
      cardLabel: "Washing machine",
      hotspotKeywords: ["washer", "washing machine", "laundry"],
      rooms: ["laundry", "bathroom"],
      defaults: { dims: { w: 0.6, d: 0.6, h: 0.85 }, finish: "painted" },
    },
    {
      id: "dryer",
      label: "Dryer",
      cardLabel: "Tumble dryer",
      hotspotKeywords: ["dryer", "laundry"],
      rooms: ["laundry", "bathroom"],
      defaults: { dims: { w: 0.6, d: 0.6, h: 0.85 }, finish: "painted" },
    },
    {
      id: "washer-dryer-stack",
      label: "Stacked",
      cardLabel: "Stacked washer + dryer",
      hotspotKeywords: ["washer", "dryer", "laundry"],
      rooms: ["laundry", "bathroom"],
      defaults: { dims: { w: 0.6, d: 0.6, h: 1.72 }, finish: "painted" },
    },
    {
      id: "microwave",
      label: "Microwave",
      cardLabel: "Worktop microwave",
      hotspotKeywords: ["microwave"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.5, d: 0.38, h: 0.3 }, finish: "steel" },
    },
    {
      id: "microwave-over-range",
      label: "Over-range",
      cardLabel: "Over-range microwave",
      hotspotKeywords: ["microwave"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.6, d: 0.4, h: 0.42 }, finish: "steel" },
    },
  ],
  defaultSpec: {
    generator: "appliance",
    dims: { w: 0.6, d: 0.66, h: 1.85 },
    modules: { doorOpen: 0, burners: 5 },
    front: "slab",
    handle: "none",
    finish: "steel",
    variant: "fridge-2door",
  },
  build(spec: ParametricSpec): THREE.Group {
    const mat = finishMaterial(spec.finish);
    const variant = variantOf(spec);
    let group: THREE.Group;

    switch (variant) {
      case "fridge-side-by-side":
        group = buildFridge(spec, mat, true);
        break;
      case "fridge-under-counter":
        group = buildUnderCounterFridge(spec, mat);
        break;
      case "oven":
        group = buildOven(spec, mat);
        break;
      case "range-cooker":
        group = buildRangeCooker(spec, mat);
        break;
      case "dishwasher-integrated":
        group = buildDishwasher(spec, mat, true);
        break;
      case "dishwasher-steel":
        group = buildDishwasher(spec, mat, false);
        break;
      case "washer":
        group = buildLaundryMachine(spec.dims.w, spec.dims.d, spec.dims.h, mat, "washer");
        break;
      case "dryer":
        group = buildLaundryMachine(spec.dims.w, spec.dims.d, spec.dims.h, mat, "dryer");
        break;
      case "washer-dryer-stack":
        group = buildStack(spec, mat);
        break;
      case "microwave":
        group = buildMicrowave(spec, mat);
        break;
      case "microwave-over-range":
        group = buildOverRangeMicrowave(spec, mat);
        break;
      default:
        group = buildFridge(spec, mat, false);
    }

    // Only the meshes actually built from the finish take the colour wheel —
    // the Phase 1 lesson: tinting the whole group turns the chrome pink too.
    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
