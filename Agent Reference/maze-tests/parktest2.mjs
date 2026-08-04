import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);
const r = await page.evaluate(async () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const draw = pts => { c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y)); pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y))); c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y)); };
  const F = designFish;
  const vline = []; for (let i = 0; i <= 40; i++) vline.push({ x: 640, y: 150 + i * 15 });
  draw(vline);
  const loop = (cx,cy,r0) => { const l=[]; for(let i=0;i<=50;i++){const a=(i/44)*Math.PI*2;l.push({x:cx+Math.cos(a)*r0,y:cy+Math.sin(a)*r0});} for(let i=1;i<=12;i++)l.push({x:cx+r0+i*5,y:cy-i*2}); return l; };
  draw(loop(300, 300, 40)); draw(loop(900, 300, 60)); draw(loop(1000, 650, 85));
  draw([{x:700,y:450},{x:701.5,y:451}]); // food behind the line for lefty fish

  const walls = F.state.coral.filter(k => k.isExternal).map(k => ({ minX: k.x - k.shape.width/2 - 10, maxX: k.x + k.shape.width/2 + 10, minY: k.y - k.shape.height - 10, maxY: k.y + 10 }));
  const hist = {};
  const stuckStreak = {}, maxStuck = {};
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await new Promise(r2 => setTimeout(r2, 100));
    for (const f of F.state.fish) {
      (hist[f.id] = hist[f.id] || []).push({ x: f.x, y: f.y });
      const h = hist[f.id];
      const near = walls.some(w => f.x > w.minX && f.x < w.maxX && f.y > w.minY && f.y < w.maxY);
      let stuck = false;
      if (near && h.length > 20) {
        const p0 = h[h.length - 21];
        stuck = Math.hypot(f.x - p0.x, f.y - p0.y) < 15; // <15px over 2s while at a wall
      }
      stuckStreak[f.id] = stuck ? (stuckStreak[f.id] || 0) + 1 : 0;
      maxStuck[f.id] = Math.max(maxStuck[f.id] || 0, stuckStreak[f.id]);
    }
  }
  return { fish: F.state.fish.length, maxStuckStreaks: Object.values(maxStuck) };
});
console.log(JSON.stringify({ ...r, errs }));
await b.close();
