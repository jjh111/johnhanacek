/**
 * zigedge.mjs — erase edge cases.
 *
 * Rewritten for the crossing-count erase (v1.10). The old version called the
 * page-internal `isSquiggle()` directly and asserted on dense synthetic
 * zigzags — both that function and that whole approach are gone. Erase is now
 * relational: a stroke erases a wall when it crosses that wall's outline ≥3
 * times, so these cases assert on OBSERVED erase behaviour instead.
 */
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1000);

const r = await page.evaluate(async () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const draw = pts => {
    c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y));
    pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y)));
    c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y));
  };
  const clear = () => document.getElementById('clearCanvas').click();
  // wall: 400..700 x 300..520
  const pen = () => {
    const r2 = [], seg = (x1, y1, x2, y2) => { for (let i = 0; i <= 12; i++) r2.push({ x: x1 + (x2 - x1) * i / 12, y: y1 + (y2 - y1) * i / 12 }); };
    seg(400, 300, 700, 300); seg(700, 300, 700, 520); seg(700, 520, 400, 520); seg(400, 520, 400, 306);
    draw(r2);
  };
  const trial = async (name, fn) => {
    clear();
    await new Promise(r2 => setTimeout(r2, 200));
    pen();
    await new Promise(r2 => setTimeout(r2, 350));
    const before = recognizedShapes.length;
    fn();
    await new Promise(r2 => setTimeout(r2, 350));
    return { name, erased: recognizedShapes.length < before };
  };

  const out = [];
  // sharp dense zigzag that crosses the wall — must erase
  out.push(await trial('sharp zigzag across wall', () => {
    const z = [];
    for (let pass = 0; pass < 4; pass++) {
      const dir = pass % 2 === 0 ? 1 : -1;
      for (let i = 0; i <= 20; i++) z.push({ x: dir > 0 ? 360 + i * 19 : 740 - i * 19, y: 340 + pass * 45 });
    }
    draw(z);
  }));
  // very small scribble far from any wall — must NOT erase, must not throw
  out.push(await trial('tiny scribble on empty canvas', () => {
    const t = [];
    for (let pass = 0; pass < 7; pass++) {
      const dir = pass % 2 === 0 ? 1 : -1;
      for (let i = 0; i <= 10; i++) t.push({ x: dir > 0 ? 950 + i * 4 : 990 - i * 4, y: 700 + pass * 6 });
    }
    draw(t);
  }));
  // two-point flick straight through the wall — 2 crossings, under the bar
  out.push(await trial('single flick through wall', () => draw([{ x: 350, y: 410 }, { x: 760, y: 415 }])));
  // a stroke clipping one corner — 2 crossings at most
  out.push(await trial('corner clip', () => draw([{ x: 380, y: 340 }, { x: 440, y: 280 }])));
  return out;
});

const expected = {
  'sharp zigzag across wall': true,
  'tiny scribble on empty canvas': false,
  'single flick through wall': false,
  'corner clip': false
};
const fails = r.filter(x => x.erased !== expected[x.name]);
console.log(JSON.stringify({ results: r, fails: fails.map(f => f.name), errs, ALL_PASS: !fails.length && !errs.length }, null, 1));
await b.close();
process.exit(fails.length || errs.length ? 1 : 0);
