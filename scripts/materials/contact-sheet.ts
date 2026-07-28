/**
 * Material pipeline — build a labelled contact sheet of candidate materials.
 *
 * Curation is a visual judgement. Tags get you a shortlist ("parquet",
 * "herringbone", "hexagon") but they cannot tell you whether a wood floor reads
 * as warm oak or muddy orange, and picking blind from tag strings is how you end
 * up with sixteen near-identical brown floors. This renders the candidates as
 * one grid image so the choice is made by looking.
 *
 * Previews come from ambientCG's thumbnail CDN at a predictable path, so no
 * per-asset API call is needed.
 *
 * Run:
 *   npx tsx scripts/materials/contact-sheet.ts <outfile.png> <assetId...>
 *   npx tsx scripts/materials/contact-sheet.ts sheet.png --category WoodFloor --sized --limit 16
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { USER_AGENT, sleep } from "./lib";
import type { MaterialIndexEntry } from "./fetch-index";
import { readFileSync } from "node:fs";

const INDEX = path.resolve("data/materials-floors.json");
const THUMB = (id: string) =>
  `https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/256-PNG/${id}.png`;

const CELL = 256;
const LABEL_H = 30;
const COLS = 4;

async function fetchThumb(id: string): Promise<Buffer | null> {
  try {
    const res = await fetch(THUMB(id), { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Label strip drawn as SVG so the sheet is self-describing when reviewed. */
function labelSvg(text: string, sub: string): Buffer {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
  return Buffer.from(
    `<svg width="${CELL}" height="${LABEL_H}">
       <rect width="100%" height="100%" fill="#15171a"/>
       <text x="6" y="13" font-family="monospace" font-size="12" fill="#e8eaed">${esc(text)}</text>
       <text x="6" y="25" font-family="monospace" font-size="10" fill="#9aa0a8">${esc(sub)}</text>
     </svg>`,
  );
}

export async function buildSheet(
  ids: { id: string; label: string; sub: string }[],
  outFile: string,
): Promise<number> {
  const cells: { input: Buffer; top: number; left: number }[] = [];
  let ok = 0;

  for (let i = 0; i < ids.length; i++) {
    const { id, label, sub } = ids[i];
    const buf = await fetchThumb(id);
    await sleep(120);
    if (!buf) continue;

    const col = ok % COLS;
    const row = Math.floor(ok / COLS);
    const img = await sharp(buf).resize(CELL, CELL, { fit: "cover" }).png().toBuffer();

    cells.push({ input: img, top: row * (CELL + LABEL_H), left: col * CELL });
    cells.push({
      input: await sharp(labelSvg(label, sub)).png().toBuffer(),
      top: row * (CELL + LABEL_H) + CELL,
      left: col * CELL,
    });
    ok++;
  }

  if (!ok) return 0;
  const rows = Math.ceil(ok / COLS);
  mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp({
    create: {
      width: COLS * CELL,
      height: rows * (CELL + LABEL_H),
      channels: 3,
      background: { r: 10, g: 11, b: 13 },
    },
  })
    .composite(cells)
    .png()
    .toFile(outFile);

  return ok;
}

async function main() {
  const args = process.argv.slice(2);
  const outFile = path.resolve(args[0] ?? "sheet.png");
  const rest = args.slice(1);

  const all: MaterialIndexEntry[] = JSON.parse(readFileSync(INDEX, "utf8"));
  let picked: MaterialIndexEntry[];

  const catIdx = rest.indexOf("--category");
  if (catIdx >= 0) {
    const category = rest[catIdx + 1];
    const sizedOnly = rest.includes("--sized");
    const limIdx = rest.indexOf("--limit");
    const limit = limIdx >= 0 ? Number(rest[limIdx + 1]) : 16;
    picked = all
      .filter((m) => m.category === category && (!sizedOnly || m.physicalSizeM))
      .sort((a, b) => (b.downloadCount ?? 0) - (a.downloadCount ?? 0))
      .slice(0, limit);
  } else {
    const wanted = new Set(rest);
    picked = all.filter((m) => wanted.has(m.assetId));
  }

  const n = await buildSheet(
    picked.map((m) => ({
      id: m.assetId,
      label: m.assetId,
      sub: m.physicalSizeM
        ? `${m.physicalSizeM.x}×${m.physicalSizeM.y}m · ${m.tags.filter((t) => !/^\d+$/.test(t)).slice(0, 3).join(",")}`
        : `no size · ${m.tags.filter((t) => !/^\d+$/.test(t)).slice(0, 3).join(",")}`,
    })),
    outFile,
  );

  console.log(`Contact sheet: ${n} materials → ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
