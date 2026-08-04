import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error' && !/ERR_|net::|404/.test(m.text())) errs.push(m.text().split('\n')[0]); });
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1500);

const r = await page.evaluate(async () => {
  const out = {};
  const F = window.designFish;
  out.boot = { engineUp: !!F, seededFish: F ? F.state.fish.length : -1, jellyfish: F ? F.state.jellyfish.length : -1 };

  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const drawPts = pts => {
    c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y));
    pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y)));
    c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y));
  };
  const externals = () => F.state.coral.filter(k => k.isExternal).length;

  // 1. square -> wall + obstacle
  const sq = [];
  const seg = (x1,y1,x2,y2,n) => { for (let i=0;i<=n;i++) sq.push({x:x1+(x2-x1)*i/n, y:y1+(y2-y1)*i/n}); };
  seg(300,300,460,300,10); seg(460,300,460,440,10); seg(460,440,300,440,10); seg(300,440,300,305,10);
  drawPts(sq);
  out.square = { shapes: recognizedShapes.map(s => s.type), obstacles: externals() };

  // 2. loop + tail -> fish
  const loop = [];
  for (let i = 0; i <= 50; i++) { const a = (i/44)*Math.PI*2; loop.push({x:700+Math.cos(a)*50, y:350+Math.sin(a)*50}); }
  for (let i = 1; i <= 12; i++) loop.push({x:750+i*6, y:350-i*2});
  const fishBefore = F.state.fish.length;
  drawPts(loop);
  out.fish = { before: fishBefore, after: F.state.fish.length };

  // 3. tap -> food (fish exist)
  const foodBefore = F.state.food.length;
  drawPts([{x:900,y:500},{x:902,y:501}]);
  out.food = { before: foodBefore, after: F.state.food.length, dotShapes: recognizedShapes.filter(s=>s.type==='dot').length };

  // 4. scratch-out ACROSS the square -> erased.
  //    Erase is crossing-based: the stroke has to cut the wall's outline ≥3
  //    times. Passes overshoot both edges (270 → 490 spans the 300..460 square)
  //    the way a hand does when scrubbing something out. A scribble kept
  //    strictly inside the shape crosses nothing and deliberately does NOT erase.
  const sqg = [];
  for (let i = 0; i <= 3; i++) {
    const y = 320 + i * 35;
    sqg.push({ x: i % 2 === 0 ? 270 : 490, y });
    sqg.push({ x: i % 2 === 0 ? 490 : 270, y: y + 17 });
  }
  drawPts(sqg);
  out.squiggle = { shapesLeft: recognizedShapes.map(s=>s.type), obstacles: externals(), fishSurvived: F.state.fish.length };

  // 5. clear button -> shapes go, fish stay
  const sq2 = []; const seg2=(x1,y1,x2,y2,n)=>{for(let i=0;i<=n;i++)sq2.push({x:x1+(x2-x1)*i/n,y:y1+(y2-y1)*i/n});};
  seg2(900,250,1020,250,10); seg2(1020,250,1020,370,10); seg2(1020,370,900,370,10); seg2(900,370,900,255,10);
  drawPts(sq2);
  const preClear = { shapes: recognizedShapes.length, obstacles: externals() };
  document.getElementById('clearCanvas').click();
  await new Promise(res => setTimeout(res, 100));
  out.clear = { preShapes: preClear.shapes, preObstacles: preClear.obstacles, postShapes: recognizedShapes.length, postObstacles: externals(), fishSurvived: F.state.fish.length };
  return out;
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/claude-0/-home-user-johnhanacek/aa3f3153-416b-5024-a090-d2507c59e8ef/scratchpad/maze-shot.png', clip: { x: 0, y: 0, width: 1280, height: 800 } });
console.log(JSON.stringify({ ...r, errs }, null, 1));
await b.close();
