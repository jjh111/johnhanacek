/**
 * navtest.mjs — fish must be guidable around walls by food.
 *
 * The headline capability of the navigation field: local steering can round a
 * convex obstacle but cannot escape a pen or find a gap. These assert that a
 * fish routes through an opening to reach food it cannot swim straight to, that
 * genuinely unreachable food is abandoned promptly rather than ground against,
 * and that a page with no walls is completely unaffected.
 *
 * Note DETECT_RANGE is 400px — food outside that is never sought, so every
 * layout here keeps fish and food well inside it.
 */
import { chromium } from 'playwright-core';

const CH = process.env.CHROMIUM_PATH;
const b = await chromium.launch({ executablePath: CH });
const errs = [];

const HELPERS = () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  window.__h = (pts, speed = 22) => {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b2 = pts[i];
      const d = Math.hypot(b2.x - a.x, b2.y - a.y);
      const n = Math.max(1, Math.round(d / speed));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ x: a.x + (b2.x - a.x) * t, y: a.y + (b2.y - a.y) * t });
      }
    }
    out.push(pts[pts.length - 1]);
    c.dispatchEvent(mk('mousedown', out[0].x, out[0].y));
    out.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y)));
    c.dispatchEvent(mk('mouseup', out.at(-1).x, out.at(-1).y));
  };
  window.__fishAt = (cx, cy, r0) => {
    const l = [];
    for (let a = -0.6; a <= Math.PI * 2 + 0.7; a += 0.26) l.push({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 });
    window.__h(l, 12);
  };
  window.__clear = () => document.querySelectorAll('button').forEach(x => { if (/clear/i.test(x.textContent)) x.click(); });
};

// ---- A. led through a gap ----------------------------------------------
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.evaluate(HELPERS);

const gap = await page.evaluate(async () => {
  window.__clear();
  await new Promise(r => setTimeout(r, 250));
  // vertical barrier at x=640 in two pieces, leaving a gap at y 420..520
  window.__h([{ x: 640, y: 120 }, { x: 640, y: 420 }], 18);
  await new Promise(r => setTimeout(r, 300));
  window.__h([{ x: 640, y: 520 }, { x: 640, y: 800 }], 18);
  await new Promise(r => setTimeout(r, 400));
  window.__fishAt(500, 300, 42);                 // fish on the LEFT
  await new Promise(r => setTimeout(r, 600));
  const startFish = designFish.state.fish.length;
  designFish.addFood(790, 300);                  // food on the RIGHT, 290px away
  const foodId = designFish.state.food.at(-1).id;

  // Did any fish cross the barrier and eat within 30s?
  const start = Date.now();
  let crossed = false, eaten = false, minX = 1e9, maxX = -1e9;
  while (Date.now() - start < 30000) {
    await new Promise(r => setTimeout(r, 100));
    for (const f of designFish.state.fish) {
      minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x);
      if (f.x > 680) crossed = true;
    }
    if (!designFish.state.food.some(x => x.id === foodId)) { eaten = true; break; }
  }
  return {
    fishCount: startFish, crossedBarrier: crossed, ateFood: eaten,
    travelledTo: Math.round(maxX), secs: +((Date.now() - start) / 1000).toFixed(1)
  };
});

await page.close();

// ---- B. sealed food is abandoned promptly -------------------------------
// Fresh page: a fish already swimming where the pen gets drawn is CORRECTLY
// enclosed ("draw a pen round a fish and it's caught"), so only fish that
// started outside can count as intruders. The pen goes in the lower right,
// clear of the centre-screen seed fish.
const pageB = await b.newPage({ viewport: { width: 1280, height: 900 } });
pageB.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await pageB.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await pageB.waitForTimeout(1200);
await pageB.evaluate(HELPERS);
const sealed = await pageB.evaluate(async () => {
  const PEN = { x0: 800, x1: 1060, y0: 550, y1: 780 };
  const inPen = f => f.x > PEN.x0 && f.x < PEN.x1 && f.y > PEN.y0 && f.y < PEN.y1;
  const r2 = [], seg = (x1, y1, x2, y2) => { for (let i = 0; i <= 12; i++) r2.push({ x: x1 + (x2 - x1) * i / 12, y: y1 + (y2 - y1) * i / 12 }); };
  seg(PEN.x0, PEN.y0, PEN.x1, PEN.y0); seg(PEN.x1, PEN.y0, PEN.x1, PEN.y1);
  seg(PEN.x1, PEN.y1, PEN.x0, PEN.y1); seg(PEN.x0, PEN.y1, PEN.x0, PEN.y0 + 6);
  window.__h(r2, 20);
  await new Promise(r => setTimeout(r, 500));
  window.__fishAt(690, 660, 42);                  // fish OUTSIDE, beside the pen
  await new Promise(r => setTimeout(r, 700));

  const outsiders = designFish.state.fish.filter(f => !inPen(f)).map(f => f.id);
  const trappedAtStart = designFish.state.fish.filter(inPen).length;
  designFish.addFood(930, 665);                   // food INSIDE, ~240px away

  const start = Date.now();
  let gaveUpAt = null, intrusions = 0;
  while (Date.now() - start < 12000) {
    await new Promise(r => setTimeout(r, 100));
    for (const f of designFish.state.fish) if (outsiders.includes(f.id) && inPen(f)) intrusions++;
    const outsiderGaveUp = designFish.state.fish
      .some(f => outsiders.includes(f.id) && f.ignoredFood && Object.keys(f.ignoredFood).length);
    if (outsiderGaveUp && gaveUpAt === null) gaveUpAt = +((Date.now() - start) / 1000).toFixed(1);
    if (gaveUpAt !== null && Date.now() - start > 4000) break;
  }
  return {
    outsideFish: outsiders.length,
    trappedAtStart,
    gaveUpAfterSecs: gaveUpAt,
    foodSurvived: designFish.state.food.length > 0,
    intrusions
  };
});
await pageB.close();

// ---- C. no walls, no change --------------------------------------------
const page2 = await b.newPage({ viewport: { width: 1280, height: 900 } });
page2.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page2.goto('http://127.0.0.1:1337/index.html', { waitUntil: 'load' });
await page2.waitForTimeout(2000);
const open = await page2.evaluate(async () => {
  const before = heroFish.state.food.length;
  heroFish.addFood(640, 400);
  const start = Date.now();
  let eaten = false;
  while (Date.now() - start < 25000) {
    await new Promise(r => setTimeout(r, 100));
    if (heroFish.state.food.length < before + 1) { eaten = true; break; }
  }
  return { ateInOpenWater: eaten, secs: +((Date.now() - start) / 1000).toFixed(1) };
});
await page2.close();
await b.close();

const fails = [];
if (!gap.crossedBarrier || !gap.ateFood) fails.push('A: fish was not led through the gap');
if (sealed.gaveUpAfterSecs === null) fails.push('B: fish never abandoned sealed food');
if (!sealed.foodSurvived) fails.push('B: sealed food was eaten through a wall');
if (sealed.intrusions) fails.push('B: fish got inside a sealed pen');
if (!open.ateInOpenWater) fails.push('C: open-water seeking regressed');

console.log(JSON.stringify({
  A_ledThroughGap: gap,
  B_sealedFoodAbandoned: sealed,
  C_openWaterUnaffected: open,
  errs, fails, ALL_PASS: !fails.length && !errs.length
}, null, 1));
process.exit(fails.length || errs.length ? 1 : 0);
