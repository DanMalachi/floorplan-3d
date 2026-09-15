/**
 * Dan's visual review verdicts (dev scene `/dev/furniture`), recorded in
 * data/furniture-review.decisions.json. Every catalog builder consults this
 * before writing, so a rebuild can never bring back a model Dan rejected by eye
 * (broken textures, wrong vibe, duplicate, ...) that the metadata and geometry
 * gates would happily pass again.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const FILE = path.resolve("data/furniture-review.decisions.json");

type Decision = { status: "approved" | "rejected"; note?: string; at: string; name: string };

const decisions: Record<string, Decision> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};

/** Rejection reason for a full catalog assetId (e.g. "sketchfab:<uid>"), or null. */
export function reviewRejection(assetId: string): string | null {
  const d = decisions[assetId];
  if (d?.status !== "rejected") return null;
  return `visual review (${d.at.slice(0, 10)}): rejected${d.note?.trim() ? ` — ${d.note.trim()}` : ""}`;
}
