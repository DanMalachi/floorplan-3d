// The looping gesture pictures inside the guide cards, hand-drawn inline SVG
// (no third-party art, CLAUDE.md rule 8). Each one plays a six-second loop of
// the move the card asks for: a cursor clicks, a ripple shows the click, and
// the result appears.
//
// The drawings are PAPER: a plan is black on white in both themes, so their
// colours are fixed on purpose and don't follow the PD tokens (the same call
// isoArt.tsx makes for the room scenes).
//
// Reduced motion: every loop stops and the picture shows its finished state
// (the result visible, no cursor, no ripple). See `GUIDE_CSS`.

import type React from "react";
import { PD } from "@/ui/planDock/tokens";

/** Keyframes and classes for the cards and their pictures. Rendered once by
 *  `GuideCard` / `WelcomeGuide` as a <style> element; everything is prefixed
 *  `dg-` so nothing collides with the app's own CSS. */
export const GUIDE_CSS = `
.dg-cur{animation-duration:6s;animation-iteration-count:infinite;animation-timing-function:cubic-bezier(.45,0,.3,1)}
.dg-rip{transform-box:fill-box;transform-origin:center;opacity:0;animation-duration:6s;animation-iteration-count:infinite}
.dg-ring{animation:dg-ring 2.4s ease-in-out infinite}
@keyframes dg-ring{50%{box-shadow:0 0 0 9px oklch(0.6 0.15 258 / .12),0 0 30px oklch(0.6 0.15 258 / .5)}}
@keyframes dg-ripA{0%,18%{opacity:0;transform:scale(.3)}20%{opacity:.9;transform:scale(.6)}30%{opacity:0;transform:scale(1.6)}100%{opacity:0}}
@keyframes dg-ripB{0%,38%{opacity:0;transform:scale(.3)}40%{opacity:.9;transform:scale(.6)}50%{opacity:0;transform:scale(1.6)}100%{opacity:0}}
@keyframes dg-at55{0%,52%{opacity:0}58%,92%{opacity:1}100%{opacity:0}}
@keyframes dg-at40{0%,38%{opacity:0}42%,92%{opacity:1}100%{opacity:0}}
@keyframes dg-at20{0%,18%{opacity:0}22%,92%{opacity:1}100%{opacity:0}}
@keyframes dg-curScale{0%{transform:translate(120px,95px)}18%,22%{transform:translate(34px,44px)}38%,42%{transform:translate(206px,44px)}60%,100%{transform:translate(160px,96px)}}
@keyframes dg-curDoor{0%{transform:translate(40px,100px)}18%,22%{transform:translate(92px,58px)}38%,42%{transform:translate(152px,58px)}60%,100%{transform:translate(190px,98px)}}
@keyframes dg-curWalls{0%{transform:translate(40px,30px)}12%,15%{transform:translate(40px,30px)}27%,30%{transform:translate(200px,30px)}42%,45%{transform:translate(200px,70px)}57%,60%{transform:translate(120px,70px)}72%,75%{transform:translate(120px,100px)}84%,86%{transform:translate(40px,100px)}94%,100%{transform:translate(40px,30px)}}
@keyframes dg-curRail{0%{transform:translate(150px,30px)}25%,30%{transform:translate(214px,30px)}55%,60%{transform:translate(214px,86px)}85%,100%{transform:translate(150px,86px)}}
@keyframes dg-curOpen{0%{transform:translate(30px,90px)}25%,30%{transform:translate(78px,52px)}48%,52%{transform:translate(150px,52px)}70%,100%{transform:translate(200px,92px)}}
@keyframes dg-drawLine{0%,12%{stroke-dashoffset:520}90%,100%{stroke-dashoffset:0}}
@keyframes dg-fillIn{0%,90%{opacity:0}94%,100%{opacity:1}}
@keyframes dg-blink{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes dg-wheel{0%,100%{transform:translateY(-3px)}50%{transform:translateY(3px)}}
@keyframes dg-swipe{0%,100%{transform:translateX(-7px)}50%{transform:translateX(7px)}}
@keyframes dg-pinch1{0%,100%{transform:translate(-8px,-6px)}50%{transform:translate(0,0)}}
@keyframes dg-pinch2{0%,100%{transform:translate(8px,6px)}50%{transform:translate(0,0)}}
@keyframes dg-hl{0%,46%{opacity:0}52%,100%{opacity:1}}
@keyframes dg-curNav{0%{transform:translate(20px,20px)}20%,26%{transform:translate(58px,26px)}46%,52%{transform:translate(96px,70px)}70%,100%{transform:translate(160px,122px)}}
.dg-pulse{animation:dg-pulse 2s ease-out infinite}
@keyframes dg-pulse{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.4)}}
@media (prefers-reduced-motion: reduce){
  .dg-anim,.dg-ring,.dg-pulse{animation:none!important}
  .dg-cur,.dg-rip{display:none}
}
`;

/** Loop helper: a named keyframe on the shared six-second clock. */
const loop = (name: string): React.CSSProperties => ({ animation: `${name} 6s infinite` });

const CURSOR = (
  <path
    d="M0 0 L0 17 L4.5 13 L7.5 20 L10.5 18.8 L7.5 12 L13 12 Z"
    fill="#111"
    stroke="#fff"
    strokeWidth={1.4}
    strokeLinejoin="round"
  />
);

function Cursor({ path }: { path: string }) {
  return (
    <g className="dg-cur" style={{ animationName: path }}>
      {CURSOR}
    </g>
  );
}

function Ripple({ cx, cy, second }: { cx: number; cy: number; second?: boolean }) {
  return (
    <circle
      className="dg-rip"
      cx={cx}
      cy={cy}
      r={10}
      fill="none"
      stroke="#2f6fe0"
      strokeWidth={3}
      style={{ animationName: second ? "dg-ripB" : "dg-ripA" }}
    />
  );
}

/** Squared paper, the plan's own background. */
function Paper({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <svg
      viewBox="0 0 240 120"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: 10, background: "#f2f1ee" }}
    >
      <rect width={240} height={120} fill="#f2f1ee" />
      <g stroke="#d9d7d0" strokeWidth={0.6}>
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={120} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i * 20} x2={240} y2={i * 20} />
        ))}
      </g>
      {children}
    </svg>
  );
}

const MARK = { fill: "#f5b400", stroke: "#8a6500" };
const FIELD_FONT = "Manrope, sans-serif";

/** Scale from a dimension line: click both ends, type the number on it. */
export function DemoDimension() {
  return (
    <Paper>
      <rect x={24} y={62} width={192} height={12} fill="#55555c" />
      <line x1={34} y1={44} x2={206} y2={44} stroke="#222" strokeWidth={1.2} />
      <line x1={34} y1={36} x2={34} y2={52} stroke="#222" />
      <line x1={206} y1={36} x2={206} y2={52} stroke="#222" />
      <text x={120} y={39} fontSize={11} textAnchor="middle" fill="#222" fontFamily="IBM Plex Mono, monospace">
        728
      </text>
      <Ripple cx={34} cy={44} />
      <Ripple cx={206} cy={44} second />
      <g className="dg-anim" style={loop("dg-at20")}>
        <circle cx={34} cy={44} r={4.5} {...MARK} />
      </g>
      <g className="dg-anim" style={loop("dg-at40")}>
        <circle cx={206} cy={44} r={4.5} {...MARK} />
        <line x1={34} y1={44} x2={206} y2={44} stroke="#f5b400" strokeWidth={2} strokeDasharray="4 3" />
      </g>
      <g className="dg-anim" style={loop("dg-at55")}>
        <rect x={66} y={84} width={108} height={26} rx={7} fill="#1e2025" />
        <text x={80} y={101} fontSize={12} fill="#fff" fontFamily={FIELD_FONT} fontWeight={700} direction="ltr">
          728 cm
        </text>
        <rect x={132} y={88} width={36} height={18} rx={9} fill="#2f6fe0" />
        <text x={150} y={100} fontSize={9} fill="#fff" textAnchor="middle" fontFamily={FIELD_FONT} fontWeight={700}>
          ✓
        </text>
      </g>
      <Cursor path="dg-curScale" />
    </Paper>
  );
}

/** Scale from a door: click both sides of the opening, type 90. */
export function DemoDoor() {
  return (
    <Paper>
      <rect x={20} y={52} width={72} height={12} fill="#55555c" />
      <rect x={152} y={52} width={68} height={12} fill="#55555c" />
      <path d="M92 58 L92 110" stroke="#777" strokeWidth={1.5} />
      <path d="M92 110 A52 52 0 0 0 144 58" fill="none" stroke="#999" strokeWidth={1} />
      <Ripple cx={92} cy={58} />
      <Ripple cx={152} cy={58} second />
      <g className="dg-anim" style={loop("dg-at20")}>
        <circle cx={92} cy={58} r={4.5} {...MARK} />
      </g>
      <g className="dg-anim" style={loop("dg-at40")}>
        <circle cx={152} cy={58} r={4.5} {...MARK} />
      </g>
      <g className="dg-anim" style={loop("dg-at55")}>
        <rect x={150} y={84} width={84} height={26} rx={7} fill="#1e2025" />
        <text x={162} y={101} fontSize={12} fill="#fff" fontFamily={FIELD_FONT} fontWeight={700} direction="ltr">
          90 cm
        </text>
      </g>
      <Cursor path="dg-curDoor" />
    </Paper>
  );
}

const WALL_PTS = "40,30 200,30 200,70 120,70 120,100 40,100 40,30";

/** Walls: click corner to corner, back to the first one, and the room fills. */
export function DemoWalls() {
  return (
    <Paper>
      <polyline points={WALL_PTS} fill="none" stroke="#55555c" strokeWidth={9} strokeLinejoin="miter" />
      <polygon points={WALL_PTS} fill="#5fc27e" fillOpacity={0.45} className="dg-anim" style={loop("dg-fillIn")} />
      <polyline
        points={WALL_PTS}
        fill="none"
        stroke="#2fa6ff"
        strokeWidth={2.4}
        strokeDasharray={520}
        className="dg-anim"
        style={loop("dg-drawLine")}
      />
      {WALL_PTS.split(" ")
        .slice(0, 6)
        .map((p) => {
          const [x, y] = p.split(",").map(Number);
          return <circle key={p} cx={x} cy={y} r={3.6} fill="#fff" stroke="#2fa6ff" strokeWidth={1.6} />;
        })}
      <Cursor path="dg-curWalls" />
    </Paper>
  );
}

/** Rail: trace the balcony's outer edge, finishing on the house wall. */
export function DemoRail() {
  const pts = "150,30 214,30 214,86 150,86";
  return (
    <Paper>
      <rect x={30} y={16} width={120} height={70} fill="none" stroke="#55555c" strokeWidth={9} />
      <polygon points={pts} fill="#5fc27e" fillOpacity={0.4} className="dg-anim" style={loop("dg-fillIn")} />
      <polyline
        points={pts}
        fill="none"
        stroke="#3fd0b4"
        strokeWidth={3}
        strokeDasharray={520}
        className="dg-anim"
        style={loop("dg-drawLine")}
      />
      <text
        x={182}
        y={62}
        fontSize={10}
        textAnchor="middle"
        fill="#2b6b5c"
        fontFamily={FIELD_FONT}
        fontWeight={700}
        className="dg-anim"
        style={loop("dg-fillIn")}
      >
        ✓
      </text>
      <Cursor path="dg-curRail" />
    </Paper>
  );
}

/** Openings: click one side of the gap, then the other. */
export function DemoOpenings() {
  return (
    <Paper>
      <rect x={16} y={46} width={208} height={12} fill="#55555c" />
      <rect x={78} y={46} width={72} height={12} fill="#f2f1ee" />
      <path d="M78 58 A60 60 0 0 1 138 118" fill="none" stroke="#999" strokeWidth={1} />
      <line x1={78} y1={58} x2={78} y2={118} stroke="#777" strokeWidth={1.5} />
      <Ripple cx={78} cy={52} />
      <Ripple cx={150} cy={52} second />
      <rect x={78} y={46} width={72} height={12} fill="#f28c38" className="dg-anim" style={loop("dg-at40")} />
      <Cursor path="dg-curOpen" />
    </Paper>
  );
}

// ── Device pictures (3D guides and the help panel) ──────────────────────────
// Line art in `currentColor`, so they take the text colour of whatever row
// they sit in, dark theme or light; the part being used is in the accent.

const HOT = PD.accentText;
const blink = (d = "1.4s", delay = "0s"): React.CSSProperties => ({ animation: `dg-blink ${d} infinite ${delay}` });

export type MousePart = "left" | "right" | "wheel" | "wheeldrag" | "none";

export function MouseIcon({ part, size = 64 }: { part: MousePart; size?: number }) {
  return (
    <svg viewBox="0 0 64 48" width={size} height={(size * 48) / 64} aria-hidden>
      <rect x={20} y={4} width={24} height={40} rx={12} fill="none" stroke="currentColor" strokeWidth={2} />
      <line x1={32} y1={4} x2={32} y2={20} stroke="currentColor" strokeWidth={2} />
      <line x1={20} y1={20} x2={44} y2={20} stroke="currentColor" strokeWidth={1.4} opacity={0.5} />
      {part === "right" && <path d="M32 5 A11 11 0 0 1 43 16 L43 20 L32 20Z" fill={HOT} className="dg-anim" style={blink()} />}
      {part === "left" && <path d="M32 5 A11 11 0 0 0 21 16 L21 20 L32 20Z" fill={HOT} className="dg-anim" style={blink()} />}
      <rect
        x={29.5}
        y={8}
        width={5}
        height={9}
        rx={2.5}
        fill={part === "wheel" || part === "wheeldrag" ? HOT : "currentColor"}
        className={part === "wheel" ? "dg-anim" : undefined}
        style={part === "wheel" ? { animation: "dg-wheel 1s infinite" } : undefined}
      />
      {part === "right" && (
        <>
          <path d="M6 30 A26 16 0 0 0 58 30" fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray="3 3" />
          <path d="M54 25 L58 30 L52 32" fill="none" stroke="currentColor" strokeWidth={1.6} />
        </>
      )}
      {part === "wheeldrag" && (
        <path d="M4 24 L14 24 M50 24 L60 24 M8 20 L4 24 L8 28 M56 20 L60 24 L56 28" fill="none" stroke="currentColor" strokeWidth={1.6} />
      )}
      {part === "wheel" && (
        <path d="M52 12 L52 36 M48 16 L52 12 L56 16 M48 32 L52 36 L56 32" fill="none" stroke="currentColor" strokeWidth={1.6} />
      )}
    </svg>
  );
}

export type PadGesture = "swipe" | "pinch" | "one" | "space";

export function PadIcon({ gesture, size = 64 }: { gesture: PadGesture; size?: number }) {
  const move = (name: string): React.CSSProperties => ({ animation: `${name} 1.6s ease-in-out infinite` });
  return (
    <svg viewBox="0 0 64 48" width={size} height={(size * 48) / 64} aria-hidden>
      <rect x={6} y={6} width={52} height={36} rx={6} fill="none" stroke="currentColor" strokeWidth={2} />
      {gesture === "swipe" && (
        <g className="dg-anim" style={move("dg-swipe")}>
          <circle cx={27} cy={24} r={4} fill={HOT} />
          <circle cx={37} cy={24} r={4} fill={HOT} />
        </g>
      )}
      {gesture === "pinch" && (
        <>
          <circle cx={32} cy={24} r={4} fill={HOT} className="dg-anim" style={move("dg-pinch1")} />
          <circle cx={32} cy={24} r={4} fill={HOT} className="dg-anim" style={move("dg-pinch2")} />
        </>
      )}
      {gesture === "one" && <circle cx={32} cy={24} r={4} fill={HOT} className="dg-anim" style={move("dg-swipe")} />}
      {gesture === "space" && (
        <>
          <rect x={14} y={30} width={36} height={8} rx={2} fill={HOT} />
          <circle cx={32} cy={18} r={4} fill="currentColor" className="dg-anim" style={move("dg-swipe")} />
        </>
      )}
    </svg>
  );
}

/** Space bar held while the cursor drags. */
export function SpaceDragIcon({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 48" width={size} height={(size * 48) / 64} aria-hidden>
      <rect x={4} y={26} width={56} height={14} rx={4} fill={HOT} opacity={0.85} />
      <g transform="translate(24,2)">
        <g className="dg-anim" style={{ animation: "dg-swipe 1.6s ease-in-out infinite" }}>
          {CURSOR}
        </g>
      </g>
    </svg>
  );
}

/** Double-click to fly to something. */
export function DoubleClickIcon({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 48" width={size} height={(size * 48) / 64} aria-hidden>
      <circle cx={30} cy={22} r={10} fill="none" stroke={HOT} strokeWidth={2} className="dg-anim" style={blink(".8s")} />
      <circle cx={30} cy={22} r={17} fill="none" stroke={HOT} strokeWidth={1.5} opacity={0.6} className="dg-anim" style={blink(".8s", ".2s")} />
      <g transform="translate(30,22)">{CURSOR}</g>
    </svg>
  );
}

/** A key, drawn small for icon slots (R, Delete). */
export function KeyIcon({ label, size = 44 }: { label: string; size?: number }) {
  const wide = label.length > 1;
  return (
    <svg viewBox="0 0 44 34" width={size} height={(size * 34) / 44} aria-hidden>
      <rect
        x={wide ? 4 : 10}
        y={5}
        width={wide ? 36 : 24}
        height={24}
        rx={5}
        fill="currentColor"
        fillOpacity={0.12}
        stroke="currentColor"
        strokeOpacity={0.3}
      />
      <text x={22} y={wide ? 21 : 22} textAnchor="middle" fontSize={wide ? 9 : 13} fontWeight={800} fill="currentColor" fontFamily={FIELD_FONT}>
        {label}
      </text>
    </svg>
  );
}

/** The Decorate navigator in miniature: pick a room, click the bed in the
 *  picture, and the shelf below shows only beds. Dark on purpose, like the
 *  navigator panel it copies. */
export function DemoNavigator() {
  return (
    <svg viewBox="0 0 240 150" aria-hidden style={{ width: "100%", height: "auto", display: "block", background: "#1e2025", borderRadius: 12 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={14 + i * 26} y={10} width={20} height={18} rx={5} fill={i === 2 ? "#34518c" : "#2b2d33"} />
      ))}
      <polygon points="14,112 150,112 176,96 40,96" fill="#2a2b30" />
      <rect x={30} y={70} width={46} height={18} rx={3} fill="#8d7c69" />
      <rect x={30} y={62} width={14} height={10} rx={2} fill="#d8d2c8" />
      <rect x={86} y={54} width={22} height={36} fill="#6b6457" />
      <rect x={118} y={48} width={30} height={18} fill="#222" stroke="#555" />
      <rect x={60} y={100} width={44} height={6} rx={3} fill="#a8906f" />
      <rect x={26} y={58} width={54} height={34} rx={6} fill="none" stroke="oklch(0.8 0.12 258)" strokeWidth={2} className="dg-anim" style={loop("dg-hl")} />
      <g className="dg-anim" style={loop("dg-hl")}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect
            key={i}
            x={10 + i * 32}
            y={122}
            width={28}
            height={22}
            rx={5}
            fill={i < 2 ? "#34518c" : "#2b2d33"}
            stroke={i < 2 ? "oklch(0.8 0.12 258)" : "none"}
          />
        ))}
        {/* Two beds on the shelf, drawn rather than emoji so they render the
            same on every OS. */}
        {[0, 1].map((i) => (
          <g key={i} transform={`translate(${16 + i * 32},128)`}>
            <rect x={0} y={4} width={16} height={6} rx={1.5} fill="#d8d2c8" />
            <rect x={0} y={1} width={5} height={4} rx={1} fill="#fff" />
          </g>
        ))}
      </g>
      <Cursor path="dg-curNav" />
    </svg>
  );
}
