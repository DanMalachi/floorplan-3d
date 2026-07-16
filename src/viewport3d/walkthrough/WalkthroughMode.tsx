import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { nodeMap } from "@/lib/rooms/roomArea";
import { T, glass } from "@/ui/tokens";
import { WALKTHROUGH_CONFIG as CFG } from "./config";
import { buildWallColliders, resolveWallCollision } from "./collision";
import { buildFurnitureColliders, resolveFurnitureCollision } from "./furnitureCollision";
import {
  buildDoorAnchors,
  buildClosedDoorColliders,
  isDoorClosed,
  targetOpenValue,
  applyOpeningValue,
  dampOpeningValue,
} from "./doors";
import { pickSpawnPoint } from "./spawn";

const PITCH_CLAMP = THREE.MathUtils.degToRad(CFG.pitchClampDeg);
// Scratch objects reused every frame instead of allocating in the render
// loop — all read/written synchronously within the same useFrame tick, so
// aliasing across frames is safe.
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _inputDir = new THREE.Vector3();
const _targetVel = new THREE.Vector3();
const _diff = new THREE.Vector3();

// e.code, not e.key — layout-independent, and arrows share the same axis.
const MOVE_KEYS: Record<string, "forward" | "back" | "left" | "right" | "sprint"> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
};

/** Mounted inside the Canvas only while walkthrough mode is active.
 *
 *  Phase 1: clamped-Euler FPS look (§3.3) driven by the Pointer Lock API
 *  (§3.4) — yaw about world Y, pitch clamped to ±PITCH_CLAMP_DEG, roll always
 *  0 (Euler order "YXZ", z term fixed at 0 — no quaternion free-look). Eye
 *  height and FOV are pinned from config. XZ position is just wherever the
 *  orbit camera handed off from, not a real spawn point (Phase 6 picks one).
 *
 *  Phase 2: WASD + arrows (§6), yaw-relative (pitch ignored — forward is
 *  always flat), delta-time accel/decel toward a target velocity (§4/§5
 *  intro), normalized diagonals, sprint.
 *
 *  Phase 3: circle-vs-segment wall collision with sliding (§5a), against the
 *  same post-opening-split geometry the renderer draws — a door or passage's
 *  gap is genuinely open, not a special case.
 *
 *  Phase 4: circle-vs-OBB furniture collision with sliding (§5b), same
 *  push-along-normal pattern. Non-blocking items (rugs via `noCollide`, and
 *  anything at/above `furnitureElevationCutoffM`) are excluded — see
 *  furnitureCollision.ts for why those are the only two signals this schema
 *  has to offer.
 *
 *  Phase 5: door proximity auto-open (§5c). Per-frame order matches §5's
 *  spec exactly: update door proximity -> walls -> furniture (closed door
 *  leaves merged into this same pass, per §5's own wording) -> commit.
 *  Closed leaves get an OBB like furniture; open doors contribute nothing
 *  extra (their opening is already a permanent gap in the wall collider).
 *  The trigger reads the live store (`useSceneStore.getState()`) rather than
 *  the `scene` prop, so it can't double-decide a transition across frames
 *  before React re-renders this component with the patched scene.
 *
 *  The open/close transition itself is a damped animation (smooth but
 *  swift), not an instant snap — driven through the store's existing
 *  gesture mechanism (beginGesture/updateGesture/endGesture, the same one
 *  a wall drag uses) so the per-frame writes don't flood undo history; the
 *  whole swing folds into one entry once it settles. See doors.ts for the
 *  open/closed API this drives (there's no separate open()/close() method
 *  in the schema, only swingDeg/slide.open).
 *
 *  CameraControls keeps calling its own internal update() every frame even
 *  while `enabled={false}` (it only gates input handling, not the update
 *  loop), so it still writes camera.position/quaternion from its own stale
 *  orbit state each frame. That runs at useFrame priority -1; ours below
 *  runs after (default priority), so our write wins for render — and because
 *  we never call any CameraControls setter, its internal state is untouched,
 *  so disabling walkthrough hands control straight back on exit with no
 *  manual restore needed. */
export function WalkthroughRig({
  scene,
  offset,
  fovDeg,
  onExit,
  onLockChange,
}: {
  scene: Scene;
  offset: { cx: number; cz: number };
  fovDeg: number;
  onExit: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const nodes = useMemo(() => nodeMap(scene.nodes), [scene]);
  const colliders = useMemo(() => buildWallColliders(scene, offset), [scene, offset]);
  const blockingColliders = useMemo(() => {
    const furniture = buildFurnitureColliders(scene, offset);
    const doorLeaves = buildClosedDoorColliders(scene, nodes, offset);
    return [...furniture, ...doorLeaves];
  }, [scene, offset, nodes]);
  const doorAnchors = useMemo(() => buildDoorAnchors(scene, nodes, offset), [scene, nodes, offset]);
  // openingId -> target value (degrees for a hinged door, 0..1 for sliding)
  // while its open/close transition is animating. Empty when nothing's mid-swing.
  const doorTargetsRef = useRef(new Map<string, number>());
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const lockedRef = useRef(false);
  const keysRef = useRef({ forward: false, back: false, left: false, right: false, sprint: false });
  const velocityRef = useRef(new THREE.Vector3()); // current XZ speed, m/s
  // The player's true XZ position. CameraControls calls its own update() every
  // frame regardless of `enabled` (see class doc below) and resets
  // cam.position to its own stale orbit target each time — harmless for an
  // absolute write like eye height, but fatal for `cam.position.x += ...`,
  // since that would read back a value CameraControls had just reset a moment
  // earlier and never actually accumulate. Track position ourselves and
  // (re)assert it onto the camera every frame instead.
  const positionRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const prevFov = cam.fov;

    // Adopt the orbit camera's current heading as the default so entering
    // doesn't jump-cut the view; clamp defensively in case the orbit view
    // was steeper than an FPS pitch would ever allow (e.g. a top-down
    // preset). Overridden below when spawning at a real doorway, where
    // facing into the room is unambiguous and looks a lot more intentional
    // than an inherited orbit angle.
    const start = new THREE.Euler().setFromQuaternion(cam.quaternion, "YXZ");
    yawRef.current = start.y;
    pitchRef.current = THREE.MathUtils.clamp(start.x, -PITCH_CLAMP, PITCH_CLAMP);

    // Spawn point: close to the exterior (front) door if one can be
    // identified, else the entry/largest room's centroid (pickSpawnPoint).
    // Depenetrate immediately in case that lands too close to a wall or
    // furniture piece — an irregular room shape, or a spawn right at a
    // doorway — with the same resolvers every other frame uses, just with
    // no movement to resolve away from (moveLen 0).
    const spawnPlan = pickSpawnPoint(scene);
    const spawnPos = { x: spawnPlan.x - offset.cx, z: spawnPlan.y - offset.cz };
    resolveWallCollision(spawnPos, colliders, CFG.playerRadiusM, 0);
    resolveFurnitureCollision(spawnPos, blockingColliders, CFG.playerRadiusM, 0);
    positionRef.current.set(spawnPos.x, CFG.eyeHeightM, spawnPos.z);
    cam.position.set(spawnPos.x, CFG.eyeHeightM, spawnPos.z);
    if (spawnPlan.yaw !== undefined) {
      yawRef.current = spawnPlan.yaw; // face into the room from the entrance
      pitchRef.current = 0; // level gaze reads better than an inherited orbit tilt here
    }

    // FOV itself is applied by a separate effect below (reactive to the
    // slider); this one only owns capturing the pre-walkthrough value and
    // restoring it on true exit.
    return () => {
      cam.fov = prevFov;
      cam.updateProjectionMatrix();
    };
    // Intentionally mount-only (camera is the only dep): scene/offset/
    // colliders are captured as they are AT ENTRY. A door opening later in
    // the session changes `scene`, and must NOT re-run this and teleport the
    // player back to spawn mid-walk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  // FOV slider (§8 acceptance: 52° default, 45-65° adjustable). Separate from
  // the effect above so a slider drag doesn't disturb the captured
  // pre-walkthrough fov that gets restored on exit.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = fovDeg;
    cam.updateProjectionMatrix();
  }, [camera, fovDeg]);

  useEffect(() => {
    const el = gl.domElement;

    const onClick = () => {
      if (document.pointerLockElement !== el) el.requestPointerLock();
    };
    // Losing pointer lock (Alt-tab, OS unlock, browser's own Escape handling)
    // just pauses look until the user clicks again — it does not exit the
    // mode. Only our own Escape handler below does that (§6: "Esc exits and
    // restores prior camera").
    const onPointerLockChange = () => {
      lockedRef.current = document.pointerLockElement === el;
      onLockChange(lockedRef.current);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!lockedRef.current) return; // no look-on-drag: only locked deltas count
      const invert = CFG.invertY ? -1 : 1;
      yawRef.current -= e.movementX * CFG.mouseSensitivity;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - e.movementY * CFG.mouseSensitivity * invert,
        -PITCH_CLAMP,
        PITCH_CLAMP,
      );
    };

    el.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      el.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      if (document.pointerLockElement === el) document.exitPointerLock();
      onLockChange(false);
    };
  }, [gl, onLockChange]);

  useEffect(() => {
    // Capture phase, and stop propagation: the editor's own keydown handler
    // (Viewport's onKeyDown) treats Escape as "deselect" and calls
    // stopPropagation on the way up, which would otherwise swallow this
    // before it reaches a bubble-phase window listener.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onExit();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onExit]);

  // TODO(mobile): this is keyboard+mouse only (§2 non-goal for this pass) —
  // touch input for movement/look would hook in here.
  useEffect(() => {
    const keys = keysRef.current;
    const setKey = (e: KeyboardEvent, down: boolean) => {
      const action = MOVE_KEYS[e.code];
      if (!action) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      keys[action] = down;
      e.preventDefault(); // arrows must not scroll the page
    };
    const onKeyDown = (e: KeyboardEvent) => setKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => setKey(e, false);
    // A key held down when focus/lock is lost (Alt-tab etc.) never gets its
    // keyup — without this the player would walk forever in one direction.
    const onBlur = () => {
      keys.forward = keys.back = keys.left = keys.right = keys.sprint = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useFrame((_state, rawDelta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const delta = Math.min(rawDelta, 0.1); // clamp huge tab-away/lag spikes

    // Door proximity trigger, first per §5's stated per-frame order. Reads
    // the live store directly (not the `scene` prop) so a transition is
    // guaranteed to be seen on the very next frame, even if React hasn't
    // re-rendered this component with the patched scene yet — without that,
    // a door could be re-decided several frames in a row before the prop
    // catches up.
    const px = positionRef.current.x;
    const pz = positionRef.current.z;
    const store = useSceneStore.getState();
    const targets = doorTargetsRef.current;
    for (const anchor of doorAnchors) {
      const dist = Math.hypot(px - anchor.x, pz - anchor.z);
      const liveOpening = store.scene.openings.find((o) => o.id === anchor.openingId);
      if (!liveOpening) continue;
      if (dist <= CFG.doorOpenDistanceM && isDoorClosed(liveOpening)) {
        targets.set(anchor.openingId, targetOpenValue(liveOpening));
      } else if (dist >= CFG.doorCloseDistanceM && !isDoorClosed(liveOpening)) {
        targets.set(anchor.openingId, 0);
      }
    }

    // Advance every animating door one damped step (smooth but swift, not a
    // snap), folded into a single gesture so the per-frame writes don't
    // flood undo history — one "Door open/close" entry per burst of
    // activity, exactly like a drag. Reversing direction mid-swing (walk up,
    // then immediately back away) continues smoothly from wherever the door
    // currently sits rather than restarting from closed.
    if (targets.size > 0) {
      store.beginGesture();
      const liveScene = store.scene;
      const nextOpenings = liveScene.openings.map((o) => {
        const target = targets.get(o.id);
        if (target === undefined) return o;
        const { value, settled } = dampOpeningValue(o, target, delta);
        if (settled) targets.delete(o.id);
        return { ...o, ...applyOpeningValue(o, value) };
      });
      store.updateGesture({ ...liveScene, openings: nextOpenings });
      if (targets.size === 0) store.endGesture("Door open/close (walkthrough)");
    }

    const keys = keysRef.current;
    const yaw = yawRef.current;
    // Movement is yaw-relative and ignores pitch — "forward" is always flat,
    // where you're walking, not where you're looking up/down.
    _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    _inputDir.set(0, 0, 0);
    if (keys.forward) _inputDir.add(_forward);
    if (keys.back) _inputDir.sub(_forward);
    if (keys.right) _inputDir.add(_right);
    if (keys.left) _inputDir.sub(_right);
    if (_inputDir.lengthSq() > 0) _inputDir.normalize(); // no faster-on-diagonal

    const targetSpeed = _inputDir.lengthSq() > 0 ? (keys.sprint ? CFG.sprintSpeedMs : CFG.walkSpeedMs) : 0;
    _targetVel.copy(_inputDir).multiplyScalar(targetSpeed);

    // Approach the target velocity at accel/decel rate (m/s^2), scaled by
    // delta so framerate never changes walking speed — a hard cap on how far
    // velocity can move this frame, not a snap.
    const velocity = velocityRef.current;
    const accelerating = _targetVel.lengthSq() > velocity.lengthSq();
    const maxStep = (accelerating ? CFG.accelMs2 : CFG.decelMs2) * delta;
    _diff.copy(_targetVel).sub(velocity);
    const diffLen = _diff.length();
    if (diffLen <= maxStep || diffLen === 0) {
      velocity.copy(_targetVel);
    } else {
      velocity.addScaledVector(_diff, maxStep / diffLen);
    }

    const moveLen = Math.hypot(velocity.x, velocity.z) * delta;
    positionRef.current.x += velocity.x * delta;
    positionRef.current.z += velocity.z * delta;
    resolveWallCollision(positionRef.current, colliders, CFG.playerRadiusM, moveLen);
    resolveFurnitureCollision(positionRef.current, blockingColliders, CFG.playerRadiusM, moveLen);
    cam.position.set(positionRef.current.x, CFG.eyeHeightM, positionRef.current.z);
    cam.quaternion.setFromEuler(_euler.set(pitchRef.current, yawRef.current, 0, "YXZ"));
  });

  return null;
}

/** HTML overlay hint, rendered outside the Canvas (§6: "Click to walk ·
 *  WASD/Arrows to move · Esc to exit" while available but not locked). */
export function WalkthroughHint({ active, locked }: { active: boolean; locked: boolean }) {
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 14,
        transform: "translateX(-50%)",
        padding: "8px 14px",
        fontSize: 12,
        color: T.textDim,
        ...glass({ borderRadius: 999 }),
      }}
    >
      {locked ? "Walking · Esc to exit" : "Click to walk · WASD/Arrows to move · Esc to exit"}
    </div>
  );
}

/** FOV slider, rendered outside the Canvas. Range comes straight from
 *  config (§8 acceptance: defaults 52°, adjustable 45-65°). */
export function WalkthroughFovControl({
  active,
  fovDeg,
  onChange,
}: {
  active: boolean;
  fovDeg: number;
  onChange: (v: number) => void;
}) {
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 14,
        top: 64,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 12px",
        ...glass({ borderRadius: 10 }),
      }}
    >
      <span style={{ fontSize: 11, color: T.textDim }}>FOV {Math.round(fovDeg)}°</span>
      <input
        type="range"
        min={CFG.fovMinDeg}
        max={CFG.fovMaxDeg}
        step={1}
        value={fovDeg}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 140, accentColor: T.accent }}
      />
    </div>
  );
}
