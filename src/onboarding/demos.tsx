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
@media (prefers-reduced-motion: reduce){
  .dg-anim,.dg-ring{animation:none!important}
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
