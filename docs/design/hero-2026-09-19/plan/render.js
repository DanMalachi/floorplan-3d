const { chromium } = require(require.resolve('playwright',{paths:['C:/Users/dandu/fp-wt/a11y-compliance']}));
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const svg = fs.readFileSync(path.join(DIR,'plan.svg'),'utf8');

function page(bg,color){
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:${bg};}
  .wrap{color:${color};background:${bg};display:inline-block;}
  svg{display:block;}
  </style></head><body><div class="wrap">${svg}</div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const jobs = [
    {name:'dark_1600', bg:'#101014', color:'#ECEAE5', width:1600},
    {name:'light_1600', bg:'#F8F7F4', color:'#2B2925', width:1600},
    {name:'dark_700', bg:'#101014', color:'#ECEAE5', width:700},
    {name:'light_700', bg:'#F8F7F4', color:'#2B2925', width:700},
  ];
  for(const job of jobs){
    const p = await browser.newPage({viewport:{width:job.width, height:Math.round(job.width*0.85)}});
    await p.setContent(page(job.bg,job.color), {waitUntil:'load'});
    // scale svg to fill width
    await p.evaluate((w)=>{
      const el = document.querySelector('svg');
      el.setAttribute('width', String(w));
      el.removeAttribute('height');
    }, job.width);
    const svgEl = await p.$('svg');
    await svgEl.screenshot({path: path.join(DIR, `render_${job.name}.png`)});
    await p.close();
  }
  await browser.close();
  console.log('done');
})();
