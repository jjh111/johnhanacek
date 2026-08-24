import { chromium } from 'playwright-core';
const PORT = process.env.PORT || 56150;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await (await b.newContext({ viewport:{width:1000,height:1200} })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text().slice(0,120)); });
await p.goto(`http://localhost:${PORT}/Assets/DemosPlayground/pretext-wrap-test.html`, { waitUntil:'load', timeout:30000 });
await p.waitForTimeout(1500);

const r = await p.evaluate(() => {
  const out = {};
  for (const id of ['p1','p2']) {
    const host = document.getElementById(id);
    const hb = host.getBoundingClientRect();
    const mark = host.querySelector('.mark').getBoundingClientRect();
    const lines = [...host.querySelectorAll('.pretext-line')]
      .filter(d => d.style.display !== 'none')
      .map(d => { const r = d.getBoundingClientRect();
        return { x: Math.round(r.left-hb.left), y: Math.round(r.top-hb.top), w: Math.round(r.width) }; });
    // Rows carrying MORE THAN ONE line box are the two-sided rows.
    const byRow = new Map();
    for (const l of lines) byRow.set(l.y, (byRow.get(l.y)||0)+1);
    const twoSided = [...byRow.values()].filter(n => n > 1).length;
    // Does any line overlap the mark horizontally at its own height?
    const overlaps = lines.filter(l => {
      const top = hb.top + l.y, bot = top + 30;
      if (bot <= mark.top || top >= mark.bottom) return false;
      const ll = hb.left + l.x, lr = ll + l.w;
      return lr > mark.left && ll < mark.right;
    }).length;
    out[id] = { lines: lines.length, rows: byRow.size, twoSidedRows: twoSided, overlapsMark: overlaps,
                srOnlyChars: (host.querySelector('.pretext-source')||{textContent:''}).textContent.length,
                layerHidden: host.querySelector('.pretext-layer')?.getAttribute('aria-hidden') };
  }
  return { results: window.__wrapResults, out };
});
console.log('module:', r.results);
for (const [k,v] of Object.entries(r.out)) console.log(k, JSON.stringify(v));
console.log('errors:', errs.length ? errs : 'none');
await b.close();
