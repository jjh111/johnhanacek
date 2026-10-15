// The shot list (scripts/reel-shots.js), end to end: a real dev server, the real rig in Chromium,
// real clicks, drags and keys, and the script file on disk as the judge.
//   node "Agent Reference/reel-tests/shotstest.mjs"
// Works on a temp copy of the cut (Assets/zz-shots-test.script.txt, played through ?script=),
// removed in finally with the backups the dev server kept of it.
//   1. S opens the list beside the preview (the stage makes room), its HUD button pressed; the
//      Fish panel, which shares that side, shuts it, and S brings it back
//   2. a row per shot in the script's order, the one under the playhead marked
//   3. a click on a row goes to its shot and opens it
//   4. a row dragged past another moves its scene in the file: one save, played in place, the
//      cut as long as before, the moved shot open; the timeline's Undo puts it back byte for byte
//   5. Alt+↓ on a row and the Later button move a shot one place
//   6. the open shot's transitions: arrive typed is `cue arrive` in its scene, emptied is gone;
//      its curve is `cue ease`
//   7. every shot: arrive typed is a `cue arrive` line above the first scene; the rows say so
//   8. its length typed is its SCENE line's length
//   9. Duplicate puts a copy after it; Delete takes it out again
//  10. in an 820 px window the list lies over the preview, and nothing overflows
//  11. no edit reloaded the page; no page errors
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { inOrder } from './inorder.mjs';   // the scenes in the order the suite was written for

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RS = createRequire(import.meta.url)(path.join(ROOT, 'scripts/reel-script.js'));
const NAME = 'zz-shots-test.script.txt', TMP = path.join(ROOT, 'Assets', NAME);
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
const ORIG = inOrder(fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8'));
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const file = () => fs.readFileSync(TMP, 'utf8');
const kinds = () => RS.parse(file()).edit.scenes.map(s => s.type);
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
  const ready = what => page.waitForFunction(() => window.REEL_LIVE && window.REEL_SHOTS && window.REEL_TIMELINE && !document.getElementById('boot'), null, { timeout: 60000 })
    .catch(e => { throw new Error(`${what}: the preview did not come back (${e.message})`); });
  // one save: it plays in place (the version counts up and the mark survives), then it is kept
  let reloads = 0;
  const saving = async (what, act) => {
    const v0 = await page.evaluate(() => { window.__mark = true; return REEL_LIVE.version; });
    await act();
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(() => ({ mark: !!window.__mark, v: window.REEL_LIVE ? REEL_LIVE.version : -1 })).catch(() => ({ mark: false, v: -1 }));
      if (!st.mark) { reloads++; console.log(`     (${what} reloaded the page)`); break; }
      if (st.v > v0) break;
      if (Date.now() - t0 > 20000) throw new Error(`${what}: the edit did not play`);
      await page.waitForTimeout(50);
    }
    await ready(what);
    await page.evaluate(() => REEL_LIVE.settled());
    await page.waitForTimeout(200);
  };
  const rows = () => page.evaluate(() => [...document.querySelectorAll('#reel-shots .sh-row')].map(r => ({ i: +r.dataset.i, kind: r.querySelector('.sh-top b').textContent,
    now: r.classList.contains('sh-now'), sel: r.classList.contains('sh-sel') })));
  await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${NAME}#t=7&pause=1`);
  await ready('first load');

  // 1. open, and the side it shares with the Fish panel
  await page.keyboard.press('s');
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => ({ open: REEL_SHOTS.isOpen, pressed: document.querySelector('#hud [data-tool="shots"]').getAttribute('aria-pressed'),
    left: REEL_LIVE.view().x, panel: document.getElementById('reel-shots').getBoundingClientRect().right }));
  check(o.open && o.pressed === 'true' && o.left >= o.panel - 1, 'S opens the shot list beside the preview: the stage starts right of it', JSON.stringify(o));
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => ({ shots: REEL_SHOTS.isOpen, fish: REEL_FISH.isOpen }));
  await page.keyboard.press('f'); await page.waitForTimeout(200);
  await page.keyboard.press('s'); await page.waitForTimeout(300);
  check(!sw.shots && sw.fish && await page.evaluate(() => REEL_SHOTS.isOpen && !REEL_FISH.isOpen), 'the Fish panel, which shares its side, shuts it; S brings it back', JSON.stringify(sw));

  // 2. the rows
  let R = await rows();
  check(R.map(r => r.kind).join(' ') === kinds().join(' ') && R.length === 12, `a row per shot, in the script's order (${R.map(r => r.kind).join(' ')})`);
  check(R.findIndex(r => r.now) === 2, 'the shot under the playhead (the answer, at 7 s) is marked', JSON.stringify(R.map(r => r.now)));

  // 3. a click goes there and opens it
  await page.locator('#reel-shots .sh-row[data-i="3"]').click();
  await page.waitForTimeout(400);
  const art = await page.evaluate(() => ({ t: REEL_LIVE.now(), start: REEL_LIVE.scenes[3].start, sel: REEL_SHOTS.selected, ed: !!document.querySelector('#reel-shots .sh-ed[data-shot="3"]') }));
  check(Math.abs(art.t - art.start) < 0.05 && art.sel === 3 && art.ed, 'a click on the art\'s row goes to its start and opens it', JSON.stringify(art));

  // 4. drag the answer below the logos (its open shot shut first, so the rows sit together)
  await page.evaluate(() => REEL_SHOTS.select(null));
  await page.waitForTimeout(300);
  const dur0 = await page.evaluate(() => REEL_LIVE.duration), before = file();
  const box = async i => page.locator(`#reel-shots .sh-row[data-i="${i}"]`).boundingBox();
  await page.evaluate(() => { document.querySelector('#reel-shots .sh-body').scrollTop = 0; });
  await saving('drag', async () => {
    const b0 = await box(2), t = await box(6);
    await page.mouse.move(b0.x + 140, b0.y + b0.height / 2); await page.mouse.down();
    const y1 = t.y + t.height * 0.75;           // past the logos' middle: it lands after the logos
    for (let k = 1; k <= 12; k++) await page.mouse.move(b0.x + 140, b0.y + b0.height / 2 + (y1 - b0.y - b0.height / 2) * k / 12);
    await page.mouse.up();
  });
  const moved = kinds();
  const after = await page.evaluate(() => ({ dur: REEL_LIVE.duration, sel: REEL_SHOTS.selected, order: REEL_SHOTS.rows() }));
  check(moved.join(' ') === 'open title art command results feature answer logos quotes offer offer end', `dragged past the feature, the answer moves in the file (${moved.join(' ')})`);
  check(Math.abs(after.dur - dur0) < 1e-9 && after.sel === 6 && after.order.join(' ') === moved.join(' '), 'one save, played in place: the cut as long as before, the list in the new order, the moved shot open', JSON.stringify(after));
  await saving('undo', () => page.keyboard.press('Control+z'));
  check(file() === before, 'the timeline\'s Undo (⌘Z) puts it back, byte for byte');

  // 5. Alt+↓ and Later
  await page.evaluate(() => REEL_SHOTS.select(4));
  await page.waitForTimeout(200);
  await page.locator('#reel-shots .sh-row[data-i="4"]').focus();
  await saving('alt-down', () => page.keyboard.press('Alt+ArrowDown'));
  check(kinds().slice(4, 6).join(' ') === 'results command', 'Alt+↓ on the command\'s row moves it one place later', kinds().join(' '));
  await saving('later', () => page.locator('#reel-shots [data-act="down"]').click());
  check(kinds().slice(4, 7).join(' ') === 'results feature command', 'the Later button moves it one more', kinds().join(' '));
  await saving('undo 2', () => page.keyboard.press('Control+z'));
  await saving('undo 3', () => page.keyboard.press('Control+z'));
  check(file() === before, 'two undos: the order as it was');

  // 6. a shot's transitions
  await page.evaluate(() => REEL_SHOTS.select(2));
  await page.waitForTimeout(300);
  const ed = '#reel-shots .sh-ed[data-shot="2"]';
  await saving('arrive', async () => { const i = page.locator(`${ed} input[data-cue="arrive"]`); await i.fill('0.3'); await i.press('Enter'); });
  let P = RS.parse(file());
  check(P.edit.scenes[2].cues && P.edit.scenes[2].cues.arrive === 0.3, 'the answer\'s arrive typed: "cue arrive 0.3" in its scene');
  await saving('ease', () => page.locator(`${ed} select[data-cue="ease"]`).selectOption('cubic'));
  P = RS.parse(file());
  check(P.edit.scenes[2].cues.ease === 'cubic', 'its curve chosen: "cue ease cubic"');
  const chips = await page.evaluate(() => [...document.querySelectorAll('#reel-shots .sh-row[data-i="2"] .sh-chip')].map(c => [c.textContent, c.className]));
  check(chips.some(([t, c]) => /arrive 0\.3s/.test(t) && /own-set/.test(c)) && chips.some(([t]) => t === 'cubic'), 'its row says so, in gold: arrive 0.3s, cubic', JSON.stringify(chips));
  await saving('arrive empty', async () => { const i = page.locator(`${ed} input[data-cue="arrive"]`); await i.fill(''); await i.press('Enter'); });
  check(RS.parse(file()).edit.scenes[2].cues.arrive == null, 'emptied, the cue line is gone (the default again)');

  // 7. every shot
  await page.evaluate(() => { document.querySelector('#reel-shots .sh-every').open = true; });
  await saving('every', async () => { const i = page.locator('#reel-shots .sh-every input[data-cue="arrive"]'); await i.fill('0.45'); await i.press('Enter'); });
  P = RS.parse(file());
  const top = file().split('\n').slice(0, P.marks.find(m => m.kind === 'scene').ln).filter(l => /^cue\s+arrive\s+0\.45$/.test(l));
  const every = await page.evaluate(() => [...document.querySelectorAll('#reel-shots .sh-row[data-i="5"] .sh-chip')].map(c => [c.textContent, c.className]));
  check(top.length === 1 && P.edit.cues.arrive === 0.45 && every.some(([t, c]) => /arrive 0\.45s/.test(t) && /every-set/.test(c)), 'every shot\'s arrive typed: a "cue arrive 0.45" line above the first scene, and every row says so', JSON.stringify(every));

  // 8. length
  await saving('length', async () => { const i = page.locator(`${ed} input[data-cue="dur"]`); await i.fill('5'); await i.press('Enter'); });
  check(/^SCENE answer 5\s/m.test(file()), 'its length typed: "SCENE answer 5"');

  // 9. duplicate and delete
  await saving('duplicate', () => page.locator(`${ed} [data-act="duplicate"]`).click());
  check(kinds().length === 13 && kinds()[3] === 'answer', 'Duplicate puts a copy of the answer right after it', kinds().join(' '));
  await saving('delete', () => page.locator('#reel-shots .sh-ed [data-act="delete"]').click());
  check(kinds().length === 12, 'Delete takes the shot out again', kinds().join(' '));

  // 10. narrow
  await page.setViewportSize({ width: 820, height: 640 });
  await page.waitForTimeout(500);
  const nw = await page.evaluate(() => {
    const r = document.getElementById('reel-shots'), b = r.getBoundingClientRect();
    const over = [...r.querySelectorAll('button')].filter(x => x.offsetParent && x.scrollWidth > x.clientWidth + 1).map(x => x.textContent.trim());
    return { over: r.classList.contains('sh-over'), left: REEL_LIVE.view().x, right: b.right, vw: innerWidth, overflow: over, sideways: r.querySelector('.sh-body').scrollWidth > r.querySelector('.sh-body').clientWidth + 1 };
  });
  check(nw.over && nw.right <= nw.vw && nw.left < 200 && !nw.overflow.length && !nw.sideways, 'in an 820 px window the list lies over the preview, which keeps its room, and nothing overflows', JSON.stringify(nw));

  // 11.
  check(reloads === 0, 'no edit reloaded the page', String(reloads));
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
