// Penumbra profiler for the calibration captures (contract §3.1).
//
//   node scripts/render/shadow-edge.mjs <dir> <file> <left> <top> <w> <h>
//   node scripts/render/shadow-edge.mjs docs/calibration          # the recorded regions
//
// Answers one question the constants cannot: is a shadow edge in these frames a
// filtered penumbra or a hard step? three r182 absorbed PCFSoftShadowMap into
// PCFShadowMap, so the name in the code says nothing about the filter that ran,
// and r182's own regression (#32591) shipped hard shadows under the soft name.
//
// Method. Inside the region, take each row's steepest luminance gradient as the
// edge crossing, then FIT A LINE to those crossings and keep only rows whose
// crossing lies within 2 px of the fit. That rejection is the whole point: an
// unfitted region silently mixes several unrelated edges — an object silhouette
// against sky is a 1 px step no matter how the shadow was filtered — and the
// first version of this script reported exactly that artefact as a result.
//
//   widthPx    mean 10-90% transition width across accepted rows. ~1 px means a
//              hard step (only the AA pass widens it); wider means filtered.
//   scatterPx  RMS residual of the crossings about the fitted line. A regular
//              kernel puts a straight edge in the same place every row; a
//              stochastic disk rotated per pixel scatters it. High scatter with
//              a narrow width is the "pixelated shadow" symptom.
//   inlierFrac accepted rows / rows with a usable edge. Below ~0.6 the region
//              does not contain one dominant straight edge and the numbers do
//              not mean anything — reported, not hidden.
import sharp from "sharp";

const dir = process.argv[2];

/**
 * Regions verified by eye to contain ONE long straight shadow edge on a smooth
 * surface. Recorded so a re-capture is profiled at the same places.
 */
const REGIONS = [
  // Bench shadow on the terrace seen straight down, on a stretch clear of the
  // spheres — their shadows scallop the edge and the fit rejects it, correctly.
  // The best target available: long, straight, high contrast, smooth concrete,
  // and the largest shadow-map texel footprint of any cell, so the worst case
  // for blockiness. Horizontal edge, so scanned down columns.
  { file: "suburb-top.png", left: 1180, top: 418, width: 90, height: 30, axis: "v", what: "bench shadow" },
  { file: "city-top.png", left: 1180, top: 418, width: 90, height: 30, axis: "v", what: "bench shadow" },
  { file: "none-top.png", left: 1180, top: 418, width: 90, height: 30, axis: "v", what: "bench shadow" },
  // Leading edge of the sun beam through the glazed slider, on the roofed-room
  // floor. Steep and near-vertical, so scanned across rows.
  //
  // `suburb` and `city` report identical numbers here, which is expected, not a
  // sign the two captures are the same file (they are not — the md5s differ).
  // The 10-90% width is normalised against each row's own plateaus, so a
  // uniform level difference between two presets cancels exactly, and the
  // scatter and inlier fraction are properties of the geometry.
  { file: "suburb-full.png", left: 624, top: 528, width: 60, height: 80, axis: "h", what: "slider beam" },
  { file: "city-full.png", left: 624, top: 528, width: 60, height: 80, axis: "h", what: "slider beam" },
];

const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

async function profile({ file, left, top, width, height, axis = "h" }) {
  let img = sharp(`${dir}/${file}`).extract({ left, top, width, height });
  // A row scan only sees near-vertical edges. Rotating the crop lets the same
  // one-crossing-per-row logic profile a horizontal edge instead of needing a
  // second, subtly different code path that could disagree with this one.
  if (axis === "v") img = img.rotate(90);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;

  // Pass 1 — one crossing per row.
  const raw = [];
  for (let y = 0; y < h; y++) {
    let best = 0, bestX = -1;
    for (let x = 1; x < w; x++) {
      const g = Math.abs(lum(data, (y * w + x) * c) - lum(data, (y * w + x - 1) * c));
      if (g > best) { best = g; bestX = x; }
    }
    if (best >= 6 && bestX > 0) raw.push({ y, x: bestX });
  }
  if (raw.length < 8) return { file, usable: false, reason: "fewer than 8 rows carry an edge" };

  // Pass 2 — least-squares line x = m*y + b, then keep the inliers.
  const n = raw.length;
  const sy = raw.reduce((s, p) => s + p.y, 0) / n;
  const sx = raw.reduce((s, p) => s + p.x, 0) / n;
  const num = raw.reduce((s, p) => s + (p.y - sy) * (p.x - sx), 0);
  const den = raw.reduce((s, p) => s + (p.y - sy) ** 2, 0) || 1;
  const m = num / den;
  const b = sx - m * sy;
  const resid = raw.map((p) => p.x - (m * p.y + b));
  const inliers = raw.filter((_, i) => Math.abs(resid[i]) <= 2);
  const inlierFrac = inliers.length / n;
  const scatter = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / n);

  // Pass 3 — 10-90% width, inliers only.
  const widths = [];
  for (const p of inliers) {
    const span = 12;
    const lo = Math.max(0, p.x - span);
    const hi = Math.min(w - 1, p.x + span);
    const a = lum(data, (p.y * w + lo) * c);
    const z = lum(data, (p.y * w + hi) * c);
    const dark = Math.min(a, z), light = Math.max(a, z);
    if (light - dark < 10) continue;
    const t10 = dark + 0.1 * (light - dark);
    const t90 = dark + 0.9 * (light - dark);
    let x10 = null, x90 = null;
    for (let x = lo; x <= hi; x++) {
      const v = lum(data, (p.y * w + x) * c);
      if (x10 === null && v >= t10) x10 = x;
      if (x90 === null && v >= t90) x90 = x;
    }
    if (x10 !== null && x90 !== null) widths.push(Math.abs(x90 - x10) + 1);
  }
  if (!widths.length) return { file, usable: false, reason: "no row had a measurable 10-90% span" };

  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  return {
    file,
    usable: true,
    rows: widths.length,
    widthPx: mean(widths),
    scatterPx: scatter,
    inlierFrac,
  };
}

const argRegion = process.argv.length >= 8
  ? [{
      file: process.argv[3],
      left: +process.argv[4], top: +process.argv[5],
      width: +process.argv[6], height: +process.argv[7],
      axis: process.argv[8] || "h",
      what: "ad hoc",
    }]
  : REGIONS;

console.log("file              region                rows  widthPx  scatterPx  inlierFrac");
for (const r of argRegion) {
  const out = await profile(r);
  if (!out.usable) {
    console.log(`${r.file.padEnd(17)} ${r.what.padEnd(20)}  UNUSABLE — ${out.reason}`);
    continue;
  }
  const flag = out.inlierFrac < 0.6 ? "  <- not one dominant edge; numbers not meaningful" : "";
  console.log(
    `${out.file.padEnd(17)} ${r.what.padEnd(20)} ${String(out.rows).padStart(5)}  ` +
    `${out.widthPx.toFixed(2).padStart(7)}  ${out.scatterPx.toFixed(2).padStart(9)}  ` +
    `${out.inlierFrac.toFixed(2).padStart(10)}${flag}`,
  );
}
