/**
 * The ingest manifest — `data/materials-ingest.manifest.json`. Deliberately
 * separate from `data/materials-floors.manifest.json`: that file is consumed
 * directly by the shipping product (`src/materials/registry.ts`) and merging
 * new classes into it is M3c's job ("first material set"), not M3b's. This
 * manifest is the ingest pipeline's own record — every asset that has been
 * through validation, what its encoder identity was, and what it measured —
 * independent of whether anything downstream reads it yet.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { IngestedMaterial } from "./types";

const MANIFEST_PATH = path.resolve("data/materials-ingest.manifest.json");

export function readManifest(manifestPath = MANIFEST_PATH): IngestedMaterial[] {
  if (!existsSync(manifestPath)) return [];
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function writeManifest(entries: IngestedMaterial[], manifestPath = MANIFEST_PATH): void {
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(entries, null, 2) + "\n");
}

/** Insert or replace by id — re-ingesting an asset updates its entry rather
 *  than duplicating it, the same idempotency `fetch-materials.ts` gives the
 *  floor pipeline by skipping already-unpacked materials. */
export function upsertEntry(entry: IngestedMaterial, manifestPath = MANIFEST_PATH): IngestedMaterial[] {
  const entries = readManifest(manifestPath).filter((e) => e.id !== entry.id);
  entries.push(entry);
  entries.sort((a, b) => a.id.localeCompare(b.id));
  writeManifest(entries, manifestPath);
  return entries;
}

export function findEntry(id: string, manifestPath = MANIFEST_PATH): IngestedMaterial | undefined {
  return readManifest(manifestPath).find((e) => e.id === id);
}

export { MANIFEST_PATH };
