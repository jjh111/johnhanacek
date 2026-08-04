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

  // horizontal line wall at y=400, x 400..700
  const line = []; for (let i = 0; i <= 30; i++) line.push({ x: 400 + i * 10, y: 400 + (Math.random() - 0.5) * 2 });
  draw(line);
  const lineWall = recognizedShapes.find(s => s.type === 'line' || s.type === 'arrow');

  const tap = (x, y) => {
    const before = F.state.food.length;
    draw([{ x, y }, { x: x + 1.5, y: y + 1 }]);
    const f = F.state.food[F.state.food.length - 1];
    return F.state.food.length > before ? { dx: Math.round(f.x - x), dy: Math.round(f.y - y) } : 'no-food';
  };

  // taps at increasing distance from the line — 30px+ away must have ZERO offset
  const at30 = tap(550, 430);   // 30px below line
  const at60 = tap(550, 460);   // 60px below
  const at120 = tap(550, 520);  // 120px below
  const onLine = tap(550, 401); // right on it
  const farAway = tap(1000, 700);

  // diagonal line containment: draw diagonal, sim, check block penetrations
  const diag = []; for (let i = 0; i <= 30; i++) diag.push({ x: 850 + i * 8, y: 250 + i * 11 });
  draw(diag);
  const blocks = F.state.coral.filter(k => k.isExternal).map(k => ({ minX: k.x - k.shape.width/2, maxX: k.x + k.shape.width/2, minY: k.y - k.shape.height, maxY: k.y }));
  // spawn a fish near the diagonal
  const loop = []; for (let i=0;i<=50;i++){const a=(i/44)*Math.PI*2;loop.push({x:950+Math.cos(a)*55,y:250+Math.sin(a)*55});} for(let i=1;i<=12;i++)loop.push({x:1005+i*6,y:250-i*2});
  draw(loop);
  let penetrations = 0, samples = 0;
  const start = Date.now();
  while (Date.now() - start < 8000) {
    await new Promise(r2 => setTimeout(r2, 80));
    for (const f of F.state.fish) { samples++; for (const w of blocks) if (f.x > w.minX && f.x < w.maxX && f.y > w.minY && f.y < w.maxY) penetrations++; }
  }
  return { lineRecognized: !!lineWall, wallBlocks: blocks.length,
           offsets: { at30, at60, at120, onLine, farAway },
           containment: { samples, penetrations, fish: F.state.fish.length } };
});
console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
