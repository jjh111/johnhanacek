// The scenes in any order: the cut played with its scenes moved about, in render mode.
//   node "Agent Reference/reel-tests/ordertest.mjs" [--format=wide,square,vertical]
// Each order is written with ReelScript.moveScene / removeScene to a temp script
// (Assets/zz-order-test.script.txt, removed in finally) and played on the renderer's own clock:
//   1. it builds and paints every quarter second with no page error
//   2. what each scene wears is on screen in the middle of it: the hero oval for a title, the end
//      card's oval for an end, the bar for a scene that asks (its words typed), nothing for an
//      opening (the glass hidden)
//   3. the scene's own words are on stage in its middle (a scene's element is on)
//   4. the transitions: a reel-wide `cue arrive 0.3` brings the answer's first line up sooner
//      than the rig's own, and `cue leave` and `cue ease` read and play
// Orders: the title after the answer; the end card in the middle; the opening after the
// command; the whole cut reversed; no title and no end card.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVerified } from '../../scripts/serve-verified.mjs';
import { inOrder } from './inorder.mjs';   // the scenes in the order the suite was written for

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RS = createRequire(import.meta.url)(resolve(ROOT, 'scripts/reel-script.js'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const FORMATS = arg('format', 'wide').split(',');
const NAME = 'zz-order-test.script.txt', TMP = resolve(ROOT, 'Assets', NAME);
const SRC = inOrder(readFileSync(resolve(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const kinds = src => RS.parse(src).edit.scenes.map(s => s.type);
const at = (src, type) => kinds(src).indexOf(type);
const move = (src, type, to) => RS.moveScene(src, at(src, type), to);
const ORDERS = [
  ['the title after the answer', src => move(src, 'title', at(src, 'answer'))],
  ['the end card in the middle', src => move(src, 'end', at(src, 'results'))],
  ['the opening after the command', src => move(src, 'open', at(src, 'command'))],
  ['the whole cut reversed', src => { let s = src; const n = kinds(s).length; for (let i = 0; i < n; i++) s = RS.moveScene(s, n - 1, i); return s; }],
  ['no title and no end card', src => RS.removeScene(RS.removeScene(src, at(src, 'end')), at(src, 'title'))],
];

const srv = await serveVerified(ROOT);
process.on('exit', () => { try { srv.stop(); } catch (e) { /* gone */ } try { unlinkSync(TMP); } catch (e) { /* gone */ } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });

async function play(src, format, what) {
  writeFileSync(TMP, src);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?render=1&format=${format}&script=${NAME}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.REEL || document.getElementById('err'), null, { timeout: 60000, polling: 100 });
  const failed = await page.$eval('#err', e => e.textContent).catch(() => null);
  if (failed) { ok(false, `${format}, ${what}: the page refused it: ${failed.slice(0, 200)}`); await ctx.close(); return null; }
  await page.evaluate(() => window.REEL.ready);
  await page.evaluate(() => document.querySelectorAll('video').forEach(v => Object.defineProperty(v, 'currentTime', {
    get() { return this.__ct || 0; }, set(x) { this.__ct = x; this.dispatchEvent(new Event('seeked')); } })));
  const scenes = await page.evaluate(() => window.REEL.debug.scenes.map(s => ({ type: s.type, start: s.start, end: s.end, query: s.query || '' })));
  const seen = [];
  for (const sc of scenes) {
    const mid = +((sc.start + sc.end) / 2).toFixed(4);
    // every quarter second up to the scene's middle, then read what is on screen
    seen.push(await page.evaluate(async ({ mid, last }) => {
      for (let t = last + 0.25; t < mid; t += 0.25) await window.REEL.frame(+t.toFixed(4));
      await window.REEL.frame(mid);
      const g = document.getElementById('glass'), gs = getComputedStyle(g), r = g.getBoundingClientRect();
      const bar = document.getElementById('bar') || document.querySelector('.bar');
      const on = [...document.querySelectorAll('#scenes > section.on')].map(e => e.className.replace('seg ', '').replace(' on', ''));
      return { glass: { op: +gs.opacity, w: r.width, h: r.height, rad: gs.borderRadius }, bar: bar ? +getComputedStyle(bar).opacity : null,
        typed: (document.querySelector('#bar .qt') || {}).textContent || '', on };
    }, { mid, last: seen.length ? +((scenes[seen.length - 1].start + scenes[seen.length - 1].end) / 2).toFixed(4) : -0.25 }));
  }
  await ctx.close();
  return { scenes, seen, errors };
}

try {
  for (const format of FORMATS) {
    for (const [what, make] of ORDERS) {
      const src = make(SRC), r = await play(src, format, what);
      if (!r) continue;
      ok(r.errors.length === 0, `${format}, ${what} (${kinds(src).join(' ')}): plays with no page error${r.errors.length ? ': ' + r.errors.slice(0, 2).join(' | ') : ''}`);
      const wrong = [];
      r.scenes.forEach((sc, i) => {
        const s = r.seen[i], wide = s.glass.w > s.glass.h * 1.6;
        const wears = sc.type === 'open' ? 'none' : sc.type === 'title' ? 'oval' : sc.type === 'end' ? 'eoval' : 'bar';
        const okWear = wears === 'none' ? s.glass.op < 0.05
          : wears === 'bar' ? s.glass.op > 0.95 && s.glass.h < 120 && s.bar > 0.95 && sc.query.startsWith(s.typed.slice(0, 3))
          : s.glass.op > 0.95 && s.glass.h > 250 && !(s.bar > 0.05);
        if (!okWear || !s.on.includes(sc.type)) wrong.push(`${i + 1} ${sc.type}: glass ${s.glass.op.toFixed(2)} ${Math.round(s.glass.w)}×${Math.round(s.glass.h)}, bar ${s.bar}, typed "${s.typed}", on [${s.on}]`);
        void wide;
      });
      ok(!wrong.length, `${format}, ${what}: every scene wears its own (oval, end oval, bar with its question, nothing) and is on screen in its middle${wrong.length ? '\n       ' + wrong.join('\n       ') : ''}`);
    }
    // 4. the transitions, reel-wide: the answer's first line, read just after the Enter (how far
    // up it has come) and just after its out (how far it has gone)
    const line = async (src, when) => {
      writeFileSync(TMP, src);
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?render=1&format=${format}&script=${NAME}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.REEL, null, { timeout: 60000 });
      await page.evaluate(() => window.REEL.ready);
      const y = await page.evaluate(async when => {
        const sc = window.REEL.debug.scenes.find(s => s.type === 'answer'), q = window.REEL.debug.queries.find(x => x.sc === sc);
        const t = +(when === 'in' ? q.enter + 0.12 : sc.end - 0.32 + 0.1).toFixed(4);
        for (let x = 0.25; x < t; x += 0.25) await window.REEL.frame(+x.toFixed(4));
        await window.REEL.frame(t);
        const li = sc.el.querySelector('.ansb .li');
        // how far down its clip the line is, in % of its height (the rig slides it in whole px)
        const m = /translate3d\(0px, ([-\d.]+)(%|px)/.exec(li.style.transform);
        return m[2] === '%' ? parseFloat(m[1]) : parseFloat(m[1]) / li.offsetHeight * 100;
      }, when);
      await ctx.close();
      return { y, errors };
    };
    const reel = (k, v) => RS.setReelCue(SRC, k, v);
    const own = await line(SRC, 'in'), fast = await line(reel('arrive', 0.3), 'in'), lin = await line(reel('ease', 'linear'), 'in');
    ok(fast.y < own.y - 10 && !fast.errors.length, `${format}: "cue arrive 0.3" for every scene brings the answer's first line up sooner (0.12 s after the Enter it is ${fast.y.toFixed(1)}% down its clip, the rig's own ${own.y.toFixed(1)}%)`);
    ok(Math.abs(lin.y - own.y) > 10 && !lin.errors.length, `${format}: "cue ease linear" puts it on another curve (${lin.y.toFixed(1)}% against ${own.y.toFixed(1)}%)`);
    const ownOut = await line(SRC, 'out'), quick = await line(reel('leave', 0.15), 'out');
    ok(quick.y < ownOut.y - 5 && !quick.errors.length, `${format}: "cue leave 0.15" has it gone sooner (0.1 s into its leaving it is ${quick.y.toFixed(1)}% out of its clip, the rig's own ${ownOut.y.toFixed(1)}%)`);
  }
} catch (e) {
  ok(false, e.stack || e.message);
} finally {
  await browser.close();
  try { unlinkSync(TMP); } catch (e) { /* gone */ }
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
