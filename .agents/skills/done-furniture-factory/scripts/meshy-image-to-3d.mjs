#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const values = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (!value.startsWith("--")) return pairs;
  const next = all[index + 1];
  pairs.push([value.slice(2), next && !next.startsWith("--") ? next : true]);
  return pairs;
}, []));

if (values.help || !values.image || !values.output) {
  console.log("Usage: node meshy-image-to-3d.mjs --image <png|jpg> --output <candidate-dir> [--target-triangles 75000] [--dry-run | --confirm-spend]");
  process.exit(values.help ? 0 : 2);
}

const imagePath = path.resolve(String(values.image));
const output = path.resolve(String(values.output));
const target = Number(values["target-triangles"] ?? 75000);
if (!Number.isInteger(target) || target < 100 || target > 300000) throw new Error("--target-triangles must be 100..300000");
const ext = path.extname(imagePath).toLowerCase();
const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : null;
if (!mime) throw new Error("Reference must be PNG or JPEG");
const image = await readFile(imagePath);
const imageSha256 = createHash("sha256").update(image).digest("hex");
const request = {
  image_url: `data:${mime};base64,${image.toString("base64")}`,
  model_type: "standard",
  ai_model: "meshy-7.1",
  geometry_resolution: "standard",
  should_texture: true,
  enable_pbr: true,
  texture_resolution: "2k",
  should_remesh: true,
  topology: "triangle",
  target_polycount: target,
  save_pre_remeshed_model: true,
  image_enhancement: false,
  target_formats: ["glb"],
  auto_size: true,
  origin_at: "bottom",
  alpha_thumbnail: true,
  multi_view_thumbnails: true
};
const summary = {
  provider: "Meshy",
  endpoint: "image-to-3d",
  model: request.ai_model,
  image: imagePath,
  imageBytes: image.byteLength,
  imageWillBeUploaded: true,
  output,
  targetTriangles: target,
  textureResolution: request.texture_resolution,
  pbr: true,
  estimatedCredits: 30,
  rightsWarning: "Free-plan output is CC BY 4.0, not CC0. Run only with a paid plan and legally clean input for the CC0 lane.",
  privacyWarning: "Current Meshy terms allow use of non-Enterprise input/output to train or improve the service unless otherwise agreed; verify the account privacy setting before upload."
};

if (values["dry-run"]) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
if (!values["confirm-spend"]) throw new Error("Refusing external upload/spend without --confirm-spend. Run --dry-run and obtain user approval first.");
const apiKey = process.env.MESHY_API_KEY;
if (!apiKey) throw new Error("MESHY_API_KEY is not set");

await mkdir(path.join(output, "exports"), { recursive: true });
await mkdir(path.join(output, "renders"), { recursive: true });
await mkdir(path.join(output, "inputs"), { recursive: true });
await writeFile(path.join(output, `inputs/reference${ext}`), image, { flag: "wx" });
const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
const create = await fetch("https://api.meshy.ai/openapi/v1/image-to-3d", { method: "POST", headers, body: JSON.stringify(request) });
if (!create.ok) throw new Error(`Meshy create failed (${create.status}): ${await create.text()}`);
const { result: taskId } = await create.json();
if (!taskId) throw new Error("Meshy did not return a task ID");

let task;
for (let attempt = 0; attempt < 120; attempt++) {
  const response = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`Meshy status failed (${response.status}): ${await response.text()}`);
  task = await response.json();
  if (["SUCCEEDED", "FAILED", "CANCELED"].includes(task.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!task || task.status !== "SUCCEEDED") throw new Error(`Meshy task ${taskId} ended as ${task?.status ?? "timeout"}: ${task?.task_error?.message ?? ""}`);

async function download(url, relative) {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${relative}`);
  const targetPath = path.join(output, relative);
  await writeFile(targetPath, new Uint8Array(await response.arrayBuffer()), { flag: "wx" });
  return relative;
}

const downloaded = {
  roomGlb: await download(task.model_urls?.glb, "exports/room.glb"),
  sourceGlb: await download(task.model_urls?.pre_remeshed_glb, "exports/source.glb"),
  thumbnail: await download(task.thumbnail_url, "renders/front.png"),
  alphaThumbnail: await download(task.alpha_thumbnail_url, "renders/front-alpha.png")
};
for (const [view, url] of Object.entries(task.thumbnail_urls ?? {})) {
  if (view === "front") continue;
  downloaded[`${view}Thumbnail`] = await download(url, `renders/${view}.png`);
}

const redactedRequest = { ...request, image_url: `<data-uri omitted; ${image.byteLength} bytes>` };
await writeFile(path.join(output, "provider-response.json"), JSON.stringify({ request: redactedRequest, response: task, downloaded }, null, 2) + "\n", { flag: "wx" });
await writeFile(path.join(output, "costs.json"), JSON.stringify({ provider: "Meshy", taskId, consumedCredits: task.consumed_credits ?? null }, null, 2) + "\n", { flag: "wx" });
await writeFile(path.join(output, "provider-rights.json"), JSON.stringify({
  status: "pending",
  provider: "Meshy",
  termsUrl: "https://www.meshy.ai/terms-of-use",
  termsChecked: "2026-09-19",
  requiredForCc0Lane: ["Paid Meshy plan at generation time", "Legally clean reference input", "Owner approval of CC0 dedication for final artifact hash"],
  warning: "This record does not itself grant or dedicate CC0 rights."
}, null, 2) + "\n", { flag: "wx" });
let sources = { schemaVersion: 1, inputs: [], provider: null, materialSources: [] };
try {
  sources = JSON.parse(await readFile(path.join(output, "sources.json"), "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
sources.inputs = [
  ...(sources.inputs ?? []).filter((entry) => entry.role !== "image-to-3d-reference"),
  { role: "image-to-3d-reference", path: `inputs/reference${ext}`, sha256: imageSha256, rights: "unresolved" }
];
sources.provider = { name: "Meshy", model: request.ai_model, taskId, termsChecked: "2026-09-19", consumedCredits: task.consumed_credits ?? null };
await writeFile(path.join(output, "sources.json"), JSON.stringify(sources, null, 2) + "\n");
console.log(JSON.stringify({ taskId, status: task.status, consumedCredits: task.consumed_credits, downloaded }, null, 2));
