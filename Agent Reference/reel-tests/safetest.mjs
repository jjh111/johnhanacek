// The safe areas and the scene's place (scripts/reel-safe.js, G), end to end: a real dev server,
// the preview in Chromium in the square frame, real keys and drags, the file on disk as the judge.
//   node "Agent Reference/reel-tests/safetest.mjs"
// Works on a temp copy (Assets/zz-safe-test.script.txt, played through ?script=), removed in finally.
//   1. G draws action safe (93%) and title safe (90%) over the frame, the HUD's Safe pressed
//   2. paused in the answer, every line inside title safe: the bar says so, nothing outlined
//   3. a drag on the stage moves the scene: one line, "place square <dx> <dy>", the frame px the
//      pointer moved; its copy now crosses, outlined in red, the bar counting it
//   4. Shift keeps a drag to one axis; Reset takes the line out (the file as it was, byte for byte)
//   5. the timeline's Undo takes a place back
//   6. the opening's caption in close (2.1×) stays inside title safe in this frame
//   7. no page errors
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = 'zz-safe-test.script.txt', FILE = path.join(ROOT, 'Assets', NAME), BACKUPS = path.join(ROOT, '.local', 'reel-backups');
const ORIG = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const file = () => fs.readFileSync(FILE, 'utf8');
// the place lines the test's own drags wrote (a place John set elsewhere in the cut is left out)
const placesIn = t => t.split('\n').filter(l => /^\s*place\s/.test(l)).map(l => l.trim().replace(/\s+/g, ' '));
const places = () => { const had = placesIn(ORIG); return placesIn(file()).filter(l => !had.includes(l)); };
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { if (fn()) return true; if (Date.now() - t0 > ms) return false; await sleep(80); } };

let child, browser;
try {
  fs.writeFileSync(FILE, ORIG);
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.REEL_LIVE && window.REEL_SAFE && !document.getElementById('boot'), null, { timeout: 60000 });
  // the answer, all of it in (its stats land 1.45 s after it starts)
  const answerAt = await (async () => { const RS = (await import('node:module')).createRequire(import.meta.url)(path.join(ROOT, 'scripts/reel-script.js'));
    const e = RS.parse(ORIG).edit, sp = RS.spans(e), i = e.scenes.findIndex(s => s.type === 'answer'); return { t: sp[i].start + 3.2, i }; })();
  await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${NAME}&format=square#t=${answerAt.t}&pause=1`);
  await ready();
  await page.evaluate(() => sessionStorage.removeItem('reel-safe-on'));
  if (await page.evaluate(() => !document.getElementById('reel-tl').hidden)) await page.keyboard.press('e');   // the stage to itself
  await sleep(400);

  // 1 ── G
  await page.mouse.click(5, 5);
  await page.keyboard.press('g');
  await sleep(500);
  const g = await page.evaluate(() => {
    const ov = document.getElementById('reel-safe'), r = s => { const b = ov.querySelector('.sa.' + s).getBoundingClientRect(); return [b.width, b.height]; };
    const st = document.getElementById('stage').getBoundingClientRect();
    return { shown: !ov.hidden, a: r('a'), t: r('t'), stage: [st.width, st.height], pressed: document.querySelector('#hud [data-tool="safe"]').getAttribute('aria-pressed') };
  });
  const share = (x, y) => [x[0] / y[0], x[1] / y[1]].map(v => +v.toFixed(3));
  check(g.shown && g.pressed === 'true' && share(g.a, g.stage).every(v => Math.abs(v - 0.93) < 0.005) && share(g.t, g.stage).every(v => Math.abs(v - 0.9) < 0.005),
    `G draws action safe (${share(g.a, g.stage).join(' × ')}) and title safe (${share(g.t, g.stage).join(' × ')}) over the square frame, the HUD's Safe pressed`, JSON.stringify(g));

  // 2 ── clean
  const state = () => page.evaluate(() => ({ bad: document.querySelectorAll('#reel-safe .bad').length, say: document.querySelector('#reel-safe-bar .say').textContent }));
  let s = await state();
  check(s.bad === 0 && /every line inside title safe/.test(s.say), `the answer: every line inside title safe ("${s.say}")`, JSON.stringify(s));

  // 3 ── a drag moves the scene, one line
  const v = await page.evaluate(() => REEL_LIVE.view());
  const before = file();
  const cx = v.x + 540 * v.s, cy = v.y + 400 * v.s, dx = 160 * v.s, dy = 40 * v.s;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(cx + dx * k / 12, cy + dy * k / 12);
  await page.mouse.up();
  await until(() => file() !== before);
  const p1 = places();
  check(p1.length === 1 && /^place square 1[56]\d 3\d$|^place square 1[56]\d 4\d$/.test(p1[0]), `a drag of 160 × 40 frame px writes one line: "${p1[0]}"`, JSON.stringify(p1));
  await sleep(600);
  s = await state();
  check(s.bad > 0 && /outside title safe/.test(s.say), `its copy now crosses the right edge: ${s.bad} outlined ("${s.say.slice(0, 70)}…")`, JSON.stringify(s));
  const moved = await page.evaluate(i => document.querySelector(`#scenes .seg[data-scene="${i}"]`).style.translate, answerAt.i);
  check(/^1[56]\dpx 3\dpx$|^1[56]\dpx 4\dpx$/.test(moved), `the scene plays there at once (translate ${moved})`);

  // 4 ── Shift, then Reset
  const b2 = file();
  await page.keyboard.down('Shift');
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(cx + 30 * v.s * k / 12, cy + 120 * v.s * k / 12);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await until(() => file() !== b2);
  const p2 = places();
  const [, x1, y1] = p1[0].match(/(-?\d+) (-?\d+)$/).map(Number), [, x2, y2] = p2[0].match(/(-?\d+) (-?\d+)$/).map(Number);
  check(x2 === x1 && Math.abs(y2 - y1 - 120) <= 2, `Shift keeps a drag to one axis: ${p1[0]} → ${p2[0]}`);
  await page.locator('#reel-safe-bar button', { hasText: 'Reset' }).click();
  await until(() => file() === ORIG);
  check(file() === ORIG, 'Reset takes the line out: the script as it was, byte for byte');

  // 5 ── Undo
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(cx, cy - 50 * v.s * k / 8);
  await page.mouse.up();
  await until(() => places().length === 1);
  await sleep(300);
  await page.keyboard.press('Control+z');
  await until(() => file() === ORIG);
  check(file() === ORIG, `the timeline's Undo takes a place back`);

  // 6 ── the opening's caption, in close
  await page.evaluate(() => { REEL_LIVE.seek(1.6); });
  await sleep(700);
  const cap = await page.evaluate(() => {
    const v = REEL_LIVE.view(), T = REEL_SAFE.title, out = [];
    for (const el of document.querySelectorAll('#scenes .seg.on .guide .lm')) {
      const r = (el.querySelector(':scope > .li') || el).getBoundingClientRect();
      if (r.width < 2) continue;
      out.push({ x0: (r.left - v.x) / v.s, x1: (r.right - v.x) / v.s });
    }
    return { out, T };
  });
  const inside = cap.out.length === 2 && cap.out.every(b => b.x0 >= cap.T.x0 - 1 && b.x1 <= cap.T.x1 + 1);
  check(inside, `the opening's caption in close stays inside title safe (${cap.out.map(b => Math.round(b.x0) + '-' + Math.round(b.x1)).join(', ')} of ${Math.round(cap.T.x0)}-${Math.round(cap.T.x1)})`, JSON.stringify(cap));

  // 7 ── no errors
  check(errors.length === 0, 'no page errors', errors.join(' | '));
} catch (e) {
  check(false, 'the run: ' + e.message);
} finally {
  if (browser) await browser.close();
  if (child) child.kill();
  fs.rmSync(FILE, { force: true });
  try { for (const f of fs.readdirSync(BACKUPS)) if (f.includes('zz-safe-test')) fs.rmSync(path.join(BACKUPS, f), { force: true }); } catch (e) { /* none */ }
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
