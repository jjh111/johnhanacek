// The Fish panel (scripts/reel-fish.js) and the timeline's fish lanes, end to end: a real dev
// server, the real rig in Chromium, real clicks and keys, and the script file on disk as the judge.
//   node "Agent Reference/reel-tests/fishpaneltest.mjs"
// Works on a temp copy of the script with its fish lines taken out (Assets/zz-fishpanel-test.script.txt,
// played through the rig's ?script=), removed in finally with the backups the dev server kept of it.
//   1. F opens the panel beside the preview (the stage makes room), and its HUD button is pressed
//   2. paused, Dart writes `fish @t big dart` into the scene under the playhead, one save; it
//      plays in place: the same moment, the same fish (the tank is not regrown), the new line
//      selected; D again adds nothing
//   3. the lit buttons follow a change: with the playhead between grid steps, Circle then Sweep
//      leave one idle line (rewritten), and Sweep is the one lit
//   4. Place, then a click on the stage, writes `big to x y` at the click's fraction of the frame;
//      the stage shows it as a mark, and dragging the mark rewrites the point
//   5. the timeline's Undo takes the drag back (the panel's saves share its stacks)
//   6. the timeline's fish lanes: spans for both fish, a mark per line; clicking a line's mark
//      selects that line in the panel (its editor open) and lights the mark
//   7. the editor: typing a point, changing what the line does, and its time, each rewrite that line
//   8. School + the S key writes `school scatter`; Dart is off for the school alone
//   9. a take: playing, D then T at two moments; pausing keeps both lines in one save
//  10. the editor's Delete takes a line out
//  10b. a scene keeps its own fish: in the next scene the sweep is not lit; the timeline's gold
//      stops at the cut, and dragging its end on past the cut carries the lines that stopped there
//      (`carry`) to a `big auto` where it lands, after which the sweep is lit there and listed as
//      still holding; Stop here ends the selected line at the playhead (`idle auto`); Carry on
//      pressed again keeps it in its scene; a mark dragged across a cut moves its line there
//  11. in an 820 px window the panel lies over the preview (no room taken) and nothing overflows
//  12. no edit reloaded the page, and none took a fish out or put one back (every save played in place)
//  13. no page errors
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = 'zz-fishpanel-test.script.txt', TMP = path.join(ROOT, 'Assets', NAME);
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
// the cut without its fish lines, so the counts below are this suite's own
const ORIG = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8').split('\n').filter(l => !/^\s*fish\s/.test(l)).join('\n');
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const fishLines = () => fs.readFileSync(TMP, 'utf8').split('\n').map(l => l.trim()).filter(l => /^fish\s/.test(l)).map(l => l.replace(/^fish\s+/, ''));
const lnOf = text => fs.readFileSync(TMP, 'utf8').split('\n').findIndex(l => l.trim().replace(/^fish\s+/, '') === text) + 1;
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
  // One save: it plays in place (the version counts up, and the mark set here survives: a reload
  // would wipe it, and is counted), then wait until it is kept.
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
    await page.waitForTimeout(150);
  };
  const lit = () => page.evaluate(() => [...document.querySelectorAll('#reel-fish .fp-on')].map(b => b.dataset.fish));
  await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${NAME}#t=24&pause=1`);
  await ready('first load');
  // every save's answer, to see that none restocked the tank
  await page.evaluate(() => { const s = REEL_LIVE.save.bind(REEL_LIVE); window.__saves = []; REEL_LIVE.save = async t => { const r = await s(t); window.__saves.push(r); return r; }; });

  // 1. open
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => ({ open: REEL_FISH.isOpen, pressed: document.querySelector('#hud [data-tool="fish"]').getAttribute('aria-pressed'),
    left: REEL_LIVE.view().x, panel: document.getElementById('reel-fish').getBoundingClientRect().right }));
  check(o.open && o.pressed === 'true' && o.left >= o.panel - 1, 'F opens the panel beside the preview: the stage starts right of it', JSON.stringify(o));

  // 2. Dart, paused
  const scene = await page.evaluate(() => { const t = REEL_LIVE.now(), sc = REEL_LIVE.scenes.filter(s => t >= s.start - 1e-6).pop(); return { i: sc.i, start: sc.start, at: +(t - sc.start).toFixed(2), type: sc.type }; });
  await page.evaluate(() => { window.__big = REEL_LIVE.debug.big(); window.__regrows = REEL_LIVE.debug.regrows; });
  await saving('dart', () => page.locator('#reel-fish [data-fish="dart"]').click());
  let fl = fishLines();
  check(fl.length === 1 && fl[0] === `@${scene.at} big dart`, `paused, Dart writes "@${scene.at} big dart" into the ${scene.type} scene`, JSON.stringify(fl));
  const back = await page.evaluate(() => ({ t: REEL_LIVE.now(), playing: REEL_LIVE.isPlaying(), open: REEL_FISH.isOpen, sel: REEL_FISH.selected,
    ed: !document.querySelector('#reel-fish .fp-edwrap').hidden }));
  check(Math.abs(back.t - 24) < 0.05 && !back.playing && back.open && back.sel === lnOf(fl[0]) && back.ed,
    'it plays in place: the same moment, paused, the panel open with the new line selected', JSON.stringify(back));
  const same = await page.evaluate(() => ({ big: !!window.__big && REEL_LIVE.debug.big() === window.__big, regrows: REEL_LIVE.debug.regrows - window.__regrows }));
  check(same.big && same.regrows === 0, 'the same big fish swims on: the tank was not regrown for a fish line', JSON.stringify(same));
  await page.keyboard.press('d');                 // the same line again: nothing to save, and it says so
  await page.waitForTimeout(600);
  const said = await page.locator('#reel-fish .fp-say').textContent();
  check(fishLines().length === 1 && /already/.test(said), 'the same press again (D) adds no second line, and says it is already there', said);

  // 3. the lit buttons follow a change, the playhead between grid steps
  await page.evaluate(t => REEL_LIVE.seek(t), scene.start + 1.38);
  await page.waitForTimeout(300);
  await saving('circle', () => page.locator('#reel-fish [data-fish="circle"]').click());
  check((await lit()).includes('circle'), 'after Circle, Circle is lit (the line starts at the playhead, not after it)', JSON.stringify(await lit()));
  await saving('sweep', () => page.locator('#reel-fish [data-fish="sweep"]').click());
  fl = fishLines();
  const idles = fl.filter(l => / big idle /.test(l)), l3 = await lit();
  check(idles.length === 1 && idles[0] === '@1.35 big idle sweep' && l3.includes('sweep') && !l3.includes('circle'),
    'Sweep at the same moment rewrites that line ("@1.35 big idle sweep"), and Sweep is now the one lit', JSON.stringify({ idles, l3 }));

  // 4. Place + a click on the stage, then drag its mark
  await page.evaluate(t => REEL_LIVE.seek(t), scene.start + 2.5);
  await page.waitForTimeout(300);
  await page.locator('#reel-fish [data-fish="to"]').click();
  const v = await page.evaluate(() => REEL_LIVE.view());
  await saving('place', () => page.mouse.click(v.x + 1920 * 0.3 * v.s, v.y + 1080 * 0.85 * v.s));
  fl = fishLines();
  check(fl.includes('@2.5 big to 0.3 0.85'), 'Place, then a click on the stage, writes "big to 0.3 0.85" (its fraction of the frame)', JSON.stringify(fl));
  const mark = page.locator('#reel-fish-marks .fm:not(.fm-look):not(.fm-feed)').first();
  check(await mark.count() === 1 && /fm-sel/.test(await mark.getAttribute('class')), 'the stage shows the spot as a mark, lit as the selected line');
  const mb = await mark.boundingBox();
  const v2 = await page.evaluate(() => REEL_LIVE.view());
  const to = { x: v2.x + 1920 * 0.5 * v2.s, y: v2.y + 1080 * 0.8 * v2.s };
  await saving('drag', async () => {
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(mb.x + mb.width / 2 + (to.x - mb.x - mb.width / 2) * k / 8, mb.y + mb.height / 2 + (to.y - mb.y - mb.height / 2) * k / 8);
    await page.mouse.up();
  });
  fl = fishLines();
  check(fl.includes('@2.5 big to 0.5 0.8') && !fl.some(l => / to 0\.3 0\.85$/.test(l)), 'dragging the mark rewrites the line\'s point (0.5 0.8)', JSON.stringify(fl));

  // 5. the timeline's Undo
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await saving('undo', () => page.locator('#reel-tl [data-act="undo"]').click());
  fl = fishLines();
  check(fl.includes('@2.5 big to 0.3 0.85'), 'the timeline\'s Undo takes the drag back', JSON.stringify(fl));

  // 6. the fish lanes
  const lanes = await page.evaluate(() => ({ big: document.querySelectorAll('#reel-tl .tl-fl[data-who="big"]').length, school: document.querySelectorAll('#reel-tl .tl-fl[data-who="school"]').length,
    marks: [...document.querySelectorAll('#reel-tl .tl-fm')].map(m => +m.dataset.ln), words: [...document.querySelectorAll('#reel-tl .tl-fl')].map(e => e.textContent).filter(Boolean) }));
  check(lanes.big > 5 && lanes.school > 3 && lanes.words.includes('the title') && lanes.words.includes('the work'), `the fish lanes show what each fish looks at across the cut (${lanes.big} spans for the big fish, ${lanes.school} for the school)`, JSON.stringify(lanes.words.slice(0, 8)));
  const toLn = lnOf('@2.5 big to 0.3 0.85');
  check(lanes.marks.includes(toLn) && lanes.marks.filter(x => x === lnOf('@1.35 big idle sweep')).length === 1, 'a mark in the lane for each line (a line for one fish, in its lane)', JSON.stringify(lanes.marks));
  await page.evaluate(() => REEL_FISH.select(null));
  await page.locator(`#reel-tl .tl-fm[data-ln="${lnOf('@1.35 big idle sweep')}"]`).click();
  await page.waitForTimeout(300);
  const picked = await page.evaluate(() => ({ sel: REEL_FISH.selected, head: document.querySelector('#reel-fish .fp-edhead') && document.querySelector('#reel-fish .fp-edhead').textContent,
    litMarks: [...document.querySelectorAll('#reel-tl .tl-fm.tl-sel')].map(m => +m.dataset.ln) }));
  check(picked.sel === lnOf('@1.35 big idle sweep') && /sweeps/.test(picked.head) && picked.litMarks.includes(picked.sel),
    'clicking a line\'s mark in the lane selects it in the panel (its editor open) and lights the mark', JSON.stringify(picked));
  await page.keyboard.press('e');

  // 7. the editor
  await page.evaluate(ln => REEL_FISH.select(ln), toLn);
  await page.waitForTimeout(200);
  await saving('type x', async () => { const x = page.locator('#reel-fish [data-ed="x"]'); await x.fill('0.62'); await x.press('Enter'); });
  check(fishLines().includes('@2.5 big to 0.62 0.85'), 'the editor: typing across 0.62 rewrites the point', JSON.stringify(fishLines()));
  await saving('verb', () => page.locator('#reel-fish [data-ed="verb"]').selectOption('look'));
  check(fishLines().includes('@2.5 big look 0.62 0.85'), 'the editor: "Does" turns the line into a look at the same point', JSON.stringify(fishLines()));
  await saving('time', async () => { const t = page.locator('#reel-fish [data-ed="at"]'); await t.fill('3'); await t.press('Enter'); });
  check(fishLines().includes('@3 big look 0.62 0.85'), 'the editor: a new time moves the line to @3', JSON.stringify(fishLines()));
  const still = await page.evaluate(() => REEL_FISH.selected);
  check(still === lnOf('@3 big look 0.62 0.85'), 'the edited line stays selected across each save', String(still));

  // 8. School + S
  await page.locator('#reel-fish [data-who="school"]').click();
  const off = await page.evaluate(() => ({ dart: document.querySelector('#reel-fish [data-fish="dart"]').disabled, scatter: document.querySelector('#reel-fish [data-fish="scatter"]').disabled }));
  check(off.dart && !off.scatter, 'for the school alone, Dart is off and Scatter on', JSON.stringify(off));
  const tS = await page.evaluate(() => REEL_LIVE.now()), atS = +(Math.floor((tS - scene.start) / 0.05 + 1e-6) * 0.05).toFixed(2);
  await saving('scatter', () => page.keyboard.press('s'));
  check(fishLines().includes(`@${atS} school scatter`), `the S key writes "@${atS} school scatter"`, JSON.stringify(fishLines()));

  // 9. a take while playing
  await page.locator('#reel-fish [data-who="big"]').click();
  const before = fishLines().length;
  await page.evaluate(t => REEL_LIVE.seek(t), scene.start + 4.5);
  await page.evaluate(() => REEL_LIVE.setPlaying(true));
  await page.waitForTimeout(400);
  await page.keyboard.press('d');
  await page.waitForTimeout(700);
  await page.keyboard.press('t');
  const tk = await page.evaluate(() => ({ at: REEL_FISH.take.map(x => x.at), pend: [...document.querySelectorAll('#reel-fish .fp-pend')].map(b => b.dataset.fish) }));
  check(tk.at.length === 2 && tk.at[1] > tk.at[0] && fishLines().length === before && tk.pend.includes('dart') && tk.pend.includes('turn'),
    `playing, D then T gather into a take, their buttons dashed, nothing saved yet (at ${tk.at.join(', ')})`, JSON.stringify(tk));
  await saving('keep take', () => page.evaluate(() => REEL_LIVE.setPlaying(false)));
  fl = fishLines();
  check(fl.length === before + 2 && fl.some(l => l === `@${tk.at[0]} big dart`) && fl.some(l => l === `@${tk.at[1]} big turn`), 'pausing keeps the take: both lines, in one save', JSON.stringify(fl));

  // 10. delete
  const n0 = fishLines().length, gone = fl.find(l => / big turn$/.test(l));
  await page.evaluate(ln => REEL_FISH.select(ln), lnOf(gone));
  await page.waitForTimeout(200);
  await saving('delete', () => page.locator('#reel-fish [data-ed="delete"]').click());
  check(fishLines().length === n0 - 1 && !fishLines().includes(gone), 'the editor\'s Delete takes the line out', JSON.stringify(fishLines()));

  // 10b. a scene keeps its own fish; a line that carries runs on past the cut
  const SCN = await page.evaluate(() => REEL_LIVE.scenes.map(s => ({ i: s.i, type: s.type, start: s.start, end: s.end })));
  const feat = SCN.find(s => s.type === 'feature'), resS = SCN.find(s => s.type === 'results');
  const kindOf = text => { let k = null; for (const l of fs.readFileSync(TMP, 'utf8').split('\n')) { const m = /^\s*SCENE\s+(\w+)/.exec(l); if (m) k = m[1]; if (l.trim().replace(/^fish\s+/, '') === text) return k; } return null; };
  const carriedNow = () => page.evaluate(() => [...document.querySelectorAll('#reel-fish .fp-line.fp-carried')].map(r => +r.dataset.ln));
  await page.evaluate(t => REEL_LIVE.seek(t), feat.start + 1.1);
  await page.waitForTimeout(400);
  const scoped = { carried: await carriedNow(), lit: await lit() };
  check(!scoped.carried.includes(lnOf('@1.35 big idle sweep')) && !scoped.lit.includes('sweep'), 'a scene keeps its own fish: in the feature, the results scene\'s sweep is not lit or carried', JSON.stringify(scoped));
  // the timeline: the gold stops at the cut, and its end there carries it on when dragged past
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  const pxs = await page.evaluate(() => document.querySelector('#reel-tl .tl-lane').getBoundingClientRect().width / REEL_LIVE.duration);
  const cutX = await page.evaluate(t => { const r = document.querySelector('#reel-tl .tl-lane').getBoundingClientRect(); return r.left + t * r.width / REEL_LIVE.duration; }, resS.end);
  const handles = await page.$$eval('#reel-tl .tl-fe[data-who="big"][data-end="cut"]', els => els.map(e => { const b = e.getBoundingClientRect(); return b.x + b.width; }));
  const hi = handles.findIndex(x => Math.abs(x - cutX) < 4);
  check(hi >= 0, `the big fish's lane: the gold stops at the results scene's cut, and its end there is a handle (${handles.length} at cuts)`);
  const dragX = async (loc, dt, what) => {
    const b = await loc.boundingBox(), x0 = b.x + b.width / 2, y0 = b.y + b.height / 2;
    await saving(what, async () => { await page.mouse.move(x0, y0); await page.mouse.down(); for (let k = 1; k <= 10; k++) await page.mouse.move(x0 + dt * pxs * k / 10, y0); await page.mouse.up(); });
  };
  await dragX(page.locator('#reel-tl .tl-fe[data-who="big"][data-end="cut"]').nth(Math.max(0, hi)), (feat.start + 1) - resS.end, 'carry handle');
  let fl2 = fishLines();
  check(fl2.includes('@1.35 big idle sweep carry') && fl2.includes('@1 big auto') && kindOf('@1 big auto') === 'feature',
    'dragged on past the cut: the lines that stopped there carry ("@1.35 big idle sweep carry"), to "@1 big auto" in the feature', JSON.stringify(fl2));
  await page.evaluate(t => REEL_LIVE.seek(t), feat.start + 0.5);
  await page.waitForTimeout(400);
  const on = { carried: await carriedNow(), lit: await lit() };
  check(on.carried.includes(lnOf('@1.35 big idle sweep carry')) && on.lit.includes('sweep'), 'carried, the sweep is lit in the feature and listed as still holding from earlier', JSON.stringify(on));
  await page.evaluate(t => REEL_LIVE.seek(t), feat.start + 1.5);
  await page.waitForTimeout(400);
  check((await lit()).includes('reel') && !(await lit()).includes('sweep'), 'after the auto the big fish is the reel\'s own again: Reel\'s own lit, the sweep not', JSON.stringify(await lit()));
  // Stop here, in the line's own scene
  await page.evaluate(t => REEL_LIVE.seek(t), resS.start + 6.02);
  await page.waitForTimeout(300);
  await page.evaluate(ln => REEL_FISH.select(ln), lnOf('@1.35 big idle sweep carry'));
  await page.waitForTimeout(300);
  const holdsTxt = await page.evaluate(() => { const e = document.querySelector('#reel-fish [data-ed="till"]'); return e && e.textContent; });
  const stopOn = await page.evaluate(() => { const b = document.querySelector('#reel-fish [data-ed="stop"]'); return !!b && !b.disabled; });
  const carryOn = await page.evaluate(() => { const b = document.querySelector('#reel-fish [data-ed="carry"]'); return b && b.getAttribute('aria-pressed'); });
  check(/to \d:\d/.test(holdsTxt || '') && stopOn && carryOn === 'true', `the line's editor says how long it holds ("${holdsTxt}"), its Carry on is pressed, and Stop here is offered past its start`);
  await saving('stop here', () => page.locator('#reel-fish [data-ed="stop"]').click());
  check(fishLines().includes('@6 big idle auto') && kindOf('@6 big idle auto') === 'results', 'Stop here ends it at the playhead: "@6 big idle auto" in the results scene', JSON.stringify(fishLines()));
  // Carry on, pressed again, keeps it in its scene
  await page.evaluate(ln => REEL_FISH.select(ln), lnOf('@1.35 big idle sweep carry'));
  await page.waitForTimeout(300);
  await saving('carry off', () => page.locator('#reel-fish [data-ed="carry"]').click());
  check(fishLines().includes('@1.35 big idle sweep') && !fishLines().includes('@1.35 big idle sweep carry'), 'Carry on pressed again: the line stays in its scene ("@1.35 big idle sweep")', JSON.stringify(fishLines()));
  // a mark dragged across a cut moves its line into that scene
  const mk = page.locator(`#reel-tl .tl-fm[data-ln="${lnOf('@1 big auto')}"][data-who="big"]`);
  await dragX(mk, (resS.start + 12) - (feat.start + 1), 'mark across');
  check(fishLines().includes('@12 big auto') && kindOf('@12 big auto') === 'results' && !fishLines().includes('@1 big auto'),
    'a mark dragged back across the cut moves its line into the results scene ("@12 big auto")', JSON.stringify(fishLines()));
  await page.keyboard.press('e');

  // 11. narrow
  await page.setViewportSize({ width: 820, height: 640 });
  await page.waitForTimeout(500);
  const nw = await page.evaluate(() => {
    const r = document.getElementById('reel-fish'), b = r.getBoundingClientRect();
    const over = [...r.querySelectorAll('button')].filter(x => x.offsetParent && x.scrollWidth > x.clientWidth + 1).map(x => x.textContent.trim());
    return { over: r.classList.contains('fp-over'), left: REEL_LIVE.view().x, right: b.right, vw: innerWidth, overflow: over };
  });
  check(nw.over && nw.right <= nw.vw && nw.left < 200 && !nw.overflow.length, 'in an 820 px window the panel lies over the preview, which keeps its room', JSON.stringify(nw));

  const sv = await page.evaluate(() => window.__saves.map(r => ({ applied: !!r.applied, restocked: !!r.restocked, ok: r.ok })));
  check(reloads === 0 && sv.length >= 10 && sv.every(r => r.applied && r.ok && !r.restocked),
    `no edit reloaded the page or regrew the tank: ${sv.length} saves, each played in place and kept`, JSON.stringify({ reloads, sv }));
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
