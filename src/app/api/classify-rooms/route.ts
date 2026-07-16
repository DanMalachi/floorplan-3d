import { reasonRooms, type RoomBrief } from "@/lib/rooms/roomReason";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ClassifyRoomsRequest {
  rooms: RoomBrief[];
  overview?: string | null; // data URL or bare base64 whole-plan PNG
  crops?: { roomId: string; image: string }[]; // data URL or bare base64 each
  model?: string;
}

const stripPrefix = (s: string) =>
  s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ClassifyRoomsRequest;
    if (!Array.isArray(body.rooms) || body.rooms.length === 0) {
      return Response.json({ error: "rooms are required" }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY is not set — add it to .env.local and restart the dev server." },
        { status: 500 },
      );
    }

    const result = await reasonRooms({
      rooms: body.rooms,
      overviewBase64: body.overview ? stripPrefix(body.overview) : null,
      crops: (body.crops ?? []).map((c) => ({
        roomId: c.roomId,
        imageBase64: stripPrefix(c.image),
      })),
      model: body.model,
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
