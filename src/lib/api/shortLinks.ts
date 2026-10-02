// Short share links — `done.design/s#<code>` standing in for `/v/<id>#g=<grant>`.
//
// The table (supabase/migrations/0009_share_links.sql) stores sha256(code) and
// the grant's claims, never the code and never the grant; see that file for
// why. This module is the one place that turns a grant into a code and back, so
// the two routes (/api/share/short, /api/share/resolve) cannot disagree on the
// alphabet, the length, or the hashing.

import crypto from "node:crypto";
import { z } from "zod";
import { resignGrant, type GrantPayload } from "@/collab/grant.server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { logError } from "./log";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** 62^12 ≈ 3.2e21 (~71 bits). The code IS the capability, so it has to be
 *  unguessable on its own; the resolve route's rate limit is a second fence,
 *  not the first. */
export const CODE_LENGTH = 12;

export const shortCodeSchema = z
  .string()
  .length(CODE_LENGTH)
  .regex(/^[A-Za-z0-9]+$/, "not a valid link code");

/** A uniformly random code. Rejection sampling: 256 is not a multiple of 62,
 *  so a plain `byte % 62` would favour the first 8 characters. */
export function generateCode(): string {
  const limit = 256 - (256 % ALPHABET.length); // 248
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const b of crypto.randomBytes(CODE_LENGTH * 2)) {
      if (b >= limit) continue;
      out += ALPHABET[b % ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

export const hashCode = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

type Claims = GrantPayload & { iat: number; exp: number };

/** Store a code for these claims. Returns the code, or null if the database
 *  would not take it (the caller falls back to the long link). Also clears
 *  expired rows — this is the table's only cleanup, see the migration. */
export async function storeShortLink(claims: Claims, now = Date.now()): Promise<string | null> {
  const admin = getAdminSupabase();
  // A collision at 71 bits is not a real event; one retry is belt and braces.
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCode();
    const { error } = await admin.from("share_links").insert({
      code_hash: hashCode(code),
      room_id: claims.room,
      role: claims.role,
      iat_ms: claims.iat,
      exp_ms: claims.exp,
    });
    if (!error) {
      const sweep = await admin.from("share_links").delete().lt("exp_ms", now);
      if (sweep.error) logError("share/short", sweep.error);
      return code;
    }
    if (error.code !== "23505") {
      logError("share/short", error);
      return null;
    }
  }
  return null;
}

export type Resolved = { ok: true; room: string; grant: string } | { ok: false; reason: "missing" | "expired" | "unavailable" };

/** Look a code up and re-sign the grant it stands for. */
export async function resolveShortLink(code: string, now = Date.now()): Promise<Resolved> {
  const { data, error } = await getAdminSupabase()
    .from("share_links")
    .select("room_id, role, iat_ms, exp_ms")
    .eq("code_hash", hashCode(code))
    .maybeSingle();
  if (error) {
    logError("share/resolve", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "missing" };
  const row = data as { room_id: string; role: GrantPayload["role"]; iat_ms: number | string; exp_ms: number | string };
  // bigint columns can arrive as strings through PostgREST.
  const iat = Number(row.iat_ms);
  const exp = Number(row.exp_ms);
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) return { ok: false, reason: "missing" };
  if (exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, room: row.room_id, grant: resignGrant({ room: row.room_id, role: row.role, iat, exp }) };
}
