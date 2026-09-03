"use client";

import { useEffect, useRef } from "react";
import { B } from "@/brand/tokens";
import {
  HERO_BOUNDS,
  HERO_NODES,
  HERO_OPENINGS,
  HERO_ROOMS,
  HERO_SEGMENTS,
  heroSegmentLength,
  type HeroOpening,
} from "./heroPlan";

// -----------------------------------------------------------------------------
// The hand that traces the hero's plan.
//
// The first ten seconds of the hero: a reference floorplan is traced wall by
// wall, four windows and two doors are placed, and "Generate model" is pressed.
// Then the drawing tilts to the 3D camera's pose and dissolves into the real
// Viewport, which is what actually builds the room.
//
// ── Why this is SVG and not the 3D layer ────────────────────────────────────
// Everything here happens before there is a model to render. Drawing it in the
// renderer would mean either faking a plan inside a 3D scene or asking the
// protected viewport3d/ tree for a 2D mode, and neither buys anything: a plan
// IS a flat drawing, and SVG draws flat things exactly.
//
// ── Why it imports nothing heavy ────────────────────────────────────────────
// Its only imports are the brand tokens and ./heroPlan, which is
// types-and-numbers by construction. See DemoStage.tsx's header for what a
// store import anywhere near here would silently cost.
//
// ── Why it never takes a pointer event ──────────────────────────────────────
// The whole overlay is `pointer-events: none`. It is driven entirely by the
// hero's button, so it needs no input of its own, and having none is the
// cheapest possible guarantee that it can never capture the wheel or a touch
// gesture — the bug AutoOrbitRig's dead input map exists to prevent.
// -----------------------------------------------------------------------------

// Phase rates. Dividing the WHOLE phase — draws, pauses and the pen lift — is
// what keeps the rhythm; scaling only the strokes turns a human hand into fast
// lines separated by unchanged gaps.
const RATE_WALLS = 1.4;
const RATE_OPENINGS = 0.8;

const M = 100; // svg units per metre
const WALL_T = 0.12 * M;
const BTN = { x: 390, y: 626, w: 232, h: 48 };

// The sheet, not just the plan. The drawing occupies x 0..780, y 0..500; the
// rest is the margin a dimensioned drawing needs, and the aspect is kept near
// the canvas cell's (~1.5) so the plan fills it rather than letterboxing.
const VIEW_BOX = "-100 -95 1060 780";

/** Plan metres to svg units. World y is up; svg y is down. */
function P(id: string): [number, number] {
  const n = HERO_NODES.find((v) => v.id === id);
  if (!n) return [0, 0];
  return [(n.x - HERO_BOUNDS.minX) * M, (HERO_BOUNDS.maxY - n.y) * M];
}

/** An opening's centre, angle and half-width, in svg space. */
function frameOf(o: HeroOpening) {
  const s = HERO_SEGMENTS.find((v) => v.id === o.wall);
  if (!s) return { cx: 0, cy: 0, ang: 0, hw: 0 };
  const [ax, ay] = P(s.a);
  const [bx, by] = P(s.b);
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const d = (o.offset / (heroSegmentLength(s) || 1)) * L;
  return {
    cx: ax + (dx / L) * d,
    cy: ay + (dy / L) * d,
    ang: (Math.atan2(dy, dx) * 180) / Math.PI,
    hw: (o.width / 2) * M,
  };
}

// ── the timeline ────────────────────────────────────────────────────────────
type StepKind =
  | "sheet" | "travel" | "draw" | "pause"
  | "otravel" | "tap" | "pop"
  | "gtravel" | "ghover" | "gpress" | "tilt";

interface Step { kind: StepKind; t0: number; t1: number; dur: number; seg?: number; op?: number }
interface SegTiming { drawStart: number; drawEnd: number; draw: number; pulseAt: number; pulseDur: number }
interface OpTiming { popStart: number; popEnd: number; popDur: number }

const STEPS: Step[] = [];
const SEG_T: SegTiming[] = [];
const OP_T: OpTiming[] = [];

(function build() {
  const push = (kind: StepKind, dur: number, extra?: Partial<Step>): Step => {
    const t0 = STEPS.length ? STEPS[STEPS.length - 1].t1 : 0;
    const st: Step = { kind, dur, t0, t1: t0 + dur, ...extra };
    STEPS.push(st);
    return st;
  };
  push("sheet", 0.8);
  HERO_SEGMENTS.forEach((s, i) => {
    if (s.travelBase) push("travel", s.travelBase / RATE_WALLS, { seg: i });
    const d = push("draw", s.drawBase / RATE_WALLS, { seg: i });
    const p = push("pause", s.pauseBase / RATE_WALLS, { seg: i });
    SEG_T[i] = {
      drawStart: d.t0, drawEnd: d.t1, draw: d.dur,
      pulseAt: p.t0, pulseDur: (s.closes ? 0.62 : 0.4) / RATE_WALLS,
    };
  });
  HERO_OPENINGS.forEach((_, i) => {
    push("otravel", 0.2 / RATE_OPENINGS, { op: i });
    push("tap", 0.08 / RATE_OPENINGS, { op: i });
    const pop = push("pop", 0.16 / RATE_OPENINGS, { op: i });
    OP_T[i] = { popStart: pop.t0, popEnd: pop.t1, popDur: pop.dur };
  });
  push("gtravel", 0.5);
  push("ghover", 0.22);
  push("gpress", 0.16);
  // Shorter than it was, and it now dissolves rather than lingering: the
  // drawing used to hold at 15% opacity over the finished room until the whole
  // build finished, which is most of what read as clunky.
  push("tilt", 0.9);
})();

const PRESS_AT = STEPS[STEPS.length - 2].t0;
const TILT0 = STEPS[STEPS.length - 1].t0;
const TILT1 = STEPS[STEPS.length - 1].t1;
export const TRACE_DURATION = TILT1;
export const TRACE_GENERATE_AT = PRESS_AT;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

function stepAt(t: number): Step {
  for (const s of STEPS) if (t < s.t1) return s;
  return STEPS[STEPS.length - 1];
}
function lerpP(a: [number, number], b: [number, number], t: number): [number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}
function centreOf(o: HeroOpening): [number, number] {
  const f = frameOf(o);
  return [f.cx, f.cy];
}
function pointerAt(t: number, st: Step): [number, number] | null {
  const p = (t - st.t0) / st.dur;
  switch (st.kind) {
    case "travel": return lerpP(P(HERO_SEGMENTS[st.seg! - 1].b), P(HERO_SEGMENTS[st.seg!].a), smooth(p));
    case "draw": return lerpP(P(HERO_SEGMENTS[st.seg!].a), P(HERO_SEGMENTS[st.seg!].b), smooth(p));
    case "pause": return P(HERO_SEGMENTS[st.seg!].b);
    case "otravel": {
      const i = st.op!;
      const from = i === 0 ? P(HERO_SEGMENTS[HERO_SEGMENTS.length - 1].b) : centreOf(HERO_OPENINGS[i - 1]);
      return lerpP(from, centreOf(HERO_OPENINGS[i]), smooth(p));
    }
    case "tap": case "pop": return centreOf(HERO_OPENINGS[st.op!]);
    case "gtravel": return lerpP(centreOf(HERO_OPENINGS[HERO_OPENINGS.length - 1]), [BTN.x, BTN.y], smooth(p));
    case "ghover": case "gpress": return [BTN.x, BTN.y];
    default: return null;
  }
}

// ── ink ─────────────────────────────────────────────────────────────────────
// Doors and windows are drawn in the colours the PRODUCT draws them in —
// `legacy/src/trace2d/TraceCanvas.tsx`'s DOOR_COLOR and WINDOW_COLOR, the same
// pair `WallMesh.tsx` already cites for its portal amber. Copying them is the
// point: the hero is claiming to be the app, so its openings have to be the
// colours a visitor will meet ten seconds later in the editor.
//
// None of these are brand accents. The brand allows exactly two copper objects
// on the page (brand/tokens.ts) and this is a picture of the app, not chrome.
const INK = {
  under: "#2E313A",
  underFill: "#191B21",
  wall: "#0A84FF",
  wallDim: "rgba(10,132,255,0.20)",
  pen: "#7CC0FF",
  door: "#E0852B",
  window: "#2BD4E0",
  dim: "#4A4E58",
  dimText: "#7E828C",
  label: "#6E727C",
};
const colourOf = (o: HeroOpening) => (o.kind === "door" ? INK.door : INK.window);

export interface TraceOverlayProps {
  running: boolean;
  onGenerate?: () => void;
  onComplete?: () => void;
}

export function TraceOverlay({ running, onGenerate, onComplete }: TraceOverlayProps) {
  const planRef = useRef<SVGSVGElement>(null);
  const hudRef = useRef<SVGSVGElement>(null);
  const traceRefs = useRef<(SVGLineElement | null)[]>([]);
  const glowRefs = useRef<(SVGLineElement | null)[]>([]);
  const pulseRefs = useRef<(SVGCircleElement | null)[]>([]);
  const openRefs = useRef<(SVGGElement | null)[]>([]);
  const ptrRef = useRef<SVGGElement>(null);
  const tapRef = useRef<SVGCircleElement>(null);
  const btnRef = useRef<SVGRectElement>(null);
  const btnTextRef = useRef<SVGTextElement>(null);
  const rippleRef = useRef<SVGRectElement>(null);
  const runLabelRef = useRef<SVGGElement>(null);
  const runTextRef = useRef<SVGTextElement>(null);

  const cb = useRef({ onGenerate, onComplete });
  cb.current = { onGenerate, onComplete };

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let t = 0;
    let fired = false;
    let finished = false;

    const draw = (time: number) => {
      const st = stepAt(time);

      HERO_SEGMENTS.forEach((s, i) => {
        const a = P(s.a);
        const b = P(s.b);
        const tm = SEG_T[i];
        const p = time >= tm.drawEnd ? 1 : time >= tm.drawStart ? smooth((time - tm.drawStart) / tm.draw) : 0;
        const x = lerp(a[0], b[0], p);
        const y = lerp(a[1], b[1], p);
        for (const node of [traceRefs.current[i], glowRefs.current[i]]) {
          if (!node) continue;
          node.setAttribute("x1", String(a[0]));
          node.setAttribute("y1", String(a[1]));
          node.setAttribute("x2", String(x));
          node.setAttribute("y2", String(y));
          node.setAttribute("opacity", p > 0 ? "1" : "0");
        }
        const pulse = pulseRefs.current[i];
        if (pulse) {
          const pr = (time - tm.pulseAt) / tm.pulseDur;
          if (pr >= 0 && pr <= 1) {
            const e = easeOut(pr);
            pulse.setAttribute("cx", String(b[0]));
            pulse.setAttribute("cy", String(b[1]));
            pulse.setAttribute("r", String(lerp(3, s.closes ? 30 : 19, e)));
            pulse.setAttribute("opacity", String((1 - e) * (s.closes ? 1 : 0.7)));
          } else pulse.setAttribute("opacity", "0");
        }
      });

      // The live measurement under the pen — the number a person watches while
      // they draw, in the same centimetres the static dimensions use.
      if (runLabelRef.current && runTextRef.current) {
        if (st.kind === "draw" || st.kind === "pause") {
          const s = HERO_SEGMENTS[st.seg!];
          const a = P(s.a);
          const b = P(s.b);
          const p = st.kind === "draw" ? smooth((time - st.t0) / st.dur) : 1;
          const cm = Math.round(heroSegmentLength(s) * 100 * p);
          const nx = -(b[1] - a[1]);
          const ny = b[0] - a[0];
          const nl = Math.hypot(nx, ny) || 1;
          const side = (a[0] + b[0]) / 2 < 390 ? 1 : -1;
          const mx = lerp(a[0], b[0], p * 0.5);
          const my = lerp(a[1], b[1], p * 0.5);
          runTextRef.current.textContent = `${cm}`;
          runLabelRef.current.setAttribute(
            "transform",
            `translate(${mx + (nx / nl) * 30 * side},${my + (ny / nl) * 30 * side})`,
          );
          runLabelRef.current.setAttribute(
            "opacity",
            st.kind === "draw" ? "1" : String(Math.max(0, 1 - (time - st.t0) / 0.3)),
          );
        } else runLabelRef.current.setAttribute("opacity", "0");
      }

      HERO_OPENINGS.forEach((o, i) => {
        const g = openRefs.current[i];
        if (!g) return;
        const tm = OP_T[i];
        const f = frameOf(o);
        let sc = 0;
        let op = 0;
        if (time >= tm.popEnd) { sc = 1; op = 1; }
        else if (time >= tm.popStart) {
          const q = clamp01((time - tm.popStart) / tm.popDur);
          op = q;
          sc = 1 + 0.22 * Math.sin(Math.PI * q);
        }
        g.setAttribute("opacity", String(op));
        g.setAttribute("transform", `translate(${f.cx},${f.cy}) rotate(${f.ang}) scale(${op ? sc : 0})`);
      });

      const ptr = ptrRef.current;
      const at = pointerAt(time, st);
      if (ptr) {
        if (at) {
          ptr.setAttribute("opacity", "1");
          ptr.setAttribute("transform", `translate(${at[0]},${at[1]})`);
        } else ptr.setAttribute("opacity", "0");
      }
      if (tapRef.current) {
        if (st.kind === "tap" || st.kind === "gpress") {
          const q = clamp01((time - st.t0) / st.dur);
          tapRef.current.setAttribute("r", String(lerp(4, 22, q)));
          tapRef.current.setAttribute("opacity", String(1 - q));
        } else tapRef.current.setAttribute("opacity", "0");
      }

      const hovering = st.kind === "ghover";
      const pressed = time >= PRESS_AT && time < TILT0;
      if (btnRef.current) {
        btnRef.current.setAttribute("fill", pressed ? B.accent : hovering ? B.accentTint : B.raised);
        btnRef.current.setAttribute("stroke", hovering || pressed ? B.accent : B.hairline2);
      }
      if (btnTextRef.current) btnTextRef.current.setAttribute("fill", pressed ? "#FFFFFF" : B.ink);
      if (rippleRef.current) {
        if (time >= PRESS_AT && time < PRESS_AT + 0.5) {
          const q = (time - PRESS_AT) / 0.5;
          rippleRef.current.setAttribute("opacity", String(1 - q));
          rippleRef.current.setAttribute("transform", `scale(${1 + q * 0.12})`);
        } else rippleRef.current.setAttribute("opacity", "0");
      }

      // The hand-off. Elevation 26 degrees above the horizon is a 64-degree
      // rotateX and azimuth 38 is the rotateZ — AutoOrbitRig's own constants,
      // mirrored the way it already mirrors FOV_DEG from Viewport.tsx.
      //
      // The drawing is GONE by 80% of the tilt rather than fading to a ghost
      // that outlives it. A dissolve where one layer finishes arriving before
      // the other has finished leaving reads as a cut; this one crosses.
      const q = clamp01((time - TILT0) / (TILT1 - TILT0));
      const e = smooth(q);
      if (planRef.current) {
        planRef.current.style.transform =
          q > 0
            ? `perspective(1500px) rotateX(${64 * e}deg) rotateZ(${-38 * e}deg) scale(${1 - 0.12 * e})`
            : "none";
        planRef.current.style.opacity = String(1 - smooth(q / 0.8));
      }
      // The toolbar and pointer are page chrome, not drawing: they leave first
      // and quickly, so nothing 2D is still sliding while the room arrives.
      if (hudRef.current) hudRef.current.style.opacity = String(1 - clamp01(q / 0.35));
    };

    if (process.env.NODE_ENV === "development") {
      (window as unknown as Record<string, unknown>).__doneTraceSeek = (sec: number) => draw(sec);
    }

    if (!running) {
      draw(0);
      return;
    }

    const tick = (now: number) => {
      if (!last) last = now;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      t += dt;
      if (!fired && t >= PRESS_AT) {
        fired = true;
        cb.current.onGenerate?.();
      }
      if (t >= TRACE_DURATION) {
        t = TRACE_DURATION;
        draw(t);
        if (!finished) {
          finished = true;
          cb.current.onComplete?.();
        }
        return;
      }
      draw(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}
    >
      <svg
        ref={planRef}
        viewBox={VIEW_BOX}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          transformOrigin: "50% 42%",
          willChange: "transform, opacity",
        }}
      >
        {/* ── the reference drawing ─────────────────────────────────────────
            Rooms, walls, dimensions and labels are all UNDERLAY: they are the
            plan being traced over, so they are on the sheet from the first
            frame. That is also what makes the resting hero read as a drawing
            rather than as an empty panel waiting for something to happen. */}
        {HERO_ROOMS.map((r) => (
          <polygon key={r.id} points={r.loop.map((id) => P(id).join(",")).join(" ")} fill={INK.underFill} />
        ))}
        {HERO_SEGMENTS.map((s) => {
          const a = P(s.a);
          const b = P(s.b);
          return (
            <line key={`u-${s.id}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
              stroke={INK.under} strokeWidth={WALL_T} strokeLinecap="square" />
          );
        })}

        <g className={PLAN_TEXT_CLASS}>
          <RoomLabel x={480} y={250} name="STUDIO" area="30.0 m²" />
          {/* Low and left of the bathroom's centre: the door is hung mid-way up
              the shared wall, and its swing arc sweeps straight through where a
              centred label would sit. */}
          <RoomLabel x={72} y={132} name="BATH" area="3.2 m²" />

          {/* Chained across the top, overall along the bottom, one run down
              each side — the way a plan of this size is actually dimensioned. */}
          <DimH x1={0} x2={180} y={-50} from={0} cm={180} />
          <DimH x1={180} x2={780} y={-50} from={0} cm={600} />
          <DimH x1={0} x2={780} y={556} from={500} cm={780} />
          <DimV y1={0} y2={500} x={838} from={780} cm={500} />
          <DimV y1={0} y2={180} x={-52} from={0} cm={180} />

          <text x={955} y={600} textAnchor="end" fontSize={16} fill={INK.label} letterSpacing="1.6">
            DIMENSIONS IN CM · 1:50
          </text>
        </g>

        {HERO_SEGMENTS.map((s, i) => (
          <line key={`g-${s.id}`} ref={(n) => { glowRefs.current[i] = n; }}
            stroke={INK.wallDim} strokeWidth={11} strokeLinecap="round" opacity={0} />
        ))}
        {HERO_SEGMENTS.map((s, i) => (
          <line key={`t-${s.id}`} ref={(n) => { traceRefs.current[i] = n; }}
            stroke={INK.wall} strokeWidth={3.4} strokeLinecap="round" opacity={0} />
        ))}

        {/* Openings sit ON TOP, so their jamb cut breaks the drawn wall line. */}
        {HERO_OPENINGS.map((o, i) => (
          <g key={o.id} ref={(n) => { openRefs.current[i] = n; }} opacity={0}>
            <OpeningGlyph o={o} />
          </g>
        ))}

        {HERO_SEGMENTS.map((s, i) => (
          <circle key={`p-${s.id}`} ref={(n) => { pulseRefs.current[i] = n; }}
            r={0} fill="none" stroke={INK.pen} strokeWidth={2} opacity={0} />
        ))}

        <g ref={runLabelRef} opacity={0} className={PLAN_TEXT_CLASS}>
          <rect x={-34} y={-14} width={68} height={26} rx={3} fill={B.ground} opacity={0.9} />
          <text ref={runTextRef} x={0} y={2} textAnchor="middle" dominantBaseline="middle"
            fontSize={17} fill={INK.pen} />
        </g>
      </svg>

      <svg ref={hudRef} viewBox={VIEW_BOX}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "opacity" }}>
        <g transform={`translate(${BTN.x},${BTN.y})`}>
          <rect ref={btnRef} x={-BTN.w / 2} y={-BTN.h / 2} width={BTN.w} height={BTN.h} rx={6}
            fill={B.raised} stroke={B.hairline2} strokeWidth={1.5} />
          <path d="M -74,-8 L -62,-8 M -74,0 L -62,0 M -74,8 L -62,8"
            stroke={B.ink3} strokeWidth={2} strokeLinecap="round" fill="none" />
          <text ref={btnTextRef} x={14} y={1} fontFamily={B.fontUi} fontSize={17} fontWeight={600}
            fill={B.ink} textAnchor="middle" dominantBaseline="middle">
            Generate model
          </text>
          <rect ref={rippleRef} x={-BTN.w / 2} y={-BTN.h / 2} width={BTN.w} height={BTN.h} rx={6}
            fill="none" stroke={B.accent} strokeWidth={2} opacity={0} />
        </g>
        <g ref={ptrRef} opacity={0}>
          <circle r={13} fill="rgba(124,192,255,0.13)" />
          <circle r={4.6} fill={INK.pen} />
          <circle ref={tapRef} r={0} fill="none" stroke={INK.pen} strokeWidth={2} opacity={0} />
        </g>
      </svg>
    </div>
  );
}

/** Room name and area, centred in the room — the two things every plan labels. */
function RoomLabel({ x, y, name, area }: { x: number; y: number; name: string; area: string }) {
  return (
    <g>
      <text x={x} y={y} textAnchor="middle" fontSize={19} fill={INK.label} letterSpacing="3.4">
        {name}
      </text>
      <text x={x} y={y + 26} textAnchor="middle" fontSize={15} fill={INK.dim}>
        {area}
      </text>
    </g>
  );
}

/**
 * A horizontal dimension: extension lines out from the plan, a run between
 * them, 45-degree slash ticks and the value above it. Architectural slashes
 * rather than arrowheads, which is the convention on a plan at this scale.
 */
function DimH({ x1, x2, y, from, cm }: { x1: number; x2: number; y: number; from: number; cm: number }) {
  const s = Math.sign(y - from) || 1;
  return (
    <g stroke={INK.dim} strokeWidth={1.2} fill="none">
      <line x1={x1} y1={from + s * 8} x2={x1} y2={y + s * 6} />
      <line x1={x2} y1={from + s * 8} x2={x2} y2={y + s * 6} />
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1 - 5} y1={y + 5} x2={x1 + 5} y2={y - 5} />
      <line x1={x2 - 5} y1={y + 5} x2={x2 + 5} y2={y - 5} />
      <text x={(x1 + x2) / 2} y={y - 9} textAnchor="middle" fontSize={17} fill={INK.dimText} stroke="none">
        {cm}
      </text>
    </g>
  );
}

/** The same, running vertically. The value stays upright by counter-rotating. */
function DimV({ y1, y2, x, from, cm }: { y1: number; y2: number; x: number; from: number; cm: number }) {
  const s = Math.sign(x - from) || 1;
  const my = (y1 + y2) / 2;
  return (
    <g stroke={INK.dim} strokeWidth={1.2} fill="none">
      <line x1={from + s * 8} y1={y1} x2={x + s * 6} y2={y1} />
      <line x1={from + s * 8} y1={y2} x2={x + s * 6} y2={y2} />
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 5} y1={y1 + 5} x2={x + 5} y2={y1 - 5} />
      <line x1={x - 5} y1={y2 + 5} x2={x + 5} y2={y2 - 5} />
      <text x={0} y={0} transform={`translate(${x - 9},${my}) rotate(-90)`} textAnchor="middle"
        fontSize={17} fill={INK.dimText} stroke="none">
        {cm}
      </text>
    </g>
  );
}

/**
 * One opening in plan, in the product's own colours: doors orange, windows and
 * the patio unit cyan.
 *
 * The patio unit shares the window glyph but sits wider in the wall and carries
 * a centre mullion — at 2.55 m a single unbroken pane reads as a missing wall
 * rather than as glass.
 */
function OpeningGlyph({ o }: { o: HeroOpening }) {
  const f = frameOf(o);
  const c = colourOf(o);
  const cut = <rect x={-f.hw} y={-WALL_T / 2 - 1} width={f.hw * 2} height={WALL_T + 2} fill={INK.underFill} />;
  const jambs = [-f.hw, f.hw].map((x) => (
    <line key={x} x1={x} y1={-WALL_T / 2} x2={x} y2={WALL_T / 2} stroke={c} strokeWidth={2.6} />
  ));

  if (o.kind === "door") {
    const R = f.hw * 2;
    const sw = o.swing ?? 1;
    return (
      <>
        {cut}
        <line x1={-f.hw} y1={0} x2={-f.hw} y2={sw * R} stroke={c} strokeWidth={2.6} strokeLinecap="round" />
        <path d={`M ${-f.hw},${sw * R} A ${R},${R} 0 0 ${sw > 0 ? 0 : 1} ${f.hw},0`}
          fill="none" stroke={c} strokeWidth={1.6} opacity={0.65} />
        {jambs}
      </>
    );
  }

  const gap = o.kind === "patio" ? WALL_T / 3.4 : WALL_T / 5;
  const sw = o.kind === "patio" ? 2.6 : 2.2;
  return (
    <>
      {cut}
      <line x1={-f.hw} y1={-gap} x2={f.hw} y2={-gap} stroke={c} strokeWidth={sw} />
      <line x1={-f.hw} y1={gap} x2={f.hw} y2={gap} stroke={c} strokeWidth={sw} />
      {o.kind === "patio" && <line x1={0} y1={-gap} x2={0} y2={gap} stroke={c} strokeWidth={2.2} opacity={0.8} />}
      {jambs}
    </>
  );
}

/** Applied through a class, not a `font-family` attribute, so the token's
 *  value resolves the same way it does everywhere else on the page. */
export const PLAN_TEXT_CLASS = "done-plan-text";
export const PLAN_TEXT_CSS = `
.${PLAN_TEXT_CLASS} { font-family: ${B.fontMono}; font-weight: 400; }
`;

export default TraceOverlay;
