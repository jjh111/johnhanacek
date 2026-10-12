// Every line of copy in every frame, against the frame's title-safe area: the cut played in render
// mode, each scene looked at every half second once its copy has settled, every line outside
// title safe (90%) or cut off by what it sits in (a card too short for its rows) named, with its
// scene, its time and its words. The editor's Safe tool (scripts/reel-safe.js, G) draws the same
// judgement live, for the moment on screen; this one sweeps the whole cut.
//   node scripts/reel-safe.mjs [--format=wide,square,vertical] [--script=Assets/x.script.txt] [--step=0.5]
// Exits non-zero when anything crosses.
import { chromium } from 'playwright-core';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVerified } from './serve-verified.mjs';
import { FONT_URLS, fontPin } from './font-pin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const FORMATS = arg('format', 'wide,square,vertical').split(',');
const STEP = +arg('step', '0.5');
const SCRIPT = arg('script', null);
const FONTS = fontPin({ dir: process.env.REEL_FONT_CACHE || join(ROOT, '.local/reel-tests/fonts') });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
const srv = await serveVerified(ROOT);
let bad = 0;
try {
  for (const format of FORMATS) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1920 } });
    await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());       // the copy is what is judged; the clips are not needed
    await ctx.route(FONT_URLS, FONTS.route);
    const page = await ctx.newPage();
    const q = new URLSearchParams({ render: '1', format });
    if (SCRIPT) q.set('script', relative(join(ROOT, 'Assets'), resolve(SCRIPT)));
    await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?${q}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.REEL || document.getElementById('err'), null, { timeout: 60000, polling: 100 });
    const failed = await page.$eval('#err', e => e.textContent).catch(() => null);
    if (failed) throw new Error(failed.slice(0, 300));
    await page.evaluate(() => window.REEL.ready);
    const found = await page.evaluate(async STEP => {
      const R = window.REEL, [W, H] = R.size, m = 0.05, TS = { x0: W * m, y0: H * m, x1: W * (1 - m), y1: H * (1 - m) };
      const stage = document.getElementById('stage'), out = [], seen = new Set();
      const scan = (t, sc) => {
        const k = stage.getBoundingClientRect(), s = k.width / W;
        const toStage = r => ({ x0: (r.left - k.left) / s, y0: (r.top - k.top) / s, x1: (r.right - k.left) / s, y1: (r.bottom - k.top) / s });
        for (const seg of stage.querySelectorAll('#scenes .seg.on')) for (const el of seg.querySelectorAll('.lm, .stat .num')) {
          if (el.parentElement.closest('.lm')) continue;
          const ink = el.querySelector(':scope > .li') || el.querySelector(':scope > .wd') || el, r = ink.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || !ink.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
          const mk = el.getBoundingClientRect();
          if (ink !== el && (r.top < mk.top - 1 || r.bottom > mk.bottom + 1)) continue;   // still sliding
          let op = 1; for (let a = el; a && a !== stage; a = a.parentElement) op *= +getComputedStyle(a).opacity;
          if (op < 0.5) continue;
          const b = toStage(r), words = (ink.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
          let why = null;
          if (b.x0 < TS.x0 - 1 || b.y0 < TS.y0 - 1 || b.x1 > TS.x1 + 1 || b.y1 > TS.y1 + 1)
            why = `outside title safe by ${Math.round(Math.max(TS.x0 - b.x0, TS.y0 - b.y0, b.x1 - TS.x1, b.y1 - TS.y1))} px`;
          else for (let a = el.parentElement; a && a !== seg; a = a.parentElement) {
            const st = getComputedStyle(a);
            if (st.overflowX === 'visible' && st.overflowY === 'visible') continue;
            const c = a.getBoundingClientRect();
            if (r.top < c.top - 1 || r.bottom > c.bottom + 1 || r.left < c.left - 1 || r.right > c.right + 1) { why = 'cut off by ' + (a.className || a.tagName); break; }
          }
          const key = sc.i + '|' + words + '|' + (why && why.split(' by ')[0]);
          if (why && !seen.has(key)) { seen.add(key); out.push({ t: +t.toFixed(2), scene: `${sc.i + 1} ${sc.type}`, why, words }); }
        }
      };
      let prev = -1;
      for (const sc of R.debug.scenes) {
        for (let t = sc.start + 0.9; t < sc.end - 0.35; t += STEP) {
          for (let k = 3; k >= 1; k--) { const f = (Math.round(t * 60) - k) / 60; if (f > prev) await R.frame(f); }
          await R.frame(t); prev = t;
          scan(t, sc);
        }
      }
      return out;
    }, STEP);
    console.log(`${format}: ${found.length ? found.length + ' crossing' : 'every line inside title safe'}`);
    for (const f of found) console.log(`  ${f.t.toFixed(2).padStart(6)} s  ${f.scene.padEnd(12)} ${f.why}: "${f.words}"`);
    bad += found.length;
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.stop();
}
process.exit(bad ? 1 : 0);
