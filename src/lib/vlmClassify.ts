import Anthropic from "@anthropic-ai/sdk";
import type { Candidate, CandidateClass } from "@/trace2d/candidates";

// ---------------------------------------------------------------------------
// Phase 2.5 / M3 — VLM-assisted semantic classification. One Claude call per
// plan: annotated page render + candidate list in, per-candidate label +
// confidence out, plus elements the candidate generator missed entirely.
// The VLM NEVER outputs geometry we use as coordinates — labels only; `missed`
// boxes are advisory "look here" hints, not model geometry.
// ---------------------------------------------------------------------------

export const DEFAULT_VLM_MODEL = "claude-opus-4-8";

export const VLM_CLASSES = [
  "wall",
  "door",
  "window",
  "dimension",
  "furniture",
  "stairs",
  "reject",
] as const;

export interface VlmLabel {
  id: number;
  label: CandidateClass;
  confidence: "high" | "medium" | "low";
}

export interface VlmMissed {
  px: number[]; // approx [x0,y0,x1,y1] — advisory only, never used as geometry
  label: CandidateClass;
  note: string;
}

export interface VlmResult {
  labels: VlmLabel[];
  missed: VlmMissed[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          label: { type: "string", enum: [...VLM_CLASSES] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["id", "label", "confidence"],
        additionalProperties: false,
      },
    },
    missed: {
      type: "array",
      items: {
        type: "object",
        properties: {
          px: { type: "array", items: { type: "integer" } },
          label: { type: "string", enum: ["wall", "door", "window"] },
          note: { type: "string" },
        },
        required: ["px", "label", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["labels", "missed"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an expert architectural-drawing analyst classifying elements of a 2D CAD floor plan.

You receive:
1. An IMAGE of the plan with numbered candidate lines drawn over it. Each candidate is a straight colored line with its numeric id printed on a small white chip near its midpoint. The overlay color encodes a preliminary machine guess (red=wall, green=door, cyan=window, magenta=stairs, orange=dimension, gray=reject) — treat it as a weak prior only; it is frequently wrong, which is why you are being asked.
2. A JSON list of the same candidates with geometric features measured deterministically from the CAD file (position in image pixels, y grows downward; length; the gap between the paired parallel lines as "thicknessPx"; angle; connectivity; and flags explaining what tripped the machine filters).

Classify EVERY candidate id into exactly one class:
- wall: a real architectural wall (load-bearing or partition). Walls bound rooms, connect to other walls at corners/T-junctions, and have consistent thickness. Interior walls are typically 7-15 cm, exterior 15-40 cm when a scale is given.
- door: an actual door in a wall, evidenced by a DOOR SYMBOL. Symbols to accept: a quarter-circle swing arc and/or a straight leaf line (hinged door); two thin overlapping offset panels in the wall line (sliding/pocket door — distinguish from a window by the staggered/overlapping panels, vs a window's aligned parallel panes); a zigzag/accordion of short segments (folding/bifold door); a wide paneled rectangle across a garage-width opening (garage door). A plain gap in a wall WITHOUT any door symbol is an open passage — label it reject, not door. The short wall stubs (jambs) beside a doorway are wall, not door. Stair-area gaps are not doors.
- window: a window in a wall. Strong cues: 3-4 closely-spaced parallel lines embedded in a wall run, usually on the building's exterior perimeter.
- dimension: measurement annotation — long thin lines OUTSIDE or alongside the building, with arrowheads, ticks, or numbers/text nearby; extension lines from the building edge.
- furniture: fixtures/furniture drawn as outlines inside rooms (cabinets, counters, sanitary ware).
- stairs: stair treads — a ladder of evenly-spaced parallel lines in a stairwell area.
- reject: drawing noise, hatching, text underlines, frames — anything that is none of the above.

Use gestalt context, not just per-line features: walls form closed room perimeters; a "wall" floating outside the building outline is likely a dimension line; evenly repeated parallels are treads or hatching; candidates over text/numbers are annotation. The room-name text in the image tells you where the building interior is.

Some candidates carry "group": N — that candidate stands in for N near-identical parallel lines collapsed into one (a stack of treads, hatching, or window panes). Your label applies to the whole stack.

Also report REAL walls/doors/windows clearly visible in the image that NO candidate covers, in "missed" (approximate pixel box + one-line note). Only include elements you are confident about; leave "missed" empty if coverage is complete.

Return JSON matching the required schema: one entry in "labels" for every candidate id you were given, plus "missed".`;

export async function classifyCandidates(args: {
  imageBase64: string; // composite render+overlay PNG, base64 (no data: prefix)
  candidates: Candidate[];
  metersPerPixel: number | null;
  model?: string;
  apiKey?: string;
}): Promise<VlmResult> {
  const model = args.model || process.env.ANTHROPIC_MODEL || DEFAULT_VLM_MODEL;
  const client = new Anthropic(args.apiKey ? { apiKey: args.apiKey } : {});

  // Compact per-candidate features — id, guess and geometry the VLM reasons over.
  const lean = args.candidates.map((c) => ({
    id: c.id,
    kind: c.kind,
    guess: c.guess,
    px: c.px,
    len: c.lengthPx,
    th: c.thicknessPx,
    ang: c.angleDeg,
    ...(c.meters ? { m: c.meters } : {}),
    ...(c.flags.length ? { flags: c.flags } : {}),
    ...(c.groupCount ? { group: c.groupCount } : {}),
  }));

  const scaleNote = args.metersPerPixel
    ? `Scale: 1 px = ${args.metersPerPixel.toFixed(5)} m ("m" on candidates = real meters).`
    : "No scale calibration available — reason from pixel sizes and context.";

  // Streamed: labels for hundreds of candidates can exceed what a non-streaming
  // request may return before HTTP timeouts kick in.
  const stream = client.messages.stream({
    model,
    max_tokens: 64000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: args.imageBase64 },
          },
          {
            type: "text",
            text: `${scaleNote}\n\nCandidates (${lean.length}):\n${JSON.stringify(lean)}`,
          },
        ],
      },
    ],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error("Model declined the request (stop_reason=refusal).");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`No text block in response (stop_reason=${response.stop_reason}).`);
  }
  const parsed = JSON.parse(text.text) as { labels: VlmLabel[]; missed: VlmMissed[] };
  return {
    labels: parsed.labels,
    missed: parsed.missed,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
