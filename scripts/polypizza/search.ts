/**
 * Poly Pizza search scan — same purpose as scripts/sketchfab/search.ts, for
 * the poly.pizza aggregator API (https://api.poly.pizza/v1.1). Auth is a
 * static `X-Auth-Token: <key>` header (confirmed against the live API —
 * `x-api-key` and query-param variants all returned 401 "You need an API
 * key to do that dingus"; X-Auth-Token returned 200).
 *
 * Paginates each query term fully (`page` param; page size ~32, last page
 * short), dedupes by ID, records the per-item `Licence` field verbatim.
 *
 * Auth: reads process.env.POLYPIZZA_API_KEY (never hardcode the key).
 * Run: POLYPIZZA_API_KEY=... npx tsx scripts/polypizza/search.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const KEY = process.env.POLYPIZZA_API_KEY;
if (!KEY) throw new Error("POLYPIZZA_API_KEY not set");

const OUT_DIR = path.resolve(
  "C:/Users/dandu/AppData/Local/Temp/claude/C--Users-dandu/12e01fd5-7c34-4516-89a9-c5630024de73/scratchpad/furn/polypizza-search",
);
mkdirSync(OUT_DIR, { recursive: true });

interface Query {
  category: string;
  terms: string[];
}

const QUERIES: Query[] = [
  { category: "beds", terms: ["bed", "platform bed", "modern bed", "double bed", "queen bed", "bed frame", "king bed", "twin bed", "single bed", "bedroom bed"] },
  { category: "office_chairs", terms: ["office chair", "desk chair", "task chair", "ergonomic chair", "swivel chair"] },
  { category: "dining_tables", terms: ["dining table", "kitchen table", "modern table", "wood table"] },
  { category: "sofas", terms: ["sofa", "couch"] },
  { category: "armchairs", terms: ["armchair", "lounge chair"] },
  { category: "dining_chairs", terms: ["dining chair"] },
  { category: "coffee_tables", terms: ["coffee table", "side table"] },
  { category: "storage", terms: ["cabinet", "sideboard", "dresser"] },
  { category: "shelving", terms: ["bookshelf", "shelf", "shelving"] },
];

async function fetchPage(term: string, page: number): Promise<any> {
  const url = `https://api.poly.pizza/v1.1/search/${encodeURIComponent(term)}?limit=32&page=${page}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": KEY! } });
  const status = res.status;
  const body = await res.json().catch(() => null);
  return { status, body };
}

async function main() {
  for (const { category, terms } of QUERIES) {
    const seen = new Map<string, any>();
    const httpLog: any[] = [];
    for (const term of terms) {
      let page = 1;
      for (; page <= 6; page++) {
        const { status, body } = await fetchPage(term, page);
        httpLog.push({ term, page, status, total: body?.total, resultCount: body?.results?.length ?? 0 });
        if (status !== 200 || !body?.results?.length) break;
        for (const r of body.results) {
          if (!seen.has(r.ID)) {
            seen.set(r.ID, {
              id: r.ID,
              name: r.Title,
              licence: r.Licence,
              tags: r.Tags ?? [],
              category: r.Category,
              triCount: r["Tri Count"],
              thumbnail: r.Thumbnail,
              download: r.Download,
              attribution: r.Attribution,
              matchedTerm: term,
            });
          }
        }
        if (body.results.length < 32) break; // last page
        await new Promise((res2) => setTimeout(res2, 150));
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    const results = [...seen.values()];
    writeFileSync(path.join(OUT_DIR, `${category}.json`), JSON.stringify(results, null, 2));
    writeFileSync(path.join(OUT_DIR, `${category}.http.json`), JSON.stringify(httpLog, null, 2));
    console.log(`${category}: ${results.length} unique candidates from ${terms.length} terms`);
  }
}

main();
