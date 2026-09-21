#!/usr/bin/env node
// Promote an APPROVED candidate into Done in one command (promotion.md steps 2-7). Never commits.
//   node promote-candidate.mjs --repo <floorplan-3d root> --candidate assets/furniture/<family>/<asset>/r001 --slug block-arm-sofa
//        --name "Block-Arm Sofa" --kind sofa [--tags sofa,couch] --category Seating --subtitle "3-seat sofa, linen, oak legs" --rooms living [--approved-on 2026-09-20]
// Preconditions: exports/audit.json exists and matches the GLB it names; renders/thumb.png was rendered from that GLB;
// sources.json lists materialSources (name, creator, url, license). Run ONLY after the user approved the audited hash.
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const a = Object.fromEntries(process.argv.slice(2).reduce((p, v, i, all) => {
  if (v.startsWith("--")) p.push([v.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return p;
}, []));
for (const k of ["repo", "candidate", "slug", "name", "kind", "category", "subtitle", "rooms"]) {
  if (!a[k]) { console.error(`missing --${k}`); process.exit(2); }
}
const repo = path.resolve(a.repo), cand = path.resolve(repo, a.candidate);
const j = async (f) => JSON.parse(await readFile(f, "utf8"));
const sha = async (f) => createHash("sha256").update(await readFile(f)).digest("hex");

const audit = await j(path.join(cand, "exports", "audit.json"));
const glb = path.resolve(audit.file);
if ((await sha(glb)) !== audit.sha256) throw new Error("GLB hash differs from audit.json: re-audit before promoting");
const [w, , d] = audit.dimensionsXYZM.map((x) => Math.round(x * 1000) / 1000);

const outDir = path.join(repo, "public", "furniture", "factory");
const glbOut = path.join(outDir, `${a.slug}.glb`);
await copyFile(glb, glbOut);
if ((await sha(glbOut)) !== audit.sha256) throw new Error("copied GLB hash mismatch");
await copyFile(path.join(cand, "renders", "thumb.png"), path.join(outDir, `${a.slug}.png`));

// catalog
const catPath = path.join(repo, "data", "furniture-factory.catalog.json");
const cat = await j(catPath);
const entry = {
  assetId: `factory:${a.slug}`, name: a.name, category: a.category, footprint: { w, d }, wallSnap: true,
  realModel: `/furniture/factory/${a.slug}.glb`, thumbnail: `/furniture/factory/${a.slug}.png`,
  brand: "Done", subtitle: a.subtitle, kind: a.kind, ...(a.tags ? { typeTags: String(a.tags).split(",") } : {}), rooms: String(a.rooms).split(","),
};
const i = cat.findIndex((x) => x.assetId === entry.assetId);
if (i >= 0) cat[i] = entry; else cat.push(entry);
await writeFile(catPath, JSON.stringify(cat, null, 2) + "\n");

// attribution
const src = await j(path.join(cand, "sources.json"));
const attPath = path.join(outDir, "ATTRIBUTION.json");
const att = await j(attPath);
const item = {
  assetId: entry.assetId, file: `${a.slug}.glb`, sha256: audit.sha256, candidate: a.candidate.replace(/\\/g, "/"),
  owner: "Dan (Done)", geometryLicense: "original work, owner-controlled; CC0 dedication NOT recorded",
  textures: (src.materialSources || []).map((m) => ({ name: m.name, creator: m.creator, url: m.url, license: m.license })),
};
const k = att.items.findIndex((x) => x.assetId === item.assetId);
if (k >= 0) att.items[k] = item; else att.items.push(item);
await writeFile(attPath, JSON.stringify(att, null, 2) + "\n");

// DATA_RIGHTS row, after the last factory row
const drPath = path.join(repo, "docs", "DATA_RIGHTS.md");
const lines = (await readFile(drPath, "utf8")).split("\n");
if (!lines.some((l) => l.includes(`furniture/factory/${a.slug}.glb`))) {
  const last = lines.map((l, n) => (l.includes("public/furniture/factory/") ? n : -1)).filter((n) => n >= 0).pop();
  const tex = (src.materialSources || []).map((m) => `${m.name} (${m.url})`).join("; ");
  const row = `| \`public/furniture/factory/${a.slug}.glb\` (+ \`.png\` thumbnail) | Done-original: authored ${a.approvedOn || new Date().toISOString().slice(0, 10)} by Claude for Dan with the done-furniture-factory skill (\`${a.candidate.replace(/\\/g, "/")}\`, sha256 \`${audit.sha256.slice(0, 8)}…${audit.sha256.slice(-5)}\`). Textures: ${tex} (https://polyhaven.com/license), plus luminance-normalised derivatives | Geometry: original, owner-controlled (Dan), **CC0 dedication not recorded**. Textures: CC0-1.0. Inspiration-only references (retailer photos) were NOT inputs and nothing from them is in the file | ✅ ship + redistribute + commercial use. Visually approved by Dan ${a.approvedOn || "today"} for this exact hash |`;
  lines.splice(last >= 0 ? last + 1 : lines.length, 0, row);
  await writeFile(drPath, lines.join("\n"));
}

// candidate records
const rp = path.join(cand, "rights.json"), vp = path.join(cand, "review.json");
const r = await j(rp), v = await j(vp);
Object.assign(r, { status: "approved-original", artifactSha256: audit.sha256 });
Object.assign(v, { user: "approved", visual: "approved by user", promotion: "promoted", artifactSha256: audit.sha256 });
await writeFile(rp, JSON.stringify(r, null, 2) + "\n");
await writeFile(vp, JSON.stringify(v, null, 2) + "\n");
console.log(JSON.stringify({ promoted: entry.assetId, footprint: { w, d }, sha256: audit.sha256 }, null, 2));
