// Building Knowledge Layer — free rule/graph classification pass.
//
// Features -> type, never geometry -> type. Every verdict carries structured
// Evidence with provenance (geometry facts, rule inferences, OCR labels) so it
// can be debugged, compared against the VLM, and recomputed at any time.
// Confidence here GATES the paid VLM pass: rooms the rules can't decide get
// escalated; rooms they can decide stay free.
//
// Classification is intentionally two-stage, like a human reads a house:
//   1. score each room independently from its features
//   2. reconcile the WHOLE house (one kitchen, one entry, master bedroom via
//      ensuite, leftover-room elimination)

import type { Evidence, Id, RoomSemantics, BuildingSemantics } from "../../schema/scene";
import type { RoomGraph, RoomGraphEntry } from "./semanticGraph";
import { functionForType } from "./roomTaxonomy";

/** Rooms at or above this confidence skip the VLM escalation. */
export const RULE_CONFIDENCE_GATE = 0.65;

export interface RuleClassification {
  rooms: Map<Id, RoomSemantics>;
  building: BuildingSemantics;
}

interface Scored {
  type: string;
  score: number;
  evidence: Evidence[];
}

const geo = (feature: string, value: string | number | boolean, weight: number): Evidence => ({
  feature,
  value,
  weight,
  source: "geometry",
});

/** Score every plausible type for one room. Weights are additive and capped at
 *  0.95 — certainty is reserved for OCR. */
function scoreRoom(e: RoomGraphEntry, ocrTokens: string[]): Scored[] {
  const f = e.features;
  const conn = e.doorConnections.length;
  const out: Scored[] = [];
  const add = (type: string, parts: Evidence[]) => {
    const score = Math.min(0.95, parts.reduce((s, p) => s + p.weight, 0));
    if (score > 0.15) out.push({ type, score, evidence: parts });
  };

  // OCR is the highest-precision cue when present: match label text to a type.
  const ocrType = matchOcrType(ocrTokens);
  if (ocrType) {
    out.push({
      type: ocrType.type,
      score: 0.95,
      evidence: [{ feature: "ocrLabel", value: ocrType.token, weight: 0.95, source: "ocr" }],
    });
  }

  // balcony / deck / terrace — bounded by a rail (a low, see-through barrier).
  // A rail is near-definitional for an outdoor space, so it carries strong
  // weight on its own; more rails and no windows reinforce it. (OCR/VLM can
  // still override — an interior mezzanine void is the rare false positive.)
  {
    const p: Evidence[] = [];
    if (f.railWallCount >= 1) p.push(geo("railWallCount", f.railWallCount, 0.6));
    if (f.railWallCount >= 2) p.push(geo("railWallCount", f.railWallCount, 0.1));
    if (f.windowCount === 0) p.push(geo("windowCount", 0, 0.1));
    if (f.railWallCount >= 1) add("balcony", p);
  }

  // closet — tiny, windowless, one door.
  {
    const p: Evidence[] = [];
    if (f.areaM2 < 3) p.push(geo("areaM2", round1(f.areaM2), 0.5));
    if (f.windowCount === 0) p.push(geo("windowCount", 0, 0.2));
    if (f.doorCount <= 1) p.push(geo("doorCount", f.doorCount, 0.2));
    if (f.areaM2 < 3) add("closet", p);
  }

  // bathroom — small, private (one door), few/no windows.
  {
    const p: Evidence[] = [];
    if (f.areaM2 >= 2 && f.areaM2 <= 9) p.push(geo("areaM2", round1(f.areaM2), 0.35));
    if (f.doorCount === 1) p.push(geo("doorCount", 1, 0.2));
    if (f.windowCount <= 1) p.push(geo("windowCount", f.windowCount, 0.15));
    if (f.hasPlumbing) p.push({ feature: "hasPlumbing", value: true, weight: 0.5, source: "geometry" });
    if (p.length >= 2) add("bathroom", p);
  }

  // garage — a vehicle-width door into a garage-SIZED room (12-60 m²; a huge
  // single loop with a wide door is a whole-house outline, not a garage).
  {
    const p: Evidence[] = [];
    if (e.maxDoorWidthM >= 2.2)
      p.push(geo("maxDoorWidthM", round1(e.maxDoorWidthM), 0.5));
    if (f.areaM2 >= 12 && f.areaM2 <= 60) p.push(geo("areaM2", round1(f.areaM2), 0.25));
    if (f.exteriorWallCount >= 2) p.push(geo("exteriorWallCount", f.exteriorWallCount, 0.1));
    if (e.maxDoorWidthM >= 2.2 && f.areaM2 <= 60) add("garage", p);
  }

  // entry — exterior door plus circulation into the house.
  {
    const p: Evidence[] = [];
    if (e.exteriorDoorCount >= 1) p.push(geo("exteriorDoorCount", e.exteriorDoorCount, 0.4));
    if (conn >= 2) p.push(geo("doorConnections", conn, 0.2));
    if (f.areaM2 < 10) p.push(geo("areaM2", round1(f.areaM2), 0.15));
    if (e.exteriorDoorCount >= 1) add("entry", p);
  }

  // hall — high connectivity, elongated, small.
  {
    const p: Evidence[] = [];
    if (conn >= 3) p.push(geo("doorConnections", conn, 0.45));
    if (f.aspectRatio >= 2) p.push(geo("aspectRatio", round1(f.aspectRatio), 0.2));
    if (f.areaM2 < 12) p.push(geo("areaM2", round1(f.areaM2), 0.15));
    if (conn >= 3) add("hall", p);
  }

  // living — claimed by size + connectivity; global pass enforces uniqueness.
  {
    const p: Evidence[] = [];
    if (conn >= 2) p.push(geo("doorConnections", conn, 0.2));
    if (f.windowCount >= 2) p.push(geo("windowCount", f.windowCount, 0.15));
    if (f.areaM2 >= 14) p.push(geo("areaM2", round1(f.areaM2), 0.25));
    if (f.areaM2 >= 14) add("living", p);
  }

  // bedroom — residential proportions, a closet, daylight, private door.
  {
    const p: Evidence[] = [];
    if (f.areaM2 >= 7 && f.areaM2 <= 25) p.push(geo("areaM2", round1(f.areaM2), 0.3));
    if (f.hasCloset) p.push(geo("hasCloset", true, 0.35));
    if (f.windowCount >= 1) p.push(geo("windowCount", f.windowCount, 0.15));
    if (f.doorCount === 1) p.push(geo("doorCount", 1, 0.15));
    if (f.areaM2 >= 7 && f.areaM2 <= 25) add("bedroom", p);
  }

  // kitchen / dining — geometry alone is weak evidence by design; these stay
  // low-confidence and either get resolved by the global pass or by the VLM.
  {
    const p: Evidence[] = [];
    if (f.areaM2 >= 5 && f.areaM2 <= 16) p.push(geo("areaM2", round1(f.areaM2), 0.18));
    if (f.windowCount >= 1) p.push(geo("windowCount", f.windowCount, 0.07));
    if (f.hasPlumbing) p.push({ feature: "hasPlumbing", value: true, weight: 0.4, source: "geometry" });
    if (p.length >= 1 && f.areaM2 >= 5 && f.areaM2 <= 16) add("kitchen", p);
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

const OCR_TYPE_MAP: [RegExp, string][] = [
  [/master\s*(bed)?/i, "master_bedroom"],
  [/bed\s*room|bedroom|\bbed\b|\bbr\b/i, "bedroom"],
  [/bath|\bwc\b|toilet|powder|ensuite|shower/i, "bathroom"],
  [/kitchen|\bkit\b/i, "kitchen"],
  [/living|family|lounge|great\s*room/i, "living"],
  [/dining|\bdin\b/i, "dining"],
  [/hall|corridor|passage|landing/i, "hall"],
  [/closet|wardrobe|\bwic\b|walk[\s-]*in/i, "closet"],
  [/office|study|den/i, "office"],
  [/laundry|utility|mud\s*room/i, "laundry"],
  [/garage|carport|parking/i, "garage"],
  [/entry|foyer|porch/i, "entry"],
  [/balcony|deck|patio|terrace/i, "balcony"],
];

function matchOcrType(tokens: string[]): { type: string; token: string } | null {
  for (const token of tokens) {
    for (const [re, type] of OCR_TYPE_MAP) {
      if (re.test(token)) return { type, token };
    }
  }
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Full free classification: per-room scoring, then house-level reconciliation.
 * `ocr` maps roomId -> text tokens found inside that room (vector PDFs only).
 */
export function classifyRoomsByRules(
  graph: RoomGraph,
  ocr?: Map<Id, string[]>,
): RuleClassification {
  // ---- stage 1: independent scoring ----
  const scored = new Map<Id, Scored[]>();
  for (const [id, entry] of graph) {
    scored.set(id, scoreRoom(entry, ocr?.get(id) ?? []));
  }

  const pick = new Map<Id, Scored>();
  for (const [id, list] of scored) {
    pick.set(id, list[0] ?? { type: "unknown", score: 0, evidence: [] });
  }

  // ---- stage 2: global consistency (the house, not the room) ----

  // A house has ~one of each of these. Keep the strongest claim; runners-up
  // fall back to their next-best type.
  for (const unique of ["kitchen", "living", "entry", "garage"]) {
    const claims = [...pick.entries()]
      .filter(([, s]) => s.type === unique)
      .sort((a, b) => b[1].score - a[1].score);
    for (const [id] of claims.slice(1)) {
      const next = (scored.get(id) ?? []).find((s) => s.type !== unique);
      pick.set(id, next ?? { type: "unknown", score: 0, evidence: [] });
    }
  }

  // Master bedroom: a bedroom with a private door to a bathroom (ensuite), or
  // failing that, the largest bedroom that has a closet.
  const bedrooms = [...pick.entries()].filter(([, s]) => s.type === "bedroom");
  let master: Id | null = null;
  for (const [id] of bedrooms) {
    const e = graph.get(id)!;
    const ensuite = e.doorConnections.some((l) => pick.get(l.room)?.type === "bathroom");
    if (ensuite) {
      master = id;
      pick.get(id)!.evidence.push({
        feature: "ensuiteBathroom",
        value: true,
        weight: 0.3,
        source: "rule",
      });
      break;
    }
  }
  if (!master && bedrooms.length >= 2) {
    const largest = bedrooms
      .filter(([id]) => graph.get(id)!.features.hasCloset)
      .sort((a, b) => graph.get(b[0])!.features.areaM2 - graph.get(a[0])!.features.areaM2)[0];
    if (largest) master = largest[0];
  }
  if (master) {
    const s = pick.get(master)!;
    pick.set(master, { ...s, type: "master_bedroom" });
  }

  // Elimination: with a kitchen and living identified but no dining, a single
  // remaining undecided room next to the kitchen is probably the dining room.
  const types = new Set([...pick.values()].map((s) => s.type));
  if (types.has("kitchen") && types.has("living") && !types.has("dining")) {
    const undecided = [...pick.entries()].filter(([, s]) => s.score < 0.4);
    if (undecided.length === 1) {
      const [id, s] = undecided[0];
      const kitchenAdj = graph
        .get(id)!
        .relationships.sharesWallWith.some((r) => pick.get(r)?.type === "kitchen");
      pick.set(id, {
        type: "dining",
        score: kitchenAdj ? 0.5 : 0.4,
        evidence: [
          ...s.evidence,
          { feature: "elimination", value: "only undecided room", weight: 0.3, source: "rule" },
          ...(kitchenAdj
            ? [{ feature: "adjacentKitchen", value: true, weight: 0.2, source: "rule" as const }]
            : []),
        ],
      });
    }
  }

  // ---- assemble RoomSemantics ----
  const rooms = new Map<Id, RoomSemantics>();
  for (const [id, entry] of graph) {
    const best = pick.get(id)!;
    const alts = (scored.get(id) ?? [])
      .filter((s) => s.type !== best.type && s.score >= 0.25)
      .slice(0, 3)
      .map((s) => s.type);
    // Confidence: the score, damped when the runner-up is close (ambiguity).
    const runner = (scored.get(id) ?? []).find((s) => s.type !== best.type);
    const margin = runner ? best.score - runner.score : best.score;
    const confidence =
      best.type === "unknown" ? 0 : Math.min(0.95, best.score * (margin < 0.1 ? 0.8 : 1));

    rooms.set(id, {
      type: best.type,
      alternatives: alts,
      function: functionForType(best.type),
      confidence,
      evidence: best.evidence,
      features: entry.features,
      relationships: entry.relationships,
      source: "rule",
    });
  }

  // ---- building-level verdict ----
  const roomCounts: Record<string, number> = {};
  for (const s of rooms.values()) roomCounts[s.type] = (roomCounts[s.type] ?? 0) + 1;
  const bedCount = (roomCounts["bedroom"] ?? 0) + (roomCounts["master_bedroom"] ?? 0);
  const confs = [...rooms.values()].map((s) => s.confidence);
  const building: BuildingSemantics = {
    archetype: bedCount > 0 ? `${bedCount}-bedroom home` : undefined,
    roomCounts,
    confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0,
    evidence: [
      {
        feature: "roomCounts",
        value: Object.entries(roomCounts)
          .map(([t, n]) => `${t}:${n}`)
          .join(" "),
        weight: 1,
        source: "rule",
      },
    ],
    source: "rule",
  };

  return { rooms, building };
}
