// The same film, exactly: the rig as it is against the rig at another commit, compared by what
// the rig itself draws, not by pixels.
//   node "Agent Reference/reel-tests/samefilmtest.mjs" --ref=HEAD [--format=wide,square,vertical]
//        [--times=0.3,2.6,…] [--script=<the script the reference plays, at the ref by default>]
// Checks out the ref into a temporary git worktree (its clips linked to these, so nothing is
// transcoded again), plays the cut in render mode in both, and at each moment (stepping the way
// the stills renderer does: the three frames before, then the moment) reads every element of the
// stage: its tag, class, inline style and SVG geometry, and every fish's place in the tank. Any
// difference is a change to the film; none means the frame is the frame. (Pixels are no judge:
// two runs of the same rig differ at the caret and in video frames, and a glyph's glow can
// rasterise a hair apart with the DOM identical.)
// For a refactor that should change nothing: run it against the commit before.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, unlinkSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVerified } from '../../scripts/serve-verified.mjs';
import { FONT_URLS, fontPin } from '../../scripts/font-pin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REF = arg('ref', 'HEAD'), FORMATS = arg('format', 'wide').split(',');
const TIMES = arg('times', '0.3,1.0,1.6,2.2,2.45,2.6,2.9,3.3,4.0,5.3,5.6,5.8,6.2,6.6,7.0,7.6,9.6,10.1,10.4,10.9,11.4,12.9,14.9,15.4,15.9,16.6,17.5,19.6,19.9,20.6,21.6,21.9,22.3,24.2,26.2,26.5,28.7,29.0,31.0,32.6,32.9,33.4,34.0,36.0,37.6,38.0,38.6,39.5,43.1,43.5,44.2,46.4,49.6,52.0,52.4,53.0,54.0,57.0,57.3,57.6,58.2,59.0,61.6')
  .split(',').map(Number);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const WT = mkdtempSync(join(tmpdir(), 'reel-ref-'));
rmSync(WT, { recursive: true, force: true });
git('worktree', 'add', '--detach', WT, REF);
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { for (const l of ['node_modules', '.local']) if (existsSync(join(WT, l))) unlinkSync(join(WT, l)); git('worktree', 'remove', '--force', WT); } catch (e) { /* gone */ } };
process.on('exit', cleanup);
for (const l of ['node_modules', '.local']) symlinkSync(join(ROOT, l), join(WT, l));
for (const f of git('ls-files', '-z', 'Assets').split('\0').filter(f => f.endsWith('.mp4'))) { unlinkSync(join(WT, f)); symlinkSync(join(ROOT, f), join(WT, f)); }
if (arg('script', null)) writeFileSync(join(WT, 'Assets/sizzle-reel-2.script.txt'), readFileSync(resolve(arg('script')), 'utf8'));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
// Both rigs set their words with the same font files (scripts/font-pin.mjs): each is a new
// context that would ask Google on its own, and Google does not always answer the same stylesheet
// with the same bytes. A fitted label is measured in its font, so other files would be another style.
const FONTS = fontPin({ dir: join(ROOT, '.local/reel-tests/fonts') });
async function states(root, format) {
  const srv = await serveVerified(root);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());
  await ctx.route(FONT_URLS, FONTS.route);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?render=1&format=${format}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.REEL || document.getElementById('err'), null, { timeout: 60000 });
  const failed = await page.$eval('#err', e => e.textContent).catch(() => null);
  if (failed) throw new Error(`${root}: ${failed.slice(0, 300)}`);
  await page.evaluate(() => window.REEL.ready);
  await page.evaluate(() => document.querySelectorAll('video').forEach(v => Object.defineProperty(v, 'currentTime', {
    get() { return this.__ct || 0; }, set(x) { this.__ct = x; this.dispatchEvent(new Event('seeked')); } })));
  const out = await page.evaluate(async TIMES => {
    let prev = -1; const res = [];
    const stage = document.getElementById('stage');
    for (const t of TIMES) {
      const f = Math.round(t * 60);
      for (let k = 3; k >= 1; k--) if ((f - k) / 60 > prev) await window.REEL.frame((f - k) / 60);
      await window.REEL.frame(t); prev = t;
      const els = [...stage.querySelectorAll('*')].map((e, i) => i + ':' + e.tagName + '.' + (e.getAttribute('class') || '') + '{' + (e.getAttribute('style') || '') + '}'
        + ['cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2'].map(a => e.getAttribute(a) || '').join(','));
      els.push('fish:' + window.REEL.debug.tank.state.fish.map(x => x.x.toFixed(3) + ',' + x.y.toFixed(3)).join(';'));
      res.push(els);
    }
    return res;
  }, TIMES);
  await ctx.close(); srv.stop();
  return { out, errors };
}
try {
  for (const format of FORMATS) {
    const A = await states(WT, format), B = await states(ROOT, format);
    const bad = [];
    TIMES.forEach((t, i) => {
      const a = A.out[i], b = B.out[i];
      if (a.length !== b.length) { bad.push(`${t}: ${a.length} elements against ${b.length}`); return; }
      const d = a.map((x, j) => [x, b[j]]).filter(([x, y]) => x !== y);
      if (d.length) bad.push(`${t}: ${d.length} differ, the first:\n         ${d[0][0].slice(0, 200)}\n         ${d[0][1].slice(0, 200)}`);
    });
    ok(!bad.length, `${format}: at ${TIMES.length} moments every element of the stage and every fish is where the rig at ${REF} put it${bad.length ? '\n       ' + bad.slice(0, 6).join('\n       ') : ''}`);
    ok(!A.errors.length && !B.errors.length, `${format}: no page errors ${JSON.stringify(A.errors.concat(B.errors)).slice(0, 200)}`);
  }
} catch (e) {
  ok(false, e.stack || e.message);
} finally {
  await browser.close();
  cleanup();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
