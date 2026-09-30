// Directing the fish: the script's `fish` lines, played by the rig on the renderer's own clock.
//   node "Agent Reference/reel-tests/fishdirecttest.mjs" [--format=wide,square,vertical]
// Writes a copy of the cut with fish lines in its results scene (Assets/zz-fish-test.script.txt,
// removed in finally), plays it in render mode (?render=1, the virtual clock, every engine tick)
// and reads the tank as it goes:
//   1. `big to 0.8 0.85`: the big fish swims to that point and holds there
//   2. `school to 0.2 0.78`: the school's centre goes there
//   3. `school scatter`: the school's phase is scatter at once and the school spreads out
//   4. `big idle circle`: the big fish swims round its spot
//   5. `feed 0.5 0.8`: food lands at its time
//   6. `big dart`: the big fish bursts forward; `big turn`: it turns round
//   7. `all look off` + `big idle wander`: the engine has the big fish again (no host steer)
//   8. without fish lines the same page swims as before (the director is transparent): checked
//      by fishtest.mjs and, against the committed rig, by hand (0 px over the whole cut)
//   9. no page errors
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVerified } from '../../scripts/serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RS = createRequire(import.meta.url)(resolve(ROOT, 'scripts/reel-script.js'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const FORMATS = arg('format', 'wide').split(',');
const NAME = 'zz-fish-test.script.txt', TMP = resolve(ROOT, 'Assets', NAME);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// the cut, its own fish lines taken out (John's direction would steer these fish too), with
// this suite's lines in its results scene
let src = readFileSync(resolve(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8').split('\n').filter(l => !/^\s*fish\s/.test(l)).join('\n');
const P0 = RS.parse(src);
const resIdx = P0.edit.scenes.findIndex(s => s.type === 'results');
const res = P0.marks.find(m => m.kind === 'scene' && m.obj === P0.edit.scenes[resIdx]);
const LINES = ['@0.5 big to 0.8 0.85', '@0.5 school to 0.2 0.78', '@4 school scatter', '@5 big idle circle',
  '@9.5 big dart', '@10.5 big turn', '@12 all look off', '@12 big idle wander', '@12.5 feed 0.5 0.8'];
for (const l of LINES.slice().reverse()) src = RS.addLine(src, res.ln, 'fish', l);
const R0 = RS.spans(RS.parse(src).edit)[resIdx].start;
const T = s => +(R0 + s).toFixed(4);          // a time in the results scene, in reel seconds

const srv = await serveVerified(ROOT);
process.on('exit', () => { try { srv.stop(); } catch (e) { /* gone */ } try { unlinkSync(TMP); } catch (e) { /* gone */ } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });

async function run(format) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?render=1&format=${format}&script=${NAME}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.REEL || document.getElementById('err'), null, { timeout: 60000, polling: 100 });
  const failed = await page.$eval('#err', e => e.textContent).catch(() => null);
  if (failed) throw new Error(failed);
  await page.evaluate(() => window.REEL.ready);
  await page.evaluate(() => document.querySelectorAll('video').forEach(v => Object.defineProperty(v, 'currentTime', {
    get() { return this.__ct || 0; }, set(x) { this.__ct = x; this.dispatchEvent(new Event('seeked')); } })));
  const size = await page.evaluate(() => window.REEL.size);
  // what the tank holds at t, in stage px
  const at = t => page.evaluate(async t => {
    await window.REEL.frame(t);
    const tank = window.REEL.debug.tank, fish = tank.state.fish, y0 = window.REEL.debug.tankY;
    const big = fish.reduce((a, f) => (!a || (f.bodyWidth || 0) > (a.bodyWidth || 0) ? f : a), null);
    const school = fish.filter(f => f !== big && f.bodyWidth >= 35 && f.bodyWidth < 60);
    const cx = school.reduce((a, f) => a + f.x, 0) / (school.length || 1), cy = school.reduce((a, f) => a + f.y, 0) / (school.length || 1);
    return {
      big: big && { x: big.x, y: big.y + y0, h: big.heading, v: Math.hypot(big.vx || 0, big.vy || 0), steered: !!(big.reelAct || big.reelHold != null) },
      school: { n: school.length, x: cx, y: cy + y0, spread: Math.max(0, ...school.map(f => Math.hypot(f.x - cx, f.y - cy))) },
      phase: window.schoolPhase, food: tank.state.food.length,
    };
  }, t);
  const W = size[0], H = size[1], R = [];
  let prev = 0;
  // step to each sample in 0.25 s strides (REEL.frame ticks the engine through every 60 Hz step)
  const walk = async t => { for (let x = prev + 0.25; x < t; x += 0.25) await page.evaluate(x => window.REEL.frame(x), +x.toFixed(4)); prev = t; return at(t); };

  // (the clock only runs forward: going back would regrow the tank, so the samples are in time order)
  // 1-2. the spots, 3. the scatter
  const s35 = await walk(T(3.9));
  const spot = { x: 0.8 * W, y: 0.85 * H };
  const dBig = Math.hypot(s35.big.x - spot.x, s35.big.y - spot.y);
  ok(dBig < 90, `${format}: "big to 0.8 0.85": the big fish is at its spot 3.4 s later (${dBig.toFixed(0)} px off)`);
  ok(Math.abs(s35.school.x - 0.2 * W) < 220, `${format}: "school to 0.2 0.78": the school's centre is there (${s35.school.x.toFixed(0)} px across, the spot ${(0.2 * W).toFixed(0)}, sweeping ±170)`);
  const pre = s35;
  const post = await walk(T(4.1));
  ok(post.phase === 'scatter', `${format}: "school scatter": the school's phase turns to scatter (${pre.phase} → ${post.phase})`);
  const later = await walk(T(4.9));
  ok(later.school.spread > pre.school.spread * 1.3, `${format}: the school spreads out (${pre.school.spread.toFixed(0)} → ${later.school.spread.toFixed(0)} px from its centre)`);
  // 4. circle: the big fish's bearing from its spot turns through most of a circle
  // (a circle is moved in from the edges until all of it is in the water: in a 1080 px frame its
  // centre is at most 280 px from a side, the water's 140 and the ellipse's 140)
  const ring = { x: Math.max(280, Math.min(W - 280, spot.x)), y: spot.y };
  let turned = 0, last = null, far = 0;
  for (let s = 6.0; s <= 9.4; s += 0.1) {
    const x = await walk(T(s));
    const a = Math.atan2((x.big.y - ring.y) / 64, (x.big.x - ring.x) / 140);
    if (last != null) { let d = a - last; d = Math.atan2(Math.sin(d), Math.cos(d)); turned += d; }
    last = a; far = Math.max(far, Math.hypot(x.big.x - ring.x, x.big.y - ring.y));
  }
  // a lap in under 10 s, on the ellipse (140 × 64 px) and not wandering off it
  ok(Math.abs(turned) > 2 * Math.PI * 3.4 / 10 && far < 260, `${format}: "big idle circle": it swims round its spot (${(Math.abs(turned) * 180 / Math.PI).toFixed(0)}° in 3.4 s, never more than ${far.toFixed(0)} px out)`);
  // 6. dart and turn
  const d0 = await walk(T(9.45)), d1 = await walk(T(9.75));
  ok(d1.big.v > Math.max(2.5, d0.big.v * 1.6), `${format}: "big dart": it bursts forward (${(d0.big.v * 60).toFixed(0)} → ${(d1.big.v * 60).toFixed(0)} px/s)`);
  const h0 = (await walk(T(10.45))).big.h, h1 = (await walk(T(11.7))).big.h;
  const turn = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
  ok(turn > 2.3, `${format}: "big turn": it turns round (${(turn * 180 / Math.PI).toFixed(0)}° in 1.25 s)`);
  // 7. look off + wander: no host steering after 12
  const w1 = await walk(T(12.4));
  const steer = await page.evaluate(() => { const f = window.REEL.debug.tank.state.fish.reduce((a, f) => (!a || f.bodyWidth > a.bodyWidth ? f : a), null); return window.REEL.debug.steer(f); });
  ok(steer === null, `${format}: "all look off", "big idle wander": the engine has the big fish again (steer ${JSON.stringify(steer)})`);
  ok(errors.length === 0, `${format}: no page errors${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
  await ctx.close();
}

// 5. feed, on its own run: the food count just before and just after its time
async function feedRun(format) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?render=1&format=${format}&script=${NAME}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.REEL, null, { timeout: 60000 });
  await page.evaluate(() => window.REEL.ready);
  await page.evaluate(() => document.querySelectorAll('video').forEach(v => Object.defineProperty(v, 'currentTime', {
    get() { return this.__ct || 0; }, set(x) { this.__ct = x; this.dispatchEvent(new Event('seeked')); } })));
  const food = t => page.evaluate(async t => { await window.REEL.frame(t); return window.REEL.debug.tank.state.food.map(f => [f.x, f.y]); }, t);
  for (let x = 0.5; x < T(12.4); x += 0.5) await page.evaluate(x => window.REEL.frame(x), x);
  const a = await food(T(12.45)), b = await food(T(12.55));
  const size = await page.evaluate(() => window.REEL.size), y0 = await page.evaluate(() => window.REEL.debug.tankY);
  const fresh = b.filter(p => !a.some(q => q[0] === p[0] && q[1] === p[1]));
  ok(fresh.length >= 1 && fresh.some(p => Math.abs(p[0] - 0.5 * size[0]) < 40 && Math.abs(p[1] + y0 - 0.8 * size[1]) < 40),
    `${format}: "feed 0.5 0.8": food lands at its point at its time (${a.length} → ${b.length} pieces)`);
  await ctx.close();
}

try {
  writeFileSync(TMP, src);
  for (const format of FORMATS) { await run(format); await feedRun(format); }
} catch (e) {
  ok(false, e.stack || e.message);
} finally {
  await browser.close();
  try { unlinkSync(TMP); } catch (e) { /* gone */ }
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
