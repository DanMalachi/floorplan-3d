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
  type HeroSegment,
} from "./heroPlan";

// -----------------------------------------------------------------------------
// The hand that traces the hero's plan.
//
// The first ten seconds of the hero: a reference plan is traced wall by wall,
// four windows and two doors are placed, and "Generate model" is pressed. Then
// the plan tilts to the 3D camera's pose and hands over to the real Viewport,
// which is what actually builds the room.
//
// ── Why this is SVG and not the 3D layer ────────────────────────────────────
// Everything here happens before there is a model to render. Drawing it in the
// renderer would mean either faking a plan inside a 3D scene or asking the
// protected viewport3d/ tree for a 2D mode, and neither buys anything: a plan
// IS a flat drawing, and SVG draws flat things exactly. It also means the whole
// trace runs before three.js has to exist on the page, which is what lets the
// heavy chunk load DURING the animation instead of in front of it.
//
// ── Why it imports nothing heavy ────────────────────────────────────────────
// This file is reached from DemoRoom.tsx, the light half of the hero. Its only
// imports are the brand tokens and ./heroPlan, which is types-and-numbers by
// construction. A store import here would silently undo the code-split — see
// DemoStage.tsx's header.
//
// ── Why it never takes a pointer event ──────────────────────────────────────
// The whole overlay is `pointer-events: none`. It is driven entirely by the
// hero's button, so it needs no input of its own, and having none is the
// cheapest possible guarantee that it can never capture the wheel or a touch
// gesture. That is the bug AutoOrbitRig's dead input map exists to prevent, and
// a new element over the canvas is exactly how it would come back.
// -----------------------------------------------------------------------------

// Phase rates, chosen by eye against the real animation and then kept: the pen
// wants to move quicker than a machine would, and placing an opening wants to
// be slower than drawing a line, because it is a decision rather than a stroke.
// Dividing the whole phase — draws, pauses AND the pen lift — keeps the
// rhythm; scaling only the strokes turns it into fast lines with unchanged gaps.
const RATE_WALLS = 1.4;
const RATE_OPENINGS = 0.8;

const M = 100; // svg units per metre
const WALL_T = 0.12 * M;
const BTN = { x: 390, y: 560, w: 232, h: 48 };
const VIEW_BOX = "-70 -90 920 700";

/** Plan metres to svg units. World y is up; svg y is down. */
function P(id: string): [number, number] {
  const n = HERO_NODES.find((v) => v.id === id);
  if (!n) return [0, 0];
  return [(n.x - HERO_BOUNDS.minX) * M, (HERO_BOUNDS.maxY - n.y) * M];
}

function segOf(id: string): HeroSegment | undefined {
  return HERO_SEGMENTS.find((s) => s.id === id);
}

/** An opening's centre, angle and half-width, in svg space. */
function frameOf(o: HeroOpening) {
  const s = segOf(o.wall);
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
// Built once, at module load. Every duration is a base second divided by its
// phase rate, so retuning the feel is two constants above and nothing else.

type StepKind =
  | "sheet"
  | "travel"
  | "draw"
  | "pause"
  | "otravel"
  | "tap"
  | "pop"
  | "gtravel"
  | "ghover"
  | "gpress"
  | "tilt";

interface Step {
  kind: StepKind;
  t0: number;
  t1: number;
  dur: number;
  seg?: number;
  op?: number;
}

interface SegTiming {
  drawStart: number;
  drawEnd: number;
  draw: number;
  pulseAt: number;
  pulseDur: number;
}
interface OpTiming {
  popStart: number;
  popEnd: number;
  popDur: number;
}

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
      drawStart: d.t0,
      drawEnd: d.t1,
      draw: d.dur,
      pulseAt: p.t0,
      pulseDur: (s.closes ? 0.62 : 0.4) / RATE_WALLS,
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
  push("tilt", 1.2);
})();

const PRESS_AT = STEPS[STEPS.length - 2].t0;
const TILT0 = STEPS[STEPS.length - 1].t0;
const TILT1 = STEPS[STEPS.length - 1].t1;
/** How long the whole overlay runs, in seconds. */
export const TRACE_DURATION = TILT1;
/** When the model has to start standing up — the moment Generate is pressed. */
export const TRACE_GENERATE_AT = PRESS_AT;

// ── maths ───────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

function stepAt(t: number): Step {
  for (const s of STEPS) if (t < s.t1) return s;
  return STEPS[STEPS.length - 1];
}

function pointerAt(t: number, st: Step): [number, number] | null {
  const p = (t - st.t0) / st.dur;
  switch (st.kind) {
    case "travel":
      return lerpP(P(HERO_SEGMENTS[st.seg! - 1].b), P(HERO_SEGMENTS[st.seg!].a), smooth(p));
    case "draw":
      return lerpP(P(HERO_SEGMENTS[st.seg!].a), P(HERO_SEGMENTS[st.seg!].b), smooth(p));
    case "pause":
      return P(HERO_SEGMENTS[st.seg!].b);
    case "otravel": {
      const i = st.op!;
      const from = i === 0 ? P(HERO_SEGMENTS[HERO_SEGMENTS.length - 1].b) : centreOf(HERO_OPENINGS[i - 1]);
      return lerpP(from, centreOf(HERO_OPENINGS[i]), smooth(p));
    }
    case "tap":
    case "pop":
      return centreOf(HERO_OPENINGS[st.op!]);
    case "gtravel":
      return lerpP(centreOf(HERO_OPENINGS[HERO_OPENINGS.length - 1]), [BTN.x, BTN.y], smooth(p));
    case "ghover":
    case "gpress":
      return [BTN.x, BTN.y];
    default:
      return null;
  }
}
function lerpP(a: [number, number], b: [number, number], t: number): [number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}
function centreOf(o: HeroOpening): [number, number] {
  const f = frameOf(o);
  return [f.cx, f.cy];
}

// ── colours ─────────────────────────────────────────────────────────────────
// The trace is the app's own wall-drawing blue, NOT a brand colour. The brand
// allows exactly two copper objects on the page (the wordmark's period and CTA
// fills, see brand/tokens.ts) and a third would break the identity rule, so the
// only accent in here is the one the editor itself draws walls in.
const INK = {
  under: "#2E313A",
  underFill: "#191B21",
  trace: "#0A84FF",
  traceDim: "rgba(10,132,255,0.20)",
  traceHi: "#7CC0FF",
};

export interface TraceOverlayProps {
  /** Drive the animation. False parks it on the resting plan. */
  running: boolean;
  /** Generate has been pressed — the model should start standing up now. */
  onGenerate?: () => void;
  /** The tilt has finished; the overlay is done and can be unmounted. */
  onComplete?: () => void;
}

/**
 * The traced plan, as an absolutely-positioned overlay on the demo canvas.
 *
 * Structure is declared in JSX and animated by mutating attributes from one
 * `requestAnimationFrame` loop — the same bargain the rest of the site makes
 * (`Hero.tsx`'s crossfade is two setTimeouts, the orbit is a `useFrame`).
 * Re-rendering forty elements sixty times a second through React to move a
 * line would cost more than the animation.
 */
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

  // Latest callbacks without restarting the loop when a parent re-renders.
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
          } else {
            pulse.setAttribute("opacity", "0");
          }
        }
      });

      HERO_OPENINGS.forEach((o, i) => {
        const g = openRefs.current[i];
        if (!g) return;
        const tm = OP_T[i];
        const f = frameOf(o);
        let sc = 0;
        let op = 0;
        if (time >= tm.popEnd) {
          sc = 1;
          op = 1;
        } else if (time >= tm.popStart) {
          const q = clamp01((time - tm.popStart) / tm.popDur);
          op = q;
          sc = 1 + 0.22 * Math.sin(Math.PI * q);
        }
        g.setAttribute("opacity", String(op));
        g.setAttribute(
          "transform",
          `translate(${f.cx},${f.cy}) rotate(${f.ang}) scale(${op ? sc : 0})`,
        );
      });

      const ptr = ptrRef.current;
      const at = pointerAt(time, st);
      if (ptr) {
        if (at) {
          ptr.setAttribute("opacity", "1");
          ptr.setAttribute("transform", `translate(${at[0]},${at[1]})`);
        } else {
          ptr.setAttribute("opacity", "0");
        }
      }
      if (tapRef.current) {
        if (st.kind === "tap" || st.kind === "gpress") {
          const q = clamp01((time - st.t0) / st.dur);
          tapRef.current.setAttribute("r", String(lerp(4, 22, q)));
          tapRef.current.setAttribute("opacity", String(1 - q));
        } else {
          tapRef.current.setAttribute("opacity", "0");
        }
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
        } else {
          rippleRef.current.setAttribute("opacity", "0");
        }
      }

      // The tilt to the 3D camera's resting pose. Elevation 26 degrees above
      // the horizon is a 64-degree rotateX; azimuth 38 is the rotateZ. Both
      // are AutoOrbitRig's own constants, mirrored here the way it already
      // mirrors FOV_DEG from Viewport.tsx rather than exporting it.
      const q = clamp01((time - TILT0) / (TILT1 - TILT0));
      const e = smooth(q);
      if (planRef.current) {
        planRef.current.style.transform =
          q > 0
            ? `perspective(1500px) rotateX(${64 * e}deg) rotateZ(${-38 * e}deg) scale(${1 - 0.14 * e})`
            : "none";
        planRef.current.style.opacity = String(1 - e * 0.85);
      }
      if (hudRef.current) hudRef.current.style.opacity = String(1 - e);
    };

    // Dev-only seek, so the animation can be inspected without playing it.
    // `draw` is a pure function of time, so this renders any instant exactly as
    // the loop would. It exists because this animation cannot be watched in an
    // automated browser at all: an occluded or background tab gets ZERO
    // requestAnimationFrame callbacks, so the trace sits at t=0 and looks
    // broken while being perfectly correct. A screenshot forces a paint but not
    // a frame, so stepping the clock by hand is the only way to see it.
    //
    //   __doneTraceSeek(4.2)   // then screenshot
    if (process.env.NODE_ENV === "development") {
      (window as unknown as Record<string, unknown>).__doneTraceSeek = (sec: number) => draw(sec);
    }

    if (!running) {
      // Parked: the reference plan, untraced, with the toolbar dimmed. This is
      // the resting hero — a drawing waiting for a hand, which is the state the
      // button is asking the visitor to end.
      draw(0);
      return;
    }

    const tick = (now: number) => {
      if (!last) last = now;
      // Clamped so a backgrounded tab does not resume by jumping the whole
      // animation in one frame — the same guard AutoOrbitRig's MAX_FRAME is.
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
      style={{
        position: "absolute",
        inset: 0,
        // Never takes an event. See the header: this is what makes it
        // impossible for the overlay to steal the page's scroll.
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <svg
        ref={planRef}
        viewBox={VIEW_BOX}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transformOrigin: "50% 46%" }}
      >
        {/* the reference plan being traced over */}
        {HERO_ROOMS.map((r) => (
          <polygon key={r.id} points={r.loop.map((id) => P(id).join(",")).join(" ")} fill={INK.underFill} />
        ))}
        {HERO_SEGMENTS.map((s) => {
          const a = P(s.a);
          const b = P(s.b);
          return (
            <line
              key={`u-${s.id}`}
              x1={a[0]}
              y1={a[1]}
              x2={b[0]}
              y2={b[1]}
              stroke={INK.under}
              strokeWidth={WALL_T}
              strokeLinecap="square"
            />
          );
        })}

        {/* the traced line: a soft under-stroke, then the crisp one */}
        {HERO_SEGMENTS.map((s, i) => (
          <line
            key={`g-${s.id}`}
            ref={(n) => {
              glowRefs.current[i] = n;
            }}
            stroke={INK.traceDim}
            strokeWidth={11}
            strokeLinecap="round"
            opacity={0}
          />
        ))}
        {HERO_SEGMENTS.map((s, i) => (
          <line
            key={`t-${s.id}`}
            ref={(n) => {
              traceRefs.current[i] = n;
            }}
            stroke={INK.trace}
            strokeWidth={3.4}
            strokeLinecap="round"
            opacity={0}
          />
        ))}

        {/* openings sit ON TOP, so their jamb cut breaks the drawn line */}
        {HERO_OPENINGS.map((o, i) => (
          <g
            key={o.id}
            ref={(n) => {
              openRefs.current[i] = n;
            }}
            opacity={0}
          >
            <OpeningGlyph o={o} />
          </g>
        ))}

        {HERO_SEGMENTS.map((s, i) => (
          <circle
            key={`p-${s.id}`}
            ref={(n) => {
              pulseRefs.current[i] = n;
            }}
            r={0}
            fill="none"
            stroke={INK.traceHi}
            strokeWidth={2}
            opacity={0}
          />
        ))}
      </svg>

      <svg
        ref={hudRef}
        viewBox={VIEW_BOX}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <g transform={`translate(${BTN.x},${BTN.y})`}>
          <rect
            ref={btnRef}
            x={-BTN.w / 2}
            y={-BTN.h / 2}
            width={BTN.w}
            height={BTN.h}
            rx={5}
            fill={B.raised}
            stroke={B.hairline2}
            strokeWidth={1.5}
          />
          <path
            d="M -74,-8 L -62,-8 M -74,0 L -62,0 M -74,8 L -62,8"
            stroke={B.ink3}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <text
            ref={btnTextRef}
            x={14}
            y={1}
            fontFamily={B.fontUi}
            fontSize={17}
            fontWeight={600}
            fill={B.ink}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            Generate model
          </text>
          <rect
            ref={rippleRef}
            x={-BTN.w / 2}
            y={-BTN.h / 2}
            width={BTN.w}
            height={BTN.h}
            rx={5}
            fill="none"
            stroke={B.accent}
            strokeWidth={2}
            opacity={0}
          />
        </g>
        <g ref={ptrRef} opacity={0}>
          <circle r={13} fill="rgba(124,192,255,0.13)" />
          <circle r={4.6} fill={INK.traceHi} />
          <circle ref={tapRef} r={0} fill="none" stroke={INK.traceHi} strokeWidth={2} opacity={0} />
        </g>
      </svg>
    </div>
  );
}

/**
 * One opening in plan.
 *
 * A door gets a leaf and its swing arc; a window gets the double glazing line.
 * The patio unit shares the window's glyph but sits wider in the wall and
 * carries a centre mullion — at 2.55 m a single unbroken pane reads as a
 * missing wall rather than as glass.
 */
function OpeningGlyph({ o }: { o: HeroOpening }) {
  const f = frameOf(o);
  const cut = (
    <rect x={-f.hw} y={-WALL_T / 2 - 1} width={f.hw * 2} height={WALL_T + 2} fill={INK.underFill} />
  );
  const jambs = [-f.hw, f.hw].map((x) => (
    <line key={x} x1={x} y1={-WALL_T / 2} x2={x} y2={WALL_T / 2} stroke={INK.traceHi} strokeWidth={2.4} />
  ));

  if (o.kind === "door") {
    const R = f.hw * 2;
    const sw = o.swing ?? 1;
    return (
      <>
        {cut}
        <line x1={-f.hw} y1={0} x2={-f.hw} y2={sw * R} stroke={INK.trace} strokeWidth={2.6} strokeLinecap="round" />
        <path
          d={`M ${-f.hw},${sw * R} A ${R},${R} 0 0 ${sw > 0 ? 0 : 1} ${f.hw},0`}
          fill="none"
          stroke={INK.trace}
          strokeWidth={1.6}
          opacity={0.6}
        />
        {jambs}
      </>
    );
  }

  const gap = o.kind === "patio" ? WALL_T / 3.4 : WALL_T / 5;
  const sw = o.kind === "patio" ? 2.6 : 2.2;
  return (
    <>
      {cut}
      <line x1={-f.hw} y1={-gap} x2={f.hw} y2={-gap} stroke={INK.trace} strokeWidth={sw} />
      <line x1={-f.hw} y1={gap} x2={f.hw} y2={gap} stroke={INK.trace} strokeWidth={sw} />
      {o.kind === "patio" && <line x1={0} y1={-gap} x2={0} y2={gap} stroke={INK.traceHi} strokeWidth={2.2} />}
      {jambs}
    </>
  );
}

export default TraceOverlay;
