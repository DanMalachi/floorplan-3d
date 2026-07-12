// -----------------------------------------------------------------------------
// Pure-TS DXF parser (no DOM). A DXF file is a flat stream of (group-code, value)
// pairs, two physical lines each. We read the ENTITIES section (plus BLOCKS so we
// can flatten INSERTs) and the few HEADER vars we need for real-world scale.
//
// This is deliberately a *focused* parser: floorplans are overwhelmingly LINEs,
// LWPOLYLINEs, ARCs and text, with doors/windows often as block INSERTs. We
// cover exactly that subset. It is DOM-free on purpose so bench.ts (Node) and
// the browser importer share one code path.
// -----------------------------------------------------------------------------

export interface DxfSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layer: string;
}

export interface DxfArc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  chord: number; // straight-line distance between endpoints (model units)
  layer: string;
}

export interface DxfText {
  x: number;
  y: number;
  text: string;
  layer: string;
}

export interface DxfBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ParsedDxf {
  segments: DxfSegment[];
  arcs: DxfArc[];
  texts: DxfText[];
  bounds: DxfBounds | null;
  /** $INSUNITS value (0 = unitless/unknown). */
  insunits: number;
  /** Meters per model unit, or null when units are unknown. */
  metersPerUnit: number | null;
  stats: { lines: number; polylines: number; arcs: number; circles: number; texts: number; inserts: number };
}

// ---- low-level: pair stream --------------------------------------------------

interface Pair {
  code: number;
  value: string;
}

function tokenize(text: string): Pair[] {
  // Split on any newline flavour. DXF is code/value on alternating lines.
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) {
      // Misaligned stream (rare). Resync by scanning forward one line.
      i -= 1;
      continue;
    }
    pairs.push({ code, value: lines[i + 1] });
  }
  return pairs;
}

// $INSUNITS -> meters per unit. 0/unknown handled by caller.
const UNIT_METERS: Record<number, number> = {
  1: 0.0254, // inches
  2: 0.3048, // feet
  4: 0.001, // millimeters
  5: 0.01, // centimeters
  6: 1, // meters
  8: 0.0000254, // microinches — unlikely but cheap to support
  9: 0.0000000254,
  10: 0.9144, // yards
  13: 1e-6, // microns
  14: 0.1, // decimeters
  15: 10, // decameters
  16: 100, // hectometers
  17: 1000, // kilometers
};

// ---- entity record -----------------------------------------------------------
// A "record" is a code-0 marker plus every non-zero pair until the next code-0.
// Order is preserved so polyline vertex pairs (repeated 10/20) stay sequential.
interface Record_ {
  type: string;
  pairs: Pair[];
}

function num(r: Record_, code: number, fallback = 0): number {
  for (const p of r.pairs) if (p.code === code) return parseFloat(p.value);
  return fallback;
}
function str(r: Record_, code: number, fallback = ""): string {
  for (const p of r.pairs) if (p.code === code) return p.value.trim();
  return fallback;
}

// ---- geometry helpers --------------------------------------------------------

// 2D affine transform as a matrix [a,b,c,d,e,f]:
//   x' = a*x + c*y + e,   y' = b*x + d*y + f
// A full matrix (not separate scale/rotation fields) is essential because real
// INSERTs combine mirror (negative scale), rotation and a block base offset —
// only matrix composition gets that right, including nested block references.
type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// m ∘ n — apply n first, then m.
function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const translate = (tx: number, ty: number): Mat => [1, 0, 0, 1, tx, ty];
const scale = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
const rotate = (rad: number): Mat => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
};

function arcEndpoints(
  cx: number,
  cy: number,
  r: number,
  aStartDeg: number,
  aEndDeg: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const a0 = (aStartDeg * Math.PI) / 180;
  const a1 = (aEndDeg * Math.PI) / 180;
  return {
    x0: cx + r * Math.cos(a0),
    y0: cy + r * Math.sin(a0),
    x1: cx + r * Math.cos(a1),
    y1: cy + r * Math.sin(a1),
  };
}

// Flatten an arc into short chords — used so arcs contribute to bounds and to the
// rendered background even though we also keep them as first-class DxfArcs.
function tessellateArc(
  cx: number,
  cy: number,
  r: number,
  aStartDeg: number,
  aEndDeg: number,
  layer: string,
  xf: Mat,
): DxfSegment[] {
  let sweep = aEndDeg - aStartDeg;
  while (sweep <= 0) sweep += 360; // DXF arcs go CCW from start to end
  const steps = Math.max(2, Math.ceil(sweep / 12));
  const out: DxfSegment[] = [];
  let prev: [number, number] | null = null;
  for (let i = 0; i <= steps; i++) {
    const a = ((aStartDeg + (sweep * i) / steps) * Math.PI) / 180;
    const p = apply(xf, cx + r * Math.cos(a), cy + r * Math.sin(a));
    if (prev) out.push({ x0: prev[0], y0: prev[1], x1: p[0], y1: p[1], layer });
    prev = p;
  }
  return out;
}

// -----------------------------------------------------------------------------

export function parseDxf(text: string): ParsedDxf {
  const pairs = tokenize(text);

  // --- split into sections -----------------------------------------------------
  let insunits = 0;
  const blockRecords = new Map<string, Record_[]>(); // block name -> entity records
  const blockBase = new Map<string, [number, number]>();
  const entityRecords: Record_[] = [];

  let section = "";
  let i = 0;
  // Header scan for $INSUNITS: pairs are 9/"$INSUNITS" then 70/<value>.
  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === 0 && p.value.trim() === "SECTION") {
      section = pairs[i + 1]?.code === 2 ? pairs[i + 1].value.trim() : "";
      i += 2;
      continue;
    }
    if (p.code === 0 && p.value.trim() === "ENDSEC") {
      section = "";
      i += 1;
      continue;
    }
    if (section === "HEADER") {
      if (p.code === 9 && p.value.trim() === "$INSUNITS") {
        insunits = parseInt(pairs[i + 1]?.value ?? "0", 10) || 0;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (section === "BLOCKS") {
      i = readBlocks(pairs, i, blockRecords, blockBase);
      continue;
    }
    if (section === "ENTITIES") {
      i = readEntities(pairs, i, entityRecords);
      continue;
    }
    i += 1;
  }

  // --- flatten records into geometry ------------------------------------------
  const segments: DxfSegment[] = [];
  const arcs: DxfArc[] = [];
  const texts: DxfText[] = [];
  const stats = { lines: 0, polylines: 0, arcs: 0, circles: 0, texts: 0, inserts: 0 };

  const emit = (records: Record_[], xf: Mat, depth: number): void => {
    for (let k = 0; k < records.length; k++) {
      const r = records[k];
      switch (r.type) {
        case "LINE": {
          const [x0, y0] = apply(xf, num(r, 10), num(r, 20));
          const [x1, y1] = apply(xf, num(r, 11), num(r, 21));
          segments.push({ x0, y0, x1, y1, layer: str(r, 8, "0") });
          stats.lines++;
          break;
        }
        case "LWPOLYLINE": {
          stats.polylines++;
          const pts = lwPolyPoints(r);
          const closed = (num(r, 70) & 1) === 1;
          pushPolyline(segments, pts, closed, str(r, 8, "0"), xf);
          break;
        }
        case "POLYLINE": {
          // Old-style POLYLINE: vertices are the VERTEX records that follow,
          // gathered by readEntities into r.pairs as synthetic 10/20 groups.
          stats.polylines++;
          const pts = polyVertexPoints(r);
          const closed = (num(r, 70) & 1) === 1;
          pushPolyline(segments, pts, closed, str(r, 8, "0"), xf);
          break;
        }
        case "ARC": {
          stats.arcs++;
          const cx = num(r, 10);
          const cy = num(r, 20);
          const rad = num(r, 40);
          const a0 = num(r, 50);
          const a1 = num(r, 51);
          const layer = str(r, 8, "0");
          const e = arcEndpoints(cx, cy, rad, a0, a1);
          const [px0, py0] = apply(xf, e.x0, e.y0);
          const [px1, py1] = apply(xf, e.x1, e.y1);
          arcs.push({
            x0: px0,
            y0: py0,
            x1: px1,
            y1: py1,
            chord: Math.hypot(px1 - px0, py1 - py0),
            layer,
          });
          // Also tessellate so the arc shows in the background + bounds.
          for (const s of tessellateArc(cx, cy, rad, a0, a1, layer, xf)) segments.push(s);
          break;
        }
        case "CIRCLE": {
          stats.circles++;
          const cx = num(r, 10);
          const cy = num(r, 20);
          const rad = num(r, 40);
          for (const s of tessellateArc(cx, cy, rad, 0, 360, str(r, 8, "0"), xf)) segments.push(s);
          break;
        }
        case "TEXT":
        case "MTEXT":
        // ATTRIB/ATTDEF: block attributes. In real CAD plans the room labels and
        // dimensions are frequently attributes, not free TEXT — so treat them the
        // same. They stream in world coords after their INSERT.
        case "ATTRIB":
        case "ATTDEF": {
          const raw = str(r, 1) || str(r, 3);
          const t = cleanMText(raw);
          if (t) {
            const [x, y] = apply(xf, num(r, 10), num(r, 20));
            texts.push({ x, y, text: t, layer: str(r, 8, "0") });
            stats.texts++;
          }
          break;
        }
        case "INSERT": {
          stats.inserts++;
          if (depth > 8) break; // guard against block-reference cycles
          const name = str(r, 2);
          const block = blockRecords.get(name);
          if (!block) break;
          const rot = (num(r, 50, 0) * Math.PI) / 180;
          const [bx, by] = blockBase.get(name) ?? [0, 0];
          // Standard DXF INSERT: world = insert · R(θ) · S(sx,sy) · (local − base).
          // Built as a matrix so mirror (negative scale) + rotation + base offset
          // compose correctly, then folded into the parent transform.
          let m = translate(num(r, 10), num(r, 20));
          m = mul(m, rotate(rot));
          m = mul(m, scale(num(r, 41, 1), num(r, 42, 1)));
          m = mul(m, translate(-bx, -by));
          emit(block, mul(xf, m), depth + 1);
          break;
        }
      }
    }
  };

  // Skip paper-space entities (group 67 = 1). Paper space holds the printed
  // LAYOUT — title blocks and, crucially, scaled/mirrored detail views of the
  // plan re-inserted via blocks. Flattening those conflates the real model-space
  // plan with half-scale ghosts of itself. We want the model-space plan only.
  const modelSpace = entityRecords.filter((r) => num(r, 67, 0) !== 1);
  emit(modelSpace, IDENTITY, 0);

  // --- bounds -----------------------------------------------------------------
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const s of segments) {
    grow(s.x0, s.y0);
    grow(s.x1, s.y1);
  }
  for (const a of arcs) {
    grow(a.x0, a.y0);
    grow(a.x1, a.y1);
  }
  const bounds =
    minX === Infinity ? null : { minX, minY, maxX, maxY };

  return {
    segments,
    arcs,
    texts,
    bounds,
    insunits,
    metersPerUnit: UNIT_METERS[insunits] ?? null,
    stats,
  };
}

// ---- section readers ---------------------------------------------------------

// Read one BLOCK…ENDBLK. Returns the index just past ENDBLK.
function readBlocks(
  pairs: Pair[],
  start: number,
  out: Map<string, Record_[]>,
  bases: Map<string, [number, number]>,
): number {
  let i = start;
  const p = pairs[i];
  if (!(p.code === 0 && p.value.trim() === "BLOCK")) return i + 1;
  // Header pairs of the BLOCK up to the first entity code-0.
  i += 1;
  let name = "";
  let bx = 0,
    by = 0;
  while (i < pairs.length && pairs[i].code !== 0) {
    if (pairs[i].code === 2) name = pairs[i].value.trim();
    if (pairs[i].code === 10) bx = parseFloat(pairs[i].value);
    if (pairs[i].code === 20) by = parseFloat(pairs[i].value);
    i += 1;
  }
  const records: Record_[] = [];
  while (i < pairs.length) {
    const t = pairs[i].value.trim();
    if (pairs[i].code === 0 && (t === "ENDBLK" || t === "ENDSEC")) {
      if (t === "ENDBLK") i += 1;
      break;
    }
    i = readEntities(pairs, i, records);
  }
  if (name) {
    out.set(name, records);
    bases.set(name, [bx, by]);
  }
  return i;
}

// Read one entity record starting at a code-0 marker. Old-style POLYLINE also
// swallows its trailing VERTEX/SEQEND run, hoisting vertex coords into synthetic
// pairs so the emitter can treat it uniformly.
function readEntities(pairs: Pair[], start: number, out: Record_[]): number {
  let i = start;
  const type = pairs[i].value.trim();
  i += 1;
  const rec: Record_ = { type, pairs: [] };
  while (i < pairs.length && pairs[i].code !== 0) {
    rec.pairs.push(pairs[i]);
    i += 1;
  }

  if (type === "POLYLINE") {
    // Gather VERTEX records until SEQEND, flattening 10/20 into rec.pairs with a
    // sentinel so polyVertexPoints can recover ordered vertices.
    while (i < pairs.length) {
      const t = pairs[i].value.trim();
      if (pairs[i].code === 0 && t === "VERTEX") {
        i += 1;
        let vx = 0,
          vy = 0,
          seen = false;
        while (i < pairs.length && pairs[i].code !== 0) {
          if (pairs[i].code === 10) {
            vx = parseFloat(pairs[i].value);
            seen = true;
          }
          if (pairs[i].code === 20) vy = parseFloat(pairs[i].value);
          i += 1;
        }
        if (seen) {
          rec.pairs.push({ code: 1010, value: String(vx) });
          rec.pairs.push({ code: 1020, value: String(vy) });
        }
      } else if (pairs[i].code === 0 && t === "SEQEND") {
        i += 1;
        break;
      } else if (pairs[i].code === 0) {
        break; // malformed; stop
      } else {
        i += 1;
      }
    }
  }

  out.push(rec);
  return i;
}

// ---- vertex extractors -------------------------------------------------------

function lwPolyPoints(r: Record_): [number, number][] {
  // LWPOLYLINE vertices are sequential 10/20 pairs. Walk in order.
  const pts: [number, number][] = [];
  let px: number | null = null;
  for (const p of r.pairs) {
    if (p.code === 10) px = parseFloat(p.value);
    else if (p.code === 20 && px !== null) {
      pts.push([px, parseFloat(p.value)]);
      px = null;
    }
  }
  return pts;
}

function polyVertexPoints(r: Record_): [number, number][] {
  const pts: [number, number][] = [];
  let px: number | null = null;
  for (const p of r.pairs) {
    if (p.code === 1010) px = parseFloat(p.value);
    else if (p.code === 1020 && px !== null) {
      pts.push([px, parseFloat(p.value)]);
      px = null;
    }
  }
  return pts;
}

function pushPolyline(
  out: DxfSegment[],
  pts: [number, number][],
  closed: boolean,
  layer: string,
  xf: Mat,
): void {
  if (pts.length < 2) return;
  const tp = pts.map(([x, y]) => apply(xf, x, y));
  for (let k = 0; k + 1 < tp.length; k++) {
    out.push({ x0: tp[k][0], y0: tp[k][1], x1: tp[k + 1][0], y1: tp[k + 1][1], layer });
  }
  if (closed) {
    const a = tp[tp.length - 1];
    const b = tp[0];
    out.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], layer });
  }
}

// MTEXT carries inline formatting codes (\P newlines, \f font, {} groups). Strip
// the common ones so room labels come through as plain text.
function cleanMText(s: string): string {
  if (!s) return "";
  return s
    .replace(/\\P/g, " ")
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\[\\{}]/g, "")
    .trim();
}
