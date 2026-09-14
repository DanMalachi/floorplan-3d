/**
 * Sketchfab search scan — collect candidates for Beds / Office chairs / Dining
 * tables (+ topping-up categories) by searching multiple query terms, filtered
 * server-side to licenses=cc0,by and downloadable=true, then de-duplicated by
 * uid. Writes raw candidate list (name, uid, license, tags, stats) to a JSON
 * file per category for manual/scripted style + license review before any
 * download happens.
 *
 * Auth: reads process.env.SKETCHFAB_API_TOKEN (never hardcode the token).
 *
 * Run: SKETCHFAB_API_TOKEN=... npx tsx scripts/sketchfab/search.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const TOKEN = process.env.SKETCHFAB_API_TOKEN;
if (!TOKEN) throw new Error("SKETCHFAB_API_TOKEN not set");

const OUT_DIR = path.resolve(
  "C:/Users/dandu/AppData/Local/Temp/claude/C--Users-dandu/12e01fd5-7c34-4516-89a9-c5630024de73/scratchpad/furn/sketchfab-search",
);
mkdirSync(OUT_DIR, { recursive: true });

interface Query {
  category: string; // our bucket name for filing
  terms: string[];
}

const QUERIES: Query[] = [
  {
    category: "beds",
    terms: [
      "modern bed",
      "platform bed",
      "bed frame",
      "queen bed",
      "king bed",
      "double bed",
      "bed with mattress",
      "scandinavian bed",
      "minimalist bed",
    ],
  },
  {
    category: "office_chairs",
    terms: [
      "office chair",
      "task chair",
      "ergonomic chair",
      "desk chair",
      "swivel chair",
      "mesh office chair",
      "executive chair",
    ],
  },
  {
    category: "dining_tables",
    terms: [
      "dining table",
      "modern dining table",
      "wood dining table",
      "kitchen table",
      "round dining table",
      "dining table set",
    ],
  },
  // topping-up categories (only reached if time/budget remains)
  { category: "sofas", terms: ["modern sofa", "scandinavian sofa"] },
  { category: "armchairs", terms: ["modern armchair", "lounge chair"] },
  { category: "dining_chairs", terms: ["modern dining chair"] },
  { category: "coffee_tables", terms: ["modern coffee table"] },
  { category: "storage", terms: ["modern cabinet", "sideboard"] },
  { category: "shelving", terms: ["modern bookshelf", "shelving unit"] },
];

async function searchOnce(q: string, cursor?: string): Promise<any> {
  const params = new URLSearchParams({
    type: "models",
    q,
    licenses: "cc0,by",
    downloadable: "true",
    count: "24",
  });
  if (cursor) params.set("cursor", cursor);
  const url = `https://api.sketchfab.com/v3/search?${params.toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Token ${TOKEN}` } });
  const status = res.status;
  const body = await res.json().catch(() => null);
  return { status, body };
}

async function main() {
  for (const { category, terms } of QUERIES) {
    const seen = new Map<string, any>();
    const httpLog: any[] = [];
    for (const term of terms) {
      // page up to 2 pages (48 results) per term
      let cursor: string | undefined;
      for (let page = 0; page < 2; page++) {
        const { status, body } = await searchOnce(term, cursor);
        httpLog.push({ term, page, status, resultCount: body?.results?.length ?? 0 });
        if (status !== 200 || !body?.results) break;
        for (const r of body.results) {
          if (!seen.has(r.uid)) {
            seen.set(r.uid, {
              uid: r.uid,
              name: r.name,
              license: r.license ? { slug: r.license.slug, label: r.license.label } : null,
              tags: (r.tags ?? []).map((t: any) => t.slug),
              categories: (r.categories ?? []).map((c: any) => c.name),
              faceCount: r.faceCount,
              vertexCount: r.vertexCount,
              viewCount: r.viewCount,
              likeCount: r.likeCount,
              isDownloadable: r.isDownloadable,
              viewerUrl: r.viewerUrl,
              thumbnail: r.thumbnails?.images?.[r.thumbnails.images.length - 1]?.url ?? null,
              matchedTerm: term,
            });
          }
        }
        const nextCursor = body.cursors?.next;
        if (!nextCursor) break;
        cursor = nextCursor;
      }
      await new Promise((r) => setTimeout(r, 150)); // be polite
    }
    const results = [...seen.values()];
    writeFileSync(path.join(OUT_DIR, `${category}.json`), JSON.stringify(results, null, 2));
    writeFileSync(path.join(OUT_DIR, `${category}.http.json`), JSON.stringify(httpLog, null, 2));
    console.log(`${category}: ${results.length} unique candidates from ${terms.length} terms`);
  }
}

main();
