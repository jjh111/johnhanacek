// The reel's fish: smaller fish give way to the big fish and never shove it (fish-engine's
// largeRightOfWay, the rig's steering). Simulates the whole cut at 60 Hz in the renderer's own
// page (?render=1, the virtual clock) for each format, and after every engine tick reads the tank.
//   node "Agent Reference/reel-tests/fishtest.mjs" [--seed=N] [--format=wide,square,vertical]
// 1. The big fish is never shoved: after each tick its position moved by its own velocity and
//    nothing else, give or take 0.5 px (the engine moves a fish by f.x += f.vx once a tick; a push
//    from a smaller fish is anything more). The seam of an edge or a wall is allowed its 0.5 px.
// 2. Smaller fish keep off it: less than 0.5 s in the whole cut with a medium fish closer than
//    the two fishes' reach (their bodyWidths summed, about where the drawn fish touch).
// 3. No page errors.
// Printed for information: how often a school member is scared off (a dart), and the big fish's
// U-turns (its heading reversed by more than 120° within 1.5 s). Before the rule, wide shoved
// the big fish 314 px (4.3 s in contact) and square 995 px (14.8 s).
import { chromium } from 'playwright-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVerified } from '../../scripts/serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SEED = arg('seed', ''), FORMATS = arg('format', 'wide,square,vertical').split(',');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const srv = await serveVerified(ROOT);
process.on('exit', () => { try { srv.stop(); } catch (e) { /* gone */ } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });

async function run(format) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());          // the fish need no clips; an aborted clip is ready at once
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?render=1&format=${format}${SEED ? '&seed=' + SEED : ''}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.REEL || document.getElementById('err'), null, { timeout: 60000, polling: 100 });
  const failed = await page.$eval('#err', e => e.textContent).catch(() => null);
  if (failed) throw new Error(failed);
  await page.evaluate(() => window.REEL.ready);
  // with the clips aborted a seek never lands: answer it at once so REEL.frame does not wait
  await page.evaluate(() => document.querySelectorAll('video').forEach(v => Object.defineProperty(v, 'currentTime', {
    get() { return this.__ct || 0; }, set(x) { this.__ct = x; this.dispatchEvent(new Event('seeked')); } })));
  await page.evaluate(() => {
    const tank = window.REEL.debug.tank, C = window.__reelClock, tick = C.tick.bind(C);
    const S = window.__fish = { ticks: 0, shove: 0, shoveMax: 0, shoved: 0, contact: 0, darts: 0, uturns: [], hist: [] };
    const fleeing = new Map();
    C.tick = ms => {
      const before = new Map(tank.state.fish.map(f => [f.id, { x: f.x, y: f.y }]));
      tick(ms);
      S.ticks++;
      const fish = tank.state.fish;
      const big = fish.reduce((a, f) => (!a || (f.bodyWidth || 0) > (a.bodyWidth || 0) ? f : a), null);
      if (!big || (big.bodyWidth || 0) < 60) return;
      const b = before.get(big.id);
      if (b) {
        const r = Math.hypot(big.x - b.x - (big.vx || 0), big.y - b.y - (big.vy || 0));
        S.shove += r; S.shoveMax = Math.max(S.shoveMax, r); if (r > 0.5) S.shoved++;
      }
      S.hist.push(big.heading); if (S.hist.length > 90) S.hist.shift();
      if (S.hist.length === 90) {
        let d = S.hist[89] - S.hist[0]; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
        const t = S.ticks / 60;
        if (d > 2.1 && (!S.uturns.length || t - S.uturns[S.uturns.length - 1] > 1.5)) S.uturns.push(+t.toFixed(1));
      }
      let touching = false;
      for (const f of fish) {
        if (f === big) continue;
        if (Math.hypot(f.x - big.x, f.y - big.y) < (big.bodyWidth || 60) + (f.bodyWidth || 20)) touching = true;
        const now = f.state === 'fleeing' && f.lastThreatId === big.id;
        if (now && !fleeing.get(f.id)) S.darts++;
        fleeing.set(f.id, now);
      }
      if (touching) S.contact++;
    };
  });
  const dur = await page.evaluate(() => window.REEL.duration);
  for (let t = 0.5; t <= dur + 1e-6; t += 0.5) await page.evaluate(t => window.REEL.frame(t), t);
  const S = await page.evaluate(() => window.__fish);
  await ctx.close();
  return { S, errors, dur };
}

try {
  for (const format of FORMATS) {
    const { S, errors, dur } = await run(format);
    const contact = S.contact / 60;
    ok(S.shoved === 0, `${format}: the big fish is never shoved (${S.shoved} ticks over 0.5 px; ${S.shove.toFixed(1)} px in all, the most in one tick ${S.shoveMax.toFixed(2)} px)`);
    ok(contact < 0.5, `${format}: smaller fish keep off it (${contact.toFixed(2)} s within reach in ${dur} s)`);
    ok(errors.length === 0, `${format}: no page errors${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
    console.log(`info ${format}: scared off ${S.darts} times; the big fish's U-turns at ${S.uturns.join(', ') || 'none'} s`);
  }
} catch (e) {
  ok(false, e.message);
} finally {
  await browser.close();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
