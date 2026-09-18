// Generates plan.svg — CAD-style Israeli 4-room apartment floorplan.
// Units: 1 SVG unit = 1 cm.
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'plan.svg');

// ---------- low level helpers ----------
function n(v){ return Math.round(v*100)/100; }
function rect(x,y,w,h,attrs=''){ if(w<0){x+=w;w=-w;} if(h<0){y+=h;h=-h;} return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${attrs}/>`; }
function line(x1,y1,x2,y2,attrs=''){ return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${attrs}/>`; }
function circle(cx,cy,r,attrs=''){ return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${attrs}/>`; }
function ellipse(cx,cy,rx,ry,attrs=''){ return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" ${attrs}/>`; }
function pathEl(d,attrs=''){ return `<path d="${d}" ${attrs}/>`; }
function grp(id,content,extra=''){ return `<g id="${id}" ${extra}>\n${content}\n</g>`; }
function text(x,y,str,attrs=''){ return `<text x="${n(x)}" y="${n(y)}" ${attrs}>${esc(str)}</text>`; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ---------- style presets ----------
const WALL = `fill="currentColor" fill-opacity="0.88" stroke="currentColor" stroke-width="0.7" stroke-opacity="0.95"`;
const COLUMN = `fill="currentColor" fill-opacity="0.4" stroke="currentColor" stroke-width="1" stroke-opacity="1"`;
const FURN = `fill="none" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.92"`;
const FURN_FILL = `fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.92"`;
const FURN_THIN = `fill="none" stroke="currentColor" stroke-width="0.9" stroke-opacity="0.8"`;
const FURN_HAIR = `fill="none" stroke="currentColor" stroke-width="0.7" stroke-opacity="0.6"`;
const DASH = `fill="none" stroke="currentColor" stroke-width="0.8" stroke-opacity="0.75" stroke-dasharray="4 3"`;
const DOOR_LEAF = `fill="none" stroke="currentColor" stroke-width="1.4" stroke-opacity="0.95"`;
const DOOR_ARC = `fill="none" stroke="currentColor" stroke-width="0.7" stroke-opacity="0.6"`;
const STEEL_LEAF = `fill="none" stroke="currentColor" stroke-width="2.3" stroke-opacity="0.97"`;
const WIN_LINE = `fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.9"`;
const DIM_LINE = `fill="none" stroke="currentColor" stroke-width="0.55" stroke-opacity="0.65"`;
const DIM_TICK = `stroke="currentColor" stroke-width="0.7" stroke-opacity="0.65"`;
const DIM_TXT = `font-family="IBM Plex Mono, monospace" font-size="9" fill="currentColor" fill-opacity="0.75" text-anchor="middle"`;
const RUG_STYLE = `fill="none" stroke="currentColor" stroke-width="0.9" stroke-opacity="0.45"`;
const TILE_STYLE = `stroke="currentColor" stroke-width="0.55" stroke-opacity="0.3"`;

// ==================================================================
// LAYOUT — REV3. Night zone widened to x25-625 (spine at 625, was 600)
// so Master, Bedroom2 and Mamad all clear their m2 minimums with
// correct per-side wall shrink (fixed the REV2 area math bug).
// ==================================================================
const ET = 25, MT = 30;
const B = { x0:0, y0:0, x1:1200, y1:900 };

const walls = [], openings = [], furniture = [], floors = [], labels = [], dims = [];

function addWall(x,y,w,h,attrs=WALL){ walls.push(rect(x,y,w,h,attrs)); }
function hWallRun(x0,x1,y0,y1,gaps,attrs=WALL){
  gaps = gaps.slice().sort((a,b)=>a[0]-b[0]);
  let cur = x0;
  for(const [a,b] of gaps){ if(a>cur) addWall(cur,y0,a-cur,y1-y0,attrs); cur = Math.max(cur,b); }
  if(cur<x1) addWall(cur,y0,x1-cur,y1-y0,attrs);
}
function vWallRun(y0,y1,x0,x1,gaps,attrs=WALL){
  gaps = gaps.slice().sort((a,b)=>a[0]-b[0]);
  let cur = y0;
  for(const [a,b] of gaps){ if(a>cur) addWall(x0,cur,x1-x0,a-cur,attrs); cur = Math.max(cur,b); }
  if(cur<y1) addWall(x0,cur,x1-x0,y1-cur,attrs);
}
function doorSwing(hx,hy,w,openDir,closedDir,opts={}){
  const leafAttrs = opts.steel ? STEEL_LEAF : DOOR_LEAF;
  const lx = hx+openDir[0]*w, ly = hy+openDir[1]*w;
  const cxp = hx+closedDir[0]*w, cyp = hy+closedDir[1]*w;
  const cross = openDir[0]*closedDir[1]-openDir[1]*closedDir[0];
  const sweep = cross>0?0:1;
  let out = line(hx,hy,lx,ly,leafAttrs);
  out += pathEl(`M ${n(lx)} ${n(ly)} A ${n(w)} ${n(w)} 0 0 ${sweep} ${n(cxp)} ${n(cyp)}`, DOOR_ARC);
  return out;
}
function winH(xa,xb,y0,y1){
  const mid1=y0+(y1-y0)*0.33, mid2=y0+(y1-y0)*0.67;
  let out='';
  out += line(xa,y0,xb,y0,WIN_LINE); out += line(xa,mid1,xb,mid1,WIN_LINE);
  out += line(xa,mid2,xb,mid2,WIN_LINE); out += line(xa,y1,xb,y1,WIN_LINE);
  out += line(xa,y0-3,xa,y1+3,FURN_HAIR); out += line(xb,y0-3,xb,y1+3,FURN_HAIR);
  return out;
}
function winV(x0,x1,ya,yb,opts={}){
  const mid1=x0+(x1-x0)*0.33, mid2=x0+(x1-x0)*0.67;
  let out='';
  out += line(x0,ya,x0,yb,WIN_LINE); out += line(mid1,ya,mid1,yb,WIN_LINE);
  out += line(mid2,ya,mid2,yb,WIN_LINE); out += line(x1,ya,x1,yb,WIN_LINE);
  out += line(x0-3,ya,x1+3,ya,FURN_HAIR); out += line(x0-3,yb,x1+3,yb,FURN_HAIR);
  if(opts.pocket){ out += rect(x0-2,ya-16,(x1-x0)+4,14,`fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="0.6" stroke-opacity="0.7"`); }
  return out;
}
function sliderH(y0,y1,xa,xb){
  const t = (y1-y0);
  const trackA = y0+t*0.12, trackAh=t*0.30, trackB=y0+t*0.58, trackBh=t*0.30;
  const mid = xa+(xb-xa)*0.52;
  let out='';
  out += rect(xa,trackA,mid-xa+18,trackAh,`fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.9"`);
  out += rect(mid-18,trackB,xb-(mid-18),trackBh,`fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.9"`);
  for(let x=xa+10;x<mid+8;x+=16) out+=line(x,trackA+2,x,trackA+trackAh-2,FURN_HAIR);
  for(let x=mid-10;x<xb-6;x+=16) out+=line(x,trackB+2,x,trackB+trackBh-2,FURN_HAIR);
  out += line(xa-3,y0-3,xa-3,y1+3,FURN_HAIR); out += line(xb+3,y0-3,xb+3,y1+3,FURN_HAIR);
  return out;
}
function netArea(x0,y0,x1,y1){ return ((x1-x0)*(y1-y0))/10000; }

// ==================================================================
// EXTERIOR WALLS
// ==================================================================
hWallRun(B.x0,B.x1,0,ET,[[80,220],[350,490],[985,1115]]);
openings.push(winH(80,220,0,ET)); openings.push(winH(350,490,0,ET)); openings.push(winH(985,1115,0,ET));

vWallRun(0,510,0,ET,[[120,240]]);
openings.push(winV(0,ET,120,240));
vWallRun(510,875,0,MT,[[650,750]]);
openings.push(winV(0,MT,650,750,{pocket:true}));

hWallRun(0,330,845,900,[]);
hWallRun(330,1200,850,900,[[446,518]]);
openings.push(doorSwing(446,850,72,[0,-1],[1,0]));

vWallRun(0,150,B.x1-ET,B.x1,[[50,150]]);
openings.push(winV(B.x1-ET,B.x1,50,150));
vWallRun(150,350,B.x1-ET,B.x1,[]);
vWallRun(550,700,B.x1-ET,B.x1,[]);
openings.push(sliderH(B.x1-ET,B.x1,350,550));
vWallRun(700,900,B.x1-ET,B.x1,[]);

// ==================================================================
// SPINE WALL (night/day) x619..631
// ==================================================================
vWallRun(25,782,619,631,[]);
vWallRun(782,875,619,631,[[800,874]]);
openings.push(doorSwing(631,800,74,[1,0],[0,1]));

// ==================================================================
// NIGHT ZONE PARTITIONS
// ==================================================================
vWallRun(25,420,264,276,[]);                              // BR2 / Master
hWallRun(25,625,414,426,[[100,180],[400,480]]);            // row1 / corridor-top
openings.push(doorSwing(100,414,80,[0,-1],[1,0]));
openings.push(doorSwing(400,414,80,[0,-1],[1,0]));

hWallRun(0,330,495,525,[]);                                // corridor-top / mamad (30-thick)
hWallRun(425,625,504,516,[[445,505],[545,605]]);           // corridor-top / ens+wic
openings.push(doorSwing(445,504,60,[0,-1],[1,0]));
openings.push(doorSwing(545,504,60,[0,-1],[1,0]));
// x330-425 (corridor-leg column) stays open — continuous hall.

vWallRun(495,875,315,345,[[610,674]]);                     // mamad east wall (30-thick), steel door
openings.push(doorSwing(345,610,64,[1,0],[0,1],{steel:true}));

vWallRun(510,782,419,431,[[700,764]]);                     // corridor-leg / ens+wic+mba block, mainbath door
openings.push(doorSwing(419,700,64,[-1,0],[0,1]));

vWallRun(510,630,519,531,[]);                              // ensuite / wic divider
hWallRun(425,625,624,636,[]);                              // ens+wic / mainbath divider
hWallRun(425,625,764,776,[]);                              // mainbath / entry divider (x425-625 only)

// ==================================================================
// DAY ZONE — laundry + guest wc carve-out
// ==================================================================
hWallRun(625,735,144,156,[]);                              // laundry / guestwc divider
hWallRun(625,735,260,272,[]);                              // guestwc SOUTH wall (was missing — bug fix)
vWallRun(25,150,729,741,[[60,120]]);
openings.push(doorSwing(729,60,60,[1,0],[0,1]));
vWallRun(150,260,729,741,[[180,254]]);
openings.push(doorSwing(729,180,74,[1,0],[0,1]));

// ==================================================================
// BALCONY parapet + railing
// ==================================================================
const BAL = {x0:1175,y0:150, x1:1355,y1:700};
addWall(BAL.x0, BAL.y0, BAL.x1-BAL.x0, 15, WALL);
addWall(BAL.x0, BAL.y1-15, BAL.x1-BAL.x0, 15, WALL);
(function(){
  const rx = BAL.x1-3;
  let out = line(rx, BAL.y0+15, rx, BAL.y1-15, `fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.85"`);
  out += line(rx-10, BAL.y0+15, rx-10, BAL.y1-15, `fill="none" stroke="currentColor" stroke-width="0.7" stroke-opacity="0.6"`);
  for(let y=BAL.y0+25;y<BAL.y1-15;y+=22) out += line(rx-10,y,rx,y,FURN_HAIR);
  openings.push(out);
})();

// ==================================================================
// STRUCTURAL COLUMNS
// ==================================================================
function column(x,y,w,h){
  let out = rect(x,y,w,h,COLUMN);
  out += line(x+3,y+3,x+w-3,y+h-3,`stroke="currentColor" stroke-width="0.9" stroke-opacity="0.95"`);
  out += line(x+w-3,y+3,x+3,y+h-3,`stroke="currentColor" stroke-width="0.9" stroke-opacity="0.95"`);
  out += rect(x,y,w,h,`fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="1"`);
  walls.push(out);
}
column(705,478,30,50);
column(725,600,30,50);

// ==================================================================
// FLOOR TILE PATTERNS — wet rooms + balcony only
// ==================================================================
function tileGrid(x0,y0,x1,y1,size){
  let out='';
  for(let x=x0+size; x<x1; x+=size) out+=line(x,y0,x,y1,TILE_STYLE);
  for(let y=y0+size; y<y1; y+=size) out+=line(x0,y,x1,y,TILE_STYLE);
  out += rect(x0,y0,x1-x0,y1-y0,`fill="none" stroke="currentColor" stroke-width="0.6" stroke-opacity="0.35"`);
  return out;
}
floors.push(tileGrid(431,516,619,624,30));   // ensuite
floors.push(tileGrid(431,636,619,764,60));   // main bathroom
floors.push(tileGrid(631,156,729,260,30));   // guest wc
floors.push(tileGrid(631,25,729,144,30));    // laundry
floors.push(tileGrid(BAL.x0+2,BAL.y0+16,BAL.x1-4,BAL.y1-16,40));

// ==================================================================
// FURNITURE SYMBOL LIBRARY
// ==================================================================
function bed(x,y,w,h,headSide){
  let out = rect(x,y,w,h,FURN);
  const inset=5;
  out += rect(x+inset,y+inset,w-inset*2,h-inset*2,FURN_THIN);
  if(headSide==='W'){
    out += rect(x+inset+3,y+inset+3,38,h-inset*2-6,FURN_THIN);
    out += line(x+inset+3,y+h/2,x+inset+41,y+h/2,FURN_HAIR);
    const fx=x+w-inset-46;
    out += line(fx,y+inset,x+w-inset,y+h-inset,FURN_HAIR);
    out += line(fx,y+h-inset,fx+20,y+h-inset,FURN_HAIR);
  } else {
    out += rect(x+inset+3,y+inset+3,w-inset*2-6,38,FURN_THIN);
    out += line(x+w/2,y+inset+3,x+w/2,y+inset+41,FURN_HAIR);
    const fy=y+h-inset-46;
    out += line(x+inset,fy,x+w-inset,y+h-inset,FURN_HAIR);
    out += line(x+w-inset,fy,x+w-inset,fy+20,FURN_HAIR);
  }
  return out;
}
function nightstand(x,y,s){ return rect(x,y,s,s,FURN); }
function wardrobe(x,y,w,h,vertical){
  let out = rect(x,y,w,h,FURN);
  if(vertical){
    const rx=x+w*0.5; out += line(rx,y+4,rx,y+h-4,DASH);
    const cnt=Math.max(2,Math.floor(h/22));
    for(let i=1;i<cnt;i++){ const ry=y+4+(h-8)*i/cnt; out+=line(rx-4,ry,rx+4,ry,FURN_HAIR); }
  } else {
    const ry=y+h*0.5; out += line(x+4,ry,x+w-4,ry,DASH);
    const cnt=Math.max(2,Math.floor(w/22));
    for(let i=1;i<cnt;i++){ const rx=x+4+(w-8)*i/cnt; out+=line(rx,ry-4,rx,ry+4,FURN_HAIR); }
  }
  return out;
}
function desk(x,y,w,h){ return rect(x,y,w,h,FURN); }
function officeChair(cx,cy,r){
  let out = circle(cx,cy,r,FURN_THIN);
  out += pathEl(`M ${n(cx-r*0.8)} ${n(cy-r)} A ${n(r*0.9)} ${n(r*0.9)} 0 0 1 ${n(cx+r*0.8)} ${n(cy-r)}`,FURN_THIN);
  return out;
}
function sofaRun(x,y,w,h,seats,backSide){
  let out = rect(x,y,w,h,FURN); const bw=12;
  if(backSide==='N') out+=rect(x,y,w,bw,FURN_THIN);
  if(backSide==='S') out+=rect(x,y+h-bw,w,bw,FURN_THIN);
  if(backSide==='E') out+=rect(x+w-bw,y,bw,h,FURN_THIN);
  if(backSide==='W') out+=rect(x,y,bw,h,FURN_THIN);
  if(backSide==='N'||backSide==='S'){ const step=w/seats; for(let i=1;i<seats;i++) out+=line(x+step*i,y+bw,x+step*i,y+h,FURN_HAIR); }
  else { const step=h/seats; for(let i=1;i<seats;i++) out+=line(x+bw,y+step*i,x+w,y+step*i,FURN_HAIR); }
  return out;
}
function armchair(x,y,w,h,backSide){
  let out=rect(x,y,w,h,FURN); const bw=10;
  if(backSide==='N') out+=rect(x,y,w,bw,FURN_THIN);
  if(backSide==='S') out+=rect(x,y+h-bw,w,bw,FURN_THIN);
  if(backSide==='E') out+=rect(x+w-bw,y,bw,h,FURN_THIN);
  if(backSide==='W') out+=rect(x,y,bw,h,FURN_THIN);
  return out;
}
function table(x,y,w,h){ return rect(x,y,w,h,FURN); }
function chair(cx,cy,rot){
  const s=32; let out='';
  if(rot==='N'){ out+=rect(cx-s/2,cy-s/2,s,s,FURN_THIN); out+=line(cx-s/2,cy-s/2-4,cx+s/2,cy-s/2-4,FURN); }
  if(rot==='S'){ out+=rect(cx-s/2,cy-s/2,s,s,FURN_THIN); out+=line(cx-s/2,cy+s/2+4,cx+s/2,cy+s/2+4,FURN); }
  if(rot==='E'){ out+=rect(cx-s/2,cy-s/2,s,s,FURN_THIN); out+=line(cx+s/2+4,cy-s/2,cx+s/2+4,cy+s/2,FURN); }
  if(rot==='W'){ out+=rect(cx-s/2,cy-s/2,s,s,FURN_THIN); out+=line(cx-s/2-4,cy-s/2,cx-s/2-4,cy+s/2,FURN); }
  return out;
}
function rug(x,y,w,h){ return rect(x,y,w,h,RUG_STYLE); }
function tvConsole(x,y,w,h){
  let out=rect(x,y,w,h,FURN);
  out+=rect(x+w*0.5-30,y-2,60,4,`fill="currentColor" fill-opacity="0.7" stroke="none"`);
  return out;
}
function counter(x,y,w,h){ return rect(x,y,w,h,FURN_FILL); }
function tallUnit(x,y,w,h){ // full-height cabinet / pantry — outline + X, never filled
  let out = rect(x,y,w,h,FURN);
  out += line(x+4,y+4,x+w-4,y+h-4,FURN_HAIR);
  out += line(x+w-4,y+4,x+4,y+h-4,FURN_HAIR);
  return out;
}
function upperCabinets(x,y,w,h){ return rect(x,y,w,h,DASH); }
function sinkDouble(x,y,w,h){
  let out=''; const bw=(w-6)/2;
  out+=rect(x,y,bw,h,FURN_THIN); out+=rect(x+bw+6,y,bw,h,FURN_THIN);
  out+=circle(x+w/2,y-3,1.6,`fill="currentColor" stroke="none"`);
  return out;
}
function hob(x,y,w,h){
  let out=rect(x,y,w,h,FURN_THIN);
  const cx1=x+w*0.28, cx2=x+w*0.72, cy1=y+h*0.3, cy2=y+h*0.7;
  [[cx1,cy1],[cx2,cy1],[cx1,cy2],[cx2,cy2]].forEach(([cx,cy])=>{ out+=circle(cx,cy,Math.min(w,h)*0.14,FURN_HAIR); });
  return out;
}
function ovenCab(x,y,w,h){
  let out=rect(x,y,w,h,FURN);
  out+=pathEl(`M ${n(x+4)} ${n(y+h-6)} L ${n(x+w-4)} ${n(y+h-6)}`,FURN_HAIR);
  out+=circle(x+w-8,y+h/2,1.4,`fill="currentColor" stroke="none"`);
  return out;
}
function fridge(x,y,w,h){
  let out=rect(x,y,w,h,FURN);
  out+=pathEl(`M ${n(x+w-4)} ${n(y+4)} A 4 4 0 0 1 ${n(x+w)} ${n(y+8)}`,FURN_HAIR);
  out+=line(x+4,y+4,x+w-4,y+h-4,FURN_HAIR);
  return out;
}
function dishwasher(x,y,w,h){ let out=rect(x,y,w,h,FURN); out+=rect(x+4,y+4,w-8,h-8,FURN_HAIR); return out; }
function islandCounter(x,y,w,h,overhangSide){
  let out=rect(x,y,w,h,FURN_FILL);
  if(overhangSide==='S') out+=line(x-6,y+h+6,x+w+6,y+h+6,DASH);
  return out;
}
function barStool(cx,cy,r){ return circle(cx,cy,r,FURN_THIN); }
function toilet(x,y,w,h,facing){
  let out='';
  if(facing==='S'){ out+=rect(x,y,w,10,FURN_THIN); out+=ellipse(x+w/2,y+h*0.62,w*0.42,h*0.36,FURN_THIN); }
  if(facing==='N'){ out+=rect(x,y+h-10,w,10,FURN_THIN); out+=ellipse(x+w/2,y+h*0.38,w*0.42,h*0.36,FURN_THIN); }
  if(facing==='E'){ out+=rect(x,y,10,h,FURN_THIN); out+=ellipse(x+w*0.62,y+h/2,w*0.36,h*0.42,FURN_THIN); }
  if(facing==='W'){ out+=rect(x+w-10,y,10,h,FURN_THIN); out+=ellipse(x+w*0.38,y+h/2,w*0.36,h*0.42,FURN_THIN); }
  return out;
}
function vanity(x,y,w,h,basins){
  let out=rect(x,y,w,h,FURN); const bw=w/basins;
  for(let i=0;i<basins;i++) out+=ellipse(x+bw*i+bw/2,y+h/2,bw*0.32,h*0.3,FURN_HAIR);
  return out;
}
function showerTray(x,y,w,h){
  let out=rect(x,y,w,h,FURN_THIN);
  out+=line(x+3,y+3,x+w-3,y+h-3,FURN_HAIR); out+=line(x+w-3,y+3,x+3,y+h-3,FURN_HAIR);
  out+=circle(x+w/2,y+h/2,2,FURN_HAIR);
  return out;
}
function bathtub(x,y,w,h){ let out=rect(x,y,w,h,FURN); out+=rect(x+6,y+6,w-12,h-12,FURN_HAIR); return out; }
function washerDryer(x,y,s){ let out=rect(x,y,s,s,FURN); out+=circle(x+s/2,y+s/2,s*0.32,FURN_HAIR); return out; }
function plant(cx,cy,r){
  let out=circle(cx,cy,r,FURN_HAIR);
  for(let a=0;a<6;a++){ const ang=a*Math.PI/3; out+=line(cx,cy,cx+Math.cos(ang)*r*0.9,cy+Math.sin(ang)*r*0.9,FURN_HAIR); }
  return out;
}
function acUnit(x,y,w,h){
  let out=rect(x,y,w,h,FURN);
  for(let i=0;i<4;i++) out+=line(x+4,y+6+i*((h-12)/3),x+w-4,y+6+i*((h-12)/3),FURN_HAIR);
  return out;
}
function roundTable(cx,cy,r){ return circle(cx,cy,r,FURN); }

// ---- BEDROOM 2 (25-270,25-420) ----
furniture.push(bed(31,110,200,180,'W'));
furniture.push(nightstand(31,74,34));
furniture.push(nightstand(31,300,34));
furniture.push(wardrobe(228,31,36,180,true));
furniture.push(desk(186,340,74,34));
furniture.push(officeChair(223,310,15));
furniture.push(rug(70,170,150,100));

// ---- MASTER BEDROOM (270-625,25-420) ----
furniture.push(bed(347,31,200,210,'N'));
furniture.push(nightstand(315,52,30));
furniture.push(nightstand(552,52,30));
furniture.push(wardrobe(495,354,110,34,false));
furniture.push(rug(377,270,150,90));

// ---- MAMAD (25-330,510-875) ----
furniture.push(desk(60,540,180,38));
furniture.push(officeChair(150,605,15));
furniture.push(wardrobe(55,780,60,60,true));
furniture.push(plant(280,820,12));

// ---- ENSUITE (425-525,510-630) ----
furniture.push(vanity(431,518,80,24,1));
furniture.push(toilet(431,556,44,56,'S'));

// ---- WALK-IN CLOSET (525-625,510-630) ----
furniture.push(wardrobe(531,518,88,106,true));

// ---- MAIN BATHROOM (425-625,630-770) — fixtures pulled tight to the
// top so the full-width bottom strip (~725-764) stays clear for the label.
furniture.push(bathtub(431,636,160,44));
furniture.push(toilet(431,690,40,32,'S'));
furniture.push(vanity(500,690,90,16,2));

// ---- GUEST WC (625-735,150-260) ----
furniture.push(vanity(637,166,60,24,1));
furniture.push(toilet(649,206,42,46,'S'));

// ---- LAUNDRY (625-735,25-150) ----
furniture.push(washerDryer(637,90,40));
furniture.push(washerDryer(685,90,40));

// ---- KITCHEN (day zone north run, starts x800 to clear GWC/LAU door swings) ----
furniture.push(counter(800,31,369,54));
furniture.push(upperCabinets(800,31,369,26));
furniture.push(ovenCab(804,33,50,50));
furniture.push(hob(860,38,70,38));
furniture.push(dishwasher(940,35,48,46));
furniture.push(sinkDouble(998,40,96,36));
furniture.push(fridge(1101,31,68,68));
furniture.push(tallUnit(631,275,60,175));

// ---- ISLAND (dining-facing bar) ----
furniture.push(islandCounter(745,250,260,60,'S'));
furniture.push(barStool(795,335,15));
furniture.push(barStool(875,335,15));

// ---- DINING (table 815-1015 x 390-490) ----
furniture.push(table(815,390,200,100));
furniture.push(chair(865,370,'N'));
furniture.push(chair(965,370,'N'));
furniture.push(chair(865,510,'S'));
furniture.push(chair(965,510,'S'));
furniture.push(chair(795,440,'W'));
furniture.push(chair(1035,440,'E'));

// ---- LIVING (sofa back >=90cm clear of dining chairs at y494-526) ----
furniture.push(sofaRun(845,636,300,84,3,'N'));
furniture.push(sofaRun(1073,636,72,170,2,'E'));
furniture.push(armchair(715,740,78,70,'W'));
furniture.push(table(885,750,140,60));
furniture.push(tvConsole(865,856,200,16));
furniture.push(rug(810,610,355,225));
furniture.push(plant(1140,820,14));

// ---- BALCONY ----
furniture.push(acUnit(1186,168,68,48));
furniture.push(roundTable(1265,500,34));
furniture.push(chair(1220,500,'E'));
furniture.push(chair(1310,500,'W'));
furniture.push(plant(1195,660,10));
furniture.push(plant(1195,260,9));

// ==================================================================
// ROOM LABELS — exact NET area (clear-rect, derived from actual wall
// bands drawn above), 1 decimal.
// ==================================================================
function roomLabel(cx,cy,en,he,areaM2,fontMain=13,fontArea=9.5){
  const areaEn = `${areaM2.toFixed(1)} m²`;
  const areaHe = `${areaM2.toFixed(1)} מ"ר`;
  let out = text(cx,cy,en,`data-en="${esc(en)}" data-he="${esc(he)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="${fontMain}" letter-spacing="0.5" fill="currentColor" fill-opacity="0.88"`);
  out += text(cx,cy+fontMain+2,areaEn,`data-en="${esc(areaEn)}" data-he="${esc(areaHe)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="${fontArea}" fill="currentColor" fill-opacity="0.6"`);
  return out;
}
// For rooms too small to hold a label with 8cm clearance from fixtures:
// place the label in adjacent clear floor and point a leader line + dot at the room.
function leaderLabel(cx,cy,dotX,dotY,en,he,areaM2){
  let out = roomLabel(cx,cy,en,he,areaM2,11,8);
  labels.push(out);
  const bendX = cx, bendY = cy+16;
  dims.push(line(cx,cy+16,bendX,bendY,FURN_HAIR));
  dims.push(line(bendX,bendY,dotX,dotY,FURN_HAIR));
  dims.push(circle(dotX,dotY,2.2,`fill="none" stroke="currentColor" stroke-width="0.8" stroke-opacity="0.7"`));
}
const A_BR2   = netArea(25,25,264,414);
const A_MAST  = netArea(276,25,619,414);
const A_MAM   = netArea(30,525,315,845);
const A_HALL  = netArea(25,426,619,495);
const A_ENS   = netArea(431,516,519,624);
const A_WIC   = netArea(531,516,619,624);
const A_MBA   = netArea(431,636,619,764);
const A_ENT   = netArea(345,782,619,850);
const A_LAU   = netArea(631,25,729,144);
const A_GWC   = netArea(631,156,729,260);
const A_KITCH = 13.0;
const A_DINE  = 9.5;
const A_LIV   = 19.8;
const A_BAL   = netArea(1175,165,1355,685);

labels.push(roomLabel(128,318,'Bedroom 2','חדר שני',A_BR2));
labels.push(roomLabel(345,380,'Master Bedroom','חדר הורים',A_MAST));
labels.push(roomLabel(150,460,'Hall','מסדרון',A_HALL,12));
labels.push(roomLabel(170,700,'Safe Room (Mamad)','ממ"ד',A_MAM));
// Ensuite / W.I.C. are <1m2 — no font fits with 8cm clearance from fixtures,
// so label them in the clear hall floor with a leader line + dot, per rule.
leaderLabel(250,450,475,570,'Ensuite','חדר רחצה הורים',A_ENS);
leaderLabel(400,450,575,570,'W.I.C.','ארון',A_WIC);
labels.push(roomLabel(525,738,'Main Bathroom','חדר אמבטיה',A_MBA,11,8));
labels.push(roomLabel(482,818,'Entry','אמצפן כניסה',A_ENT,12));
labels.push(roomLabel(680,50,'Laundry','מעבדת כביסה',A_LAU,11,8));
// Guest WC is 1.0m2 — leader label into the open kitchen floor.
leaderLabel(800,195,680,208,'Guest WC','שירותים',A_GWC);
labels.push(roomLabel(1000,150,'Kitchen','מטבח',A_KITCH));
labels.push(roomLabel(915,195,'Dining','פינת אוכל',A_DINE));
labels.push(roomLabel(975,578,'Living Room','סלון',A_LIV));
labels.push(roomLabel(1265,375,'Balcony','מרפסת',A_BAL));

// ==================================================================
// DIMENSION CHAINS
// ==================================================================
function tick(x,y,ang=45){
  const r=4.2, a=ang*Math.PI/180;
  return line(x-Math.cos(a)*r,y-Math.sin(a)*r,x+Math.cos(a)*r,y+Math.sin(a)*r,DIM_TICK);
}
function dimChainH(y,pts,extYFrom,showNumbers=true){
  let out=''; out+=line(pts[0],y,pts[pts.length-1],y,DIM_LINE);
  for(let i=0;i<pts.length;i++){ out+=tick(pts[i],y); out+=line(pts[i],extYFrom,pts[i],y+(y<extYFrom?-3:3),FURN_HAIR); }
  if(showNumbers) for(let i=0;i<pts.length-1;i++){ const mid=(pts[i]+pts[i+1])/2; out+=text(mid,y-3.5,((pts[i+1]-pts[i])/100).toFixed(2),DIM_TXT); }
  return out;
}
function dimChainV(x,pts,extXFrom,showNumbers=true){
  let out=''; out+=line(x,pts[0],x,pts[pts.length-1],DIM_LINE);
  for(let i=0;i<pts.length;i++){ out+=tick(x,pts[i]); out+=line(extXFrom,pts[i],x+(x<extXFrom?3:-3),pts[i],FURN_HAIR); }
  if(showNumbers) for(let i=0;i<pts.length-1;i++){ const mid=(pts[i]+pts[i+1])/2; out+=text(0,0,((pts[i+1]-pts[i])/100).toFixed(2),DIM_TXT+` transform="translate(${n(x-6)} ${n(mid)}) rotate(-90)"`); }
  return out;
}
dims.push(dimChainH(-40, [0,25,270,625,1175,1200], 0));
dims.push(dimChainH(-68, [0,1200], -40));
dims.push(dimChainH(120, [1175,1355], 150));
dims.push(dimChainV(-40, [0,25,420,510,875,900], 0));
dims.push(dimChainV(-68, [0,900], -40));

function bubbleV(x,label){
  let out=line(x,-72,x,-84,FURN_HAIR);
  out+=circle(x,-92,10,`fill="none" stroke="currentColor" stroke-width="0.8" stroke-opacity="0.7"`);
  out+=text(x,-88.5,label,`text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="currentColor" fill-opacity="0.75"`);
  return out;
}
function bubbleH(y,label){
  let out=line(-72,y,-84,y,FURN_HAIR);
  out+=circle(-92,y,10,`fill="none" stroke="currentColor" stroke-width="0.8" stroke-opacity="0.7"`);
  out+=text(-92,y+3.5,label,`text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="currentColor" fill-opacity="0.75"`);
  return out;
}
dims.push(bubbleV(25,'1')); dims.push(bubbleV(270,'2')); dims.push(bubbleV(625,'3')); dims.push(bubbleV(1175,'4'));
dims.push(bubbleH(25,'A')); dims.push(bubbleH(420,'B')); dims.push(bubbleH(510,'C')); dims.push(bubbleH(875,'D'));

function northArrow(cx,cy){
  let out = pathEl(`M ${n(cx)} ${n(cy-30)} L ${n(cx+11)} ${n(cy+16)} L ${n(cx)} ${n(cy+7)} L ${n(cx-11)} ${n(cy+16)} Z`,
    `fill="currentColor" fill-opacity="0.85" stroke="currentColor" stroke-width="0.6"`);
  out += text(cx,cy+34,'N',`text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="13" fill="currentColor" fill-opacity="0.85"`);
  return out;
}
function scaleBar(x,y){
  const labelsArr=['0','1','2','4 m'], stops=[0,100,200,400]; let out='';
  out += line(x,y,x+400,y,`stroke="currentColor" stroke-width="1" stroke-opacity="0.8"`);
  for(let i=0;i<stops.length;i++){
    out += line(x+stops[i],y-4,x+stops[i],y+4,`stroke="currentColor" stroke-width="1" stroke-opacity="0.8"`);
    out += text(x+stops[i],y+16,labelsArr[i],`text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="9" fill="currentColor" fill-opacity="0.7"`);
  }
  out += rect(x,y-3,100,3,`fill="currentColor" fill-opacity="0.8" stroke="none"`);
  out += rect(x+200,y-3,100,3,`fill="currentColor" fill-opacity="0.8" stroke="none"`);
  return out;
}
dims.push(northArrow(-100,970));
dims.push(scaleBar(-60,1040));

// ==================================================================
// ASSEMBLE SVG
// ==================================================================
const VB = { x:-190, y:-190, w:1620, h:1300 };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" font-family="IBM Plex Mono, monospace">
<title>Floorplan — 4-room apartment, 12x9m</title>
${grp('floors', floors.join('\n'))}
${grp('walls', walls.join('\n'))}
${grp('openings', openings.join('\n'))}
${grp('furniture', furniture.join('\n'))}
${grp('dims', dims.join('\n'))}
${grp('labels', labels.join('\n'))}
</svg>`;

fs.writeFileSync(OUT, svg, 'utf8');
console.log('wrote', OUT, (Buffer.byteLength(svg,'utf8')/1024).toFixed(1)+'KB');
console.log('Areas:', {A_BR2,A_MAST,A_MAM,A_HALL,A_ENS,A_WIC,A_MBA,A_ENT,A_LAU,A_GWC,A_BAL,
  DAY_TOTAL:(A_KITCH+A_DINE+A_LIV).toFixed(1)});
