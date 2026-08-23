import { z } from "zod";
import { classifyCandidates } from "@legacy/lib/rooms/vlmClassify";
import type { Candidate } from "@legacy/trace2d/candidates";
import { requireUser } from "@/lib/api/auth";
import { readJson, byteLimitFromEnv, MB } from "@/lib/api/body";
import { apiError, unavailable } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { imageSchema, modelSchema, modelOverride } from "@/lib/api/schemas";

// The wall/opening classifier from the (paused) auto-extraction pipeline. Same
// exposure as /api/classify-rooms: an unauthenticated proxy to Claude on Dan's key
// with maxDuration 300. Auth, per-account rate limit and a body cap now apply.
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BODY = byteLimitFromEnv("CLASSIFY_MAX_BODY_BYTES", 12 * MB);

const candidateSchema = z.looseObject({
  id: z.number(),
  kind: z.enum(["wall", "opening"]),
  px: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

const bodySchema = z.object({
  image: imageSchema,
  candidates: z.array(candidateSchema).min(1).max(2000),
  metersPerPixel: z.number().positive().nullish(),
  planHint: z.string().max(2000).nullish(),
  model: modelSchema.optional(),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limited = await enforceRateLimit("classify", rateLimitIdentity(req, auth.user.id), {
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
      "classification is not configured",
      "ANTHROPIC_API_KEY is not set on this deployment",
    );
  }

  const imageBase64 = body.image.startsWith("data:")
    ? body.image.slice(body.image.indexOf(",") + 1)
    : body.image;

  try {
    const result = await classifyCandidates({
      imageBase64,
      candidates: body.candidates as unknown as Candidate[],
      metersPerPixel: body.metersPerPixel ?? null,
      planHint: body.planHint ?? null,
      model: modelOverride(body.model),
    });
    return Response.json(result);
  } catch (e) {
    console.error("[classify] failed", e);
    return apiError(502, "classification failed");
  }
}
