// The music under the timeline (scripts/reel-timeline.js, drawing the synth rack's score:
// scripts/reel-rack.js), end to end: a real dev server, the rig in Chromium, real clicks, drags and
// keys, and the files on disk as the judge.
//   node "Agent Reference/reel-tests/musiclanestest.mjs"
// Works on temp copies (Assets/zz-mlane-test.script.txt and .score.txt, played through ?script=),
// removed in finally with the dev server's backups of them.
//   1. under the fish lanes: a head per section where its music plays (to 2 px), its chords on
//      the bars, a dashed line where the picture cuts when the music arrives on a bar beside it,
//      a chip on every seam (how the music crosses it), and, open, a ribbon of each flowing
//      instrument's level and the builds' own notes (a fill, a rise, a crash) on their lanes
//   2. open: a lane per instrument with a cell per section, lit where the score plays it, and a lane
//      per sound effect with a tick per moment; M and S beside every lane
//   3. one Undo for both files: a scene's edge dragged, then a cell clicked; Ctrl+Z takes back the
//      cell (the score as it was), Ctrl+Z again the edge (the script as it was); Ctrl+Shift+Z gives
//      the edge back, and Ctrl+Z takes it again
//   4. a click on a silent cell plays the instrument there (one line of the score), a click again
//      stops it; Alt-click halves a level and gives it back; a drag up raises a level
//   5. M mutes (the engine's, never the file's) and dims its lane; S solos and dims the others
//   6. a sound effect's tick: a click plays from just before it
//   7. the chevron shuts the music to its head and the panel loses the lanes' height; shut stays
//      shut after a reload by hand, and opens again
//   8. a short window: the panel stops where the preview would get too small, its lanes scroll up
//      and down under a ruler that stays, and the M and S column moves with them
//  1b. a click on a seam's chip writes the next way in (fade → swell) to the score, and Undo
//      takes it back
//   9. no edit reloads the page; no page errors
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = 'zz-mlane-test.script.txt', SCRIPT = path.join(ROOT, 'Assets', NAME), SCORE = SCRIPT.replace(/\.script\.txt$/, '.score.txt');
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
const ORIG = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
const ORIG_SCORE = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.score.txt'), 'utf8');
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const script = () => fs.readFileSync(SCRIPT, 'utf8'), score = () => fs.readFileSync(SCORE, 'utf8');
const playLine = (text, ref) => ((new RegExp(`^SECTION ${ref}\\n(?:.*\\n)*?  play +(.*)$`, 'm')).exec(text) || [])[1] || '';
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// wait until fn(file) holds (saves are debounced and written by the dev server)
const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { if (fn()) return true; if (Date.now() - t0 > ms) return false; await sleep(80); } };

let child, browser;
try {
  fs.writeFileSync(SCRIPT, ORIG); fs.writeFileSync(SCORE, ORIG_SCORE);
  const port = await freePort();
  child = spawn(process.execPath, [path.join(ROOT, 'scripts/reel-dev.mjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error('no listening line in 5 s: ' + out)), 5000);
    child.stdout.on('data', d => { out += d; const m = /^reel-dev: (http:\/\/127\.0\.0\.1:\d+)\//m.exec(out); if (m) { clearTimeout(t); resolve(m[1]); } });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', c => reject(new Error('server exited ' + c + ': ' + out)));
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.fulfill({ status: 404, body: '' }));           // the clips do not matter here
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.REEL_LIVE && window.REEL_TIMELINE && window.REEL_RACK && window.REEL_RACK.parsed
    && document.querySelector('#reel-tl .tl-mh[data-ref]') && !document.getElementById('boot'), null, { timeout: 60000 });
  await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${NAME}#t=27&pause=1`);
  await ready();
  await page.evaluate(() => { window.__mark = true; sessionStorage.removeItem('reel-tl-music'); });
  if (await page.evaluate(() => document.getElementById('reel-tl').hidden)) await page.keyboard.press('e');
  await page.evaluate(() => REEL_TIMELINE.music.open(true));
  await sleep(300);

  // 1 ── under the fish lanes: the sections where their music plays, chords, cuts, seams, ribbons
  const geo = await page.evaluate(() => {
    const r = e => e.getBoundingClientRect(), lane = document.querySelector('#reel-tl .tl-lane'), x0 = r(lane).left, pxs = lane.clientWidth / REEL_LIVE.duration;
    const A = REEL_RACK.arrangement;
    const fish = [...document.querySelectorAll('#reel-tl .tl-fl')].reduce((b, e) => Math.max(b, r(e).bottom), 0);
    const heads = [...document.querySelectorAll('#reel-tl .tl-mh[data-ref]')].map(e => ({ ref: e.dataset.ref, l: r(e).left - x0, rt: r(e).right - x0, top: r(e).top }));
    const want = A.sections.map(sc => ({ l: sc.start * pxs, rt: sc.end * pxs }));
    const runs = A.sections.reduce((n, sc) => n + sc.harmony.filter((h, i, all) => !i || h.chord.name !== all[i - 1].chord.name).length, 0);
    return { fish, heads, want, chords: document.querySelectorAll('#reel-tl .tl-mch').length, runs,
      cuts: document.querySelectorAll('#reel-tl .tl-mcut').length, offCut: A.sections.filter(sc => Math.abs(sc.start - sc.cut) > 1e-6).length,
      seams: [...document.querySelectorAll('#reel-tl button.tl-mseam')].map(b => b.dataset.ref + ':' + b.dataset.kind).join(' '),
      wantSeams: A.transitions.map(t => t.ref + ':' + t.kind).join(' '),
      ribbons: [...document.querySelectorAll('#reel-tl svg.tl-mrib')].map(s => s.dataset.track).sort().join(), levels: Object.keys(A.levels).sort().join(),
      ramp: (() => { const p = document.querySelector('#reel-tl svg.tl-mrib[data-track="hat"] path'); return p ? p.getAttribute('d').split('L').length : 0; })(),
      own: { snare: document.querySelectorAll('#reel-tl .tl-mtk.tl-x[data-track="snare"]').length, riser: document.querySelectorAll('#reel-tl .tl-mtk.tl-x[data-track="riser"]').length, crash: document.querySelectorAll('#reel-tl .tl-mtk.tl-x[data-track="crash"]').length } };
  });
  const aligned = geo.heads.every((hd, i) => geo.want[i] && Math.abs(hd.l - geo.want[i].l) <= 2 && Math.abs(hd.rt - geo.want[i].rt) <= 4);
  check(geo.heads.length === 11 && geo.heads.every(hd => hd.top > geo.fish) && aligned,
    `under the fish lanes, a head per section (${geo.heads.length}), each where its music plays to 2 px (on the bar near its cut)`, JSON.stringify({ heads: geo.heads.slice(0, 3), want: geo.want.slice(0, 3) }));
  check(geo.chords === geo.runs && geo.runs > 20 && geo.cuts === geo.offCut && geo.cuts >= 4,
    `the chords on the bars (${geo.chords}), and a dashed line where the picture cuts for each of the ${geo.cuts} sections whose music arrives on a bar beside it`, JSON.stringify(geo).slice(0, 300));
  check(geo.seams === geo.wantSeams && geo.seams.split(' ').length === 10, `a chip on every seam, naming how the music crosses it (${geo.seams})`, geo.seams + ' / ' + geo.wantSeams);
  check(geo.ribbons === geo.levels && geo.ribbons.split(',').length >= 8 && geo.ramp >= 6,
    `a ribbon of the level of each of the ${geo.ribbons.split(',').length} instruments that flow (the hat's: ${geo.ramp} points, its fades ramps)`, JSON.stringify({ ribbons: geo.ribbons, levels: geo.levels, ramp: geo.ramp }));
  check(geo.own.snare >= 2 && geo.own.riser >= 2 && geo.own.crash >= 3, `the seams' own notes on their lanes, in gold: a fill on the snare, a rise, a crash (${JSON.stringify(geo.own)})`);

  // 2 ── a lane per instrument and per sound effect, with M and S
  const lanes = await page.evaluate(() => {
    const P = REEL_RACK.parsed, A = REEL_RACK.arrangement, band = P.score.tracks.filter(t => !t.on), fx = P.score.tracks.filter(t => t.on);
    const plays = A.sections.reduce((n, s) => n + s.play.length, 0);
    // the letters of one question come 25 ms apart: one span of the keys lane each
    const kt = A.events.filter(e => e.track === 'keys').map(e => e.t).sort((a, b) => a - b);
    const keys = kt.length, bursts = kt.filter((t, i) => !i || t - kt[i - 1] >= 0.12).length, enters = REEL_LIVE.parsed.edit.scenes.filter(s => s.query).length;
    return { band: band.length, fx: fx.length, plays, keys, bursts, enters, sections: A.sections.length,
      enterTicks: document.querySelectorAll('#reel-tl .tl-mtk[data-track="enter"]').length,
      cells: document.querySelectorAll('#reel-tl .tl-mc').length, lit: document.querySelectorAll('#reel-tl .tl-mc.tl-on').length,
      rows: [...document.querySelectorAll('#reel-tl .tl-mms')].filter(r => r.querySelectorAll('button').length === 2).length,
      keyTicks: document.querySelectorAll('#reel-tl .tl-mtk[data-track="keys"]').length };
  });
  check(lanes.cells === lanes.band * lanes.sections && lanes.lit === lanes.plays && lanes.rows === lanes.band + lanes.fx,
    `open: ${lanes.band} instruments × ${lanes.sections} sections, ${lanes.lit} cells lit (the score plays ${lanes.plays}), M and S on all ${lanes.rows} lanes`, JSON.stringify(lanes));
  check(lanes.fx === 5 && lanes.keyTicks === lanes.bursts && lanes.bursts === lanes.enters && lanes.keys > 100 && lanes.enterTicks === lanes.enters,
    `the sound effects' lanes: a span of keys for each question typed (${lanes.bursts}, ${lanes.keys} letters), a tick per Enter (${lanes.enterTicks})`, JSON.stringify(lanes));

  // 1b ── a seam's chip: the next way in, written to the score, and back with Undo
  {
    const m00 = score();
    // the ways in go round: fade, swell, build, drop, cut
    await page.locator('#reel-tl button.tl-mseam[data-ref="art"]').click();
    const swelled = await until(() => /SECTION art\n(?:.*\n)*?  into +swell$/m.test(score()));
    const kind = await page.waitForFunction(() => { const b = document.querySelector('#reel-tl button.tl-mseam[data-ref="art"]'); return b && b.dataset.kind === 'swell' && b; }, null, { timeout: 5000 }).then(() => 'swell', () => 'unchanged');
    check(swelled && kind === 'swell', `a click on the art's chip (a fade) makes it the next way in, a swell: "into swell" in the score, the chip redrawn (${kind})`);
    await page.keyboard.press('Control+z');
    check(await until(() => score() === m00), 'Ctrl+Z takes the seam back: the score as it was');
  }

  // 3 ── one Undo for both files
  const s0 = script(), m0 = score();
  const pxs = await page.evaluate(() => document.querySelector('#reel-tl .tl-lane').clientWidth / REEL_LIVE.duration);
  const g = await page.locator('#reel-tl .tl-sc[data-scene="2"] .tl-grip').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.keyboard.down('Shift'); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(g.x + g.width / 2 + 0.5 * pxs * k / 8, g.y + g.height / 2);
  await page.mouse.up(); await page.keyboard.up('Shift');
  const s1ok = await until(() => /^SCENE answer 5\s/m.test(script()));
  const s1 = script();
  await page.locator('#reel-tl .tl-mc[data-track="lead"][data-ref="answer"]').click();
  const m1ok = await until(() => / lead$/.test(playLine(score(), 'answer')));
  const m1 = score();
  check(s1ok && m1ok, `a scene's edge dragged (the script: "SCENE answer 5"), then a silent cell clicked (the score's answer plays "${playLine(m1, 'answer')}")`);
  await page.keyboard.press('Control+z');
  const u1 = await until(() => score() === m0);
  check(u1 && script() === s1, 'Ctrl+Z takes back the cell: the score as it was, byte for byte, the script still edited');
  await page.keyboard.press('Control+z');
  const u2 = await until(() => script() === s0);
  check(u2 && score() === m0, 'Ctrl+Z again takes back the edge: the script as it was, byte for byte');
  await page.keyboard.press('Control+Shift+z');
  const r1 = await until(() => script() === s1);
  check(r1 && score() === m0, 'Ctrl+Shift+Z gives the edge back');
  await page.keyboard.press('Control+z');
  check(await until(() => script() === s0) && score() === m0, 'and Ctrl+Z takes it again: both files as they were');

  // 4 ── a click, an Alt-click, a drag
  const cellSel = (t, ref) => `#reel-tl .tl-mc[data-track="${t}"][data-ref="${ref}"]`;
  await page.locator(cellSel('lead', 'answer')).click();
  const on = await until(() => / lead$/.test(playLine(score(), 'answer')));
  const lit = await page.evaluate(s => document.querySelector(s).classList.contains('tl-on'), cellSel('lead', 'answer'));
  check(on && lit, `a click on a silent cell plays it there: answer plays "${playLine(score(), 'answer')}", and the cell is lit`);
  await page.locator(cellSel('lead', 'answer')).click();
  check(await until(() => score() === m0), 'a click again stops it: the score as it was');
  await page.locator(cellSel('pad', 'answer')).click({ modifiers: ['Alt'] });
  const half = await until(() => /\bpad:0\.5\b/.test(playLine(score(), 'answer')));
  check(half, `Alt-click halves its level: "${playLine(score(), 'answer')}"`);
  await page.locator(cellSel('pad', 'answer')).click({ modifiers: ['Alt'] });
  check(await until(() => score() === m0), 'Alt-click again: full, the score as it was');
  const b = await page.locator(cellSel('bass', 'art')).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 5 * k);
  await page.mouse.up();
  const raised = await until(() => /\bbass(?!:)\b/.test(playLine(score(), 'art')));
  check(raised, `dragging a lit cell up 30 px raises its level from 0.7 to full: art plays "${playLine(score(), 'art')}"`);
  await page.keyboard.press('Control+z');
  check(await until(() => score() === m0), 'Ctrl+Z puts the level back');

  // 5 ── mute and solo: the engine's, never the file's
  const mix = () => page.evaluate(() => {
    const E = REEL_RACK.engine, dim = t => [...document.querySelectorAll(`#reel-tl .tl-mc[data-track="${t}"]`)].every(e => e.classList.contains('tl-mute'));
    return { mutes: [...E.mutes], solos: [...E.solos], padDim: dim('pad'), kickDim: dim('kick'), bassDim: dim('bass'),
      mOn: document.querySelector('#reel-tl .tl-mms[data-track="pad"] button').classList.contains('tl-on') };
  });
  await page.locator('#reel-tl .tl-mms[data-track="pad"] button').first().click();
  await sleep(150);
  let mx = await mix();
  check(mx.mutes.join() === 'pad' && mx.padDim && !mx.kickDim && mx.mOn && score() === m0, 'M mutes pad in the engine, lights M and dims its lane; the score is untouched', JSON.stringify(mx));
  await page.locator('#reel-tl .tl-mms[data-track="pad"] button').first().click();
  await page.locator('#reel-tl .tl-mms[data-track="kick"] button').nth(1).click();
  await sleep(150);
  mx = await mix();
  check(!mx.mutes.length && mx.solos.join() === 'kick' && !mx.kickDim && mx.bassDim && mx.padDim, 'M again unmutes; S solos kick and dims every other lane', JSON.stringify(mx));
  await page.locator('#reel-tl .tl-mms[data-track="kick"] button').nth(1).click();
  await sleep(150);
  mx = await mix();
  check(!mx.solos.length && !mx.bassDim, 'S again: every lane back', JSON.stringify(mx));

  // 6 ── a sound effect's tick
  const tk = page.locator('#reel-tl .tl-mtk[data-track="enter"]').nth(1);
  const tt = +(await tk.getAttribute('data-t'));
  await tk.click();
  await sleep(150);
  const now = await page.evaluate(() => REEL_LIVE.now());
  check(Math.abs(now - (tt - 0.4)) < 0.05, `a click on the second Enter's tick (${tt} s) plays from just before it (${now.toFixed(2)} s)`);

  // 7 ── shut, a reload, open
  const hOpen = await page.evaluate(() => document.getElementById('reel-tl').getBoundingClientRect().height);
  await page.locator('#reel-tl button.tl-mtog').click();
  await sleep(200);
  const shut = await page.evaluate(() => ({ h: document.getElementById('reel-tl').getBoundingClientRect().height, cells: document.querySelectorAll('#reel-tl .tl-mc').length,
    heads: document.querySelectorAll('#reel-tl .tl-mh[data-ref]').length, exp: document.querySelector('#reel-tl button.tl-mtog').getAttribute('aria-expanded') }));
  const lanesH = (lanes.band + lanes.fx) * 14 + 8 + 4;
  check(shut.cells === 0 && shut.heads === 11 && shut.exp === 'false' && Math.abs(hOpen - shut.h - lanesH) <= 2,
    `the chevron shuts the music to its head: ${Math.round(hOpen)} → ${Math.round(shut.h)} px, the lanes' height`, JSON.stringify(shut));
  await page.reload();
  await ready();
  const after = await page.evaluate(() => ({ opened: REEL_TIMELINE.music.opened, cells: document.querySelectorAll('#reel-tl .tl-mc').length }));
  check(!after.opened && after.cells === 0, 'shut stays shut after a reload by hand');
  await page.evaluate(() => { window.__mark = true; });
  if (await page.evaluate(() => document.getElementById('reel-tl').hidden)) await page.keyboard.press('e');
  await page.locator('#reel-tl button.tl-mtog').click();
  await sleep(200);
  check(await page.evaluate(() => document.querySelectorAll('#reel-tl .tl-mc').length) === lanes.cells, 'and the chevron opens it again');

  // 8 ── a short window: the lanes scroll under a ruler that stays
  await page.setViewportSize({ width: 1440, height: 640 });
  await sleep(400);
  const tall = await page.evaluate(async () => {
    const tl = document.getElementById('reel-tl'), view = tl.querySelector('.tl-view'), hud = document.getElementById('hud');
    const st = document.getElementById('stage').getBoundingClientRect();
    const out = { vs: tl.classList.contains('tl-vs'), h: tl.getBoundingClientRect().height, stageH: st.height, sh: view.scrollHeight, ch: view.clientHeight };
    view.scrollTop = view.scrollHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e => e.getBoundingClientRect();
    out.scrolled = view.scrollTop;
    out.rulerTop = r(tl.querySelector('.tl-ruler')).top - r(view).top;
    const lb = tl.querySelector('.tl-mlb[data-track="pop"]'), row = tl.querySelector('.tl-mms[data-track="pop"]');
    out.rowVsLane = Math.round(r(row).top - r(lb).top);
    out.popInView = r(lb).bottom <= r(view).bottom + 1 && r(lb).top >= r(view).top;
    return out;
  });
  check(tall.vs && tall.sh > tall.ch && tall.stageH >= 150, `a 640 px window: the panel stops at ${Math.round(tall.h)} px (the preview keeps ${Math.round(tall.stageH)} px) and its lanes scroll`, JSON.stringify(tall));
  check(tall.scrolled > 0 && Math.abs(tall.rulerTop) <= 1 && tall.popInView && Math.abs(tall.rowVsLane) <= 2,
    'scrolled to the last lane: the ruler stays on top, and the last lane\'s M and S sit beside it', JSON.stringify(tall));
  await page.setViewportSize({ width: 1600, height: 1000 });

  // 9 ── no reloads, no errors
  check(await page.evaluate(() => !!window.__mark), 'no edit reloaded the page');
  check(errors.length === 0, 'no page errors', errors.join(' | '));
} catch (e) {
  check(false, 'the run: ' + e.message);
} finally {
  if (browser) await browser.close();
  if (child) child.kill();
  for (const f of [SCRIPT, SCORE]) fs.rmSync(f, { force: true });
  try { for (const f of fs.readdirSync(BACKUPS)) if (f.includes('zz-mlane-test')) fs.rmSync(path.join(BACKUPS, f), { force: true }); } catch (e) { /* none */ }
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
