import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);

// Containment + standoff. Squares are CORAL now (open water), so the enclosure
// is built from LINE strokes — lines are walls. (The old squiggle-detector
// phases died with the crossing-based erase rewrite; mazetest + humantest
// cover erase behaviour now.)
const contain = await page.evaluate(async () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const draw = pts => { c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y)); pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y))); c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y)); };
  const line = (x1,y1,x2,y2) => { const r=[]; for(let i=0;i<=12;i++)r.push({x:x1+(x2-x1)*i/12,y:y1+(y2-y1)*i/12}); draw(r); };
  // box of 4 line walls forming an enclosure 450..830 x 350..650
  line(450,330,830,380);   // top bar
  line(450,600,830,650);   // bottom bar
  line(450,380,510,600);   // left bar
  line(770,380,830,600);   // right bar
  // spawn a couple more fish outside (medium loop + large loop)
  const loop = (cx,cy,r) => { const l=[]; for(let i=0;i<=50;i++){const a=(i/44)*Math.PI*2;l.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});} for(let i=1;i<=12;i++)l.push({x:cx+r+i*6,y:cy-i*2}); return l; };
  draw(loop(200, 200, 55));
  draw(loop(1050, 700, 85));
  const F = designFish;
  const walls = F.state.coral.filter(k => k.isExternal).map(k => ({ minX: k.x - k.shape.width/2, maxX: k.x + k.shape.width/2, minY: k.y - k.shape.height, maxY: k.y }));
  let penetrations = 0, samples = 0;
  let minWallDist = { small: 1e9, medium: 1e9, large: 1e9 };
  const tier = bw => bw >= 60 ? 'large' : bw >= 35 ? 'medium' : 'small';
  const start = Date.now();
  while (Date.now() - start < 12000) {
    await new Promise(r => setTimeout(r, 80));
    for (const f of F.state.fish) {
      samples++;
      for (const w of walls) {
        const inside = f.x > w.minX && f.x < w.maxX && f.y > w.minY && f.y < w.maxY;
        if (inside) penetrations++;
        const dx = Math.max(w.minX - f.x, 0, f.x - w.maxX);
        const dy = Math.max(w.minY - f.y, 0, f.y - w.maxY);
        const d = Math.sqrt(dx * dx + dy * dy);
        const t = tier(f.bodyWidth || 20);
        if (d < minWallDist[t]) minWallDist[t] = d;
      }
    }
  }
  return { wallCount: walls.length, fishCount: F.state.fish.length,
           tiers: F.state.fish.map(f => tier(f.bodyWidth || 20)),
           samples, penetrations,
           minWallDist: Object.fromEntries(Object.entries(minWallDist).map(([k,v]) => [k, v === 1e9 ? null : Math.round(v)])) };
});
console.log(JSON.stringify({ contain, errs }, null, 1));
await b.close();
