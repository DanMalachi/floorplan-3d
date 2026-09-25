#!/usr/bin/env node
// Bake the door veneer library: Poly Haven CC0 veneer scans -> app-ready WebP
// tiles under public/materials/doors/veneer/<id>/{color,normal,roughness}.webp.
//
// Why a grade at all: Poly Haven scans RAW veneer — sanded, unfinished wood,
// which reads chalky, and each scan carries its own colour cast. Every real
// door is finished, and a clear finish "wets" the wood (the film index-matches
// the open fibres, so it darkens and saturates). The grade below bakes that
// finished colour into the tile ONCE, so the renderer only adds the finish's
// SHEEN (roughness / clearcoat) on top, never a second darkening.
//
// Grain runs along +U in every Poly Haven veneer (checked on the contact
// sheet), which src/doors/geometry.ts relies on to lay grain up the stiles and
// across the rails.
//
// Usage: node scripts/doors/bake-veneers.mjs [--only id,id] [--cache <dir>]
// Licence: https://polyhaven.com/license (CC0-1.0), checked 2026-09-25.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const OUT = path.join(ROOT, "public/materials/doors/veneer");
const args = process.argv.slice(2);
const argVal = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const CACHE = argVal("--cache") ?? path.join(os.tmpdir(), "done-door-veneers");
const ONLY = argVal("--only")?.split(",");

// id -> Poly Haven source + the FINISHED species' mean colour (sRGB, a
// clear-finished sample of that wood, not the raw scan). Scans carry their own
// grey/pink casts (raw American walnut is nearly grey-green), so a gamma
// "wetting" curve alone kept the cast. Instead each channel is scaled so the
// tile's mean lands on `target`, and `contrast` (an exponent on the
// pixel/mean ratio) sets how hard the grain reads — finish deepens figure.
export const VENEERS = {
  "white-oak": { src: "oak_veneer_03", target: [196, 170, 134], contrast: 1.25 },
  "natural-oak": { src: "oak_veneer_04", target: [182, 144, 100], contrast: 1.3 },
  "rift-oak": { src: "silver_oak_veneer_01", target: [204, 178, 142], contrast: 1.2 },
  "smoked-oak": { src: "oak_veneer_05", target: [112, 84, 62], contrast: 1.35 },
  "grey-oak": { src: "washed_grey_oak_veneer", target: [172, 163, 150], contrast: 1.25 },
  "black-oak": { src: "black_oak_veneer", target: [54, 50, 47], contrast: 1.3 },
  "american-walnut": { src: "american_walnut_veneer", target: [98, 68, 50], contrast: 1.5 },
  "european-walnut": { src: "european_walnut_veneer_04", target: [126, 90, 63], contrast: 1.4 },
  "figured-walnut": { src: "walnut_veneer_02", target: [118, 84, 60], contrast: 1.2 },
  ash: { src: "ash_veneer", target: [206, 188, 158], contrast: 1.3 },
  "white-maple": { src: "white_maple_veneer", target: [224, 204, 170], contrast: 1.2 },
  cherry: { src: "cherry_veneer", target: [168, 104, 70], contrast: 1.3 },
  teak: { src: "teak_veneer", target: [150, 102, 58], contrast: 1.1 },
  sapele: { src: "sapele_veneer_02", target: [134, 72, 46], contrast: 1.3 },
  "flamed-black": { src: "flamed_black_veneer", target: [46, 43, 41], contrast: 1.2 },
};

const SIZE = 1024; // Poly Haven veneers are 1 m square: 1 px ~ 1 mm on the door.

async function fetchTo(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

async function grade(file, { target, contrast }) {
  const { data, info } = await sharp(file).resize(SIZE, SIZE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = data.length / 3;
  const lin = new Float32Array(data.length);
  const mean = [0, 0, 0];
  for (let i = 0; i < data.length; i++) {
    lin[i] = toLin(data[i] / 255);
    mean[i % 3] += lin[i] / n;
  }
  const want = target.map((c) => toLin(c / 255));
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    const k = i % 3;
    const v = want[k] * (lin[i] / Math.max(1e-6, mean[k])) ** contrast;
    out[i] = Math.round(toSrgb(Math.min(1, Math.max(0, v))) * 255);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const manifest = {};
  for (const [id, v] of Object.entries(VENEERS)) {
    if (ONLY && !ONLY.includes(id)) continue;
    const files = await (await fetch(`https://api.polyhaven.com/files/${v.src}`)).json();
    const info = await (await fetch(`https://api.polyhaven.com/info/${v.src}`)).json();
    const pick = (k) => files[k]["1k"].jpg.url;
    const raw = {
      color: path.join(CACHE, `${v.src}_diff.jpg`),
      normal: path.join(CACHE, `${v.src}_nor_gl.jpg`),
      roughness: path.join(CACHE, `${v.src}_rough.jpg`),
    };
    await fetchTo(pick("Diffuse"), raw.color);
    await fetchTo(pick("nor_gl"), raw.normal);
    await fetchTo(pick("Rough"), raw.roughness);
    const dir = path.join(OUT, id);
    fs.mkdirSync(dir, { recursive: true });
    await (await grade(raw.color, v)).webp({ quality: 88 }).toFile(path.join(dir, "color.webp"));
    // Data maps: never graded, never chroma-subsampled into mush.
    await sharp(raw.normal).resize(SIZE, SIZE).webp({ quality: 90, smartSubsample: true }).toFile(path.join(dir, "normal.webp"));
    await sharp(raw.roughness).resize(SIZE, SIZE).greyscale().webp({ quality: 90 }).toFile(path.join(dir, "roughness.webp"));
    const [dx, dy] = info.dimensions ?? [1000, 1000]; // mm
    manifest[id] = {
      source: `https://polyhaven.com/a/${v.src}`,
      name: info.name,
      licence: "CC0-1.0 (https://polyhaven.com/license)",
      authors: Object.keys(info.authors ?? {}),
      tileMetres: [dx / 1000, dy / 1000],
      grade: { target: v.target, contrast: v.contrast },
    };
    console.log(id, "<-", v.src, manifest[id].tileMetres.join("x"), "m");
  }
  const mf = path.join(OUT, "manifest.json");
  const prev = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : {};
  fs.writeFileSync(mf, JSON.stringify({ ...prev, ...manifest }, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
