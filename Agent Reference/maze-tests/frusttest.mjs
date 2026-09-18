import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto((process.env.BASE_URL || 'http://127.0.0.1:1337') + '/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);
// Since squares became CORAL (v1.11), this fixture is "food parked in a reef
// square", not "walled-off food". What must hold now:
//   - the square is open water: label says just "Food" (never "enclosed")
//   - the pellet SURVIVES (no false give-up from the hoard/near-shelter path)
//   - no seeking fish grinds forever: nobody stays 'seeking' the whole soak
// The genuine walled-off give-up mechanic is covered by navtest phase B
// (line pen, gaveUpAfterSecs measured there).
const r = await page.evaluate(async () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const draw = pts => { c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y)); pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y))); c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y)); };
  const F = designFish;
  const D = window.designDebug;
  // empty corner pen 1000..1200 x 600..780 (a coral square now)
  const rect = []; const seg = (x1,y1,x2,y2) => { for (let i=0;i<=14;i++) rect.push({x:x1+(x2-x1)*i/14, y:y1+(y2-y1)*i/14}); };
  seg(1000,600,1200,600); seg(1200,600,1200,780); seg(1200,780,1000,780); seg(1000,780,1000,606);
  draw(rect);
  const pen = D.shapes.find(s => s.type === 'rectangle');
  const fishInsideAtStart = F.state.fish.filter(f => D.pointInPoly(f.x, f.y, pen.idealPoints)).length;
  // food dead center of the coral square
  draw([{x:1100,y:690},{x:1101.5,y:691}]);
  const fd = F.state.food[F.state.food.length - 1];
  const labelAtTap = D.labels.length ? D.labels[D.labels.length - 1].text : "none";
  // watch 10s
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
    stuckSeeking: seekTimeline.every(n => n > 0),
    gaveUp: F.state.fish.filter(f => f.ignoredFood && Object.keys(f.ignoredFood).length > 0).length,
    foodSurvived: F.state.food.some(x => x.id === fd.id),
    fishCount: F.state.fish.length
  };
});
await b.close();

const fails = [];
if (r.label !== 'Food') fails.push(`label = ${r.label} — coral square is open water, must not read as enclosed`);
if (!r.foodSurvived) fails.push('food inside coral was removed — pellets must survive (no false give-up)');
if (r.stuckSeeking) fails.push('a fish sought the coral food for the whole soak — grinding');
console.log(JSON.stringify({ ...r, errs, fails, ALL_PASS: !fails.length && !errs.length }, null, 1));
process.exit(fails.length || errs.length ? 1 : 0);
