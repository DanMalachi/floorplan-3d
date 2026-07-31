// Everything derived from a traced staircase: how many steps, how tall each
// riser, and where the landings are. Pure — no Three.js, no React — so both the
// trace canvas (2D preview + buildability readout) and the 3D mesh builder read
// the SAME numbers instead of each inventing their own.
//
// The central rule: a staircase has ONE total `rise`. The step count derives
// from it once and is then distributed across the flights, so the riser is
// uniform over the whole staircase by construction. Per-flight rise would let
// two flights disagree, and the disagreement would show up as a visible step
// discontinuity at the landing.
//
// The second rule: landings are never authored. The GAP a user leaves between
// two flights IS the landing, and its footprint is the convex hull of the two
// facing cross-sections. One formula covers a straight mid-landing, a
// quarter-turn and a half-turn, at any angle.

import type { Stair, StairFlight } from "@/schema/scene";
import {
  COMFORT_RISER,
  LANDING_DEPTH,
  LANDING_SLAB,
  MIN_STAIR_STEPS,
} from "@/schema/constants";

export interface Pt {
  x: number;
  y: number;
}

const EPS = 1e-9;

export function flightRun(f: StairFlight): number {
  return Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
}

export function totalRun(s: Stair): number {
  let sum = 0;
  for (const f of s.flights) sum += flightRun(f);
  return sum;
}

/** Unit vector along a flight, foot -> head. Zero-length flights report +X so
 *  downstream geometry stays finite rather than emitting NaN corners. */
function direction(f: StairFlight): Pt {
  const dx = f.x1 - f.x0;
  const dy = f.y1 - f.y0;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

/**
 * Perpendicular distance from a point to a flight's AXIS (infinite line, not
 * the segment). Same units in, same units out, so the canvas can feed it
 * pixels.
 *
 * This is the width click: forgiving along the run, and accurate only across
 * it — which is where the plan's parallel edges are drawn.
 */
export function perpDistanceToFlight(f: StairFlight, x: number, y: number): number {
  const d = direction(f);
  return Math.abs((x - f.x0) * -d.y + (y - f.y0) * d.x);
}

// A stray width click would otherwise hand back a 12 m staircase or a
// zero-width one, and both break the mesh rather than the intent.
export const MIN_STAIR_WIDTH = 0.3; // meters
export const MAX_STAIR_WIDTH = 3;

export function clampStairWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_STAIR_WIDTH;
  return Math.min(MAX_STAIR_WIDTH, Math.max(MIN_STAIR_WIDTH, width));
}

/**
 * Total steps for the whole staircase. `steps` present = the user counted the
 * treads printed on the plan and overrode us; absent = derive from the rise at
 * a comfortable riser height.
 *
 * Floored at one step per flight as well as MIN_STAIR_STEPS, because the
 * distribution below cannot give a flight zero steps.
 */
export function stepCount(s: Stair): number {
  const floor = Math.max(MIN_STAIR_STEPS, s.flights.length);
  const raw = s.steps != null ? Math.round(s.steps) : Math.round(s.rise / COMFORT_RISER);
  return Number.isFinite(raw) ? Math.max(floor, raw) : floor;
}

/**
 * Split `total` steps across flights in proportion to their run length, by
 * largest remainder, so the parts sum to EXACTLY `total` (a plain round-each
 * would drift and change the riser height). Every flight gets at least one.
 */
function distributeSteps(runs: number[], total: number): number[] {
  const n = runs.length;
  if (n === 0) return [];
  if (n === 1) return [total];

  const sum = runs.reduce((a, b) => a + b, 0);
  // No length anywhere to weight by — fall back to an even split.
  const quotas =
    sum > EPS ? runs.map((r) => (r / sum) * total) : runs.map(() => total / n);

  const out = quotas.map((q) => Math.max(1, Math.floor(q)));
  let assigned = out.reduce((a, b) => a + b, 0);

  if (assigned < total) {
    const order = quotas
      .map((q, i) => ({ i, frac: q - Math.floor(q) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; assigned < total; k++, assigned++) out[order[k % n].i]++;
  } else if (assigned > total) {
    // The min-1 floor over-assigned (a very short flight among long ones).
    // Claw back from whoever has the most, never below 1.
    while (assigned > total) {
      let big = 0;
      for (let i = 1; i < n; i++) if (out[i] > out[big]) big = i;
      if (out[big] <= 1) break; // cannot go lower; total was below flight count
      out[big]--;
      assigned--;
    }
  }
  return out;
}

export interface FlightMetrics {
  run: number;
  steps: number;
  going: number; // tread depth within this flight
  baseHeight: number; // height of this flight's FOOT (0 for the first)
  topHeight: number; // height of its head
  angleRad: number; // pitch above horizontal
}

export interface StairMetrics {
  steps: number; // total
  riser: number; // uniform across the whole staircase
  going: number; // nominal, totalRun / steps
  run: number; // total
  flights: FlightMetrics[];
  warnings: string[]; // advisory only — nothing blocks on these
}

const cm = (m: number) => `${Math.round(m * 100)} cm`;

export function stairMetrics(s: Stair): StairMetrics {
  const runs = s.flights.map(flightRun);
  const run = runs.reduce((a, b) => a + b, 0);
  const steps = stepCount(s);
  const per = distributeSteps(runs, steps);
  const riser = steps > 0 ? s.rise / steps : 0;
  const going = steps > 0 ? run / steps : 0;

  const flights: FlightMetrics[] = [];
  let stepsBefore = 0;
  for (let i = 0; i < s.flights.length; i++) {
    const fSteps = per[i] ?? 0;
    const fRun = runs[i];
    const fGoing = fSteps > 0 ? fRun / fSteps : 0;
    flights.push({
      run: fRun,
      steps: fSteps,
      going: fGoing,
      baseHeight: riser * stepsBefore,
      topHeight: riser * (stepsBefore + fSteps),
      angleRad: fGoing > EPS ? Math.atan2(riser, fGoing) : Math.PI / 2,
    });
    stepsBefore += fSteps;
  }

  // Buildability, as a rule of thumb rather than a code check: report, never
  // block. A plan can legitimately show a stair that fails these.
  const warnings: string[] = [];
  if (s.rise <= 0) warnings.push("Rise must be greater than zero.");
  if (s.flights.length === 0) warnings.push("Stair has no flights.");
  runs.forEach((r, i) => {
    if (r <= EPS) warnings.push(`Flight ${i + 1} has no length.`);
  });
  if (riser > 0.19) warnings.push(`Riser ${cm(riser)} is steep (over 19 cm).`);
  if (going > EPS && going < 0.25) warnings.push(`Tread ${cm(going)} is shallow (under 25 cm).`);
  const rule = 2 * riser + going;
  if (going > EPS && (rule < 0.6 || rule > 0.66)) {
    warnings.push(`2×riser + tread is ${cm(rule)} — comfortable stairs sit between 60 and 66 cm.`);
  }
  if (s.width < 0.8) warnings.push(`Width ${cm(s.width)} is narrow (under 80 cm).`);
  for (let i = 0; i + 1 < s.flights.length; i++) {
    const a = s.flights[i];
    const b = s.flights[i + 1];
    const gap = Math.hypot(b.x0 - a.x1, b.y0 - a.y1);
    if (gap > 3) warnings.push(`Landing ${i + 1} spans ${cm(gap)} — is that intended?`);
    // Only reachable when two flights continue on the SAME axis with no gap at
    // all: there is genuinely nothing between them to bridge. A flush TURN is
    // not this case — it builds a proper landing (see interiorLandingPoly).
    if (interiorLandingPoly(a, b, s.width).length < 3) {
      warnings.push(`Flights ${i + 1} and ${i + 2} meet head-on — leave a gap for the landing.`);
    }
  }

  return { steps, riser, going, run, flights, warnings };
}

/** The two points at ±width/2 across a flight's axis, at a given point on it. */
function crossSection(at: Pt, dir: Pt, width: number): [Pt, Pt] {
  const h = width / 2;
  const px = -dir.y;
  const py = dir.x;
  return [
    { x: at.x + px * h, y: at.y + py * h },
    { x: at.x - px * h, y: at.y - py * h },
  ];
}

/** Monotone-chain hull, CCW, collinear points dropped. */
function convexHull(pts: Pt[]): Pt[] {
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const uniq = sorted.filter(
    (p, i) =>
      i === 0 ||
      Math.abs(p.x - sorted[i - 1].x) > EPS ||
      Math.abs(p.y - sorted[i - 1].y) > EPS,
  );
  if (uniq.length < 3) return uniq;

  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Pt[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * The footprint bridging two consecutive flights.
 *
 * A straight break and a turn are different problems, so this builds two
 * different shapes:
 *
 * - **Straight break** (flight B continues on flight A's heading and axis):
 *   the gap the user left IS the landing, so the hull of the two facing
 *   cross-sections is exactly right and nothing is added.
 *
 * - **Turn** (quarter, half or oblique): those two cross-sections face each
 *   other ACROSS the corner, and their hull collapses. On a half-turn — two
 *   flights side by side, both ending on the same line, which is how a U is
 *   naturally traced — it collapses to a sliver millimetres deep, which is why
 *   a U-stair rendered as two flights with a void between them. A turn needs
 *   somewhere to stand, so each corridor is extended past its own end by the
 *   stair's width (the conventional minimum landing depth: a landing is at
 *   least as deep as the stair is wide) before hulling. That fills the corner
 *   of an L and the crossover of a U, and it is why a flush turn is now a
 *   perfectly good staircase rather than a warning.
 *
 * Fewer than 3 points still means there is nothing to bridge — only reachable
 * now when two collinear flights meet with no gap at all.
 */
function interiorLandingPoly(a: StairFlight, b: StairFlight, width: number): Pt[] {
  const da = direction(a);
  const db = direction(b);
  const head = { x: a.x1, y: a.y1 };
  const foot = { x: b.x0, y: b.y0 };

  const pts: Pt[] = [
    ...crossSection(head, da, width),
    ...crossSection(foot, db, width),
  ];

  // Same heading AND no lateral shift = a straight break. Anything else — a
  // turn of any angle, or a dog-leg onto a parallel axis — has a corner.
  const sameHeading = da.x * db.x + da.y * db.y > 0.999;
  const lateral = Math.abs((foot.x - head.x) * -da.y + (foot.y - head.y) * da.x);
  if (!sameHeading || lateral > width * 0.25) {
    pts.push(
      ...crossSection({ x: head.x + da.x * width, y: head.y + da.y * width }, da, width),
      ...crossSection({ x: foot.x - db.x * width, y: foot.y - db.y * width }, db, width),
    );
  }

  return convexHull(pts);
}

export interface StairLanding {
  poly: Pt[]; // convex hull, plan meters
  top: number; // height of the landing's TOP surface
  // Height of its UNDERSIDE. On a SOLID stair a landing BETWEEN flights is
  // built down to the floor (0), like the flights themselves, which close to
  // y=0: a slab left floating at mid-height puts a see-through void exactly
  // where the turn should read as solid. On an OPEN stair the whole point is
  // that you see under it, so the landing stays a slab. The top stub is always
  // a slab — there it stands in for the floor above, not for stair structure.
  base: number;
}

/**
 * Every landing on the staircase: one filling each gap between consecutive
 * flights, plus the stub past the last flight that stands in for the floor
 * above. Derived, never authored.
 *
 * A hull that degenerates below 3 points (two flights meeting exactly, zero
 * gap) yields no landing rather than a zero-area polygon the mesher would
 * choke on — the flights already touch, so there is nothing to bridge.
 */
export function stairLandings(s: Stair): StairLanding[] {
  const m = stairMetrics(s);
  const out: StairLanding[] = [];

  const slab = (top: number) => Math.max(0, top - LANDING_SLAB);
  const open = s.style === "open";

  for (let i = 0; i + 1 < s.flights.length; i++) {
    const poly = interiorLandingPoly(s.flights[i], s.flights[i + 1], s.width);
    if (poly.length < 3) continue;
    const top = m.flights[i].topHeight;
    out.push({ poly, top, base: open ? slab(top) : 0 });
  }

  const last = s.flights[s.flights.length - 1];
  if (last) {
    const d = direction(last);
    const head = { x: last.x1, y: last.y1 };
    const beyond = { x: head.x + d.x * LANDING_DEPTH, y: head.y + d.y * LANDING_DEPTH };
    const [h1, h2] = crossSection(head, d, s.width);
    const [e1, e2] = crossSection(beyond, d, s.width);
    const poly = convexHull([h1, h2, e1, e2]);
    if (poly.length >= 3) out.push({ poly, top: s.rise, base: slab(s.rise) });
  }

  return out;
}
