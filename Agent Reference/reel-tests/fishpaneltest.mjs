// The Fish panel (scripts/reel-fish.js), end to end: a real dev server, the real rig in Chromium,
// real clicks and keys, and the script file on disk as the judge.
//   node "Agent Reference/reel-tests/fishpaneltest.mjs"
// Works on a temp copy of the script (Assets/zz-fishpanel-test.script.txt, played through the
// rig's ?script=), removed in finally with the backups the dev server kept of it.
//   1. F opens the panel beside the preview (the stage makes room), and its HUD button is pressed
//   2. paused, Dart writes `fish @t big dart` into the scene under the playhead, one save, and
//      the preview comes back at the same moment; pressing it again rewrites that line, never a
//      second one
//   3. Place, then a click on the stage, writes `big to x y` at the click's fraction of the frame
//   4. the stage shows that spot as a mark; dragging it rewrites the line's point
//   5. the timeline's Undo takes the drag back (the panel's saves share its stacks)
//   6. School + the S key writes `school scatter`; Dart is off for the school alone
//   7. a take: playing, D then T at two moments; pausing keeps both lines in one save
//   8. the list's delete takes a line out
//   9. in an 820 px window the panel lies over the preview (no room taken) and nothing overflows
//  10. no page errors
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = 'zz-fishpanel-test.script.txt', TMP = path.join(ROOT, 'Assets', NAME);
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
const ORIG = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const fishLines = () => fs.readFileSync(TMP, 'utf8').split('\n').map(l => l.trim()).filter(l => /^fish\s/.test(l)).map(l => l.replace(/^fish\s+/, ''));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

let child, browser;
try {
  fs.writeFileSync(TMP, ORIG);
  const port = await freePort();
  child = spawn(process.execPath, [path.join(ROOT, 'scripts/reel-dev.mjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error('no listening line in 5 s: ' + out)), 5000);
    child.stdout.on('data', d => { out += d; const m = /^reel-dev: (http:\/\/127\.0\.0\.1:\d+)\//m.exec(out); if (m) { clearTimeout(t); resolve(m[1]); } });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', c => reject(new Error('server exited ' + c + ': ' + out)));
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = what => page.waitForFunction(() => window.REEL_LIVE && window.REEL_FISH && window.REEL_TIMELINE && !document.getElementById('boot'), null, { timeout: 60000 })
    .catch(e => { throw new Error(`${what}: the preview did not come back (${e.message})`); });
  // one save: the page reloads; wait for the new one
  const saving = async (what, act) => {
    await page.evaluate(() => { window.__stale = true; });
    await act();
    await page.waitForFunction(() => !window.__stale, null, { timeout: 20000 }).catch(() => { throw new Error(`${what}: no reload`); });
    await ready(what);
  };
  await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${NAME}#t=24&pause=1`);
  await ready('first load');

  // 1. open
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => ({ open: REEL_FISH.isOpen, pressed: document.querySelector('#hud [data-tool="fish"]').getAttribute('aria-pressed'),
    left: REEL_LIVE.view().x, panel: document.getElementById('reel-fish').getBoundingClientRect().right }));
  check(o.open && o.pressed === 'true' && o.left >= o.panel - 1, 'F opens the panel beside the preview: the stage starts right of it', JSON.stringify(o));

  // 2. Dart, paused
  const scene = await page.evaluate(() => { const t = REEL_LIVE.now(), sc = REEL_LIVE.scenes.filter(s => t >= s.start - 1e-6).pop(); return { i: sc.i, at: +(t - sc.start).toFixed(2), type: sc.type }; });
  await saving('dart', () => page.locator('#reel-fish [data-fish="dart"]').click());
  let fl = fishLines();
  check(fl.length === 1 && fl[0] === `@${scene.at} big dart`, `paused, Dart writes "@${scene.at} big dart" into the ${scene.type} scene`, JSON.stringify(fl));
  const back = await page.evaluate(() => ({ t: REEL_LIVE.now(), playing: REEL_LIVE.isPlaying(), open: REEL_FISH.isOpen }));
  check(Math.abs(back.t - 24) < 0.05 && !back.playing && back.open, 'the preview comes back at the same moment, paused, the panel open', JSON.stringify(back));
  await page.keyboard.press('d');                 // the same line again: nothing to save, and it says so
  await page.waitForTimeout(600);
  fl = fishLines();
  const said = await page.locator('#reel-fish .fp-say').textContent();
  check(fl.length === 1 && /already/.test(said), 'the same press again (D) adds no second line, and says it is already there', JSON.stringify({ fl, said }));

  // 3. Place + click on the stage
  await page.locator('#reel-fish [data-fish="to"]').click();
  const v = await page.evaluate(() => REEL_LIVE.view());
  await saving('place', () => page.mouse.click(v.x + 1920 * 0.3 * v.s, v.y + 1080 * 0.85 * v.s));
  fl = fishLines();
  check(fl.includes(`@${scene.at} big to 0.3 0.85`), 'Place, then a click on the stage, writes "big to 0.3 0.85" (its fraction of the frame)', JSON.stringify(fl));

  // 4. the mark, dragged
  const mark = page.locator('#reel-fish-marks .fm:not(.fm-look):not(.fm-feed)').first();
  check(await mark.count() === 1, 'the stage shows the spot as a mark');
  const mb = await mark.boundingBox();
  const v2 = await page.evaluate(() => REEL_LIVE.view());
  const to = { x: v2.x + 1920 * 0.5 * v2.s, y: v2.y + 1080 * 0.8 * v2.s };
  await saving('drag', async () => {
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(mb.x + mb.width / 2 + (to.x - mb.x - mb.width / 2) * k / 8, mb.y + mb.height / 2 + (to.y - mb.y - mb.height / 2) * k / 8);
    await page.mouse.up();
  });
  fl = fishLines();
  check(fl.includes(`@${scene.at} big to 0.5 0.8`) && !fl.some(l => / to 0\.3 0\.85$/.test(l)), 'dragging the mark rewrites the line\'s point (0.5 0.8)', JSON.stringify(fl));

  // 5. the timeline's Undo
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await saving('undo', () => page.locator('#reel-tl [data-act="undo"]').click());
  fl = fishLines();
  check(fl.includes(`@${scene.at} big to 0.3 0.85`), 'the timeline\'s Undo takes the drag back', JSON.stringify(fl));
  await page.keyboard.press('e');

  // 6. School + S
  await page.locator('#reel-fish [data-who="school"]').click();
  const off = await page.evaluate(() => ({ dart: document.querySelector('#reel-fish [data-fish="dart"]').disabled, scatter: document.querySelector('#reel-fish [data-fish="scatter"]').disabled }));
  check(off.dart && !off.scatter, 'for the school alone, Dart is off and Scatter on', JSON.stringify(off));
  await saving('scatter', () => page.keyboard.press('s'));
  fl = fishLines();
  check(fl.includes(`@${scene.at} school scatter`), 'the S key writes "school scatter"', JSON.stringify(fl));

  // 7. a take while playing
  await page.locator('#reel-fish [data-who="big"]').click();
  const before = fishLines().length;
  await page.evaluate(() => REEL_LIVE.seek(26));
  await page.evaluate(() => REEL_LIVE.setPlaying(true));
  await page.waitForTimeout(400);
  await page.keyboard.press('d');
  await page.waitForTimeout(700);
  await page.keyboard.press('t');
  const tk = await page.evaluate(() => REEL_FISH.take.map(x => x.at));
  check(tk.length === 2 && tk[1] > tk[0] && fishLines().length === before, `playing, D then T gather into a take and nothing is saved yet (at ${tk.join(', ')})`, JSON.stringify(tk));
  await saving('keep take', () => page.evaluate(() => REEL_LIVE.setPlaying(false)));
  fl = fishLines();
  check(fl.length === before + 2 && fl.some(l => / big dart$/.test(l) && !l.startsWith(`@${scene.at} `)) && fl.some(l => / big turn$/.test(l)), 'pausing keeps the take: both lines, in one save', JSON.stringify(fl));

  // 8. delete from the list
  await page.evaluate(() => REEL_LIVE.seek(24));
  await page.waitForTimeout(300);
  const n0 = fishLines().length;
  await saving('delete', () => page.locator('#reel-fish .fp-line button').first().click());
  check(fishLines().length === n0 - 1, 'the list\'s delete takes a line out', JSON.stringify(fishLines()));

  // 9. narrow
  await page.setViewportSize({ width: 820, height: 640 });
  await page.waitForTimeout(500);
  const nw = await page.evaluate(() => {
    const r = document.getElementById('reel-fish'), b = r.getBoundingClientRect();
    const over = [...r.querySelectorAll('button')].filter(x => x.offsetParent && x.scrollWidth > x.clientWidth + 1).map(x => x.textContent.trim());
    return { over: r.classList.contains('fp-over'), left: REEL_LIVE.view().x, right: b.right, vw: innerWidth, overflow: over };
  });
  check(nw.over && nw.right <= nw.vw && nw.left < 200 && !nw.overflow.length, 'in an 820 px window the panel lies over the preview, which keeps its room', JSON.stringify(nw));

  const own = errors.filter(e => !/Failed to load|NotSupportedError|no supported source/i.test(e));
  check(!own.length, 'no page errors', own.join(' | '));
} catch (e) {
  fails++; console.log('FAIL ' + (e.stack || e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child) child.kill();
  try { fs.unlinkSync(TMP); } catch (e) { /* not made */ }
  if (fs.existsSync(BACKUPS)) for (const b of fs.readdirSync(BACKUPS)) if (b.startsWith(NAME + '.')) fs.unlinkSync(path.join(BACKUPS, b));
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
