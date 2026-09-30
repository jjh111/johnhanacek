// The timeline panel (scripts/reel-timeline.js), end to end: a real dev server, the real rig in
// Chromium, real pointer drags, and the script file on disk as the judge.
//   node "Agent Reference/reel-tests/timelinetest.mjs"
// Works on a temp copy of the script (Assets/zz-timeline-test.script.txt, played through the rig's
// ?script=), removed in finally with the backups the dev server kept of it. Screenshots of the open
// panel and the inspector land in the scratch folder named below (or $TIMELINE_SHOTS).
//   1. E opens the panel with a block per scene
//   2. dragging the answer scene's right edge +0.5 s with Shift saves "SCENE answer 5"; the
//      reel runs 0.5 s longer than it did, at once, in place
//   0. no edit reloads the page: every one plays in place (a mark set on the page before each
//      edit is still there after it), and each lands in the file before the next check
//   3. the inspector's first line input saves its words; Ctrl+Z twice gives the file back byte for byte
//   4. dragging the MARA beat (@2.35 in the first ITEM) +0.5 s with Shift rewrites it as @3: a
//      drag snaps the time to the grid, and Shift's grid is the 0.5 s beat
//   5. with no dev server (ping answered 404) an edit is a draft: the file is untouched, the
//      status offers Download and Discard, and Discard plays the file again
// And every key is a button: the HUD's transport (play, next scene) and tools (Timeline, Synths,
// Export, each naming its key), the panel's Undo, zoom and Export video. Zoomed in, a stat is a
// moment of its own: dragged, it rewrites its @; clicked, it opens its line in the inspector.
// The media picker: an img line's chip opens it, a search and Enter put a picture in the slot,
// a clip too short for the slot's in-point starts at 0, and Undo takes each back.
//   6. narrow windows: at 820 and 390 px no button overflows or leaves the window; the bars
//      fold, the seek buttons move into More, the inspector and the synth rack change shape;
//      back at 1600 px every label returns
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

  // Wait for the page (after a load, or a reload) to have the rig and the timeline up. Polls with
  // evaluate, because a navigation mid-wait destroys the context a waitForFunction runs in.
  const ready = async (label, ms = 30000) => {
    const t0 = Date.now();
    for (;;) {
      const ok = await page.evaluate(() => !window.__tlStale && !!window.REEL_LIVE && !!window.REEL_TIMELINE).catch(() => false);
      if (ok) return;
      if (Date.now() - t0 > ms) throw new Error('the reel did not come back: ' + label);
      await sleep(150);
    }
  };
  // Do something that saves: it plays in place (the page's version counts up, and the mark set
  // here survives: a reload would wipe it, and is counted), then wait until it is kept.
  let reloads = 0;
  const saving = async (label, act) => {
    const v0 = await page.evaluate(() => { window.__tlMark = true; return REEL_LIVE.version; });
    await act();
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(() => ({ mark: !!window.__tlMark, v: window.REEL_LIVE ? REEL_LIVE.version : -1 })).catch(() => ({ mark: false, v: -1 }));
      if (!st.mark) { reloads++; console.log('     (' + label + ' reloaded the page)'); break; }
      if (st.v > v0) break;
      if (Date.now() - t0 > 30000) throw new Error('the edit did not play: ' + label);
      await sleep(50);
    }
    await ready(label);
    await page.evaluate(() => REEL_LIVE.settled());
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
  const tools = await page.locator('#hud .tools button').evaluateAll(bs => bs.map(b => `${b.dataset.tool}|${b.title}|${b.getAttribute('aria-pressed')}`));
  check(tools.some(t => /^timeline\|.*\(E\)\|true$/.test(t)) && tools.some(t => /^synths\|.*\(M\)/.test(t)) && tools.some(t => /^export\|.*\(X\)/.test(t)),
    'the HUD has buttons for the timeline (pressed while open), the synths and export, each naming its key', tools.join(' ; '));
  // every key is a button too
  await page.locator('#hud [data-do="play"]').click();
  const played = await page.evaluate(() => REEL_LIVE.isPlaying());
  await page.locator('#hud [data-do="play"]').click();
  check(played && !(await page.evaluate(() => REEL_LIVE.isPlaying())), 'the HUD\'s play button plays, and pauses');
  const tA = await page.evaluate(() => REEL_LIVE.now());
  await page.locator('#hud [data-do="next"]').click();
  const tB = await page.evaluate(() => REEL_LIVE.now()), nextStart = await page.evaluate(t => REEL_LIVE.scenes.find(x => x.start > t + 1e-6).start, tA);
  check(Math.abs(tB - nextStart) < 0.01, 'the next-scene button jumps to the next scene', `${tA} → ${tB}, want ${nextStart}`);
  await page.locator('#hud [data-tool="timeline"]').click();
  const shut = !(await page.locator('#reel-tl').isVisible());
  await page.locator('#hud [data-tool="timeline"]').click();
  check(shut && await page.locator('#reel-tl').isVisible(), 'the HUD\'s Timeline button shuts the panel and opens it again');
  await page.evaluate(() => REEL_LIVE.seek(7));
  await page.waitForTimeout(600);                  // fonts settle before the picture
  await page.screenshot({ path: path.join(SHOTS, 'timeline-panel.png') });

  // 2 ── drag the answer scene's right edge +0.5 s with Shift
  let s = await pxs();
  const dur0 = await page.evaluate(() => REEL_LIVE.duration);
  await saving('scene edge', () => dragBy('#reel-tl .tl-sc[data-scene="2"] .tl-grip', 0.5 * s, true));
  check(/^SCENE answer 5\s/m.test(file()), 'the edge drag saved "SCENE answer 5"', (/^SCENE answer.*$/m.exec(file()) || [])[0]);
  const dur = await page.evaluate(() => REEL_LIVE.duration);
  check(Math.abs(dur - (dur0 + 0.5)) < 1e-9, `the reel runs 0.5 s longer, in place (${dur0} → ${dur0 + 0.5} s)`, dur);
  check(await page.locator('#reel-tl').isVisible() && await page.locator('#reel-tl .tl-sc').count() === 11, 'the panel stays open, its cards drawn again');

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
  check(w === 'Freehand drawing', 'the parse has the new words, at once', w);
  check(await page.locator('#reel-tl .tl-insp-col').isVisible(), 'the inspector stays open');
  const foc = await page.evaluate(() => { const a = document.activeElement; return a && a.dataset ? { key: a.dataset.key, v: a.value } : null; });
  check(foc && foc.key === 'line' && foc.v === 'Freehand drawing', 'and the field you pressed Enter in keeps the focus, with its new words', JSON.stringify(foc));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
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

  // 4b ── zoom, and a stat's @ is a moment like any other
  await page.locator('#reel-tl [data-act="zoom-in"]').click();
  const z1 = await page.evaluate(() => REEL_TIMELINE.zoomLevel);
  check(z1 > 1.5 && await page.locator('#reel-tl .tl-lane').evaluate(e => e.clientWidth > e.parentElement.clientWidth * 1.5), 'the + button zooms in, and the lane scrolls', z1);
  await page.evaluate(() => REEL_TIMELINE.zoom(10));
  const stat = '#reel-tl .tl-bt.tl-f[title^="@1.15 "]';
  check(await page.locator(stat).count() === 1, 'the answer\'s second stat is a moment of its own');
  await page.locator(stat).scrollIntoViewIfNeeded();
  s = await pxs();
  await saving('stat', () => dragBy(stat, 0.35 * s, false));
  const statLine = (/^\s*stat\s+@\S+ 3 products shipped$/m.exec(file()) || [''])[0];
  check(/@1\.5 /.test(statLine), 'dragging it +0.35 s rewrote its @ on the 0.25 s grid (@1.5)', statLine);
  check(await page.evaluate(() => REEL_TIMELINE.zoomLevel) > 9, 'the zoom stays through a save');
  await saving('undo stat', () => page.locator('#reel-tl [data-act="undo"]').click());
  check(/^\s*stat\s+@1\.15 3 products shipped$/m.test(file()), 'the Undo button takes it back');
  await page.locator(stat).scrollIntoViewIfNeeded();
  await page.locator(stat).click();
  const lit = await page.evaluate(() => { const r = document.querySelector('#reel-tl .tl-insp-col .tl-hl'); const i = r && r.querySelector('input'); return i ? i.value : null; });
  check(lit === '@1.15 3 products shipped', 'clicking a moment opens its scene in the inspector, its line lit', lit);
  await page.locator('#reel-tl [data-act="fit"]').click();
  check(await page.evaluate(() => REEL_TIMELINE.zoomLevel) === 1, 'Fit shows the whole reel again');
  await page.locator('#reel-tl [data-act="export"]').click();
  const ex = await page.evaluate(() => ({ open: !document.getElementById('reel-ex').hidden, go: document.querySelector('#reel-ex .ex-go').textContent, mode: REEL_EXPORT.mode }));
  check(ex.open && ex.mode === 'dev' && /^Render/.test(ex.go), 'Export video opens the export panel, which renders here on the dev server', JSON.stringify(ex));
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.getElementById('reel-ex').hidden), 'Esc shuts it');
  await page.screenshot({ path: path.join(SHOTS, 'timeline-zoomed.png') });

  // 4c ── the media picker: a slot's picture or clip, chosen by looking at it
  await page.evaluate(() => REEL_TIMELINE.select(3, true));        // the art scene: two pictures
  await page.waitForFunction(() => { const t = document.querySelector('#reel-tl .tl-mchip .tl-mth'); return t && /url\(/.test(t.style.backgroundImage); }, null, { timeout: 15000 }).catch(() => {});
  const chip = page.locator('#reel-tl .tl-mchip').first();
  const c0 = await chip.evaluate(b => ({ name: b.querySelector('.tl-mnm').textContent, thumb: b.querySelector('.tl-mth').style.backgroundImage }));
  check(c0.name === 'earthstar-painting.webp' && /url\(/.test(c0.thumb), 'an img line shows its picture and its name as a chip', JSON.stringify(c0));
  await chip.click();
  await page.waitForFunction(() => document.querySelectorAll('#reel-pk .pk-tile').length > 40, null, { timeout: 20000 }).catch(() => {});
  const pk = await page.evaluate(() => ({ open: !document.getElementById('reel-pk').hidden, n: document.querySelectorAll('#reel-pk .pk-tile').length,
    cur: (document.querySelector('#reel-pk .pk-cur') || { dataset: {} }).dataset.path, head: document.querySelector('#reel-pk h2').textContent }));
  check(pk.open && pk.n >= 50 && pk.cur === './earthstar-painting.webp' && pk.head === 'Choose a picture', `the chip opens the picker: ${pk.n} pictures, the slot's own marked`, JSON.stringify(pk));
  await page.screenshot({ path: path.join(SHOTS, 'media-picker.png') });
  await page.locator('#reel-pk input[type=search]').fill('jhana-3');
  const one = await page.locator('#reel-pk .pk-tile').count();
  await saving('pick', () => page.locator('#reel-pk input[type=search]').press('Enter'));
  const artImg = (/^\s*img\s+\.\/\S+$/m.exec(file()) || [''])[0];
  check(one === 1 && /\.\/jhana-3\.webp$/.test(artImg), 'searching and pressing Enter puts that picture in the slot', `${one} tile(s); ${artImg.trim()}`);
  await saving('undo pick', () => page.locator('#reel-tl [data-act="undo"]').click());
  check(file().includes('img      ./earthstar-painting.webp'), 'and Undo takes it back');
  await page.evaluate(() => REEL_TIMELINE.select(5, true));        // the results: its items' clips
  await page.locator('#reel-tl .tl-mchip').first().click();          // nanome-hero, from 6.2
  await page.waitForFunction(() => document.querySelectorAll('#reel-pk .pk-tile').length >= 5, null, { timeout: 20000 }).catch(() => {});
  const nClips = await page.locator('#reel-pk .pk-tile').count(), nDur = await page.locator('#reel-pk .pk-tile .pk-dur').count();
  check(nClips >= 7 && nDur === nClips && (await page.locator('#reel-pk h2').textContent()) === 'Choose a clip', `a video line's picker offers the clips, each with its length (${nClips})`);
  await saving('pick clip', () => page.locator('#reel-pk .pk-tile[data-path="./BadVR-AROC-hud.mp4"]').click());
  const swapped = /video\s+\.\/BadVR-AROC-hud\.mp4\n\s*from\s+(\S+)/.exec(file());
  check(swapped && swapped[1] === '0', 'a clip shorter than the slot\'s in-point starts at 0 (from 6.2 → 0)', swapped && swapped[0]);
  await saving('undo clip', () => page.locator('#reel-tl [data-act="undo"]').click());
  check(/video\s+\.\/nanome-hero\.mp4\n\s*from\s+6\.2\b/.test(file()), 'Undo restores the clip and its in-point');

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

  // 6 ── narrow windows: the collapse rule (scripts/reel-ui.js)
  const narrow = () => page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const bars = [document.getElementById('hud'), document.querySelector('#reel-tl .tl-status')];
    const btns = [...document.querySelectorAll('#hud button, #reel-tl button')].filter(vis);
    const col = document.querySelector('#reel-tl .tl-insp-col'), tl = document.getElementById('reel-tl');
    return {
      hudFit: +bars[0].dataset.fit, statusFit: +bars[1].dataset.fit,
      overflow: [...bars, ...btns].filter(e => vis(e) && e.scrollWidth > e.clientWidth + 1).map(e => e.getAttribute('aria-label') || e.id || e.className),
      outside: btns.filter(b => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5; }).map(b => b.getAttribute('aria-label')),
      slim: tl.classList.contains('tl-slim'), panel: Math.round(tl.getBoundingClientRect().width),
      insp: col && !col.hidden ? Math.round(col.getBoundingClientRect().width) : 0,
    };
  });
  await page.evaluate(() => REEL_TIMELINE.select(5, true));
  await page.setViewportSize({ width: 820, height: 640 });
  await sleep(500);
  let nw = await narrow();
  check(!nw.overflow.length && !nw.outside.length, '820 px, inspector open: no button overflows its box or leaves the window', JSON.stringify(nw));
  check(nw.hudFit >= 1 && nw.statusFit >= 1 && !nw.slim && nw.insp > 0 && nw.insp < nw.panel,
    `820 px: the HUD and the status bar fold (steps ${nw.hudFit} and ${nw.statusFit}); the inspector sits beside the cards (${nw.insp} of ${nw.panel} px)`, JSON.stringify(nw));
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(500);
  nw = await narrow();
  check(!nw.overflow.length && !nw.outside.length, '390 px: no button overflows its box or leaves the window', JSON.stringify(nw));
  check(nw.slim && nw.insp === nw.panel, '390 px: the panel is slim and the inspector opens over all of it', JSON.stringify(nw));
  const more = page.locator('#hud .more');
  check(await more.isVisible() && !(await page.locator('#hud .tp [data-do="fwd"]').isVisible()), '390 px: the seek buttons fold into a More menu');
  await more.click();
  const items = await page.locator('#hud .menu [role="menuitem"]').count();
  const m0 = await page.evaluate(() => REEL_LIVE.now());
  await page.locator('#hud .menu [data-do="fwd"]').click();
  const m1 = await page.evaluate(() => REEL_LIVE.now());
  check(items === 3 && Math.abs(m1 - m0 - 5) < 0.3 && await page.locator('#hud .menu').isHidden(),
    `More holds restart, back and forward; Forward moves 5 s and shuts the menu (${m0.toFixed(2)} → ${m1.toFixed(2)})`);
  await more.click(); const menuOn = await page.locator('#hud .menu').isVisible();
  await more.click(); const menuOff = await page.locator('#hud .menu').isHidden();
  check(menuOn && menuOff, 'More opens its menu, and a second click on it shuts it', JSON.stringify({ menuOn, menuOff }));
  await page.keyboard.press('m');
  await sleep(500);
  const rk = await page.evaluate(() => { const r = document.getElementById('reel-rack'), b = r.getBoundingClientRect(), h = document.getElementById('hud').getBoundingClientRect();
    return { over: r.classList.contains('rk-over'), w: Math.round(b.width), foot: Math.round(b.bottom), hudTop: Math.round(h.top), vw: innerWidth }; });
  check(rk.over && rk.w === rk.vw && Math.abs(rk.foot - rk.hudTop) <= 1, '390 px: the synth rack lies over the preview, the window\'s width, and stops at the HUD', JSON.stringify(rk));
  await page.keyboard.press('m');
  await page.setViewportSize({ width: 1600, height: 900 });
  await sleep(500);
  nw = await narrow();
  check(nw.hudFit === 0 && nw.statusFit === 0 && !nw.slim, 'back at 1600 px every label returns', JSON.stringify(nw));

  check(reloads === 0, 'no edit reloaded the page: every one played in place', reloads + ' reloads');
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
