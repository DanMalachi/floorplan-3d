import fs from "fs";
const D = "C:/Users/dandu/AppData/Local/Temp/claude/C--Users-dandu/84f0248d-5959-49f2-b295-0f157367f282/scratchpad/";
let svg = fs.readFileSync(D + "plan/plan.svg", "utf8").replace(/<\?xml[^>]*>\s*/, "");
svg = svg.replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, "<svg$1").replace(/<svg([^>]*?)\s(width|height)="[^"]*"/g, "<svg$1");
if (!/preserveAspectRatio/.test(svg.slice(0, 400))) svg = svg.replace("<svg", '<svg preserveAspectRatio="xMaxYMid meet" aria-hidden="true"');
const src = fs.readFileSync(D + "hero-mockup.src.html", "utf8");
fs.writeFileSync(D + "hero-mockup.html", src.replace("<!--PLAN_SVG-->", svg));
console.log("built", (fs.statSync(D + "hero-mockup.html").size / 1024).toFixed(0) + "KB");
