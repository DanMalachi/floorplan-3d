// Shared zod pieces. Anything more than one route validates lives here so the
// rules can't drift apart between copies.

import { z } from "zod";

export const shareRoleSchema = z.enum(["view", "decorate", "build"]);

/** `floorplan-<share id>` — matches isValidRoom() in ./rooms. */
export const roomSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^floorplan-[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/, "not a valid room id");

/** A signed grant is `<base64url payload>.<base64url signature>`. */
export const grantSchema = z
  .string()
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "malformed grant");

/**
 * A model override names a Claude model and nothing else. Without this a caller
 * could point the proxy at any model string it liked — including a far more
 * expensive one — on Dan's key. Honoured only when ANTHROPIC_ALLOW_MODEL_OVERRIDE
 * is set; see modelOverride() below.
 */
export const modelSchema = z
  .string()
  .max(64)
  .regex(/^claude-[a-z0-9.-]+$/, "not a Claude model id");

/** The caller's requested model, or undefined to use the server's configured default. */
export const modelOverride = (requested: string | undefined): string | undefined =>
  process.env.ANTHROPIC_ALLOW_MODEL_OVERRIDE === "true" ? requested : undefined;

/**
 * An inline image: a data URL or bare base64. Length is bounded here as well as by
 * the body cap, so one enormous image inside an otherwise small body is still
 * refused.
 */
export const imageSchema = z.string().min(1).max(12 * 1024 * 1024);

export const dataUrlImageSchema = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/, "expected a png/jpeg/webp data URL")
  .max(24 * 1024 * 1024);

/**
 * What an abuse/takedown report can name as its target. Kept in sync by hand
 * with the `target_kind` check constraint in
 * supabase/migrations/0003_abuse_reports.sql — change both together. Exported
 * (not inlined in the report route) because the public report page
 * (src/app/report/page.tsx) needs the same list to render its form options.
 */
export const abuseTargetKindSchema = z.enum(["project", "share_link", "live_room", "asset", "other"]);

/** Mirrors the `reason` check constraint in the same migration. */
export const abuseReasonSchema = z.enum([
  "copyright",
  "privacy",
  "illegal_content",
  "harassment",
  "malware",
  "spam",
  "other",
]);
