// Tunables for the first-person walkthrough camera. Single source of truth —
// no magic numbers scattered through the rig/collision/door code.

export interface WalkthroughConfig {
  /** Eye height for a ~175 cm person, meters above the current floor. */
  eyeHeightM: number;
  /** Collision cylinder radius (shoulder buffer), meters. */
  playerRadiusM: number;
  /** Collision cylinder height, meters (floor to head clearance) — distinct
   *  from eye height. Decides which wall pieces block: a solid span or a
   *  window's below-sill box always starts at the floor so it always
   *  qualifies, but a door/opening's lintel piece only blocks if the opening
   *  is short enough that its top sits below this line. A standard door
   *  reaching (or exceeding) this height keeps its lintel out of collision,
   *  so a real doorway is walkable, not a wall with a gap that stops above
   *  head height. */
  bodyHeightM: number;
  /** FurnitureItem.elevation at/above this (meters above floor) is treated
   *  as non-blocking — wall-mounted art, ceiling fixtures, anything hung
   *  above roughly chest height. The schema has no PlacementType field, so
   *  this plus the catalog's `noCollide` are the only two inclusion signals. */
  furnitureElevationCutoffM: number;
  walkSpeedMs: number;
  sprintSpeedMs: number;
  accelMs2: number;
  decelMs2: number;
  /** Vertical FOV, three.js convention. */
  fovDeg: number;
  fovMinDeg: number;
  fovMaxDeg: number;
  pitchClampDeg: number;
  /** Radians of yaw/pitch per pixel of pointer-lock mouse movement. */
  mouseSensitivity: number;
  invertY: boolean;
  /** Player-to-door-anchor distance (meters) that triggers auto-open. */
  doorOpenDistanceM: number;
  /** Player-to-door-anchor distance (meters) that triggers auto-close. Must
   *  stay greater than doorOpenDistanceM — the gap is a deliberate hysteresis
   *  band so standing near the threshold doesn't flicker the door state. */
  doorCloseDistanceM: number;
  /** Swing angle (degrees) a hinged door opens to on proximity trigger. Not
   *  in the original spec's tunable table — added because "open a door" has
   *  to mean *some* concrete angle. Sliding doors use their own 0..1 scale
   *  (slide.open) instead and don't need this. */
  doorOpenSwingDeg: number;
  /** Damping rate (THREE.MathUtils.damp's lambda, ~1/time-constant in 1/s)
   *  for the door's open/close transition — smooth but swift, not an
   *  instant snap. Same damp-based easing already used elsewhere in this
   *  codebase (WallMesh's selection-glow fades) for a consistent feel. */
  doorSwingLambda: number;
}

export const WALKTHROUGH_CONFIG: WalkthroughConfig = {
  eyeHeightM: 1.65,
  playerRadiusM: 0.28,
  bodyHeightM: 2.0,
  furnitureElevationCutoffM: 1.0,
  walkSpeedMs: 1.4,
  sprintSpeedMs: 3.0,
  accelMs2: 12,
  decelMs2: 16,
  fovDeg: 52,
  fovMinDeg: 45,
  fovMaxDeg: 65,
  pitchClampDeg: 85,
  mouseSensitivity: 0.00154, // 0.0022 * 0.7 — 30% less sensitive
  invertY: false,
  doorOpenDistanceM: 1.5,
  doorCloseDistanceM: 2.5,
  doorOpenSwingDeg: 90,
  doorSwingLambda: 12,
};
