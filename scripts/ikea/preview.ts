/**
 * Dev-only visual preview of the furniture catalog (NOT part of the app).
 * Reads data/furniture-ikea.json and writes a single self-contained HTML gallery
 * with the data inlined; product images load from IKEA's CDN, so open it with a
 * live connection. Handy for eyeballing the catalog between pipeline phases.
 *
 * Run:  npx tsx scripts/ikea/preview.ts   → writes out/furniture-preview.html
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { FurnitureItem } from "../../src/lib/furnitureCatalog";

const items: FurnitureItem[] = JSON.parse(
  readFileSync(path.resolve("data/furniture-ikea.json"), "utf8"),
);

const OUT = path.resolve("out/furniture-preview.html");
mkdirSync(path.dirname(OUT), { recursive: true });

const html = `<!doctype html>
<html lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IKEA furniture catalog — preview (${items.length})</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f6f4; --card:#fff; --fg:#1a1a1a; --muted:#6b6b6b; --line:#e4e4e0; --accent:#0058a3; }
  @media (prefers-color-scheme: dark){ :root{ --bg:#161615; --card:#212120; --fg:#ededeb; --muted:#9a9a97; --line:#333330; --accent:#4a9be8; } }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--bg); color:var(--fg); }
  header { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line); padding:14px 20px; }
  h1 { margin:0 0 10px; font-size:16px; font-weight:650; }
  h1 small { color:var(--muted); font-weight:400; }
  .filters { display:flex; flex-wrap:wrap; gap:6px; }
  .filters button { border:1px solid var(--line); background:var(--card); color:var(--fg); padding:5px 11px; border-radius:999px; cursor:pointer; font-size:12.5px; }
  .filters button.on { background:var(--accent); color:#fff; border-color:var(--accent); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); gap:16px; padding:20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
  .thumb { position:relative; aspect-ratio:1; background:#fff; }
  .thumb img { width:100%; height:100%; object-fit:contain; display:block; }
  .badge { position:absolute; top:8px; inset-inline-start:8px; background:rgba(0,0,0,.72); color:#fff; font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:6px; letter-spacing:.03em; }
  .body { padding:10px 12px 12px; display:flex; flex-direction:column; gap:4px; }
  .name { font-weight:650; font-size:13.5px; }
  .sub { color:var(--muted); font-size:12px; }
  .sub[dir=rtl]{ text-align:start; }
  .row { display:flex; justify-content:space-between; align-items:center; margin-top:4px; }
  .price { font-weight:650; }
  .dims { color:var(--muted); font-size:11.5px; font-variant-numeric:tabular-nums; }
  .swatches { display:flex; gap:4px; margin-top:6px; }
  .sw { width:14px; height:14px; border-radius:50%; border:1px solid rgba(128,128,128,.4); }
  a.card { text-decoration:none; color:inherit; }
</style>
</head>
<body>
<header>
  <h1>IKEA furniture catalog <small>· <span id="count">${items.length}</span> items · IL/he · prototype preview</small></h1>
  <div class="filters" id="filters"></div>
</header>
<div class="grid" id="grid"></div>
<script>
const DATA = ${JSON.stringify(items)};
const cats = [...new Set(DATA.map(d=>d.category))].sort();
let active = "all";
const dim = d => ["width","depth","height","length","diameter"]
  .filter(k=>d.dimensions[k]!=null)
  .map(k=>({width:"W",depth:"D",height:"H",length:"L",diameter:"Ø"}[k]+d.dimensions[k])).join(" × ") + (Object.keys(d.dimensions).length?" cm":"");
const thumb = u => u ? u + (u.includes("?")?"&":"?") + "imwidth=350" : "";

function render(){
  const list = active==="all" ? DATA : DATA.filter(d=>d.category===active);
  document.getElementById("count").textContent = list.length;
  document.getElementById("grid").innerHTML = list.map(d=>\`
    <a class="card" href="\${d.productUrl}" target="_blank" rel="noopener">
      <div class="thumb">
        \${d.model3d?'<span class="badge">3D</span>':''}
        <img loading="lazy" src="\${thumb(d.imageMain)}" alt="">
      </div>
      <div class="body">
        <div class="name">\${d.name}</div>
        <div class="sub" dir="rtl">\${d.subcategoryHe||d.subcategory}</div>
        <div class="row">
          <span class="price">\${d.price.value!=null? "₪"+d.price.value.toLocaleString() : "—"}</span>
          <span class="dims">\${dim(d)}</span>
        </div>
        \${d.colors.length?'<div class="swatches">'+d.colors.map(c=>'<span class="sw" title="'+c.name+'" style="background:'+(c.hex||'transparent')+'"></span>').join('')+'</div>':''}
      </div>
    </a>\`).join("");
}
function buildFilters(){
  const f = document.getElementById("filters");
  const mk = (key,label) => { const b=document.createElement("button"); b.textContent=label; b.className=key===active?"on":""; b.onclick=()=>{active=key;[...f.children].forEach(c=>c.className="");b.className="on";render();}; return b; };
  f.append(mk("all","All ("+DATA.length+")"));
  cats.forEach(c=>f.append(mk(c, c+" ("+DATA.filter(d=>d.category===c).length+")")));
}
buildFilters(); render();
</script>
</body>
</html>`;

writeFileSync(OUT, html, "utf8");
console.log(`Wrote preview → ${OUT}  (${(html.length / 1024) | 0} KB, ${items.length} items)`);
