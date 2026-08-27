"use client";

import type { CSSProperties } from "react";
import { readGpuInfo, shortRendererLabel } from "./gpuInfo";
import { usePerfState, type PerfTrendPoint } from "./perfStore";
import { usePerfEnabled } from "./usePerfEnabled";

/**
 * The DOM half of the Phase 0 HUD (`docs/PERFORMANCE.md` §3, Phase 0).
 *
 * A SIBLING of `<Canvas>`, not a child: this is ordinary DOM, and putting it
 * inside the Canvas would hand it to R3F's reconciler, which would try to
 * `extend()` a `div` into the three.js scene graph and throw.
 *
 * It re-renders at the sampler's 4 Hz publish rate and never faster. The panel
 * is `pointer-events: none` throughout — a measuring instrument that can
 * intercept a click on the thing being measured is a bug generator, and every
 * value here is read-only anyway.
 */

const OK = "#56d364";
const WARN = "#e3b341";
const BAD = "#f85149";
const TEXT = "#e6edf3";
const DIM = "#8b949e";

/** The §5 exit bar. p95 above this is a dropped frame at 60 Hz. */
const FRAME_BUDGET_MS = 16.7;

const panelStyle: CSSProperties = {
  position: "fixed",
  right: 12,
  bottom: 12,
  zIndex: 9999,
  pointerEvents: "none",
  userSelect: "none",
  width: 232,
  padding: "9px 11px 10px",
  borderRadius: 8,
  // Semi-opaque near-black with a light hairline: legible over both a bright
  // daylight render and a night scene without needing to know which is behind
  // it. The blur is what keeps small text readable over high-frequency detail
  // like a patterned rug or foliage.
  background: "rgba(9, 11, 14, 0.78)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
  color: TEXT,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 10.5,
  lineHeight: 1.45,
  // Every number in this panel changes 4x a second. Without tabular figures the
  // columns jitter horizontally on each update and the eye cannot track a trend
  // — which is the one thing this panel exists to show.
  fontVariantNumeric: "tabular-nums",
};

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  whiteSpace: "nowrap",
};

const labelStyle: CSSProperties = { color: DIM };

const ruleStyle: CSSProperties = {
  margin: "6px 0 4px",
  borderTop: "1px solid rgba(255,255,255,0.09)",
  paddingTop: 3,
  color: DIM,
  fontSize: 9,
  letterSpacing: 0.6,
  textTransform: "uppercase",
};

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

/** 1_240_000 -> "1.24M". Draw calls and triangles span four orders of magnitude
 *  across this app's modes; full digits would wrap the panel. */
function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * A resource count with its change across the visible trend window.
 *
 * The delta is the actual instrument. An absolute count of 214 textures means
 * nothing on its own; "214, +37 over the last 30 s while all I did was drag one
 * sofa" is the §2.4-shaped finding. Rising is amber rather than red because a
 * rise is legitimate whenever new furniture or a new floor material has just
 * loaded — it is a prompt to look, not a verdict.
 */
function ResourceRow({ label, value, delta }: { label: string; value: number; delta: number }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span>
        <span>{compact(value)}</span>
        <span style={{ color: delta > 0 ? WARN : DIM, marginLeft: 6 }}>
          {delta === 0 ? "flat" : signed(delta)}
        </span>
      </span>
    </div>
  );
}

/**
 * Autoscaled sparkline of texture count over the trend window.
 *
 * Autoscaled, which is a deliberate trade and worth stating: the SHAPE shows
 * direction and shows it even for a rise of two textures, but it says nothing
 * about magnitude, because the y-axis is refitted to min..max every publish. The
 * caption underneath carries the magnitude. A genuinely flat series draws as a
 * flat mid-line rather than as noise amplified to full height.
 */
function Sparkline({ values }: { values: number[] }) {
  const width = 210;
  const height = 26;

  let path = "";
  if (values.length >= 2) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min;
    const step = width / (values.length - 1);
    const points: string[] = [];
    for (let i = 0; i < values.length; i++) {
      const x = i * step;
      const y = span === 0 ? height / 2 : height - 1 - ((values[i] - min) / span) * (height - 2);
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    path = points.join(" ");
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", margin: "3px 0 1px" }}
      aria-hidden
    >
      <rect x={0} y={0} width={width} height={height} fill="rgba(255,255,255,0.04)" rx={3} />
      {path ? (
        <polyline points={path} fill="none" stroke={OK} strokeWidth={1.25} strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

function frameColor(p95: number): string {
  if (p95 <= FRAME_BUDGET_MS) return OK;
  if (p95 <= FRAME_BUDGET_MS * 2) return WARN;
  return BAD;
}

function delta(trend: readonly PerfTrendPoint[], pick: (p: PerfTrendPoint) => number): number {
  if (trend.length < 2) return 0;
  return pick(trend[trend.length - 1]) - pick(trend[0]);
}

export function PerfHud() {
  const enabled = usePerfEnabled();
  const state = usePerfState();

  if (!enabled) return null;

  if (!state) {
    return (
      <div style={panelStyle}>
        <div style={{ color: DIM }}>perf — waiting for first frame</div>
      </div>
    );
  }

  const { sample, trend } = state;
  // Safe to call during render: `readGpuInfo` is memoised at module level and
  // `PerfRig` has already warmed it from the app's own context by the time any
  // sample exists. It never opens a context of its own on this path.
  const gpu = readGpuInfo();

  const textureSeries = trend.map((p) => p.textures);
  const textureDelta = delta(trend, (p) => p.textures);
  const windowSeconds = Math.round(trend.length / 4);

  return (
    <div style={panelStyle}>
      <div style={{ ...rowStyle, marginBottom: 2 }}>
        <span style={{ color: TEXT, letterSpacing: 0.5 }}>PERF</span>
        <span style={{ color: DIM }}>#{sample.seq}</span>
      </div>

      <Row
        label="frame p50/p95"
        value={`${sample.frameMsP50.toFixed(1)} / ${sample.frameMsP95.toFixed(1)} ms`}
        color={frameColor(sample.frameMsP95)}
      />
      <Row label="fps" value={sample.fps.toFixed(0)} />
      {/* CPU submit cost, not GPU time — see usePerfSampler.ts. A small js
          number next to a large frame number is the GPU-bound signature. */}
      <Row
        label="js p50/p95"
        value={`${sample.jsMsP50.toFixed(1)} / ${sample.jsMsP95.toFixed(1)} ms`}
      />

      <div style={ruleStyle}>per frame</div>
      {/* The §2.1/§2.2 counter. `renders` is gl.render() INVOCATIONS, so a
          number far above 1 is the composer chain plus any pass that re-renders
          the scene — and every one of those re-runs the shadow maps. */}
      <Row label="gl.render calls" value={String(sample.rendersPerFrame)} />
      <Row label="draw calls" value={compact(sample.drawCalls)} />
      <Row label="triangles" value={compact(sample.triangles)} />
      {sample.lines > 0 ? <Row label="lines" value={compact(sample.lines)} /> : null}
      {sample.points > 0 ? <Row label="points" value={compact(sample.points)} /> : null}
      <Row
        label="shadow maps"
        value={sample.shadowAutoUpdate ? "every frame" : "on demand"}
        color={sample.shadowAutoUpdate ? WARN : OK}
      />

      <div style={ruleStyle}>resident ({windowSeconds}s window)</div>
      <ResourceRow label="textures" value={sample.textures} delta={textureDelta} />
      <ResourceRow
        label="geometries"
        value={sample.geometries}
        delta={delta(trend, (p) => p.geometries)}
      />
      {/* Program count is the material-clone tell. Shader programs are cached by
          a parameter-derived key and refcounted; a material dropped without
          `.dispose()` never releases its reference, so a clone loop that varies
          any key-bearing flag ratchets this up and it never comes back down. */}
      <ResourceRow
        label="programs"
        value={sample.programs}
        delta={delta(trend, (p) => p.programs)}
      />

      <Sparkline values={textureSeries} />
      <div style={{ ...rowStyle, color: DIM, fontSize: 9.5 }}>
        <span>textures over time</span>
        <span>
          {textureSeries.length > 0 ? textureSeries[0] : 0} →{" "}
          {textureSeries.length > 0 ? textureSeries[textureSeries.length - 1] : 0}
        </span>
      </div>

      <div style={ruleStyle}>memory</div>
      {/* Estimated, and labelled "est" for that reason: it counts textures
          reachable from the scene graph at RGBA8, and cannot see render targets
          or anything the renderer holds that the scene no longer references. */}
      <Row
        label="scene textures est"
        value={sample.textureMb === null ? "—" : `${sample.textureMb.toFixed(0)} MB`}
      />
      <Row
        label="js heap"
        value={sample.heapMb === null ? "n/a (not Chromium)" : `${sample.heapMb.toFixed(0)} MB`}
      />

      <div style={ruleStyle}>device</div>
      <div style={{ color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {shortRendererLabel(gpu.renderer)}
      </div>
      <Row
        label="class"
        value={gpu.deviceClass + (gpu.unmasked ? "" : " (masked)")}
        color={gpu.unmasked ? undefined : WARN}
      />
      <Row
        label="dpr"
        value={`${sample.dpr.toFixed(2)} of ${gpu.devicePixelRatio.toFixed(2)}`}
      />
      <Row
        label="buffer"
        value={`${Math.round(sample.drawingBufferWidth)}x${Math.round(sample.drawingBufferHeight)}`}
      />
      <Row
        label="megapixels"
        value={(
          (sample.drawingBufferWidth * sample.drawingBufferHeight) /
          1e6
        ).toFixed(2)}
      />
      {/* Granted, not requested — the Phase 1 #3/#4 levers are only verifiable
          from the attributes the context actually got. */}
      <Row
        label="ctx"
        value={
          gpu.contextAttributes
            ? [
                `aa ${gpu.contextAttributes.antialias ? "on" : "off"}`,
                `alpha ${gpu.contextAttributes.alpha ? "on" : "off"}`,
                `pdb ${gpu.contextAttributes.preserveDrawingBuffer ? "on" : "off"}`,
              ].join(" ")
            : "—"
        }
      />
      <Row label="cores" value={gpu.hardwareConcurrency === null ? "—" : String(gpu.hardwareConcurrency)} />
      <Row
        label="max texture"
        value={gpu.maxTextureSize === null ? "—" : String(gpu.maxTextureSize)}
      />
    </div>
  );
}
