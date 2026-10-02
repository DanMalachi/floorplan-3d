import { createRequire } from "module";
import path from "path";
import fs from "fs";
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const worktree = "C:/Users/dandu/fp-wt/nightstands";
const names = opt("--names").split("|");     // "Listed Name=out.png|..."
const port = opt("--port", "3140");
const { chromium } = createRequire(path.join(worktree, "package.json"))("playwright");
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
const q = await b.newPage({ viewport: { width: 400, height: 400 } });
await p.addInitScript(() => {
  window.__scenes = [];
  window.__THREE_DEVTOOLS__ = window.__THREE_DEVTOOLS__ || new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener("observe", (e) => window.__scenes.push(e.detail));
});
await p.goto(`http://localhost:${port}/dev/furniture`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(15000);
const clip = { x: 300, y: 100, width: 1200, height: 900 };
for (const spec of names) {
  const [name, out] = spec.split("=");
  await p.getByText(name, { exact: false }).first().click({ timeout: 60000 });
  await p.waitForTimeout(9000);
  await p.evaluate(() => {
    for (const s of window.__scenes) {
      if (s.type !== "Scene") continue;
      s.traverse((o) => {
        if (o.isLine || o.isLineSegments) o.visible = false;
        if (o.isMesh && o.geometry && o.geometry.type === "PlaneGeometry" && o.receiveShadow) o.visible = false;
      });
    }
    document.querySelectorAll("div").forEach((d) => {
      if (getComputedStyle(d).position === "absolute" && d.querySelector("button")) d.style.display = "none";
      if (d.textContent && /^\d+\. /.test(d.textContent) && d.children.length === 0) d.style.display = "none";
    });
    window.__vis = [];
    for (const s of window.__scenes) if (s.type === "Scene") s.traverse((o) => { if (o.isMesh && o.visible && o.geometry) { o.geometry.computeBoundingSphere(); o.updateWorldMatrix(true, false); const sc = Math.max(o.matrixWorld.elements[0], o.matrixWorld.elements[5], o.matrixWorld.elements[10]); if (o.geometry.boundingSphere.radius * sc < 1.5) window.__vis.push(o); } });
  });
  await p.waitForTimeout(2500);
  const withPiece = await p.screenshot({ clip });
  await p.evaluate(() => window.__vis.forEach((o) => { for (const m of [].concat(o.material)) { m.colorWrite = false; m.depthWrite = false; } }));
  await p.waitForTimeout(2500);
  const bg = await p.screenshot({ clip });
  await p.evaluate(() => window.__vis.forEach((o) => { for (const m of [].concat(o.material)) { m.colorWrite = true; m.depthWrite = true; } }));
  fs.writeFileSync(out.replace(/\.png$/, "") + ".with.png", withPiece);
  fs.writeFileSync(out.replace(/\.png$/, "") + ".bg.png", bg);
  await q.setContent("<canvas id=c></canvas>");
  const dataUrl = await q.evaluate(async ([a, c]) => {
    const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const A = await load("data:image/png;base64," + a), B = await load("data:image/png;base64," + c);
    const W = A.width, H = A.height;
    const mk = (i) => { const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const x = cv.getContext("2d"); x.drawImage(i, 0, 0); return x.getImageData(0, 0, W, H); };
    const da = mk(A), db = mk(B);
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const d = Math.max(Math.abs(da.data[i * 4] - db.data[i * 4]), Math.abs(da.data[i * 4 + 1] - db.data[i * 4 + 1]), Math.abs(da.data[i * 4 + 2] - db.data[i * 4 + 2]));
      mask[i] = d > 3 ? 1 : 0;
    }
    const lab = new Int32Array(W * H); let best = 0, bestN = 0, L = 0;
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || lab[s]) continue;
      L++; let n = 0; const st = [s]; lab[s] = L;
      while (st.length) { const v = st.pop(); n++; const x = v % W, y = (v / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const u = ny * W + nx; if (mask[u] && !lab[u]) { lab[u] = L; st.push(u); } } }
      if (n > bestN) { bestN = n; best = L; }
    }
    const out = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = lab[i] === best ? 2 : 0;
    const reach = new Uint8Array(W * H); const st = [];
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const u = y * W + x; if (out[u] !== 2 && !reach[u]) { reach[u] = 1; st.push(u); } }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const u = y * W + x; if (out[u] !== 2 && !reach[u]) { reach[u] = 1; st.push(u); } }
    while (st.length) { const v = st.pop(); const x = v % W, y = (v / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const u = ny * W + nx; if (out[u] !== 2 && !reach[u]) { reach[u] = 1; st.push(u); } } }
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    const res = new ImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      if (!reach[i]) { res.data.set([da.data[i * 4], da.data[i * 4 + 1], da.data[i * 4 + 2], 255], i * 4);
        const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const full = document.createElement("canvas"); full.width = W; full.height = H; full.getContext("2d").putImageData(res, 0, 0);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, side = Math.max(bw, bh) * 1.12;
    const o = document.getElementById("c"); o.width = 512; o.height = 512;
    const cx = o.getContext("2d"); cx.imageSmoothingQuality = "high";
    cx.drawImage(full, (x0 + x1) / 2 - side / 2, (y0 + y1) / 2 - side / 2, side, side, 0, 0, 512, 512);
    return o.toDataURL("image/png");
  }, [withPiece.toString("base64"), bg.toString("base64")]);
  fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("wrote", out);
}
await b.close();
