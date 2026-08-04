// Image statistics for the M1b verification screenshots.
//
//   node scripts/render/image-stats.mjs <dir>
//
// Two measures, both computed over raw pixels rather than probe points — a
// projected probe can silently collapse onto the wrong geometry, whole-image
// statistics cannot.
//
//   sunFrac  fraction of pixels brighter than a direct-sun threshold. The leak
//            detector: at noon a roofed interior must have ~none, because a
//            near-vertical sun puts nothing through a vertical window.
//   hp       mean |laplacian|, restricted to a region. The acne detector:
//            shadow acne alternates lit/dark per shadow-map texel and lifts
//            this sharply, while a smooth lit surface stays near zero.
import sharp from "sharp";
import { readdirSync } from "fs";

const dir = process.argv[2];

async function stats(file, crop) {
  let img = sharp(`${dir}/${file}`);
  if (crop) img = img.extract(crop);
  const { data, info } = await img.greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let sum = 0, max = 0, sun = 0, hp = 0, hpN = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (data[i] > max) max = data[i];
    if (data[i] > 190) sun++;
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      hp += Math.abs(4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w]);
      hpN++;
    }
  }
  return {
    mean: sum / data.length,
    max,
    sunFrac: sun / data.length,
    hp: hp / hpN,
  };
}

const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
console.log("file".padEnd(22), "mean".padStart(7), "max".padStart(5), "sunFrac".padStart(9), "hp".padStart(7));
for (const f of files) {
  // Interior frames: measure the lower half, which is floor.
  const crop = f.startsWith("int-") ? { left: 0, top: 350, width: 1000, height: 340 } : null;
  const s = await stats(f, crop);
  console.log(
    f.padEnd(22),
    s.mean.toFixed(1).padStart(7),
    String(s.max).padStart(5),
    (s.sunFrac * 100).toFixed(2).padStart(8) + "%",
    s.hp.toFixed(2).padStart(7),
  );
}
