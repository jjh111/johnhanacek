// John's sung take (2026-10-05): a melody he sang over the cut, read from a recording by
// scripts/reel-sing.py into the score as a TAKE, and sung by a sound made of his voice's own
// harmonics. This suite checks
//   1. the reading and the mapping (scripts/reel-music.js): the take's notes, its mapping lines
//      (octave, shift, straighten, nuance, feel), each note's bend, the one-line edits, the errors
//   2. the synth (scripts/reel-synth.js), offline: the harmonics wave and the bends are heard
//   3. the editor, through the dev server: the rack's take view (its knobs write their lines, a
//      note clicked says what became of it, the arrow keys move it to the next note of the key,
//      Shift a semitone), the voice's
//      harmonics bars, one undo a change, and the timeline's voice lane drawing the bends
//   node "Agent Reference/reel-tests/taketest.mjs"      exits non-zero on any failure
// Works on temp copies (Assets/zz-take-test.script.txt and .score.txt), removed in finally.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const req = createRequire(import.meta.url);
const RM = req(join(ROOT, 'scripts/reel-music.js')), RS = req(join(ROOT, 'scripts/reel-script.js'));
const SCRIPT = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
const SCORE = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.score.txt'), 'utf8');
const T_SCRIPT = 'Assets/zz-take-test.script.txt', T_SCORE = 'Assets/zz-take-test.score.txt';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const throws = (fn, re, what) => { try { fn(); ok(false, what + ' (did not throw)'); } catch (e) { ok(re.test(e.message), `${what}: ${e.message.split('\n')[0]}`); } };
const lines = s => s.split('\n');
const diff = (a, b) => lines(a).map((l, i) => [i + 1, l, lines(b)[i]]).filter(([, x, y]) => x !== y);

// ── 1. reading and mapping ───────────────────────────────────────────────
const edit = RS.parse(SCRIPT).edit;
const scenes = RS.spans(edit).map((c, i) => ({ type: edit.scenes[i].type, start: c.start, end: c.end }));
const mom = RM.moments(edit, RS), CUT = scenes[scenes.length - 1].end;
const P = RM.parse(SCORE), tk = P.score.takes.find(t => t.name === 'john');
const voice = P.score.tracks.find(t => t.name === 'voice');
ok(tk && tk.notes.length >= 100 && tk.octave === 1 && tk.drift.length >= 30,
  `the score holds John's take: ${tk && tk.notes.length} notes, octave ${tk && tk.octave}, the key's drift a bar (${tk && tk.drift.length} bars)`);
ok(voice && voice.voices.some(v => v.wave === 'harmonics') && voice.harmonics && voice.harmonics.length === 16 && voice.harmonics[0] === 0,
  `the voice is a harmonics sound, its 16 harmonics measured from the take (${voice && voice.harmonics && voice.harmonics.slice(0, 5).join(' ')} …)`);
ok(P.score.parts.some(p => p.pads.some(d => d.voices.some(v => v.track === 'voice' && v.take === 'john'))), 'a pad sings it ("pad john take john")');
const A = RM.arrange(P.score, scenes, mom), sung = A.events.filter(e => e.take === 'john');
const clip = A.clips.find(c => c.part === 'voice');
const inClip = tk.notes.filter(n => (n.step + tk.shift) * A.step >= clip.t0 - 1e-9 && (n.step + tk.shift) * A.step < Math.min(clip.t1, CUT) - 1e-9);
ok(sung.length === inClip.length && sung.every(e => e.dur > 0 && e.t >= 0 && e.t < CUT), `every note of the take inside its clip plays (${sung.length} of ${tk.notes.length}; the rest were sung past the cut's end)`);
const byLn = new Map(tk.notes.map(n => [n.ln, n]));
ok(sung.every(e => { const n = byLn.get(e.nln); return n && e.midi === n.midi + 12 * tk.octave && Math.abs(e.t - Math.max(0, (n.step + tk.shift) * A.step + tk.feel / 100 * n.early / 1000)) < 1e-9; }),
  `each plays its written note an octave up, on its sixteenth plus ${tk.feel}% of how early or late it was sung`);
ok(sung.filter(e => e.bend).every(e => e.bend.every(c => Math.abs(c) <= RM.BEND_MAX * tk.nuance / 100 + 1)) && sung.some(e => e.bend),
  `its notes bend as sung, each point held to ±${RM.BEND_MAX} cents (the glides beyond belong to the next note)`);
const remap = change => { const p = RM.parse(SCORE); Object.assign(p.score.takes[0], change); return RM.arrange(p.score, scenes, mom).events.filter(e => e.take === 'john'); };
{
  const n0 = remap({ nuance: 0 }), n2 = remap({ nuance: 200 }), n1 = sung;
  ok(n0.every(e => !e.bend), 'nuance 0: every note plays straight');
  const pairs = n1.filter(e => e.bend).map(e => [e, n2.find(x => x.nln === e.nln)]);
  ok(pairs.length && pairs.every(([a, b]) => b && b.bend && b.bend.every((c, i) => Math.abs(c - 2 * a.bend[i]) <= 1)), 'nuance 200: every bend twice as deep');
  const s0 = remap({ straighten: 0 }), s9 = remap({ straighten: 100 });
  const long = s0.filter(e => e.bend && e.bend.length > 12);
  const edgesKept = long.every(e => { const o = s9.find(x => x.nln === e.nln); return o.bend[0] === e.bend[0] && o.bend[o.bend.length - 1] === e.bend[e.bend.length - 1]; });
  const bodyMoved = long.some(e => { const o = s9.find(x => x.nln === e.nln); return o.bend.some((c, i) => c !== e.bend[i]); });
  ok(long.length && edgesKept && bodyMoved, `straighten takes the wander out of a note's body and keeps its scoop and fall (${long.length} long notes)`);
  const f0 = remap({ feel: 0 }), sh = remap({ feel: 0, shift: 4 });
  ok(f0.every(e => Math.abs(e.t / A.step - Math.round(e.t / A.step)) < 1e-6), 'feel 0: every note on its sixteenth');
  ok(f0.filter(e => e.t > 2 && e.t < 50).every(e => { const o = sh.find(x => x.nln === e.nln); return o && Math.abs(o.t - e.t - 0.5) < 1e-6; }), 'shift 4: the take a beat later');
}
{
  // one-line edits: a mapping line, and a note moved a semitone with its columns kept
  const t1 = RM.setArg(SCORE, 'TAKE', 'john', 'nuance', 0, 40), d1 = diff(SCORE, t1);
  ok(d1.length === 1 && /^ {2}nuance +40$/.test(d1[0][2]) && RM.parse(t1).score.takes[0].nuance === 40, `a mapping knob writes its one line (${d1.map(x => x[2].trim()).join()})`);
  const n = tk.notes[5], t2 = RM.setTakeNote(SCORE, 'john', n.ln, { midi: n.midi + 1 }), d2 = diff(SCORE, t2);
  const after = RM.parse(t2).score.takes[0].notes.find(x => x.ln === n.ln);
  ok(d2.length === 1 && after.midi === n.midi + 1 && d2[0][1].length === d2[0][2].length && d2[0][1].split('|')[1] === d2[0][2].split('|')[1],
    `a note a semitone up rewrites its n line, same columns, its sung pitch and bend untouched (${d2[0][1].trim().slice(0, 22)} → ${d2[0][2].trim().slice(0, 22)})`);
  throws(() => RM.parse(SCORE.replace(/^ {2}n (\S+) +\S+/m, '  n $1 X9')), /line \d+: n wants .*"X9" is not a note/, 'a note that is not one says so by line');
  throws(() => RM.parse(SCORE.replace('take john', 'take nobody')), /line \d+: take wants the name of a TAKE \(john\)/, 'a pad that sings a take not there says so');
  throws(() => RM.parse(SCORE.replace(/^ {2}harmonics .*\n/m, '')), /has a harmonics voice but no harmonics line/, 'a harmonics voice with no harmonics says so');
  throws(() => RM.parse(SCORE.replace(/^ {2}octave +\+?1$/m, '  octave     9')), /line \d+: octave wants a whole number from -3 to 3/, 'an octave out of range says so');
}

// ── 2. the synth, offline ────────────────────────────────────────────────
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
let dev, browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), args: ['--autoplay-policy=no-user-gesture-required'] });
  {
    const page = await browser.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ path: join(ROOT, 'scripts/reel-music.js') });
    await page.addScriptTag({ path: join(ROOT, 'scripts/reel-synth.js') });
    const r = await page.evaluate(async ({ SCORE, scenes, mom }) => {
      const RM = window.ReelMusic, RSy = window.ReelSynth;
      // the voice alone, 8 to 12 s, as it is, as a sine (harmonics 0), and straight (nuance 0)
      const run = async edit => {
        const P = RM.parse(edit(SCORE));
        P.score.tracks.forEach(t => { if (t.name !== 'voice') t.level = 0; });
        const buf = await RSy.renderOffline(P, RM.arrange(P.score, scenes, mom), { from: 8, to: 12, sampleRate: 24000 });
        return Array.from(buf.getChannelData(0));
      };
      const base = await run(s => s), sine = await run(s => s.replace(/^ {2}harmonics .*$/m, '  harmonics 0')), straight = await run(s => s.replace(/^ {2}nuance +\d+$/m, '  nuance     0'));
      const rms = a => Math.sqrt(a.reduce((x, v) => x + v * v, 0) / a.length), peak = a => a.reduce((x, v) => Math.max(x, Math.abs(v)), 0);
      const dif = (a, b) => rms(a.map((v, i) => v - b[i]));
      // brightness: how much of it changes from one sample to the next (a sine's is least)
      const bright = a => rms(a.slice(1).map((v, i) => v - a[i])) / Math.max(1e-9, rms(a));
      return { peak: peak(base), rms: rms(base), sineDiff: dif(base, sine), straightDiff: dif(base, straight), bright: bright(base), sineBright: bright(sine) };
    }, { SCORE, scenes, mom });
    const db = x => (20 * Math.log10(x || 1e-9)).toFixed(1);
    ok(r.peak > 0.02 && r.peak < 0.99, `the voice sings, alone, 8-12 s: peak ${db(r.peak)} dBFS, rms ${db(r.rms)} dBFS`);
    ok(r.sineDiff > r.rms * 0.3 && r.bright > r.sineBright * 1.2, `its harmonics are heard: brighter than a sine of the same notes (${r.bright.toFixed(3)} against ${r.sineBright.toFixed(3)})`);
    ok(r.straightDiff > r.rms * 0.1, `its bends are heard: nuance 0 plays it differently (${db(r.straightDiff)} dBFS of difference)`);
    ok(errs.length === 0, 'no page errors offline' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await page.close();
  }

  // ── 3. the editor ──────────────────────────────────────────────────────
  writeFileSync(join(ROOT, T_SCRIPT), SCRIPT); writeFileSync(join(ROOT, T_SCORE), SCORE);
  const port = await freePort();
  dev = spawn(process.execPath, [join(ROOT, 'scripts/reel-dev.mjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('dev server did not start')), 8000); dev.stdout.on('data', d => { if (/reel-dev: http/.test(String(d))) { clearTimeout(t); res(); } }); });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/\.mp4(\?.*)?$/i, rt => rt.fulfill({ status: 404, body: '' }));
  await page.goto(`http://127.0.0.1:${port}/Assets/sizzle-reel-2.html?script=zz-take-test.script.txt#t=8.6&pause=1`);
  await page.waitForFunction(() => window.REEL_RACK && window.REEL_RACK.parsed, null, { timeout: 60000 });
  await page.mouse.click(200, 200);
  await page.keyboard.press('m');
  await page.waitForSelector('#reel-rack:not([hidden]) .rk-mod');
  await page.locator('#reel-rack .rk-prow[data-part="voice"] .rk-tile', { hasText: 'john' }).first().click();
  await page.waitForSelector('#reel-rack .rk-take canvas.rk-tcv');
  const view = await page.evaluate(() => {
    const t = document.querySelector('#reel-rack .rk-take');
    return { knobs: [...t.querySelectorAll('.rk-knob .l')].map(l => l.textContent), sum: t.querySelector('.rk-tsum').textContent, drawn: t.querySelector('canvas.rk-tcv').width > 0 };
  });
  ok(view.knobs.join() === 'octave,shift,straighten,nuance,feel' && view.drawn, `the voice's pad opens the take view: the sung line, the notes and how they play, drawn; the mapping as knobs (${view.knobs.join(', ')})`);
  ok(/notes, sung from/.test(view.sum) && /drifted/.test(view.sum) && /A minor/.test(view.sum), 'it says, in words, what became of the take (the drift, the key, the sixteenths, the octave)');
  const waitFile = async fn => { for (let i = 0; i < 50; i++) { const t = readFileSync(join(ROOT, T_SCORE), 'utf8'); if (fn(t)) return t; await new Promise(r => setTimeout(r, 100)); } return null; };
  // the nuance knob, typed
  const nk = page.locator('#reel-rack .rk-take .rk-knob', { hasText: 'nuance' });
  await nk.dblclick();
  await page.keyboard.press('Control+A'); await page.keyboard.type('40'); await page.keyboard.press('Enter');
  let t = await waitFile(x => /^ {2}nuance +40$/m.test(x));
  ok(t && diff(SCORE, t).length === 1, 'typing 40 into the nuance knob writes that one line of the score');
  const heard = await page.evaluate(() => REEL_RACK.parsed.score.takes[0].nuance);
  ok(heard === 40, 'and the engine plays it at once');
  // a note: clicked, then a semitone up with the arrow key
  const pick = await page.evaluate(() => {
    const A = REEL_RACK.arrangement, e = A.events.find(x => x.take && x.t >= 9.2 && x.t < 9.6);
    const cv = document.querySelector('#reel-rack .rk-take canvas.rk-tcv'), r = cv.getBoundingClientRect();
    const all = A.events.filter(x => x.take).map(x => x.midi), lo = Math.min(...all, 60) - 2, hi = Math.max(...all, 60) + 2;
    const t0 = 4 * A.bar, t1 = t0 + 4 * A.bar, rh = (r.height - 14 - 3) / (hi - lo + 1);
    return { x: r.left + 26 + (e.t + e.dur / 2 - t0) / (t1 - t0) * (r.width - 28), y: r.top + 14 + (hi - e.midi) * rh + rh / 2, nln: e.nln };
  });
  await page.mouse.click(pick.x, pick.y);
  const info = await page.locator('#reel-rack .rk-tsel span').first().textContent();
  ok(/plays [A-G]#?\d\. Sung [A-G]#?\d/.test(info) && /moved [+-]\d+ cents/.test(info), `a note clicked says what became of it ("${info.slice(0, 70)}…")`);
  // ↑: the next note of the key (A minor: F to G), its one n line; Shift+↓: a semitone (G to F#)
  const before = t, midiOf = (x, ln) => RM.parse(x).score.takes[0].notes.find(n => n.ln === ln).midi, m0 = midiOf(before, pick.nln);
  const inKey = m => [0, 2, 3, 5, 7, 8, 10].includes(((m - 9) % 12 + 12) % 12);
  let want = m0 + 1; while (!inKey(want)) want++;
  await page.keyboard.press('ArrowUp');
  t = await waitFile(x => x !== before);
  let d = t ? diff(before, t) : [];
  ok(d.length === 1 && d[0][0] === pick.nln && midiOf(t, pick.nln) === want, `↑ moves it up to the next note of the key: its one n line (line ${pick.nln}, ${m0} → ${t && midiOf(t, pick.nln)})`);
  const before1 = t;
  await page.keyboard.press('Shift+ArrowDown');
  t = await waitFile(x => x !== before1);
  d = t ? diff(before1, t) : [];
  ok(t && d.length === 1 && midiOf(t, pick.nln) === want - 1, `Shift+↓ moves it a semitone, the view keeping the keys after it drew again (${want} → ${t && midiOf(t, pick.nln)})`);
  t = t || before1;
  // the voice's harmonics: drag the third bar to the top
  const harm = page.locator('#reel-rack .rk-mod .rk-harm svg').first();
  await harm.scrollIntoViewIfNeeded();
  const hb = await harm.boundingBox();
  const before2 = t;
  await page.mouse.move(hb.x + 1 + 2 * 14 + 7, hb.y + 30); await page.mouse.down();
  await page.mouse.move(hb.x + 1 + 2 * 14 + 7, hb.y + 4, { steps: 4 }); await page.mouse.up();
  t = await waitFile(x => x !== before2);
  const h3 = t && RM.parse(t).score.tracks.find(x => x.name === 'voice').harmonics[2], h3was = voice.harmonics[2];
  ok(t && diff(before2, t).length === 1 && h3 > h3was, `dragging the third harmonic's bar up writes the harmonics line (${h3was} → ${h3} dB)`);
  for (let i = 0; i < 4; i++) await page.evaluate(() => REEL_RACK.undo());
  t = await waitFile(x => x === SCORE);
  ok(t === SCORE, 'four undos: the score is as it was, byte for byte');
  // the timeline: the voice lane, its notes and their bends
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const r = document.getElementById('reel-rack'); if (r && !r.hidden) REEL_RACK.open(false); });
  await page.keyboard.press('e');
  await page.waitForFunction(() => { const s = document.querySelector('#reel-tl svg.tl-mroll[data-track="voice"] .tl-nb'); return s && (s.getAttribute('d') || '').length > 20; }, null, { timeout: 10000 }).catch(() => {});
  const lane = await page.evaluate(() => { const s = document.querySelector('#reel-tl svg.tl-mroll[data-track="voice"]'); return s ? { notes: [...s.querySelectorAll('.tl-n')].map(p => (p.getAttribute('d') || '').length).reduce((a, b) => a + b, 0), bends: (s.querySelector('.tl-nb').getAttribute('d') || '').length, h: s.getBoundingClientRect().height } : null; });
  ok(lane && lane.notes > 100 && lane.bends > 20 && lane.h >= 30, `the timeline's voice lane draws the notes and, over them, how each bends (lane ${lane && Math.round(lane.h)} px tall)`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} finally {
  if (browser) await browser.close();
  if (dev) dev.kill();
  for (const f of [T_SCRIPT, T_SCORE]) rmSync(join(ROOT, f), { force: true });
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
