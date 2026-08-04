import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);

// Phase 1: squiggle realism — sloppy hand-like zigzag (rounded turns, dense points)
const sq = await page.evaluate(() => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const draw = pts => { c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y)); pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y))); c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y)); };
  // wall to erase
  const box = []; const seg=(x1,y1,x2,y2)=>{for(let i=0;i<=12;i++)box.push({x:x1+(x2-x1)*i/12,y:y1+(y2-y1)*i/12});};
  seg(500,300,640,300); seg(640,300,640,420); seg(640,420,500,420); seg(500,420,500,305);
  draw(box);
  const wallsBefore = recognizedShapes.length;
  // sloppy zigzag: 6 passes, rounded turns, wobble, dense sampling (like coalesced events)
  const zig = [];
  for (let pass = 0; pass < 6; pass++) {
    const y0 = 310 + pass * 18, dir = pass % 2 === 0 ? 1 : -1;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = dir > 0 ? 505 + t * 125 : 630 - t * 125;
      const y = y0 + Math.sin(t * Math.PI) * 6 + (Math.random() - 0.5) * 3; // wobbly, rounded
      zig.push({ x, y });
    }
  }
  draw(zig);
  const detected = typeof isSquiggle === 'function' ? isSquiggle(zig) : 'n/a';
  return { wallsBefore, wallsAfter: recognizedShapes.length, detectorSaysSquiggle: detected, fish: designFish.state.fish.length };
});

// Phase 2: clean shapes must NOT squiggle-trigger; loop must still be a fish
const shapes = await page.evaluate(() => {
  const circ = n => Array.from({length:n+1},(_,i)=>{const a=(i/n)*Math.PI*2;return{x:300+Math.cos(a)*70,y:600+Math.sin(a)*70};});
  const tri = []; const seg=(x1,y1,x2,y2)=>{for(let i=0;i<=15;i++)tri.push({x:x1+(x2-x1)*i/15,y:y1+(y2-y1)*i/15});};
  seg(800,650,870,540); seg(870,540,940,650); seg(940,650,805,652);
  const loop = []; for (let i=0;i<=50;i++){const a=(i/44)*Math.PI*2;loop.push({x:1000+Math.cos(a)*50,y:300+Math.sin(a)*50});} for(let i=1;i<=12;i++)loop.push({x:1050+i*6,y:300-i*2});
  return { circleIsSquiggle: isSquiggle(circ(40)), triIsSquiggle: isSquiggle(tri), loopIsSquiggle: isSquiggle(loop) };
});

// Phase 3: containment — box of 4 walls around center, fish outside must stay out,
// and record how close fish get to walls (standoff check)
const contain = await page.evaluate(async () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const draw = pts => { c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y)); pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y))); c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y)); };
  const rect = (x1,y1,x2,y2) => { const r=[]; const seg=(a,b,d,e)=>{for(let i=0;i<=12;i++)r.push({x:a+(d-a)*i/12,y:b+(e-b)*i/12});}; seg(x1,y1,x2,y1); seg(x2,y1,x2,y2); seg(x2,y2,x1,y2); seg(x1,y2,x1,y1+4); return r; };
  // 4 thin box walls forming an enclosure 450..830 x 350..650
  draw(rect(450,330,830,380));   // top bar
  draw(rect(450,600,830,650));   // bottom bar
  draw(rect(450,380,510,600));   // left bar
  draw(rect(770,380,830,600));   // right bar
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
console.log(JSON.stringify({ sq, shapes, contain, errs }, null, 1));
await b.close();
