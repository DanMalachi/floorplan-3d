import { z } from "zod";
import { reasonRooms, type RoomBrief } from "@/lib/rooms/roomReason";
import { requireUser } from "@/lib/api/auth";
import { readJson, byteLimitFromEnv, MB } from "@/lib/api/body";
import { apiError, unavailable } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { imageSchema, modelSchema, modelOverride } from "@/lib/api/schemas";

// Room naming. This calls Claude with a whole floorplan and up to a few dozen
// crops, on Dan's ANTHROPIC_API_KEY, with maxDuration 300 — it was open to the
// internet, which made it a free LLM endpoint anyone could bill to him. It now
// requires a signed-in account, is rate limited per account, and refuses a body
// bigger than the images it legitimately needs.
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BODY = byteLimitFromEnv("CLASSIFY_MAX_BODY_BYTES", 12 * MB);

const roomBriefSchema = z.looseObject({
  id: z.string().max(200),
  status: z.enum(["confident", "undecided"]),
  provisionalType: z.string().max(120),
  alternatives: z.array(z.string().max(120)).max(40),
  confidence: z.number(),
  ocr: z.array(z.string().max(400)).max(200),
  features: z.record(z.string().max(120), z.union([z.number(), z.boolean(), z.string().max(400)])),
  adjacentRooms: z.array(z.string().max(200)).max(100),
  doorConnections: z.array(z.string().max(200)).max(100),
});

// Every bound here is also a cost bound: rooms and crops are what decide how many
// tokens and images the model is asked to read.
const bodySchema = z.object({
  rooms: z.array(roomBriefSchema).min(1).max(200),
  overview: imageSchema.nullish(),
  crops: z
    .array(z.object({ roomId: z.string().max(200), image: imageSchema }))
    .max(60)
    .optional()
    .default([]),
  model: modelSchema.optional(),
});

const stripPrefix = (s: string) => (s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s);

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limited = await enforceRateLimit("classify-rooms", rateLimitIdentity(req, auth.user.id), {
    limit: 20,
    windowSec: 60 * 60,
    kind: "cost",
  });
  if (limited) return limited;

  const parsed = await readJson(req, bodySchema, MAX_BODY);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return unavailable(
      "room naming is not configured",
      "ANTHROPIC_API_KEY is not set on this deployment",
    );
  }

  try {
    const result = await reasonRooms({
      rooms: body.rooms as RoomBrief[],
      overviewBase64: body.overview ? stripPrefix(body.overview) : null,
      crops: body.crops.map((c) => ({ roomId: c.roomId, imageBase64: stripPrefix(c.image) })),
      model: modelOverride(body.model),
    });
    return Response.json(result);
  } catch (e) {
    // The upstream message can carry account and key details — log it, don't ship it.
    console.error("[classify-rooms] failed", e);
    return apiError(502, "room naming failed");
  }
}
