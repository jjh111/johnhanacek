// The timeline panel (scripts/reel-timeline.js), end to end: a real dev server, the real rig in
// Chromium, real pointer drags, and the script file on disk as the judge.
//   node "Agent Reference/reel-tests/timelinetest.mjs"
// Works on a temp copy of the script (Assets/zz-timeline-test.script.txt, played through the rig's
// ?script=), removed in finally with the backups the dev server kept of it. Screenshots of the open
// panel and the inspector land in the scratch folder named below (or $TIMELINE_SHOTS).
//   1. E opens the panel with a block per scene
//   2. dragging the answer scene's right edge +0.5 s with Shift saves "SCENE answer 5"; the
//      reloaded reel runs 60.5 s
//   3. the inspector's first line input saves its words; Ctrl+Z twice gives the file back byte for byte
//   4. dragging the MARA beat (@2.35 in the first ITEM) +0.5 s with Shift rewrites it as @3: a
//      drag snaps the time to the grid, and Shift's grid is the 0.5 s beat
//   5. with no dev server (ping answered 404) an edit is a draft: the file is untouched, the
//      status offers Download and Discard, and Discard plays the file again
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = 'zz-timeline-test.script.txt', TMP = path.join(ROOT, 'Assets', NAME);
const BACKUPS = path.join(ROOT, '.local', 'reel-backups'), CACHE = path.join(ROOT, '.local', 'sizzle-cache');
const SHOTS = process.env.TIMELINE_SHOTS || path.join(ROOT, '.local', 'reel-tests', 'timeline');
const ORIG = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const file = () => fs.readFileSync(TMP, 'utf8');
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// the VP9 transcode render-sizzle-reel.mjs caches for a clip (its webmFor naming); none is made
// here, so a clip with no transcode yet just loads as the mp4 and plays nothing
const webmFor = mp4 => { const st = fs.statSync(mp4); return path.join(CACHE, `${path.basename(mp4, '.mp4').replace(/[^\w.-]+/g, '_')}-${st.size}-${Math.round(st.mtimeMs)}.webm`); };

let child, browser;
try {
  fs.mkdirSync(SHOTS, { recursive: true });
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

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true,
    args: proxy ? [`--proxy-server=https=${new URL(proxy).host}`] : [] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const clips = new Map();
  await ctx.route(/\.mp4(\?.*)?$/i, route => {
    const mp4 = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname.slice(1)));
    if (!fs.existsSync(mp4)) return route.continue();
    const webm = webmFor(mp4);
    if (!fs.existsSync(webm)) return route.continue();
    if (!clips.has(webm)) clips.set(webm, fs.readFileSync(webm));
    const buf = clips.get(webm), size = buf.length;
    const headers = { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes' };
    const r = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers().range || '');
    if (!r || (r[1] === '' && r[2] === '')) return route.fulfill({ status: 200, headers, body: buf });
    const from = r[1] === '' ? Math.max(0, size - +r[2]) : +r[1];
    const to = r[1] !== '' && r[2] !== '' ? Math.min(+r[2], size - 1) : size - 1;
    if (from >= size || from > to) return route.fulfill({ status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` }, body: '' });
    return route.fulfill({ status: 206, headers: { ...headers, 'Content-Range': `bytes ${from}-${to}/${size}` }, body: buf.subarray(from, to + 1) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // Wait for the page (after any reload) to have the rig and the timeline up. Polls with evaluate,
  // because a navigation mid-wait destroys the context a waitForFunction runs in.
  const ready = async (label, ms = 30000) => {
    const t0 = Date.now();
    for (;;) {
      const ok = await page.evaluate(() => !window.__tlStale && !!window.REEL_LIVE && !!window.REEL_TIMELINE).catch(() => false);
      if (ok) return;
      if (Date.now() - t0 > ms) throw new Error('the reel did not come back: ' + label);
      await sleep(150);
    }
  };
  // do something that saves, then wait for the reload it causes
  const saving = async (label, act) => {
    await page.evaluate(() => { window.__tlStale = true; });
    await act();
    await ready(label);
    await page.evaluate(() => REEL_LIVE.setPlaying(false));
  };
  const pxs = () => page.evaluate(() => document.querySelector('#reel-tl .tl-lane').clientWidth / REEL_LIVE.duration);
  // press on an element's centre, travel dx in steps (so the drag registers), release
  const dragBy = async (sel, dx, shift) => {
    const b = await page.locator(sel).boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(x + dx * k / 8, y);
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
  };

  await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${NAME}#t=7`);
  await ready('first load');
  await page.evaluate(() => REEL_LIVE.setPlaying(false));

  // 1 ── E opens the panel
  await page.keyboard.press('e');
  const n = await page.locator('#reel-tl .tl-sc').count();
  check(await page.locator('#reel-tl').isVisible() && n === 11, 'E opens the panel with 11 scene blocks', `visible ${await page.locator('#reel-tl').isVisible()}, ${n} blocks`);
  const hint = await page.locator('#hud > span:last-child').textContent();
  check(/E timeline$/.test(hint), 'the HUD hint names E', hint);
  await page.waitForTimeout(600);                  // fonts settle before the picture
  await page.screenshot({ path: path.join(SHOTS, 'timeline-panel.png') });

  // 2 ── drag the answer scene's right edge +0.5 s with Shift
  let s = await pxs();
  await saving('scene edge', () => dragBy('#reel-tl .tl-sc[data-scene="2"] .tl-grip', 0.5 * s, true));
  check(/^SCENE answer 5\s/m.test(file()), 'the edge drag saved "SCENE answer 5"', (/^SCENE answer.*$/m.exec(file()) || [])[0]);
  const dur = await page.evaluate(() => REEL_LIVE.duration);
  check(dur === 60.5, 'the reloaded reel runs 60.5 s', dur);
  check(await page.locator('#reel-tl').isVisible(), 'the panel is still open after the reload');

  // 3 ── the inspector: the first line of the answer scene
  await page.locator('#reel-tl .tl-sc[data-scene="2"] b').click();
  const first = page.locator('#reel-tl .tl-insp-col input[data-key="line"]').first();
  check(await first.inputValue() === 'Freehand expression', 'the inspector shows the answer scene\'s first line', await first.inputValue());
  const nIn = await page.locator('#reel-tl .tl-insp-col input').count();
  check(nIn >= 10, 'the inspector has an input per line (and the cues)', nIn);
  await page.screenshot({ path: path.join(SHOTS, 'timeline-inspector.png') });
  await saving('field', async () => { await first.fill('Freehand drawing'); await first.press('Enter'); });
  check(/^  line     Freehand drawing$/m.test(file()), 'Enter saved the words to that line of the file');
  const w = await page.evaluate(() => REEL_LIVE.parsed.edit.scenes[2].lines[0]);
  check(w === 'Freehand drawing', 'the reloaded parse has the new words', w);
  check(await page.locator('#reel-tl .tl-insp-col').isVisible(), 'the inspector comes back open after the reload');
  await saving('undo 1', () => page.keyboard.press('Control+z'));
  check(/^  line     Freehand expression$/m.test(file()) && /^SCENE answer 5\s/m.test(file()), 'Ctrl+Z undid the words');
  await saving('undo 2', () => page.keyboard.press('Control+z'));
  check(file() === ORIG, 'Ctrl+Z twice gives the file back byte for byte');
  await saving('redo', () => page.keyboard.press('Control+Shift+z'));
  check(/^SCENE answer 5\s/m.test(file()), 'Shift+Ctrl+Z redid the edge');
  await saving('undo 3', () => page.keyboard.press('Control+z'));
  check(file() === ORIG, 'and undo takes it back again');

  // 4 ── drag the MARA beat
  s = await pxs();
  const mara = '#reel-tl .tl-bt[title^="@2.35"]';
  check(await page.locator(mara).count() === 1, 'there is one marker for the MARA beat');
  await saving('beat', () => dragBy(mara, 0.5 * s, true));
  const at = /^\s*@(\S+).*\n\s*video\s+\.\/nanome-mara\.mp4/m.exec(file());
  check(at && at[1] === '3', 'dragging the MARA beat +0.5 s with Shift rewrote its @ line, on the 0.5 s grid (@3)', at && at[1]);
  check(!/^\s*@2\.35\b/m.test(file()), 'no @2.35 is left');

  // a script the parser refuses is never saved: an item longer than its results scene allows
  const before = file();
  await page.evaluate(() => { REEL_TIMELINE.select(2, true); });
  const len = page.locator('#reel-tl .tl-insp-col input[data-key="SCENE"]');
  await len.fill('-1'); await len.press('Enter');
  await page.waitForTimeout(400);
  const errText = await page.locator('#reel-tl .tl-status .tl-err').textContent();
  check(file() === before && /line \d+/.test(errText), 'a length that breaks the script is refused and shown, not saved', errText);

  // 5 ── no dev server: the edit is a draft
  await page.route('**/__reel/ping', r => r.fulfill({ status: 404, body: 'no' }));
  await page.evaluate(() => { window.__tlStale = true; });
  await page.reload();
  await ready('reload without the dev server');
  await page.evaluate(() => REEL_LIVE.setPlaying(false));
  check(await page.evaluate(() => REEL_LIVE.dev) === false, 'the rig sees no dev server');
  const where = await page.locator('#reel-tl .tl-status .tl-where').textContent();
  check(/^Draft in this tab: no dev server/.test(where), 'the status says edits stay in this tab', where);
  const disk = file();
  s = await pxs();
  await saving('draft edit', () => dragBy('#reel-tl .tl-sc[data-scene="2"] .tl-grip', 0.5 * s, true));
  const st = await page.evaluate(() => ({ draft: REEL_LIVE.draft, dur: REEL_LIVE.parsed.edit.scenes[2].dur }));
  check(st.draft === true && st.dur === 5, 'the edit plays as a draft', JSON.stringify(st));
  check(file() === disk, 'the file on disk is untouched');
  const btns = await page.locator('#reel-tl .tl-status button').allTextContents();
  check(btns.includes('Download') && btns.includes('Discard'), 'the status offers Download and Discard', btns.join(','));
  await saving('discard', () => page.locator('#reel-tl .tl-status button[data-act="discard"]').click());
  const back = await page.evaluate(() => ({ draft: REEL_LIVE.draft, src: REEL_LIVE.src }));
  check(back.draft === false && back.src === disk, 'Discard plays the file\'s version again');

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
