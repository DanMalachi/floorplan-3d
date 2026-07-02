import { classifyCandidates } from "@/lib/vlmClassify";
import type { Candidate } from "@/trace2d/candidates";

export const runtime = "nodejs";
export const maxDuration = 300; // one VLM call over a full plan can take minutes

interface ClassifyRequest {
  image: string; // data URL or bare base64 of the composite overlay PNG
  candidates: Candidate[];
  metersPerPixel: number | null;
  model?: string; // on-the-fly override; defaults to claude-opus-4-8
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ClassifyRequest;
    if (!body.image || !Array.isArray(body.candidates) || body.candidates.length === 0) {
      return Response.json({ error: "image and candidates are required" }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY is not set — add it to .env.local and restart the dev server." },
        { status: 500 },
      );
    }
    const imageBase64 = body.image.startsWith("data:")
      ? body.image.slice(body.image.indexOf(",") + 1)
      : body.image;

    const result = await classifyCandidates({
      imageBase64,
      candidates: body.candidates,
      metersPerPixel: body.metersPerPixel ?? null,
      model: body.model,
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
