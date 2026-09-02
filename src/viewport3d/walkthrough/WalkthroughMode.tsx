import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CameraControls } from "@react-three/drei";
import type { Opening, Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { nodeMap } from "@/lib/rooms/roomArea";
import { effectiveSlide, hasDerivedSlide, withoutAuthoredDoorStyle } from "@/render/doorStyle";
import { T, glass } from "@/ui/tokens";
import { WALKTHROUGH_CONFIG as CFG } from "./config";
import { buildWallColliders, resolveWallCollision } from "./collision";
import { buildStairGround, groundHeightAt } from "./stairGround";
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

/** The camera's trip between the orbit view and the player's eyes — into them
 *  on entry, back out of them on exit (P2 T5). Same shape either direction:
 *  just a lerp of position and a yaw/pitch pair from one pose to another. */
interface CameraFlight {
  t: number; // 0..1
  durationS: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromYaw: number;
  deltaYaw: number; // signed shortest arc from fromYaw to the target heading
  fromPitch: number;
  toPitch: number;
}

/** Signed shortest way round from angle `a` to angle `b`, in radians. */
function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Smoothstep: eases out of the orbit pose and into the standing one, so the
 *  flight has no visible start or stop, just an arrival. */
const ease = (t: number) => t * t * (3 - 2 * t);

/** A door's identity for anchor/collider purposes: every field that changes
 *  its position, size or open/closed STATE — deliberately excluding
 *  `swingDeg`/`slide.open`, the two fields a door-open animation actually
 *  animates. Used to build a string key (see `doorSig` below) that a swing
 *  leaves untouched frame-to-frame even though `scene.openings`'s own array
 *  identity changes every frame while one is in flight (a fresh `Scene` is
 *  published each step so the swinging leaf redraws). Gating the expensive
 *  `buildDoorAnchors`/`buildClosedDoorColliders` recomputes on this instead
 *  of on `scene` itself is what stops them re-running 60x/sec during a
 *  swing; keying it off real geometry (not just id) also means a remote
 *  collaborator resizing or re-hosting a door mid-walkthrough still gets
 *  picked up, and `isDoorClosed(o)` is folded in so the one field that MUST
 *  never go stale — whether the door currently blocks the player — is part
 *  of the key by construction. */
function doorGeometryKey(o: Opening): string {
  // The DERIVED slide, not the raw field: a wide unstyled door genuinely has
  // sliding-panel collider geometry, and keying off the stored field alone
  // would also miss the moment a resize carries a door across the patio
  // threshold and changes what its leaves are.
  const s = effectiveSlide(o);
  return [
    o.id,
    o.wallId,
    o.offset,
    o.width,
    o.height,
    o.sill,
    o.hinge ?? "",
    o.double ? 1 : 0,
    (o.leafSplit ?? []).join(","),
    s ? `${s.style}:${s.panels}:${s.glazed ? 1 : 0}:${s.side ?? ""}` : "",
    isDoorClosed(o) ? 1 : 0,
  ].join(":");
}

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
 *  we never call any CameraControls setter, its internal state sits exactly
 *  where the orbit view left it for the entire walkthrough session. That is
 *  what makes it usable as the exit flight's TARGET (below) rather than
 *  something this rig has to separately remember.
 *
 *  Phase 6 (P2 T5): exit now mirrors entry — a flight back OUT to that
 *  untouched orbit pose, instead of the hard cut this used to be (unmount and
 *  let `enabled` flip back to true, which snapped the view straight from the
 *  player's eyes to wherever the orbit camera was sitting). `walkthroughActive`
 *  still flips false the instant the user asks to leave (Esc here, or the
 *  Scene panel's button — outside this component, watched via
 *  `exitRequested`); only the actual unmount now waits for the flight to
 *  land, signaled by `onExitComplete`. CameraControls has to stay disabled
 *  for that whole tail too (Viewport.tsx keys `enabled` off a separate
 *  `walkthroughMounted` flag, not `walkthroughActive`, for exactly this
 *  reason) — otherwise a stray drag mid-flight would move the target we're
 *  flying toward, and the handoff would snap to wherever THAT went instead of
 *  where the flight visually landed. */
export function WalkthroughRig({
  scene,
  offset,
  fovDeg,
  exitRequested,
  onExitComplete,
  onLockChange,
}: {
  scene: Scene;
  offset: { cx: number; cz: number };
  fovDeg: number;
  /** True once the user has asked to leave (Esc, or the Scene panel button)
   *  — begins the exit flight. Not itself the unmount signal; see
   *  onExitComplete. */
  exitRequested: boolean;
  /** Fired once the exit flight lands — the parent unmounts this rig (and
   *  re-enables CameraControls) in response, not on `exitRequested` itself. */
  onExitComplete: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const controls = useThree((s) => s.controls) as CameraControls | null;
  // nodes/walls only — a door swing republishes a new Scene object every
  // frame (openings change) but keeps these sub-arrays referentially stable,
  // so narrowing the deps skips this recompute during the ~1-2s swing.
  const nodes = useMemo(() => nodeMap(scene.nodes), [scene.nodes]);
  const colliders = useMemo(() => buildWallColliders(scene, offset), [scene.nodes, scene.walls, offset]);
  // Recomputed every frame (cheap: a filter/map/join over the door list, no
  // wall lookups, no buildJoinery) but byte-identical frame-to-frame during a
  // swing — see `doorGeometryKey`. `blockingColliders` and `doorAnchors`
  // below key their expensive recompute off this instead of off `scene`
  // directly, which is what used to make them redo `buildJoinery` / wall
  // lookups on every single frame of a door swing (~1-2s, 60x/sec).
  const doorSig = useMemo(
    () =>
      scene.openings
        .filter((o) => o.type === "door")
        .map(doorGeometryKey)
        .join("|"),
    [scene.openings],
  );
  const blockingColliders = useMemo(() => {
    const furniture = buildFurnitureColliders(scene, offset);
    const doorLeaves = buildClosedDoorColliders(scene, nodes, offset);
    return [...furniture, ...doorLeaves];
  }, [scene.furniture, scene.walls, nodes, offset, doorSig]);
  const doorAnchors = useMemo(
    () => buildDoorAnchors(scene, nodes, offset),
    [scene.walls, nodes, offset, doorSig],
  );
  // openingId -> target value (degrees for a hinged door, 0..1 for sliding)
  // while its open/close transition is animating. Empty when nothing's mid-swing.
  const doorTargetsRef = useRef(new Map<string, number>());
  // Ids of doors whose sliding gear was DERIVED from their width rather than
  // stored (src/render/doorStyle.ts). Opening one has to materialise that spec
  // into the scene — the renderer animates the stored field, there is nowhere
  // else to put the position — and the mere presence of `slide`/`swingDeg` is
  // what `hasAuthoredDoorStyle` reads as "the user chose this by hand". So the
  // rig remembers which doors it borrowed and hands them back unstyled, either
  // when they settle shut or when the walkthrough ends. Without that, walking
  // through a patio door converts it into a single hinged leaf for good — the
  // write is committed, autosaved and synced like any other edit.
  const derivedDoorsRef = useRef(new Set<string>());
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
  // Stairs make the floor a FUNCTION of position instead of a constant, so the
  // rig now tracks two vertical values: the height of the surface the player is
  // standing on (a step, a landing, or 0), and the damped eye height chasing
  // it. Everything else about movement stays XZ.
  // stairs only — buildStairGround reads nothing else, and a door swing's
  // per-frame `{...liveScene, openings}` spread keeps `scene.stairs` at its
  // original reference (same reasoning as `colliders` above), so this now
  // never recomputes during a swing either.
  const stairGround = useMemo(() => buildStairGround(scene, offset), [scene.stairs, offset]);
  const groundRef = useRef(0);
  const eyeYRef = useRef(CFG.eyeHeightM);
  // Non-null only while the entry flight is in the air (see the mount effect).
  const entryRef = useRef<CameraFlight | null>(null);
  // Non-null only while the exit flight is in the air (see triggerExit below).
  const exitRef = useRef<CameraFlight | null>(null);

  // Exiting walkthrough mid-swing (Esc, or leaving the mode entirely) would
  // otherwise leave doorGestureActive stuck true, permanently suppressing
  // N8AO for the rest of the session — clear it unconditionally on unmount.
  //
  // The same teardown hands back any door still standing open on a slide spec
  // this rig materialised (see `derivedDoorsRef`). Walking out through a patio
  // door and pressing Esc leaves it open and therefore authored, which is the
  // one path the settle-shut restore below can't catch; the door closing on
  // the way out is the cheaper surprise of the two, since the alternative is a
  // slider silently demoted to a single hinged leaf.
  useEffect(() => {
    const derived = derivedDoorsRef.current;
    return () => {
      const store = useSceneStore.getState();
      if (derived.size > 0) {
        const scene = store.scene;
        const openings = scene.openings.map((o) => (derived.has(o.id) ? withoutAuthoredDoorStyle(o) : o));
        derived.clear();
        // Folded into the swing gesture already in flight when there is one
        // (beginGesture is a no-op then), so the whole visit is still a single
        // undo entry and a single collab commit.
        store.beginGesture();
        store.setDoorGestureActive(true);
        store.updateGesture({ ...scene, openings });
        store.endGesture("Door open/close (walkthrough)");
      }
      store.setDoorGestureActive(false);
    };
  }, []);

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
    // Spawn standing on whatever is under the spawn point (normally the floor,
    // but a spawn inside a stair's footprint must not start the player buried
    // in it or floating over it).
    groundRef.current = groundHeightAt(stairGround, spawnPos.x, spawnPos.z);
    eyeYRef.current = groundRef.current + CFG.eyeHeightM;
    positionRef.current.set(spawnPos.x, eyeYRef.current, spawnPos.z);
    if (spawnPlan.yaw !== undefined) {
      yawRef.current = spawnPlan.yaw; // face into the room from the entrance
    }
    // Always ARRIVE level, whatever the orbit was doing. A person who walks
    // into a room looks ahead, not at their feet — and an orbit view is
    // usually tilted well down, so inheriting its pitch used to land you
    // staring at the floor. The flight makes this free: it's just the target
    // of an interpolation, so the tilt straightens out on the way in.
    pitchRef.current = 0;

    // Fly the CAMERA down into the player's eyes rather than cutting to them.
    // The player is already standing at the spawn (positionRef above) — only
    // the view travels, so nothing about movement, collision or doors has to
    // know this is happening. Duration comes from the distance: entering from
    // an orbit already inside the room is nearly instant, from a wide top-down
    // it's a beat longer.
    const from = cam.position.clone();
    const to = new THREE.Vector3(spawnPos.x, eyeYRef.current, spawnPos.z);
    const durationS = THREE.MathUtils.clamp(
      from.distanceTo(to) / CFG.entryFlightSpeedMs,
      CFG.entryFlightMinS,
      CFG.entryFlightMaxS,
    );
    entryRef.current = {
      t: 0,
      durationS,
      from,
      to,
      fromYaw: start.y,
      fromPitch: THREE.MathUtils.clamp(start.x, -PITCH_CLAMP, PITCH_CLAMP),
      // Yaw is an angle: turning 350° the long way round would spin the world.
      // Take the shortest arc to the target heading instead.
      deltaYaw: shortestAngle(start.y, yawRef.current),
      toPitch: pitchRef.current,
    };
    // Hold the orbit pose for frame one; the flight starts from exactly what
    // the user was already looking at.
    cam.position.copy(from);

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
    //
    // Just flips the store flag — same as the Scene panel's "Exit walkthrough"
    // button does from outside this component entirely. Both routes converge
    // on the `exitRequested` effect below, which is what actually begins the
    // exit flight; Escape doesn't need its own copy of that logic.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        useSceneStore.getState().setWalkthroughActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // P2 T5: begin the exit flight the moment the user asks to leave, however
  // that request arrived (Esc above, or the Scene panel's button, which never
  // touches this component directly — both just flip `walkthroughActive`,
  // relayed here as `exitRequested`).
  useEffect(() => {
    if (!exitRequested || exitRef.current) return;
    const cam = camera as THREE.PerspectiveCamera;

    // Hand the cursor back right away — the camera itself may still spend up
    // to entryFlightMaxS seconds visibly flying out.
    if (document.pointerLockElement === gl.domElement) document.exitPointerLock();

    // A same-instant Esc during the ENTRY flight (rare, but possible) cancels
    // it rather than fighting it for the camera: the exit flight starts from
    // wherever entry had gotten to, already sitting in cam.position since
    // entry writes it every frame.
    entryRef.current = null;

    // CameraControls has been quietly sitting at the orbit pose for the
    // entire session (see the class doc) — that is exactly the pose control
    // hands back to on unmount, so it is the exit flight's target.
    const toPos = new THREE.Vector3();
    const toLookAt = new THREE.Vector3();
    if (controls) {
      controls.getPosition(toPos);
      controls.getTarget(toLookAt);
    } else {
      // No CameraControls instance somehow — hold the current pose as both
      // ends rather than crash; the flight collapses to a same-spot no-op
      // and the mode just exits on the next frame.
      toPos.copy(cam.position);
      toLookAt.set(toPos.x - Math.sin(yawRef.current), toPos.y, toPos.z - Math.cos(yawRef.current));
    }

    // One-off allocation (this runs at most once per walkthrough session, not
    // per frame) rather than hand-deriving yaw/pitch from the look-at vector.
    const towards = new THREE.Object3D();
    towards.position.copy(toPos);
    towards.lookAt(toLookAt);
    const toEuler = new THREE.Euler().setFromQuaternion(towards.quaternion, "YXZ");

    const from = cam.position.clone();
    const durationS = THREE.MathUtils.clamp(
      from.distanceTo(toPos) / CFG.entryFlightSpeedMs,
      CFG.entryFlightMinS,
      CFG.entryFlightMaxS,
    );
    exitRef.current = {
      t: 0,
      durationS,
      from,
      to: toPos,
      fromYaw: yawRef.current,
      deltaYaw: shortestAngle(yawRef.current, toEuler.y),
      fromPitch: pitchRef.current,
      toPitch: toEuler.x,
    };
    // controls/camera/gl are stable for the component's life; only
    // exitRequested's own transition should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitRequested]);

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

    // Exit flight (P2 T5) takes priority over everything below, symmetric
    // with the entry flight's own early return: movement/doors/collision/
    // look all sit out the trip back to the orbit pose exactly as they sit
    // out the trip in. Once it lands, tell the parent — it unmounts this rig
    // and re-enables CameraControls, which is already sitting at this exact
    // pose (that's what we flew to), so the handoff is invisible.
    const exit = exitRef.current;
    if (exit) {
      exit.t = Math.min(1, exit.t + delta / exit.durationS);
      const k = ease(exit.t);
      cam.position.lerpVectors(exit.from, exit.to, k);
      const yaw = exit.fromYaw + exit.deltaYaw * k;
      const pitch = THREE.MathUtils.lerp(exit.fromPitch, exit.toPitch, k);
      cam.quaternion.setFromEuler(_euler.set(pitch, yaw, 0, "YXZ"));
      if (exit.t >= 1) {
        exitRef.current = null;
        onExitComplete();
      }
      return;
    }

    // Entry flight owns the camera until it lands. Movement, doors and
    // collision all sit this out: the player is already standing at the spawn,
    // so there is nothing to simulate until the view catches up with them.
    // Look input is ignored too — being able to steer mid-flight would fight
    // the interpolation and land you somewhere the spawn never chose.
    const entry = entryRef.current;
    if (entry) {
      entry.t = Math.min(1, entry.t + delta / entry.durationS);
      const k = ease(entry.t);
      cam.position.lerpVectors(entry.from, entry.to, k);
      yawRef.current = entry.fromYaw + entry.deltaYaw * k;
      pitchRef.current = THREE.MathUtils.lerp(entry.fromPitch, entry.toPitch, k);
      cam.quaternion.setFromEuler(_euler.set(pitchRef.current, yawRef.current, 0, "YXZ"));
      if (entry.t >= 1) entryRef.current = null; // landed — hand back to the rig
      return;
    }

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
        // Recorded BEFORE the first write materialises the derived spec —
        // afterwards this door is indistinguishable from a hand-styled one.
        if (hasDerivedSlide(liveOpening)) derivedDoorsRef.current.add(anchor.openingId);
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
      if (!store.doorGestureActive) store.setDoorGestureActive(true);
      const liveScene = store.scene;
      const derived = derivedDoorsRef.current;
      const nextOpenings = liveScene.openings.map((o) => {
        const target = targets.get(o.id);
        if (target === undefined) return o;
        const { value, settled } = dampOpeningValue(o, target, delta);
        if (settled) targets.delete(o.id);
        // A borrowed door that has finished shutting has no position left worth
        // storing, so give it back the way it was found — otherwise the spec
        // this rig materialised stays in the scene as an authored style.
        if (settled && target === 0 && derived.has(o.id)) {
          derived.delete(o.id);
          return withoutAuthoredDoorStyle(o);
        }
        return { ...o, ...applyOpeningValue(o, value) };
      });
      store.updateGesture({ ...liveScene, openings: nextOpenings });
      if (targets.size === 0) {
        store.endGesture("Door open/close (walkthrough)");
        store.setDoorGestureActive(false);
      }
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
    // Where the player stood at the end of last frame: already depenetrated,
    // so it is always a legal position to fall back to.
    const fromX = positionRef.current.x;
    const fromZ = positionRef.current.z;
    positionRef.current.x += velocity.x * delta;
    positionRef.current.z += velocity.z * delta;
    resolveWallCollision(positionRef.current, colliders, CFG.playerRadiusM, moveLen);
    resolveFurnitureCollision(positionRef.current, blockingColliders, CFG.playerRadiusM, moveLen);

    // A move that would climb more than one step isn't a climb — it's walking
    // into the side of the staircase. Retry each axis alone before giving up,
    // so brushing past a flight slides along it instead of sticking.
    const climbable = (x: number, z: number) =>
      groundHeightAt(stairGround, x, z) - groundRef.current <= CFG.stepUpM;
    if (!climbable(positionRef.current.x, positionRef.current.z)) {
      if (climbable(positionRef.current.x, fromZ)) {
        positionRef.current.z = fromZ;
      } else if (climbable(fromX, positionRef.current.z)) {
        positionRef.current.x = fromX;
      } else {
        positionRef.current.x = fromX;
        positionRef.current.z = fromZ;
      }
      velocity.set(0, 0, 0); // stop dead against it, don't build up speed
      // The fallback mixes this frame's axis with last frame's; depenetrate
      // once more so a corner case can't leave the player inside a wall.
      resolveWallCollision(positionRef.current, colliders, CFG.playerRadiusM, 0);
      resolveFurnitureCollision(positionRef.current, blockingColliders, CFG.playerRadiusM, 0);
    }

    groundRef.current = groundHeightAt(stairGround, positionRef.current.x, positionRef.current.z);
    // Descending is never blocked: step off a landing and the eye damps back
    // down, which reads as stepping down rather than falling.
    eyeYRef.current = THREE.MathUtils.damp(
      eyeYRef.current,
      groundRef.current + CFG.eyeHeightM,
      CFG.groundLambda,
      delta,
    );
    cam.position.set(positionRef.current.x, eyeYRef.current, positionRef.current.z);
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
