import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto((process.env.BASE_URL || 'http://127.0.0.1:1337') + '/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);
const r = await page.evaluate(async () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const draw = pts => { c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y)); pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y))); c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y)); };
  const F = designFish;
  const D = window.designDebug;
  // empty corner pen 1000..1200 x 600..780
  const rect = []; const seg = (x1,y1,x2,y2) => { for (let i=0;i<=14;i++) rect.push({x:x1+(x2-x1)*i/14, y:y1+(y2-y1)*i/14}); };
  seg(1000,600,1200,600); seg(1200,600,1200,780); seg(1200,780,1000,780); seg(1000,780,1000,606);
  draw(rect);
  const pen = D.shapes.find(s => s.type === 'rectangle');
  const fishInsideAtStart = F.state.fish.filter(f => D.pointInPoly(f.x, f.y, pen.idealPoints)).length;
  // food dead center of the empty pen
  draw([{x:1100,y:690},{x:1101.5,y:691}]);
  const fd = F.state.food[F.state.food.length - 1];
  const labelAtTap = D.labels.length ? D.labels[D.labels.length - 1].text : "none";
  // watch 10s: fish should try, give up, and food should survive
  const seekTimeline = [];
  const start = Date.now();
  while (Date.now() - start < 10000) {
    await new Promise(r2 => setTimeout(r2, 500));
    seekTimeline.push(F.state.fish.filter(f => f.state === 'seeking').length);
  }
  return {
    fishInsideAtStart,
    label: labelAtTap,
    seekTimeline,
    gaveUp: F.state.fish.filter(f => f.ignoredFood && Object.keys(f.ignoredFood).length > 0).length,
    foodSurvived: F.state.food.some(x => x.id === fd.id),
    fishCount: F.state.fish.length
  };
});
console.log(JSON.stringify({ ...r, errs }));
await b.close();
