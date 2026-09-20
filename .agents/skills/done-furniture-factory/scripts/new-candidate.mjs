#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (!value.startsWith("--")) return pairs;
  const next = all[index + 1];
  pairs.push([value.slice(2), next && !next.startsWith("--") ? next : true]);
  return pairs;
}, []));

if (args.help || !args.family || !args.asset || !args.revision || !args.root) {
  console.log("Usage: node new-candidate.mjs --root <assets/furniture> --family <slug> --asset <slug> --revision <1> [--category <kind>]");
  process.exit(args.help ? 0 : 2);
}

const revision = Number(args.revision);
if (!Number.isInteger(revision) || revision < 1) throw new Error("--revision must be a positive integer");
for (const [key, value] of [["family", args.family], ["asset", args.asset]]) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`--${key} must be a lowercase slug`);
}

const revisionId = `r${String(revision).padStart(3, "0")}`;
const output = path.resolve(String(args.root), String(args.family), String(args.asset), revisionId);
for (const dir of ["exports", "renders", "inputs"]) await mkdir(path.join(output, dir), { recursive: true });

async function create(name, data) {
  await writeFile(path.join(output, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
}

await create("brief.json", {
  schemaVersion: 2,
  candidateId: `${args.family}:${args.asset}:${revisionId}`,
  category: args.category || "unresolved",
  dimensionsM: { width: null, depth: null, height: null },
  style: [],
  materials: [],
  mustKeep: [],
  avoid: [],
  referenceImages: [],
  roomContext: [],
  status: "unresolved"
});
await create("sources.json", { schemaVersion: 1, inputs: [], provider: null, materialSources: [] });
await create("rights.json", {
  schemaVersion: 1,
  status: "pending",
  intendedRelease: "CC0-1.0",
  ownerDedicationRecorded: false,
  artifactSha256: null,
  notes: ["Do not declare CC0 until every input and provider output right is resolved for the exact artifact hash."]
});
await create("review.json", { schemaVersion: 1, technical: "pending", visual: "pending", user: "pending", promotion: "candidate" });
console.log(output);
