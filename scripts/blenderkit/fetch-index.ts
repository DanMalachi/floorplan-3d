/**
 * BlenderKit furniture pipeline, step 1 — build the raw asset index (offline).
 *
 * Pages the public search API for free CC0 interior models and records what it
 * finds into data/furniture-blenderkit.json. Nothing is downloaded here; the
 * search response already carries real-world dimensions, face counts and object
 * counts, so the expensive filtering decisions get made from metadata alone.
 *
 * The license restriction is deliberate and load-bearing — see lib.ts.
 *
 * Run:
 *   npx tsx scripts/blenderkit/fetch-index.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { API, USER_AGENT, ALLOWED_LICENSE, politeDelay, paramsToObject, num } from "./lib";
import type { BlenderKitIndexEntry } from "./index-schema";

const OUT = path.resolve("data/furniture-blenderkit.json");
const PAGE_SIZE = 100;

/** Interior-relevant subtrees. `interior` is the broad umbrella; the others are
 *  listed explicitly because BlenderKit's tree is inconsistent about whether a
 *  sofa lives under interior/furniture or at the top level. Duplicates are
 *  collapsed by assetBaseId. */
const SUBTREES = ["interior", "furniture"];

interface SearchResponse {
  count: number;
  next: string | null;
  results: Record<string, unknown>[];
}

function buildUrl(subtree: string, page: number): string {
  const query = [
    "asset_type:model",
    `category_subtree:${subtree}`,
    "is_free:true",
    `license:${ALLOWED_LICENSE}`,
  ].join("+");
  return `${API}/search/?query=${query}&page_size=${PAGE_SIZE}&page=${page}`;
}

function toEntry(r: Record<string, unknown>): BlenderKitIndexEntry | null {
  const license = String(r.license ?? "");
  // Defense in depth: the query already filters, but a server-side change to
  // query parsing must never silently pull a Royalty-Free asset into the catalog.
  if (license !== ALLOWED_LICENSE) return null;

  const p = paramsToObject(r.parameters as never);
  const files = (r.files ?? []) as { fileType: string; id: number }[];
  const gltf = files.find((f) => f.fileType === "gltf");
  const author = (r.author ?? {}) as { id?: number; firstName?: string; lastName?: string };

  return {
    assetBaseId: String(r.assetBaseId ?? ""),
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    displayName: String(r.displayName ?? r.name ?? ""),
    category: String(r.category ?? ""),
    tags: (r.tags ?? []) as string[],
    description: String(r.description ?? "").slice(0, 500),

    license,
    author: {
      id: author.id ?? null,
      name: [author.firstName, author.lastName].filter(Boolean).join(" ").trim(),
    },

    geometry: {
      dimensionX: num(p.dimensionX),
      dimensionY: num(p.dimensionY),
      dimensionZ: num(p.dimensionZ),
      boundBoxMinZ: num(p.boundBoxMinZ),
      boundBoxMaxZ: num(p.boundBoxMaxZ),
      faceCount: num(p.faceCountRender) ?? num(p.faceCount),
      objectCount: num(p.objectCount),
      textureResolutionMax: num(p.textureResolutionMax),
      textureCount: num(p.textureCount),
    },
    modelStyle: typeof p.modelStyle === "string" ? p.modelStyle : null,
    productionLevel: typeof p.productionLevel === "string" ? p.productionLevel : null,

    gltfFileId: gltf?.id ?? null,
    filesSize: num(r.filesSize as never),

    thumbnailUrl: (r.thumbnailMiddleUrl as string) ?? null,
    webUrl: `https://www.blenderkit.com/asset-gallery-detail/${r.assetBaseId}/`,

    ratingsAverage: num(r.ratingsAverage as never),
    ratingsCount: num(r.ratingsCount as never),
  };
}

async function fetchSubtree(subtree: string, byId: Map<string, BlenderKitIndexEntry>) {
  let page = 1;
  let total: number | null = null;
  let added = 0;
  let rejected = 0;

  for (;;) {
    const res = await fetch(buildUrl(subtree, page), { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`search ${subtree} p${page}: HTTP ${res.status}`);
    const data = (await res.json()) as SearchResponse;
    total ??= data.count;

    for (const r of data.results) {
      const entry = toEntry(r);
      if (!entry) {
        rejected++;
        continue;
      }
      if (!byId.has(entry.assetBaseId)) {
        byId.set(entry.assetBaseId, entry);
        added++;
      }
    }

    process.stdout.write(`\r[${subtree}] page ${page} · ${added} new · ${byId.size} unique total`);
    if (!data.next) break;
    page++;
    await politeDelay();
  }

  console.log(
    `\n[${subtree}] done — API reported ${total}, kept ${added} new` +
      (rejected ? `, rejected ${rejected} on license` : ""),
  );
}

async function main() {
  const byId = new Map<string, BlenderKitIndexEntry>();

  for (const subtree of SUBTREES) {
    await fetchSubtree(subtree, byId);
    await politeDelay();
  }

  const entries = [...byId.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(entries, null, 2));

  // Population summary — the filtering thresholds in audit.ts get set against
  // these distributions, not against a handful of hand-picked examples.
  const withGltf = entries.filter((e) => e.gltfFileId !== null).length;
  const realistic = entries.filter((e) => e.modelStyle === "realistic").length;
  const single = entries.filter((e) => (e.geometry.objectCount ?? 99) <= 1).length;
  const sized = entries.filter((e) => e.geometry.dimensionX !== null).length;
  const byCat = new Map<string, number>();
  for (const e of entries) byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);

  console.log(`\nWrote ${entries.length} CC0 entries → ${path.relative(process.cwd(), OUT)}`);
  console.log(`  with glTF export : ${withGltf}`);
  console.log(`  modelStyle=realistic: ${realistic}`);
  console.log(`  single-object    : ${single}`);
  console.log(`  has dimensions   : ${sized}`);
  console.log(
    `  categories       : ${[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(", ")}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
