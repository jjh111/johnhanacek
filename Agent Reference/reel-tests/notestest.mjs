// The note editor (2026-10-06; John: "i need to be able to edit the notes/timing of this stuff like
// ableton to dial it in"): the voice's take as a piano roll (scripts/reel-notes.js, N), every edit
// one ReelMusic.editTake through the synth rack. This suite checks
//   1. editTake (scripts/reel-music.js), in node: no edit is no change; a note moved keeps where it
//      was sung, and moved more than a bar leaves what was sung there as a note left out; an added
//      note taken away and a sung one left out; levels; several edits of one note as one; the lines
//      in time order, a comment line going with its note; the errors
//   2. the panel, through the dev server: N opens it in the timeline's place (and E gives it back);
//      a note dragged a beat later and a row up (Key: the next note of A minor), its edge dragged
//      longer, Option-drag copies, a box chooses notes, double-click adds and takes away, the
//      velocity strip, the keys (↑ ↓ ← → with Shift, ⌫, 0, Q, ⌘D, ⌘C ⌘V), the ruler moves the
//      playhead, the timeline's voice clip and the take view's button open it there; each edit
//      one save of the score, and as many undos bring it back byte for byte
//   node "Agent Reference/reel-tests/notestest.mjs"      exits non-zero on any failure
// Works on temp copies (Assets/zz-notes-test.script.txt and .score.txt), removed in finally.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const req = createRequire(import.meta.url);
const RM = req(join(ROOT, 'scripts/reel-music.js'));
const SCRIPT = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
const SCORE = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.score.txt'), 'utf8');
const T_SCRIPT = 'Assets/zz-notes-test.script.txt', T_SCORE = 'Assets/zz-notes-test.score.txt';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const throws = (fn, re, what) => { try { fn(); ok(false, what + ' (did not throw)'); } catch (e) { ok(re.test(e.message), `${what}: ${e.message.split('\n')[0]}`); } };
const take = s => RM.parse(s).score.takes[0];
const at = (s, ln) => take(s).notes.find(n => n.ln === ln);
const sorted = s => { const ns = take(s).notes; return ns.every((n, i) => !i || n.step >= ns[i - 1].step); };
const MS = 60000 / RM.parse(SCORE).score.tempo / 4;

// ── 1. editTake ──────────────────────────────────────────────────────────
const tk = take(SCORE);
const sung = tk.notes.find(n => n.heard && !n.out && n.early && n.step > 64), added = tk.notes.find(n => !n.heard && !n.out);
{
  ok(RM.editTake(SCORE, 'john', []).text === SCORE, 'no edit: the score as it was, byte for byte');
  const r = RM.editTake(SCORE, 'john', [{ ln: sung.ln, step: sung.step + 2 }]), m = at(r.text, r.lns[0]);
  ok(m.step === sung.step + 2 && Math.abs((m.step * MS + m.early) - (sung.step * MS + sung.early)) <= 1 && m.sung === sung.sung && m.curve.join() === sung.curve.join(),
    `a sung note moved an eighth keeps where it was sung (early ${sung.early} → ${m.early} ms)`);
  const far = RM.editTake(SCORE, 'john', [{ ln: sung.ln, step: sung.step + 32 }]), T = take(far.text), f = at(far.text, far.lns[0]);
  const ref = T.notes.find(n => n.out && n.heard && n.step === sung.step && n.sung === sung.sung && n.early === sung.early);
  ok(f.step === sung.step + 32 && !f.heard && f.midi === sung.midi && !!ref && T.notes.length === tk.notes.length + 1 && sorted(far.text),
    'moved two bars, the note goes on with nothing sung, and what was sung stays where it was, left out');
  const a = RM.editTake(SCORE, 'john', [{ add: { step: 101, midi: 57, len: 3, vel: 0.7 } }]), an = at(a.text, a.lns[0]);
  ok(an.step === 101 && an.midi === 57 && an.len === 3 && an.vel === 0.7 && !an.heard && sorted(a.text), `a note added: its own line, in time order ("${a.text.split('\n')[a.lns[0] - 1].trim()}")`);
  ok(RM.editTake(a.text, 'john', [{ ln: a.lns[0], remove: true }]).text === SCORE, 'and taken away: the score as it was');
  const g = RM.editTake(SCORE, 'john', [{ ln: sung.ln, remove: true }]);
  ok(at(g.text, g.lns[0]).out && take(g.text).notes.length === tk.notes.length, 'a sung note taken away is left out (what was sung stays)');
  const ad = RM.editTake(SCORE, 'john', [{ ln: added.ln, remove: true }]);
  ok(ad.lns[0] === null && take(ad.text).notes.length === tk.notes.length - 1, 'an added note taken away is gone');
  const v = RM.editTake(SCORE, 'john', [{ ln: sung.ln, vel: 0.55 }]), vl = v.text.split('\n')[v.lns[0] - 1];
  ok(at(v.text, v.lns[0]).vel === 0.55 && vl.replace('0.55', sung.vel.toFixed(2)) === SCORE.split('\n')[sung.ln - 1], `a level: its one column ("${vl.trim().slice(0, 40)}")`);
  ok(RM.editTake(SCORE, 'john', [{ ln: sung.ln, step: sung.step + 2 }, { ln: sung.ln, step: sung.step }]).text === SCORE, 'two edits of one note that come to nothing: nothing');
  const many = RM.editTake(SCORE, 'john', tk.notes.filter(n => !n.out && n.step >= 128 && n.step < 192).map(n => ({ ln: n.ln, step: n.step + 4, midi: n.midi + 2 })));
  ok(sorted(many.text) && many.lns.every((l, i) => { const n = at(many.text, l), o = tk.notes.filter(x => !x.out && x.step >= 128 && x.step < 192)[i]; return n.step === o.step + 4 && n.midi === o.midi + 2; }), `${many.lns.length} notes moved together, each line where it now belongs`);
  // a comment right above a note goes with it
  const c0 = SCORE.split('\n'), cmt = '  # the turn';
  c0.splice(sung.ln - 1, 0, cmt);
  const withC = c0.join('\n'), cl = sung.ln + 1;
  const moved = RM.editTake(withC, 'john', [{ ln: cl, step: sung.step - 8 }]), ml = moved.text.split('\n');
  const passed = tk.notes.filter(n => n.step >= sung.step - 8 && n.step < sung.step).length;
  ok(passed > 0 && ml[moved.lns[0] - 2] === cmt && sorted(moved.text), `a comment line right above a note goes with it (moved half a bar, past ${passed} notes)`);
  const away = RM.editTake(withC, 'john', [{ ln: cl, step: sung.step - 40 }]), al = away.text.split('\n'), ri = al.indexOf(cmt);
  const refAt = ri >= 0 ? take(away.text).notes.find(n => n.ln === ri + 2) : null;
  ok(refAt && refAt.out && refAt.heard && refAt.step === sung.step, 'moved further than a bar, the comment stays with what was sung');
  throws(() => RM.editTake(SCORE, 'john', [{ ln: 3, step: 4 }]), /TAKE john has no note on line 3/, 'a line that is no note of the take says so');
  throws(() => RM.editTake(SCORE, 'nobody', []), /there is no TAKE nobody/, 'a take not there says so');
}

// ── 2. the panel ─────────────────────────────────────────────────────────
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
let dev, browser;
try {
  writeFileSync(join(ROOT, T_SCRIPT), SCRIPT); writeFileSync(join(ROOT, T_SCORE), SCORE);
  const port = await freePort();
  dev = spawn(process.execPath, [join(ROOT, 'scripts/reel-dev.mjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('dev server did not start')), 8000); dev.stdout.on('data', d => { if (/reel-dev: http/.test(String(d))) { clearTimeout(t); res(); } }); });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/\.mp4(\?.*)?$/i, rt => rt.fulfill({ status: 404, body: '' }));
  await page.goto(`http://127.0.0.1:${port}/Assets/sizzle-reel-2.html?script=zz-notes-test.script.txt#t=17&pause=1`);
  await page.waitForFunction(() => window.REEL_RACK && window.REEL_RACK.parsed && window.REEL_NOTES && window.REEL_TIMELINE, null, { timeout: 60000 });
  await page.evaluate(() => sessionStorage.clear());
  const file = () => readFileSync(join(ROOT, T_SCORE), 'utf8');
  const waitFile = async fn => { for (let i = 0; i < 60; i++) { const t = file(); if (fn(t)) return t; await new Promise(r => setTimeout(r, 100)); } return null; };
  const sel = () => page.evaluate(() => REEL_NOTES.selection);
  const box = ln => page.evaluate(ln => REEL_NOTES.box(ln), ln);
  const model = () => page.evaluate(() => { const M = REEL_NOTES.model; return { oct: M.oct, rows: M.rows, step: M.step, notes: M.notes.map(x => ({ ln: x.ln, step: x.step, len: x.len, pitch: x.pitch, vel: x.vel, out: x.out, heard: x.heard })) }; });
  await page.mouse.click(300, 200);

  // the timeline open, then N: the notes take its place
  await page.keyboard.press('e');
  await page.waitForFunction(() => !document.getElementById('reel-tl').hidden);
  await page.keyboard.press('n');
  await page.waitForFunction(() => REEL_NOTES.open && REEL_NOTES.model && !REEL_NOTES.model.none);
  await page.waitForTimeout(300);
  const opened = await page.evaluate(() => ({ tl: document.getElementById('reel-tl').hidden, btn: document.querySelector('#hud [data-tool="notes"]').getAttribute('aria-pressed'), focus: document.activeElement && document.activeElement.closest('#reel-notes') != null,
    rect: document.getElementById('reel-notes').getBoundingClientRect().toJSON(), stage: document.getElementById('stage') ? document.getElementById('stage').getBoundingClientRect().bottom : 0 }));
  let M0 = await model();
  ok(opened.tl && opened.btn === 'true' && opened.focus && opened.rect.height >= 300, `N opens the notes in the timeline's place (${Math.round(opened.rect.height)} px tall, the roll in focus, the HUD's Notes pressed)`);
  ok(M0.notes.length === tk.notes.length && M0.rows.every(p => [0, 2, 3, 5, 7, 8, 10].includes(((p - 9) % 12 + 12) % 12)), `every note of the take is drawn (${M0.notes.length}), on the rows of A minor (Key: ${M0.rows.length} rows)`);

  // a note in view, dragged a beat later and a row up
  const pick = M0.notes.find(n => !n.out && n.heard && n.step * M0.step > 16.2 && n.step * M0.step < 22 && n.len >= 2);
  let b = await box(pick.ln);
  let before = file();
  const pxs = (await page.evaluate(() => REEL_NOTES.view)).pxs;
  await page.mouse.move(b.x + Math.min(10, b.w / 2), b.y + b.h / 2); await page.mouse.down();
  await page.mouse.move(b.x + Math.min(10, b.w / 2) + 4 * M0.step * pxs, b.y + b.h / 2 - b.h, { steps: 8 }); await page.mouse.up();
  let t = await waitFile(x => x !== before);
  const upRow = M0.rows[M0.rows.indexOf(pick.pitch) - 1];
  let S = await sel(), now = await model(), moved = now.notes.find(n => n.ln === S[0]);
  ok(t && S.length === 1 && moved.step === pick.step + 4 && moved.pitch === upRow, `a note dragged a beat later and a row up: ${RM.posText(pick.step, 16)} ${pick.pitch} → ${RM.posText(moved.step, 16)} ${moved.pitch} (the next note of the key), still chosen`);
  const sungKept = t && (() => { const n = at(t, S[0]), o = at(before, pick.ln); return n.heard && Math.abs((n.step * MS + n.early) - (o.step * MS + o.early)) <= 1; })();
  ok(sungKept, 'and it keeps where it was sung');
  // its right edge, an eighth longer
  b = await box(S[0]); before = t;
  await page.mouse.move(b.x + b.w - 3, b.y + b.h / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.w - 3 + 2 * M0.step * pxs, b.y + b.h / 2, { steps: 6 }); await page.mouse.up();
  t = await waitFile(x => x !== before);
  S = await sel(); now = await model();
  ok(t && now.notes.find(n => n.ln === S[0]).len === moved.len + 2, `its right edge dragged an eighth longer: ${moved.len} → ${now.notes.find(n => n.ln === S[0]).len} sixteenths`);

  // the keys: ↑ (the next note of the key), Shift+↑ (an octave), → (the grid), Shift+→ (longer)
  const keyStep = async (key, what, check) => {
    const b4 = file(), l4 = (await sel())[0], s4 = (await model()).notes.find(n => n.ln === l4);
    await page.keyboard.press(key);
    const tt = await waitFile(x => x !== b4), l5 = (await sel())[0], s5 = (await model()).notes.find(n => n.ln === l5);
    ok(tt && s5 && check(s4, s5), `${key}: ${what} (${s4.step}/${s4.pitch}/${s4.len} → ${s5 && s5.step}/${s5 && s5.pitch}/${s5 && s5.len})`);
  };
  await keyStep('ArrowUp', 'a row up, the next note of the key', (a, c) => c.pitch === M0.rows[M0.rows.indexOf(a.pitch) - 1] && c.step === a.step);
  await keyStep('Shift+ArrowDown', 'an octave down', (a, c) => c.pitch === a.pitch - 12);
  await keyStep('Shift+ArrowUp', 'and up again', (a, c) => c.pitch === a.pitch + 12);
  await keyStep('ArrowRight', 'an eighth later (the grid)', (a, c) => c.step === a.step + 2);
  await keyStep('Shift+ArrowRight', 'an eighth longer', (a, c) => c.len === a.len + 2);
  await keyStep('Alt+ArrowLeft', 'a sixteenth earlier', (a, c) => c.step === a.step - 1);
  // Q: back onto the grid
  await keyStep('q', 'quantized onto the 1/8 grid', (a, c) => c.step % 2 === 0 && Math.abs(c.step - a.step) === 1);

  // double-click an empty spot: a new note there, an eighth long (the grid), chosen
  now = await model();
  const row = now.rows[2], tAt = 19.0;
  const free = now.notes.every(n => n.pitch !== row || n.step * now.step > tAt + 0.3 || (n.step + n.len) * now.step < tAt);
  const p0 = await page.evaluate(([tt, r]) => REEL_NOTES.point(tt, r), [tAt + 0.06, row]);
  before = file();
  await page.mouse.dblclick(p0.x, p0.y);
  t = await waitFile(x => x !== before);
  S = await sel(); now = await model();
  const nn = now.notes.find(n => n.ln === S[0]);
  ok(free && t && S.length === 1 && nn && !nn.heard && nn.pitch === row && nn.step === Math.floor(tAt / now.step / 2) * 2 && take(t).notes.length === take(before).notes.length + 1,
    `double-click on an empty row: a new note there (${RM.posText(nn ? nn.step : 0, 16)}, ${row}), nothing sung for it, chosen`);
  // ⌫ takes it away again
  before = t;
  await page.keyboard.press('Backspace');
  t = await waitFile(x => x !== before);
  ok(t && take(t).notes.length === take(before).notes.length - 1 && (await sel()).length === 0, '⌫ takes the added note away');

  // a box: drag on empty space chooses what it touches
  now = await model();
  const inBox = now.notes.filter(n => !n.out && n.step * now.step >= 20 && n.step * now.step < 22);
  const lo = Math.min(...inBox.map(n => n.pitch)), hi = Math.max(...inBox.map(n => n.pitch));
  const a1 = await page.evaluate(([tt, r]) => REEL_NOTES.point(tt, r), [19.97, hi]), a2 = await page.evaluate(([tt, r]) => REEL_NOTES.point(tt, r), [21.97, lo]);
  const clear = now.notes.every(n => { const x0 = n.step * now.step, x1 = (n.step + n.len) * now.step; return !(x0 <= 19.97 && x1 >= 19.97 && n.pitch === hi); });
  await page.mouse.move(a1.x, a1.y - 6); await page.mouse.down(); await page.mouse.move(a2.x, a2.y + 6, { steps: 8 }); await page.mouse.up();
  S = await sel();
  const want = now.notes.filter(n => { const x0 = n.step * now.step, x1 = (n.step + n.len) * now.step; return x1 >= 19.97 && x0 <= 21.97 && n.pitch >= lo && n.pitch <= hi; }).map(n => n.ln).sort();
  ok(clear && S.slice().sort().join() === want.join() && S.length >= 3, `a box drawn on the rows chooses the notes it touches (${S.length})`);
  // the velocity strip: the chosen ones softer together
  const vb = await page.evaluate(() => { const r = document.querySelector('#reel-notes .nt-roll canvas').getBoundingClientRect(), v = REEL_NOTES.view; return { bottom: r.bottom, velH: v.velH }; });
  const first = now.notes.find(n => n.ln === S[0]), fp = await page.evaluate(t0 => REEL_NOTES.point(t0, 0), first.step * now.step);
  before = file();
  const y0 = vb.bottom - 2 - (vb.velH - 8) * Math.min(1, first.vel);
  await page.mouse.move(fp.x + 0.5, y0); await page.mouse.down(); await page.mouse.move(fp.x + 0.5, y0 + 12, { steps: 4 }); await page.mouse.up();
  t = await waitFile(x => x !== before);
  now = await model();
  const softer = S.map(l => now.notes.find(n => n.ln === l)).filter(Boolean);
  ok(t && softer.length === S.length && softer.every(n => n.vel < 0.8 && Math.abs(n.vel - softer[0].vel) < 0.011), `the velocity strip: dragged down, the ${S.length} chosen ones softer together (${softer[0] && softer[0].vel})`);
  // ⌘D: a copy right after them; Option-drag: another copy, where it is dropped
  before = file();
  await page.keyboard.press('Meta+d');
  t = await waitFile(x => x !== before);
  const S2 = await sel();
  ok(t && take(t).notes.length === take(before).notes.length + S.length && S2.length === S.length && S2.every(l => !S.includes(l)), `⌘D: a copy of the ${S.length} after them, the copies chosen`);
  now = await model();
  const c0n = now.notes.find(n => n.ln === S2[0]); b = await box(c0n.ln); before = file();
  await page.keyboard.down('Alt');
  await page.mouse.move(b.x + Math.min(8, b.w / 2), b.y + b.h / 2); await page.mouse.down();
  await page.mouse.move(b.x + Math.min(8, b.w / 2) + 16 * now.step * pxs, b.y + b.h / 2, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  t = await waitFile(x => x !== before);
  ok(t && take(t).notes.length === take(before).notes.length + S2.length, `Option-drag: ${S2.length} more copies a bar later, the originals where they were`);
  // 0: leave out and put back
  before = file(); S = await sel();
  await page.keyboard.press('0');
  t = await waitFile(x => x !== before);
  now = await model();
  ok(t && S.every(l => now.notes.find(n => n.ln === l).out), '0: the chosen notes left out');
  before = t;
  await page.keyboard.press('0');
  t = await waitFile(x => x !== before);
  now = await model();
  ok(t && S.every(l => !now.notes.find(n => n.ln === l).out), '0 again: put back');
  // ⌘C, then ⌘V at the playhead
  await page.keyboard.press('Meta+c');
  await page.evaluate(() => REEL_LIVE.seek(30));
  before = file();
  await page.keyboard.press('Meta+v');
  t = await waitFile(x => x !== before);
  const S3 = await sel(); now = await model();
  ok(t && S3.length === S.length && Math.min(...S3.map(l => now.notes.find(n => n.ln === l).step)) === Math.round(30 / now.step), `⌘C ⌘V: ${S3.length} pasted at the playhead (30 s)`);

  // the ruler: a click moves the playhead
  const rp = await page.evaluate(() => { const r = document.querySelector('#reel-notes .nt-roll canvas').getBoundingClientRect(), v = REEL_NOTES.view; return { x: r.left + (v.t0 + 1.5 - v.t0) * v.pxs, y: r.top + 8, t: v.t0 + 1.5 }; });
  await page.mouse.click(rp.x, rp.y);
  const ph = await page.evaluate(() => REEL_LIVE.now());
  ok(Math.abs(ph - rp.t) < 0.05, `a click on its ruler moves the playhead (${ph.toFixed(2)} s)`);

  // every edit undone, one at a time: the score as it was
  let n = 0;
  for (; n < 40 && file() !== SCORE; n++) { const b5 = file(); await page.evaluate(() => REEL_TIMELINE.undo()); await waitFile(x => x !== b5); }
  ok(file() === SCORE, `${n} undos: the score as it was, byte for byte`);

  // E: the timeline back, the notes shut, the window's foot the timeline's
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => ({ notes: REEL_NOTES.open, tl: !document.getElementById('reel-tl').hidden, tlTop: document.getElementById('reel-tl').getBoundingClientRect().top, stage: document.getElementById('stage').getBoundingClientRect().bottom }));
  ok(!back.notes && back.tl && back.stage <= back.tlTop + 1, `E: the timeline back in its place, the notes shut, the preview above it (${Math.round(back.stage)} ≤ ${Math.round(back.tlTop)})`);
  // the timeline's voice clip, double-clicked: the notes there
  await page.evaluate(() => { const r = document.getElementById('reel-tl'); if (r) REEL_TIMELINE.show(true); });
  await page.waitForFunction(() => !!document.querySelector('#reel-tl .tl-mk[data-part="voice"]'), null, { timeout: 10000 }).catch(() => {});
  const vk = await page.evaluate(() => { const k = document.querySelector('#reel-tl .tl-mk[data-part="voice"]'); if (!k) return null; k.scrollIntoView({ block: 'center' }); const r = k.getBoundingClientRect(); return { x: Math.min(r.right - 20, r.left + 200), y: r.top + r.height / 2 }; });
  if (vk) await page.mouse.dblclick(vk.x, vk.y);
  await page.waitForTimeout(300);
  const fromTl = await page.evaluate(() => ({ open: REEL_NOTES.open, t0: REEL_NOTES.view.t0 }));
  ok(vk && fromTl.open, `the timeline's voice clip, double-clicked: the notes open there (from ${fromTl.t0.toFixed(1)} s)`);
  // the take view's button
  await page.evaluate(() => REEL_NOTES.show(false));
  await page.keyboard.press('m');
  await page.waitForSelector('#reel-rack:not([hidden]) .rk-mod');
  await page.locator('#reel-rack .rk-prow[data-part="voice"] .rk-tile', { hasText: 'john' }).first().click();
  await page.locator('#reel-rack .rk-take button', { hasText: 'Edit notes' }).click();
  await page.waitForTimeout(300);
  const fromRack = await page.evaluate(() => ({ open: REEL_NOTES.open, right: document.getElementById('reel-notes').getBoundingClientRect().right, rack: document.getElementById('reel-rack').getBoundingClientRect().left }));
  ok(fromRack.open && fromRack.right <= fromRack.rack + 1, `the take view's Edit notes opens them, left of the rack (${Math.round(fromRack.right)} ≤ ${Math.round(fromRack.rack)})`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} finally {
  if (browser) await browser.close();
  if (dev) dev.kill();
  for (const f of [T_SCRIPT, T_SCORE]) rmSync(join(ROOT, f), { force: true });
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
