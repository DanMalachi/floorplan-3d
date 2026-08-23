// Reading request bodies without letting a caller decide how much memory we
// allocate. Two gates, because either one alone is bypassable:
//
//   1. content-length — rejects the honest oversized upload before a single byte
//      is read. A caller can lie about it or omit it entirely (chunked), so:
//   2. a counting read loop — stops pulling from the stream the moment the cap is
//      passed, so a lying or chunked caller still can't grow our heap.
//
// Everything then goes through a zod schema; no route parses a raw body itself.

import type { ZodType } from "zod";
import { badRequest, payloadTooLarge } from "./http";

export const KB = 1024;
export const MB = 1024 * KB;

/** Reads an env var as a byte count, falling back when unset or unparseable. */
export function byteLimitFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

class TooLarge extends Error {}

/** Declared size, or null when the caller didn't declare one. */
function declaredLength(req: Request): number | null {
  const raw = req.headers.get("content-length");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Read the whole body as text, refusing anything over `maxBytes`. Throws TooLarge,
 * which the wrappers below turn into a 413.
 */
async function readCappedText(req: Request, maxBytes: number): Promise<string> {
  const declared = declaredLength(req);
  if (declared !== null && declared > maxBytes) throw new TooLarge();

  const body = req.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop the producer instead of draining the rest into memory.
        await reader.cancel().catch(() => {});
        throw new TooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Size-capped read + schema validation. The single entry point for JSON bodies:
 * a route that calls this cannot forget either gate.
 */
export async function readJson<T>(
  req: Request,
  schema: ZodType<T>,
  maxBytes: number,
): Promise<Parsed<T>> {
  let text: string;
  try {
    text = await readCappedText(req, maxBytes);
  } catch (e) {
    if (e instanceof TooLarge) {
      return { ok: false, response: payloadTooLarge("request too large", `limit ${maxBytes} bytes`) };
    }
    return { ok: false, response: badRequest("could not read request body") };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, response: badRequest("body must be JSON") };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? first.path.join(".") : "body";
    return { ok: false, response: badRequest("invalid request", `${where}: ${first?.message ?? "invalid"}`) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Size-capped multipart read. formData() has to buffer, so the content-length gate
 * is the real protection here — we refuse an undeclared multipart body outright
 * rather than let an unbounded one through the one hole we can't stream past.
 */
export async function readFormData(req: Request, maxBytes: number): Promise<Parsed<FormData>> {
  const declared = declaredLength(req);
  if (declared === null) {
    return { ok: false, response: badRequest("content-length is required for uploads") };
  }
  if (declared > maxBytes) {
    return { ok: false, response: payloadTooLarge("upload too large", `limit ${maxBytes} bytes`) };
  }
  try {
    return { ok: true, data: await req.formData() };
  } catch {
    return { ok: false, response: badRequest("body must be multipart/form-data") };
  }
}

export interface FileRules {
  maxBytes: number;
  /** Accepted filename extensions, lowercase, without the dot. */
  extensions: string[];
  /** Accepted MIME types. Browsers lie/omit, so an empty type passes on extension. */
  mimeTypes: string[];
}

/** Validate an uploaded File against size, extension and (when present) MIME type. */
export function checkFile(value: FormDataEntryValue | null, rules: FileRules): Parsed<File> {
  if (!(value instanceof File)) {
    return { ok: false, response: badRequest("no file uploaded") };
  }
  if (value.size === 0) {
    return { ok: false, response: badRequest("uploaded file is empty") };
  }
  if (value.size > rules.maxBytes) {
    return {
      ok: false,
      response: payloadTooLarge("upload too large", `limit ${rules.maxBytes} bytes`),
    };
  }
  const ext = value.name.toLowerCase().split(".").pop() ?? "";
  if (!rules.extensions.includes(ext)) {
    return {
      ok: false,
      response: badRequest("unsupported file type", `expected one of: ${rules.extensions.join(", ")}`),
    };
  }
  const mime = (value.type || "").toLowerCase().split(";")[0].trim();
  if (mime && rules.mimeTypes.length && !rules.mimeTypes.includes(mime)) {
    return {
      ok: false,
      response: badRequest("unsupported content type", `got ${mime}`),
    };
  }
  return { ok: true, data: value };
}
