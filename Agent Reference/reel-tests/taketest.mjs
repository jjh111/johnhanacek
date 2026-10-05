// John's sung take (2026-10-05): a melody sung over the cut, read from a recording by
// scripts/reel-sing.py into the score as a TAKE, then composed from it (the n lines are the
// melody; each keeps what was sung for it; `out` lines are sung notes it leaves out, and notes
// with nothing sung were added), and sung by a sound made of the voice's own harmonics.
// This suite checks
//   1. the reading and the mapping (scripts/reel-music.js): the take's notes, what plays and what
//      is left out, its mapping lines (octave, shift, straighten, nuance, feel), each note's bend,
//      the one-line edits (a note moved keeps where it was sung; out and back is byte for byte),
//      the errors
//   2. the synth (scripts/reel-synth.js), offline: the harmonics wave and the bends are heard
//   3. the editor, through the dev server: the rack's take view (its knobs write their lines, a
//      note clicked says what became of it, the arrow keys move it to the next note of the key,
//      Shift a semitone, Leave out and Put back write its one line; a left-out note's sung line
//      and an added note say what they are), the voice's harmonics bars, one undo a change, and
//      the timeline's voice lane drawing the bends
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
ok(tk && tk.notes.length >= 100 && tk.octave === 2 && tk.drift.length >= 30,
  `the score holds John's take: ${tk && tk.notes.length} notes, octave ${tk && tk.octave}, the key's drift a bar (${tk && tk.drift.length} bars)`);
ok(voice && voice.voices.some(v => v.wave === 'harmonics') && voice.harmonics && voice.harmonics.length === 16 && voice.harmonics[0] === 0,
  `the voice is a harmonics sound, its 16 harmonics measured from the take (${voice && voice.harmonics && voice.harmonics.slice(0, 5).join(' ')} …)`);
ok(P.score.parts.some(p => p.pads.some(d => d.voices.some(v => v.track === 'voice' && v.take === 'john'))), 'a pad sings it ("pad john take john")');
const A = RM.arrange(P.score, scenes, mom), sung = A.events.filter(e => e.take === 'john');
const S = RM.takeSummary(tk, A.step, A.spb), outs = tk.notes.filter(n => n.out), added = tk.notes.filter(n => !n.out && !n.heard);
ok(S && outs.length > 0 && added.length > 0 && S.notes + S.left === tk.notes.length && S.kept + S.added === S.notes && S.sungNotes === tk.notes.filter(n => n.heard).length,
  `a melody composed from what was sung: ${S && S.notes} notes play (${S && S.kept} sung, ${S && S.added} added), ${S && S.left} sung notes left out`);
ok(added.every(n => n.early === 0 && n.sung === n.midi) && tk.notes.filter(n => n.heard).every(n => n.ln && Number.isFinite(n.sung)),
  'an added note has nothing sung for it; every other keeps what was sung');
const clip = A.clips.find(c => c.part === 'voice');
const inClip = tk.notes.filter(n => !n.out && (n.step + tk.shift) * A.step >= clip.t0 - 1e-9 && (n.step + tk.shift) * A.step < Math.min(clip.t1, CUT) - 1e-9);
ok(sung.length === inClip.length && sung.length === S.notes && sung.every(e => e.dur > 0 && e.t >= 0 && e.t + e.dur <= CUT + 1e-9),
  `every note of the melody plays, inside its clip and the cut (${sung.length} of ${tk.notes.length} lines)`);
const byLn = new Map(tk.notes.map(n => [n.ln, n]));
ok(sung.every(e => !byLn.get(e.nln).out), `no left-out note plays (${outs.length} of them)`);
ok(sung.every(e => { const n = byLn.get(e.nln); return n && e.midi === n.midi + 12 * tk.octave && Math.abs(e.t - Math.max(0, (n.step + tk.shift) * A.step + tk.feel / 100 * n.early / 1000)) < 1e-9; }),
  `each plays its written note ${tk.octave} octave${tk.octave === 1 ? '' : 's'} up, on its sixteenth plus ${tk.feel}% of how early or late it was sung`);
ok(sung.every(e => { const n = byLn.get(e.nln); return e.vel === n.vel && e.tone === Math.max(-RM.TONE_MAX, Math.min(RM.TONE_MAX, n.tone)); }),
  `each plays at its own level and tone, as written (${[...new Set(sung.map(e => e.vel))].join(', ')}; ${[...new Set(sung.map(e => e.tone))].join(', ')} dB)`);
const remap = change => { const p = RM.parse(SCORE); Object.assign(p.score.takes[0], change); return RM.arrange(p.score, scenes, mom).events.filter(e => e.take === 'john'); };
{
  // the bends are the mapping's: at the score's nuance (${tk.nuance}) and at others, set here
  const b100 = remap({ nuance: 100 });
  ok(b100.filter(e => e.bend).every(e => e.bend.every(c => Math.abs(c) <= RM.BEND_MAX + 1)) && b100.some(e => e.bend),
    `at nuance 100 its notes bend as sung, each point held to ±${RM.BEND_MAX} cents (the glides beyond belong to the next note)`);
  const n0 = remap({ nuance: 0 }), n2 = b100, n1 = remap({ nuance: 50 });
  ok(n0.every(e => !e.bend), `nuance 0: every note plays straight${tk.nuance === 0 ? ' (the score\'s own: the melody plays clean)' : ''}`);
  const pairs = n1.filter(e => e.bend).map(e => [e, n2.find(x => x.nln === e.nln)]);
  ok(pairs.length && pairs.every(([a, b]) => b && b.bend && b.bend.every((c, i) => Math.abs(c - 2 * a.bend[i]) <= 1)), 'nuance 100: every bend twice as deep as at 50');
  const s0 = remap({ straighten: 0, nuance: 100 }), s9 = remap({ straighten: 100, nuance: 100 });
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
  const n = tk.notes.find(x => x.heard && !x.out && x.curve.length > 4 && x.early), t2 = RM.setTakeNote(SCORE, 'john', n.ln, { midi: n.midi + 1 }), d2 = diff(SCORE, t2);
  const after = RM.parse(t2).score.takes[0].notes.find(x => x.ln === n.ln);
  ok(d2.length === 1 && after.midi === n.midi + 1 && d2[0][1].length === d2[0][2].length && d2[0][1].split('|')[1] === d2[0][2].split('|')[1],
    `a note a semitone up rewrites its n line, same columns, its sung pitch and bend untouched (${d2[0][1].trim().slice(0, 22)} → ${d2[0][2].trim().slice(0, 22)})`);
  // moved two sixteenths later: what was sung stays where it was (its early takes the move)
  const ms = 60000 / P.score.tempo / 4, t3 = RM.setTakeNote(SCORE, 'john', n.ln, { step: n.step + 2 }), m3 = RM.parse(t3).score.takes[0].notes.find(x => x.ln === n.ln);
  ok(diff(SCORE, t3).length === 1 && m3.step === n.step + 2 && Math.abs((m3.step * ms + m3.early) - (n.step * ms + n.early)) <= 1 && m3.curve.join() === n.curve.join() && m3.sung === n.sung,
    `a note moved keeps where it was sung: its early ${n.early} → ${m3.early} ms, its sung pitch and bend as they were`);
  const a = added[0], t4 = RM.setTakeNote(SCORE, 'john', a.ln, { step: a.step + 1 }), m4 = RM.parse(t4).score.takes[0].notes.find(x => x.ln === a.ln);
  ok(diff(SCORE, t4).length === 1 && m4.step === a.step + 1 && !m4.heard && m4.early === 0, 'an added note moved stays added: nothing sung is made up for it');
  // left out and put back: its one line, byte for byte; a left-out note does not play, put back it does
  const t5 = RM.setTakeNote(SCORE, 'john', n.ln, { out: true }), d5 = diff(SCORE, t5), P5 = RM.parse(t5), m5 = P5.score.takes[0].notes.find(x => x.ln === n.ln);
  const plays5 = RM.arrange(P5.score, scenes, mom).events.some(e => e.nln === n.ln);
  ok(d5.length === 1 && m5.out && / out \| /.test(d5[0][2]) && !plays5 && sung.some(e => e.nln === n.ln) && RM.setTakeNote(t5, 'john', n.ln, { out: false }) === SCORE,
    `Leave out writes "out" on its one line and it stops playing; Put back is the line it was (${d5.length && d5[0][2].trim().slice(0, 48)}…)`);
  const rt = tk.notes.filter(x => RM.setTakeNote(RM.setTakeNote(SCORE, 'john', x.ln, { out: !x.out }), 'john', x.ln, { out: x.out }) !== SCORE);
  ok(rt.length === 0, `every note, left out and put back (or back and out), is its line again, byte for byte${rt.length ? ': not lines ' + rt.map(x => x.ln).join(' ') : ''}`);
  const o = outs.find(x => x.heard && x.step * A.step > 7 && x.step * A.step < 60), t6 = RM.setTakeNote(SCORE, 'john', o.ln, { out: false }), P6 = RM.parse(t6);
  ok(diff(SCORE, t6).length === 1 && !P6.score.takes[0].notes.find(x => x.ln === o.ln).out && RM.arrange(P6.score, scenes, mom).events.some(e => e.nln === o.ln) && RM.setTakeNote(t6, 'john', o.ln, { out: true }) === SCORE,
    `a left-out note put back plays (line ${o.ln}), and out again is the line it was`);
  throws(() => RM.parse(SCORE.replace(/^ {2}n (\S+) +\S+/m, '  n $1 X9')), /line \d+: n wants .*"X9" is not a note/, 'a note that is not one says so by line');
  throws(() => RM.parse(SCORE.replace('take john', 'take nobody')), /line \d+: take wants the name of a TAKE \(john\)/, 'a pad that sings a take not there says so');
  throws(() => RM.parse(SCORE.replace(/^ {2}harmonics .*\n/m, '')), /has a harmonics voice but no harmonics line/, 'a harmonics voice with no harmonics says so');
  throws(() => RM.parse(SCORE.replace(/^ {2}octave +[+-]?\d+$/m, '  octave     9')), /line \d+: octave wants a whole number from -3 to 3/, 'an octave out of range says so');
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
      // the voice alone, 8 to 12 s, as it is, as a sine (harmonics 0), bent (nuance 100) and straight (nuance 0)
      const run = async edit => {
        const P = RM.parse(edit(SCORE));
        P.score.tracks.forEach(t => { if (t.name !== 'voice') t.level = 0; });
        const buf = await RSy.renderOffline(P, RM.arrange(P.score, scenes, mom), { from: 8, to: 12, sampleRate: 24000 });
        return Array.from(buf.getChannelData(0));
      };
      const base = await run(s => s), sine = await run(s => s.replace(/^ {2}harmonics .*$/m, '  harmonics 0'));
      const bent = await run(s => s.replace(/^ {2}nuance +\d+$/m, '  nuance     100')), straight = await run(s => s.replace(/^ {2}nuance +\d+$/m, '  nuance     0'));
      const rms = a => Math.sqrt(a.reduce((x, v) => x + v * v, 0) / a.length), peak = a => a.reduce((x, v) => Math.max(x, Math.abs(v)), 0);
      const dif = (a, b) => rms(a.map((v, i) => v - b[i]));
      // brightness: how much of it changes from one sample to the next (a sine's is least)
      const bright = a => rms(a.slice(1).map((v, i) => v - a[i])) / Math.max(1e-9, rms(a));
      return { peak: peak(base), rms: rms(base), sineDiff: dif(base, sine), straightDiff: dif(bent, straight), bright: bright(base), sineBright: bright(sine) };
    }, { SCORE, scenes, mom });
    const db = x => (20 * Math.log10(x || 1e-9)).toFixed(1);
    ok(r.peak > 0.02 && r.peak < 0.99, `the voice sings, alone, 8-12 s: peak ${db(r.peak)} dBFS, rms ${db(r.rms)} dBFS`);
    ok(r.sineDiff > r.rms * 0.3 && r.bright > r.sineBright * 1.2, `its harmonics are heard: brighter than a sine of the same notes (${r.bright.toFixed(3)} against ${r.sineBright.toFixed(3)})`);
    ok(r.straightDiff > r.rms * 0.1, `its bends are heard: nuance 100 plays it differently from 0 (${db(r.straightDiff)} dBFS of difference)`);
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
  ok(/\d+ notes play .*made from the \d+ sung/.test(view.sum) && /left out \(dotted\)/.test(view.sum) && /added/.test(view.sum) && /drifted/.test(view.sum) && /A minor/.test(view.sum) && /sixteenth/.test(view.sum),
    'it says, in words, what the melody made of the take (kept, added, left out; the drift, the key, the sixteenths, the octave)');
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
  // where a note (or, for a left-out one, its sung line) is drawn: the view's rows and bars as drawn
  const pointOf = sel => page.evaluate(sel => {
    const A = REEL_RACK.arrangement, tk = REEL_RACK.parsed.score.takes[0], cv = document.querySelector('#reel-rack .rk-take canvas.rk-tcv'), r = cv.getBoundingClientRect(), d = cv.dataset;
    const lo = +d.lo, hi = +d.hi, t0 = +d.bar0 * A.bar, t1 = t0 + 4 * A.bar, rh = (r.height - +d.top - 3) / (hi - lo + 1);
    const X = t => r.left + +d.gut + (t - t0) / (t1 - t0) * (r.width - +d.gut - 2), Y = m => r.top + +d.top + (hi - m) * rh + rh / 2;
    if (sel.out) {
      const n = tk.notes.find(n => n.out && n.heard && n.curve.length > 4 && n.step * A.step + n.early / 1000 >= t0 && n.step * A.step + n.early / 1000 < t1 - 0.3);
      if (!n) return null;
      const i = Math.floor(n.curve.length / 2);
      return { x: X(n.step * A.step + n.early / 1000 + i / 32), y: Y(n.sung + 12 * tk.octave + n.curve[i] / 100), nln: n.ln };
    }
    const e = sel.added ? A.events.find(x => x.take && x.t >= t0 && x.t < t1 && !tk.notes.find(n => n.ln === x.nln).heard) : A.events.find(x => x.take && x.t >= sel.t && x.t < sel.t + 0.4);
    return e ? { x: X(e.t + e.dur / 2), y: Y(e.midi), nln: e.nln } : null;
  }, sel);
  const selText = () => page.locator('#reel-rack .rk-tsel span').first().textContent();
  const outBtn = () => page.locator('#reel-rack .rk-tsel button').last();
  const pick = await pointOf({ t: 9.2 });
  await page.mouse.click(pick.x, pick.y);
  const info = await selText();
  ok(/plays [A-G]#?\d\. Sung [A-G]#?\d/.test(info) && /(Tuned [+-]\d+ cents to|Set to) [A-G]#?\d/.test(info), `a note clicked says what became of it ("${info.slice(0, 70)}…")`);
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
  // Leave out: its one line says out, and it stops playing; Put back: the line it was
  const before3 = t;
  ok((await outBtn().textContent()) === 'Leave out', 'a note that plays offers Leave out');
  await outBtn().click();
  t = await waitFile(x => x !== before3);
  d = t ? diff(before3, t) : [];
  const gone = await page.evaluate(ln => !REEL_RACK.arrangement.events.some(e => e.nln === ln), pick.nln);
  ok(t && d.length === 1 && d[0][0] === pick.nln && / out( \||$)/.test(d[0][2]) && gone && (await outBtn().textContent()) === 'Put back' && /^Left out\./.test(await selText()),
    'Leave out writes "out" on its one line; the note stops playing and says it is left out');
  const before4 = t;
  await outBtn().click();
  t = await waitFile(x => x !== before4);
  const back = await page.evaluate(ln => REEL_RACK.arrangement.events.some(e => e.nln === ln), pick.nln);
  ok(t === before3 && back, 'Put back: the line it was, byte for byte, and it plays again');
  t = t || before4;
  // a left-out note, clicked on its sung line (dotted); an added note, which nothing was sung for
  const op = await pointOf({ out: true });
  if (op) await page.mouse.click(op.x, op.y);
  ok(op && /^Left out\. Sung [A-G]#?\d/.test(await selText()) && (await outBtn().textContent()) === 'Put back', `a left-out note is picked by the line of what was sung (line ${op && op.nln}): "${(await selText()).slice(0, 48)}…"`);
  for (let i = 0; i < 6; i++) await page.locator('#reel-rack .rk-take .rk-tnav button').nth(1).click();
  const ap = await pointOf({ added: true });
  if (ap) await page.mouse.click(ap.x, ap.y);
  ok(ap && /Added: nothing was sung here/.test(await selText()) && (await outBtn().textContent()) === 'Leave out', `an added note says so (bars 29-32, line ${ap && ap.nln})`);
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
  for (let i = 0; i < 6; i++) await page.evaluate(() => REEL_RACK.undo());
  t = await waitFile(x => x === SCORE);
  ok(t === SCORE, 'six undos: the score is as it was, byte for byte');
  // the timeline: the voice lane, its notes and, where the mapping bends them, their bends
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const r = document.getElementById('reel-rack'); if (r && !r.hidden) REEL_RACK.open(false); });
  await page.keyboard.press('e');
  const laneOf = () => page.evaluate(() => { const s = document.querySelector('#reel-tl svg.tl-mroll[data-track="voice"]'); return s ? { notes: [...s.querySelectorAll('.tl-n')].map(p => (p.getAttribute('d') || '').length).reduce((a, b) => a + b, 0), bends: ((s.querySelector('.tl-nb') || { getAttribute: () => '' }).getAttribute('d') || '').length, h: s.getBoundingClientRect().height } : null; });
  await page.waitForFunction(() => { const s = document.querySelector('#reel-tl svg.tl-mroll[data-track="voice"] .tl-n'); return s && (s.getAttribute('d') || '').length > 20; }, null, { timeout: 10000 }).catch(() => {});
  const lane = await laneOf(), bentAt = tk.nuance > 0;
  ok(lane && lane.notes > 100 && (bentAt ? lane.bends > 20 : lane.bends === 0) && lane.h >= 30,
    `the timeline's voice lane draws the notes${bentAt ? ' and, over them, how each bends' : ', straight at nuance 0 (no bend drawn)'} (lane ${lane && Math.round(lane.h)} px tall)`);
  const before5 = t;
  await page.evaluate(() => REEL_RACK.change(ReelMusic.setArg(REEL_RACK.src, 'TAKE', 'john', 'nuance', 0, 40)));
  await page.waitForFunction(() => { const s = document.querySelector('#reel-tl svg.tl-mroll[data-track="voice"] .tl-nb'); return s && (s.getAttribute('d') || '').length > 20; }, null, { timeout: 10000 }).catch(() => {});
  const lane40 = await laneOf();
  ok(lane40 && lane40.bends > 20, `at nuance 40 the lane draws how each note bends, over it (${lane40 && lane40.bends} of path)`);
  await page.evaluate(() => REEL_RACK.undo());
  t = await waitFile(x => x === before5);
  ok(t === SCORE, 'and one undo: the score as it was');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} finally {
  if (browser) await browser.close();
  if (dev) dev.kill();
  for (const f of [T_SCRIPT, T_SCORE]) rmSync(join(ROOT, f), { force: true });
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
