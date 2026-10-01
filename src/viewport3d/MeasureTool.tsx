"use client";

// "Measure" tool: a tape you stretch across the scene. Press on a floor, wall
// face or ceiling, drag, and a ruler stretches from that point to the pointer
// with its length read out live; let go and it stays until the next one.
// A click without a drag still works the old way (click, move, click), for
// trackpads and anyone who can't hold a drag. Armed from the Build
// navigator's Measure tile and from the Decorate shelf rail, so it mounts in
// both modes while buildTool === "measure". Approved change to a protected
// file: docs/PROTECTED_PATHS.md, 2026-10-01.
//
// Input is taken at the DOM, in the capture phase on window, not through R3F
// mesh events: a press that starts a measurement must not also select or drag
// the furniture/wall under it, or orbit the camera. Capture on window runs
// before R3F's and the camera rig's own listeners, so stopping the press
// there keeps it from them. Only the primary button: right/middle-drag still
// orbit and pan. Moves are never stopped (hover keeps working), except
// during a drag.
//
// Surface picking (floor/wall/ceiling) is buildTools/planMath.ts's
// `raycastSceneSurfaces`, given a world-space ray, which returns points in
// this group's (recentred) frame.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Html, Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { Node } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { PD } from "@/ui/planDock/tokens";
import { raycastSceneSurfaces } from "./buildTools/planMath";

const fmt = (m: number) => (m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`);

type Pt = { x: number; y: number; z: number };

/** Screen px a press has to travel before it counts as a drag. */
const DRAG_PX = 6;
const TAPE = "#5b8def";

/** Tick marks along A→B, in this group's frame: every 10 cm (every 50 cm
 *  past 8 m, so a long tape stays readable), longer at 50 cm and at each
 *  metre. They lie across the tape in the plane that holds it and is most
 *  level, so a floor measurement's ticks lie flat on the floor. */
function rulerTicks(a: THREE.Vector3, b: THREE.Vector3) {
  const len = a.distanceTo(b);
  const dir = b.clone().sub(a).normalize();
  // Across: horizontal and square to the tape; for a vertical tape, any
  // horizontal direction will do.
  const across = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
  across.normalize();
  const step = len > 8 ? 0.5 : 0.1;
  const segs: THREE.Vector3[] = [];
  const tick = (d: number, half: number) => {
    const p = a.clone().addScaledVector(dir, d);
    segs.push(p.clone().addScaledVector(across, -half), p.clone().addScaledVector(across, half));
  };
  const n = Math.floor(len / step + 1e-6);
  for (let i = 1; i <= n; i++) {
    const d = i * step;
    if (len - d < step * 0.3) break; // too close to the end cap
    const cm = Math.round(d * 100);
    tick(d, cm % 100 === 0 ? 0.11 : cm % 50 === 0 ? 0.075 : 0.04);
  }
  // end caps
  tick(0, 0.16);
  tick(len, 0.16);
  return segs;
}

export function MeasureTool({ offset }: { offset: { cx: number; cz: number } }) {
  const active = useSceneStore((s) => s.buildTool === "measure" && (s.appMode === "build" || s.appMode === "furnish"));
  const scene = useSceneStore((s) => s.scene);
  // Mirrors FloorMesh.tsx's own `Ceilings` visibility condition — the ceiling
  // should only compete as a pickable surface when one is actually rendered
  // (Cutaway/Top deliberately hide it so you can see inside).
  const wallMode = useSceneStore((s) => s.wallMode);
  const showCeilings = useSceneStore((s) => s.showCeilings);
  const ceilingVisible = wallMode === "full" && showCeilings;
  const nodes = useMemo(() => new Map<string, Node>(scene.nodes.map((n) => [n.id, n])), [scene.nodes]);
  const { gl, camera } = useThree();

  // 0 points: nothing yet. 1 point: anchored, `cursor` is the live end
  // (mid-drag, or between the two clicks of click-click). 2 points: done;
  // the next press starts a fresh one.
  const [points, setPoints] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);

  // Everything the window listeners read, kept current without re-binding.
  const live = useRef({ scene, nodes, offset, ceilingVisible, points });
  useEffect(() => {
    live.current = { scene, nodes, offset, ceilingVisible, points };
  });

  useEffect(() => {
    if (!active) {
      setPoints([]);
      setCursor(null);
      return;
    }
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitAt = (e: PointerEvent): Pt | null => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const L = live.current;
      const hit = raycastSceneSurfaces(raycaster.ray, L.scene, L.offset, L.nodes, L.ceilingVisible);
      return hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
    };
    // The press in progress: where it went down on screen, and whether it
    // anchored a new tape (vs. finishing a click-click one).
    let press: { x: number; y: number; id: number; anchored: boolean; dragging: boolean } | null = null;
    // The browser's own click after a press we took: keep it from the scene
    // too, or it lands as a selection click.
    let eatClick = false;
    // Points change here synchronously too, not only on the next render: a
    // move that lands before React commits must already see the anchor.
    const setPts = (v: Pt[]) => {
      live.current.points = v;
      setPoints(v);
    };
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation?.();
    };

    const onDown = (e: PointerEvent) => {
      if (e.target !== el || e.button !== 0) return;
      const p = hitAt(e);
      if (!p) return; // pressed on sky: leave it to the camera
      swallow(e);
      e.preventDefault();
      eatClick = true;
      if (live.current.points.length === 1) {
        // second click of click-click: finish here
        setPts([live.current.points[0], p]);
        setCursor(p);
        press = { x: e.clientX, y: e.clientY, id: e.pointerId, anchored: false, dragging: false };
      } else {
        setPts([p]);
        setCursor(p);
        press = { x: e.clientX, y: e.clientY, id: e.pointerId, anchored: true, dragging: false };
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // synthetic events have no capturable pointer
      }
    };
    const onMove = (e: PointerEvent) => {
      const mine = press && e.pointerId === press.id;
      if (!mine && e.target !== el) return;
      if (mine) {
        swallow(e);
        if (press!.anchored && !press!.dragging && Math.hypot(e.clientX - press!.x, e.clientY - press!.y) >= DRAG_PX) press!.dragging = true;
      }
      if (live.current.points.length !== 1) return;
      const p = hitAt(e);
      if (p) setCursor(p);
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      swallow(e);
      const { anchored, dragging } = press;
      press = null;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
      if (!anchored || !dragging) return; // a plain click: stay anchored, wait for the second
      const p = hitAt(e);
      const a = live.current.points[0];
      if (a && p) setPts([a, p]);
    };
    const onClick = (e: MouseEvent) => {
      if (eatClick && e.target === el) swallow(e);
      eatClick = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // First Esc clears the tape; Esc with nothing on screen puts it away.
      if (live.current.points.length) {
        setPts([]);
        setCursor(null);
      } else useSceneStore.getState().setBuildTool("select");
    };

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("click", onClick, true);
    // Capture-phase: Viewport's wrapper div handles Escape itself (clearing
    // selection/brush/gesture) and stops it from bubbling.
    window.addEventListener("keydown", onKey, true);
    const prevCursor = el.style.cursor;
    el.style.cursor = "crosshair";
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
      el.style.cursor = prevCursor;
    };
  }, [active, gl, camera]);

  const a = points[0] ?? null;
  const b = points[1] ?? (points.length === 1 ? cursor : null);
  const va = useMemo(() => (a ? new THREE.Vector3(a.x, a.y, a.z) : null), [a]);
  const vb = useMemo(() => (b ? new THREE.Vector3(b.x, b.y, b.z) : null), [b]);
  const dist = va && vb ? va.distanceTo(vb) : null;
  const ruler = useMemo(() => (va && vb && dist! > 0.005 ? rulerTicks(va, vb) : null), [va, vb, dist]);

  if (!active || !va) return null;

  // Drawn with depthTest off: the tape lies ON a floor or wall and would
  // z-fight it, and a tape through a wall should still read.
  const settled = points.length === 2;
  return (
    <>
      <mesh position={va} renderOrder={10}>
        <sphereGeometry args={[0.035, 16, 12]} />
        <meshBasicMaterial color={TAPE} depthTest={false} />
      </mesh>
      {vb && ruler && (
        <>
          {/* the tape: a wide band, then its edge ticks */}
          <Line points={[va, vb]} color={TAPE} lineWidth={8} transparent opacity={0.6} depthTest={false} renderOrder={10} />
          <Line points={[va, vb]} color="#ffffff" lineWidth={1.25} depthTest={false} renderOrder={11} />
          <Line points={ruler} segments color="#ffffff" lineWidth={1.25} depthTest={false} renderOrder={11} />
          <mesh position={vb} renderOrder={10}>
            <sphereGeometry args={[0.035, 16, 12]} />
            <meshBasicMaterial color={TAPE} depthTest={false} />
          </mesh>
          <Html position={[(va.x + vb.x) / 2, (va.y + vb.y) / 2 + 0.25, (va.z + vb.z) / 2]} center style={{ pointerEvents: "none" }}>
            <div
              role={settled ? "status" : undefined}
              style={{
                padding: "3px 9px",
                borderRadius: 7,
                background: "oklch(0.2 0.014 260 / 0.88)",
                border: `1px solid ${settled ? "rgba(255,255,255,0.18)" : TAPE}`,
                color: PD.textPrimary,
                fontFamily: PD.fontMono,
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                // Isolate from RTL (Hebrew) context: this is always
                // "<number> m"/"<number> cm", and without isolation the
                // bidi algorithm reorders it to "m 2.00".
                direction: "ltr",
                unicodeBidi: "isolate",
              }}
            >
              {fmt(dist!)}
            </div>
          </Html>
        </>
      )}
    </>
  );
}
