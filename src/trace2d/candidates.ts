import type { ImportSegment, ImportArc } from "@/store/useSceneStore";
import { extractWalls, DEFAULT_PARAMS, type ExtractParams, type Centerline } from "./extractWalls";
import { detectOpenings, DEFAULT_DETECT, type DetectParams } from "./detectOpenings";

// ---------------------------------------------------------------------------
// Phase 2.5 candidate generation. The existing heuristics run in high-recall
// mode (keep + annotate instead of discard) and everything is normalized into
// one flat candidate list. The heuristic's own verdict is carried as `guess`;
// the VLM makes the final semantic call. Coordinates are image-render px —
// the same space as the page PNG, so candidates can be drawn onto it.
// ---------------------------------------------------------------------------

export type CandidateClass = "wall" | "door" | "window" | "dimension" | "furniture" | "stairs" | "reject";

export interface Candidate {
  id: number; // sequential — doubles as the label on the annotated overlay
  kind: "wall" | "opening";
  guess: CandidateClass; // the heuristic's verdict
  keptByHeuristic: boolean; // would today's strict pipeline surface this?
  px: [number, number, number, number]; // x0,y0,x1,y1 (ints, render px)
  lengthPx: number;
  thicknessPx: number;
  angleDeg: number; // 0..180, 0 = horizontal
  meters?: { length: number; thickness: number };
  neighbors?: { parallelCount: number; groupSize: number };
  flags: string[];
  groupCount?: number; // this candidate stands in for N collapsed similar lines
}

export interface CandidateSet {
  candidates: Candidate[];
  stats: {
    total: number;
    rawTotal: number; // before dense-plan compression
    keptByHeuristic: number;
    byGuess: Record<string, number>;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Derive the heuristic's best guess for a wall candidate from its rejection
 * metadata. Mirrors what each strict filter "means" when it fires.
 */
function wallGuess(c: Centerline, hatchMaxNeighbors: number): CandidateClass {
  const m = c.meta!;
  if (m.kept) return "wall";
  if (m.pane) return "window"; // glass/frame pair inside a wall band
  if (m.hatchNeighbors >= hatchMaxNeighbors) return "stairs"; // hatch/tread stack
  if (m.groupSize >= 3) return "stairs"; // close-parallel stack
  if (m.isolated) return "dimension"; // floats free of the wall network
  if (!m.thicknessOk) return "reject"; // off-band pair — could be anything
  if (m.groupSize === 2 && !m.longestInGroup) return "reject"; // duplicate of a kept wall
  return "reject";
}

/**
 * Run wall extraction + opening detection in candidate (high-recall) mode and
 * flatten into the candidate list the VLM classifies.
 */
export function generateCandidates(
  segs: ImportSegment[],
  arcs: ImportArc[],
  metersPerPixel: number | null,
  opts?: {
    extractionTargets?: number[];
    extract?: Partial<ExtractParams>;
    detect?: Partial<DetectParams>;
    maxCandidates?: number; // dense-plan budget (default 600)
  },
): CandidateSet {
  const extractParams: ExtractParams = {
    ...DEFAULT_PARAMS,
    thicknessTargets: opts?.extractionTargets ?? [],
    minWallSepPx: metersPerPixel ? 0.3 / metersPerPixel : 0,
    ...opts?.extract,
    mode: "candidates",
  };
  const r = extractWalls(segs, extractParams);

  // Openings detected along the walls the strict pipeline would keep (running
  // them along stair/dim candidates would only produce junk), with rejected
  // openings kept + flagged.
  const keptWalls = r.centerlines.filter((c) => c.meta?.kept);
  const det = detectOpenings(segs, keptWalls, arcs, metersPerPixel, {
    ...DEFAULT_DETECT,
    ...opts?.detect,
    keepRejected: true,
  });

  const candidates: Candidate[] = [];
  let id = 0;

  for (const c of r.centerlines) {
    const m = c.meta!;
    const len = Math.hypot(c.x1 - c.x0, c.y1 - c.y0);
    const angle = ((Math.atan2(c.y1 - c.y0, c.x1 - c.x0) * 180) / Math.PI + 180) % 180;
    const flags: string[] = [];
    if (m.pane) flags.push("paneLike");
    if (m.hatchNeighbors >= extractParams.hatchMaxNeighbors) flags.push("hatchStack");
    if (m.groupSize >= 3) flags.push("closeParallelGroup");
    if (m.isolated) flags.push("isolated");
    if (!m.thicknessOk) flags.push("thicknessOffBand");
    candidates.push({
      id: id++,
      kind: "wall",
      guess: wallGuess(c, extractParams.hatchMaxNeighbors),
      keptByHeuristic: m.kept,
      px: [Math.round(c.x0), Math.round(c.y0), Math.round(c.x1), Math.round(c.y1)],
      lengthPx: Math.round(len),
      thicknessPx: r1(c.thickness),
      angleDeg: Math.round(angle),
      ...(metersPerPixel
        ? {
            meters: {
              length: r1(len * metersPerPixel),
              thickness: Math.round(c.thickness * metersPerPixel * 100) / 100,
            },
          }
        : {}),
      neighbors: { parallelCount: m.hatchNeighbors, groupSize: m.groupSize },
      flags,
    });
  }

  for (const o of det.openings) {
    const len = Math.hypot(o.x1 - o.x0, o.y1 - o.y0);
    const angle = ((Math.atan2(o.y1 - o.y0, o.x1 - o.x0) * 180) / Math.PI + 180) % 180;
    const flags = o.flags ?? [];
    // Openings the strict filters would have dropped carry a reject-reason flag.
    const rejectedFlags = ["inStairRegion", "interior", "dupOfArc"];
    const kept = !flags.some((f) => rejectedFlags.includes(f));
    candidates.push({
      id: id++,
      kind: "opening",
      guess: o.type,
      keptByHeuristic: kept,
      px: [Math.round(o.x0), Math.round(o.y0), Math.round(o.x1), Math.round(o.y1)],
      lengthPx: Math.round(len),
      thicknessPx: r1(o.thickness),
      angleDeg: Math.round(angle),
      ...(metersPerPixel
        ? {
            meters: {
              length: r1(len * metersPerPixel),
              thickness: Math.round(o.thickness * metersPerPixel * 100) / 100,
            },
          }
        : {}),
      flags,
    });
  }

  const compacted = compactCandidates(candidates, opts?.maxCandidates ?? 600);

  const byGuess: Record<string, number> = {};
  for (const c of compacted) byGuess[c.guess] = (byGuess[c.guess] ?? 0) + 1;
  return {
    candidates: compacted,
    stats: {
      total: compacted.length,
      rawTotal: candidates.length,
      keptByHeuristic: compacted.filter((c) => c.keptByHeuristic).length,
      byGuess,
    },
  };
}

// ---------------------------------------------------------------------------
// Dense-plan compression. Hatching, tile grids, stair stacks and window-pane
// stacks explode into hundreds of near-identical parallel candidates that
// share one fate. Collapse each cluster of similar non-kept lines into its
// longest member (carrying `groupCount`), then, if still over budget, drop the
// shortest lowest-value leftovers. Kept-by-heuristic and opening candidates
// are never dropped.
// ---------------------------------------------------------------------------

const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};

function compactCandidates(candidates: Candidate[], maxCandidates: number): Candidate[] {
  // 1. Collapse clusters among non-kept wall-kind candidates of the same guess.
  const collapsible = candidates.filter((c) => c.kind === "wall" && !c.keptByHeuristic);
  const rest = candidates.filter((c) => !(c.kind === "wall" && !c.keptByHeuristic));

  const n = collapsible.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const mid = (c: Candidate) => [(c.px[0] + c.px[2]) / 2, (c.px[1] + c.px[3]) / 2] as const;
  const RADIUS = 35; // midpoints closer than this may merge (a stack, not neighbors)
  for (let i = 0; i < n; i++) {
    const [mxi, myi] = mid(collapsible[i]);
    for (let j = i + 1; j < n; j++) {
      if (collapsible[i].guess !== collapsible[j].guess) continue;
      if (angleDiff(collapsible[i].angleDeg, collapsible[j].angleDeg) > 8) continue;
      const [mxj, myj] = mid(collapsible[j]);
      if (Math.hypot(mxi - mxj, myi - myj) > RADIUS) continue;
      parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Candidate[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(collapsible[i]);
  }
  const collapsed: Candidate[] = [];
  for (const g of groups.values()) {
    const rep = g.reduce((a, b) => (b.lengthPx > a.lengthPx ? b : a));
    collapsed.push(g.length > 1 ? { ...rep, groupCount: g.length } : rep);
  }

  let out = [...rest, ...collapsed];

  // 2. Hard cap: drop the shortest droppable candidates until under budget.
  if (out.length > maxCandidates) {
    const droppable = (c: Candidate) => c.kind === "wall" && !c.keptByHeuristic;
    const sacrifices = out
      .filter(droppable)
      .sort((a, b) => a.lengthPx * (a.groupCount ?? 1) - b.lengthPx * (b.groupCount ?? 1));
    const toDrop = new Set<number>();
    for (const c of sacrifices) {
      if (out.length - toDrop.size <= maxCandidates) break;
      toDrop.add(c.id);
    }
    out = out.filter((c) => !toDrop.has(c.id));
  }

  // Re-number so overlay chips and VLM ids stay small and dense.
  out.sort((a, b) => a.id - b.id);
  return out.map((c, i) => ({ ...c, id: i }));
}
