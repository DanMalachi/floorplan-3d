import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_VLM_MODEL } from "@/lib/vlmClassify";

// ---------------------------------------------------------------------------
// Building Knowledge Layer — VLM reasoning pass (the paid escalation).
//
// The free rule classifier decides most rooms; whatever it can't decide with
// confidence gets escalated HERE with everything a human would use: the room's
// deterministic features + relationships, OCR tokens, an overview of the whole
// plan, and native-resolution crops of the ambiguous rooms. The model reasons
// like an architect over the WHOLE house at once (global consistency), but it
// only ever returns MEANING — type/function/confidence/evidence. Never
// coordinates. Iron rule: deterministic code owns geometry; the model owns
// meaning.
// ---------------------------------------------------------------------------

/** One room as presented to the model. Confident rooms are context ("locked");
 *  undecided rooms are the question. */
export interface RoomBrief {
  id: string;
  status: "confident" | "undecided";
  provisionalType: string; // rule verdict (or "unknown")
  alternatives: string[];
  confidence: number;
  ocr: string[]; // text tokens found inside the room (vector PDFs)
  features: Record<string, number | boolean | string>;
  adjacentRooms: string[]; // room ids sharing a wall
  doorConnections: string[]; // room ids reachable through a door
}

export interface RoomVerdict {
  id: string;
  type: string; // open vocabulary — "nursery" is as valid as "bedroom"
  function: string; // "sleeping" | "hygiene" | "circulation" | ... (open vocab)
  confidence: number; // 0..1
  evidence: { feature: string; weight: number }[];
  alternatives: string[];
}

export interface RoomReasonResult {
  rooms: RoomVerdict[];
  archetype: string; // house-level read, e.g. "3-bedroom single-family"
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    rooms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          function: { type: "string" },
          confidence: { type: "number" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                feature: { type: "string" },
                weight: { type: "number" },
              },
              required: ["feature", "weight"],
              additionalProperties: false,
            },
          },
          alternatives: { type: "array", items: { type: "string" } },
        },
        required: ["id", "type", "function", "confidence", "evidence", "alternatives"],
        additionalProperties: false,
      },
    },
    archetype: { type: "string" },
  },
  required: ["rooms", "archetype"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an architect reading a residential floor plan. You are given a structured description of every room in the house (areas in m², door/window counts, exterior walls, adjacency, door connections, any text labels found in the room) plus images: one overview of the whole plan and native-resolution crops of the rooms that need classification.

Rooms marked "confident" are already classified — treat their types as fixed context. Classify ONLY the rooms marked "undecided".

Reason over the WHOLE house, not each room in isolation: a house has roughly one kitchen and one entry; bathrooms cluster near plumbing; bedrooms cluster together; the room left over when kitchen/living/bedrooms are placed is often the dining room. Use the images for what structure alone cannot tell you: fixture symbols (toilet, tub, sink, stove, counters, beds, wardrobes), printed room labels, and drawing conventions.

For each undecided room return:
- "type": the best label. OPEN vocabulary — use precise labels when the plan shows them ("nursery", "walk-in closet", "mud room", "tatami room"), common ones otherwise (bedroom, master_bedroom, bathroom, kitchen, living, dining, hall, closet, office, laundry, garage, entry, balcony). Use "unknown" only when genuinely unreadable.
- "function": what the room is FOR — sleeping, hygiene, food_prep, gathering, dining, circulation, storage, work, utility, vehicle_storage, outdoor. Give a function even when the type is unusual or unknown; this is what downstream features consume.
- "confidence": 0..1, honest.
- "evidence": the concrete reasons, most decisive first, each with a 0..1 weight (e.g. {"feature":"toilet symbol visible in crop","weight":0.9}).
- "alternatives": ranked other plausible types (may be empty).

Also return "archetype": a one-line read of the whole house (e.g. "3-bedroom single-family home").

Never invent geometry, dimensions, or coordinates — the structured data is the geometric truth. If an image contradicts the structured data, trust the structured data for geometry and the image for symbols/labels.`;

export async function reasonRooms(args: {
  rooms: RoomBrief[];
  overviewBase64: string | null; // whole-plan PNG (downscaled), base64 no prefix
  crops: { roomId: string; imageBase64: string }[]; // per-undecided-room crops
  model?: string;
  apiKey?: string;
}): Promise<RoomReasonResult> {
  const model = args.model || process.env.ANTHROPIC_MODEL || DEFAULT_VLM_MODEL;
  const client = new Anthropic(args.apiKey ? { apiKey: args.apiKey } : {});

  const content: Anthropic.ContentBlockParam[] = [];
  if (args.overviewBase64) {
    content.push({ type: "text", text: "Whole-plan overview:" });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: args.overviewBase64 },
    });
  }
  for (const c of args.crops) {
    content.push({ type: "text", text: `Crop of room "${c.roomId}":` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: c.imageBase64 },
    });
  }
  content.push({
    type: "text",
    text: `House rooms (${args.rooms.length}):\n${JSON.stringify(args.rooms)}`,
  });

  // Same call shape as vlmClassify: streamed, json_schema output, Sonnet-5
  // thinking disabled (adaptive thinking cost lesson).
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    ...(model.includes("sonnet-5") ? { thinking: { type: "disabled" as const } } : {}),
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error("Model declined the request (stop_reason=refusal).");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`No text block in response (stop_reason=${response.stop_reason}).`);
  }
  const parsed = JSON.parse(text.text) as { rooms: RoomVerdict[]; archetype: string };
  return {
    rooms: parsed.rooms,
    archetype: parsed.archetype,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
