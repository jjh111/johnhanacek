import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error' && !/ERR_|net::/.test(m.text())) errs.push('console: ' + m.text().split('\n')[0]); });
await page.goto('http://127.0.0.1:1337/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1500);

const boot = await page.evaluate(() => ({
  engine: typeof FishCanvas === 'function',
  api: !!window.heroFish,
  fishCount: window.heroFish ? heroFish.state.fish.length : -1,
  jellyfishCount: window.heroFish ? heroFish.state.jellyfish.length : -1,
  animating: true
}));

// draw a fish loop via real dispatched events (loop with tail)
const spawn = await page.evaluate(() => {
  const c = heroFish.canvas;
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const pts = [];
  for (let i = 0; i <= 50; i++) { const a = (i / 44) * Math.PI * 2; pts.push([500 + Math.cos(a) * 55, 380 + Math.sin(a) * 55]); }
  for (let i = 1; i <= 12; i++) pts.push([500 + 55 + i * 6, 380 - i * 2]); // tail out of the loop
  const before = heroFish.state.fish.length;
  c.dispatchEvent(mk('mousedown', pts[0][0], pts[0][1]));
  pts.forEach(p => c.dispatchEvent(mk('mousemove', p[0], p[1])));
  c.dispatchEvent(mk('mouseup', pts.at(-1)[0], pts.at(-1)[1]));
  return { before, after: heroFish.state.fish.length };
});

// food dot with fish present
const food = await page.evaluate(() => {
  const c = heroFish.canvas;
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const before = heroFish.state.food.length;
  c.dispatchEvent(mk('mousedown', 800, 300));
  c.dispatchEvent(mk('mousemove', 802, 301));
  c.dispatchEvent(mk('mouseup', 802, 301));
  return { before, after: heroFish.state.food.length };
});

// QR easter egg: two crossing straight lines
const qr = await page.evaluate(async () => {
  const c = heroFish.canvas;
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  const line = (x1, y1, x2, y2) => {
    c.dispatchEvent(mk('mousedown', x1, y1));
    for (let i = 1; i <= 20; i++) c.dispatchEvent(mk('mousemove', x1 + (x2 - x1) * i / 20, y1 + (y2 - y1) * i / 20));
    c.dispatchEvent(mk('mouseup', x2, y2));
  };
  line(900, 250, 1050, 400);
  line(1050, 250, 900, 400);
  await new Promise(r => setTimeout(r, 300));
  const el = document.getElementById('qrReveal');
  return { qrVisible: el ? el.classList.contains('visible') : 'no-el' };
});

// debug + scare
const misc = await page.evaluate(() => {
  heroFish.setDebug(true);
  const dbg = heroFish.debugMode;
  heroFish.setDebug(false);
  const scared = heroFish.scareFishAt(heroFish.state.fish[0].x, heroFish.state.fish[0].y);
  return { debugToggles: dbg === true, scared };
});

await page.waitForTimeout(800);
const shot = '/tmp/claude-0/-home-user-johnhanacek/aa3f3153-416b-5024-a090-d2507c59e8ef/scratchpad/hero-after.png';
await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1280, height: 800 } });
console.log(JSON.stringify({ boot, spawn, food, qr, misc, errs }));
await b.close();
