// The reel's music, end to end: the score's reader and its one-line edits
// (scripts/reel-music.js), the synths' offline mix (scripts/reel-synth.js), the synth rack in
// the live preview (scripts/reel-rack.js, through scripts/reel-dev.mjs), and the renderer's
// soundtrack (--audio-only, and a short film with its audio muxed in).
//
//   node "Agent Reference/reel-tests/musictest.mjs"      exits non-zero on any failure
//
// Works on temp copies (Assets/zz-music-test.script.txt and .score.txt), removed in finally.
// Renders land in .local/reel-tests/music/.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const req = createRequire(import.meta.url);
const RM = req(join(ROOT, 'scripts/reel-music.js')), RS = req(join(ROOT, 'scripts/reel-script.js'));
const OUT = join(ROOT, '.local/reel-tests/music');
mkdirSync(OUT, { recursive: true });
const SCRIPT = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
const SCORE = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.score.txt'), 'utf8');
const T_SCRIPT = 'Assets/zz-music-test.script.txt', T_SCORE = 'Assets/zz-music-test.score.txt';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const throws = (fn, re, what) => { try { fn(); ok(false, what + ' (did not throw)'); } catch (e) { ok(re.test(e.message), `${what}: ${e.message.split('\n')[0]}`); } };
const lines = s => s.split('\n');
const diff = (a, b) => lines(a).map((l, i) => [i + 1, l, lines(b)[i]]).filter(([, x, y]) => x !== y);

// ── reading and arranging ────────────────────────────────────────────────
const edit = RS.parse(SCRIPT).edit;
const scenes = RS.spans(edit).map((c, i) => ({ type: edit.scenes[i].type, start: c.start, end: c.end }));
const P = RM.parse(SCORE), mom = RM.moments(edit, RS), A = RM.arrange(P.score, scenes, mom);
const CUT = scenes[scenes.length - 1].end;                          // the cut's length, as the script says (60 s, then 63.5)
ok(P.score.tempo === 120 && P.score.tracks.length === 10 && A.sections.length === scenes.length, `the score parses: ${P.score.tracks.length} tracks, a section for each of the ${scenes.length} scenes`);
ok(A.events.every(e => e.t >= 0 && e.t < CUT && e.dur > 0 && e.vel > 0), `${A.events.length} events, every one inside the ${CUT} s cut`);
const band = A.events.filter(e => !P.score.tracks.find(t => t.name === e.track).on);
// the music is one piece (2026-10-01): one clock, sections on the bars near their cuts, seams
const levelAt = (pts, t) => { let v = pts[0].v; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (t < a.t) break; if (t <= b.t) return b.t - a.t < 1e-9 ? b.v : a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t); v = b.v; } return v; };
const secAt = t => { let s = A.sections[0]; for (const x of A.sections) if (t >= x.start - 1e-9) s = x; return s; };
const strays = band.filter(e => {
  if (e.bypass) return !A.transitions.some(tr => ['build', 'swell', 'drop'].includes(tr.kind) && e.t >= tr.t0 - 1e-9 && e.t <= tr.t + 1e-9);
  if (A.levels[e.track]) return !(Math.max(levelAt(A.levels[e.track], e.t), levelAt(A.levels[e.track], e.t + 0.05)) > 0);
  return !A.sections.some(s => s.play.some(p => p.name === e.track) && (e.t >= s.cut - 1e-9 || e.t >= s.start - 1e-9) && e.t < s.end + 1e-9);
});
ok(!strays.length, `every note of the band sounds where it belongs: an instrument that flows only where its level is above nothing (its fades included), a hit on a section that plays it, a seam's own notes at a build, a swell or a drop${strays.length ? ' (' + strays.slice(0, 3).map(e => e.track + '@' + e.t).join(' ') + ')' : ''}`);
const STEP = 0.125, kickSteps = P.score.tracks.find(t => t.name === 'kick').steps;
const kicks = band.filter(e => e.track === 'kick');
ok(kicks.length > 50 && kicks.every(e => Math.abs(e.t / STEP - Math.round(e.t / STEP)) < 1e-6 && kickSteps[Math.round(e.t / STEP) % kickSteps.length] !== '.'),
  `the groove never starts again: all ${kicks.length} kicks sit on the reel's own sixteenths, on a step their pattern plays, across every seam`);
ok(band.every(e => Math.abs(e.t / STEP - Math.round(e.t / STEP)) < 1e-6), 'every note of the band sits on the reel\'s sixteenth grid (0.125 s from 0)');
const at = type => A.sections.find(s => s.type === type);
ok(at('title').start === 2 && at('answer').start === 8 && at('results').start === 22 && at('command').start === 17 && at('quotes').start === 45 && at('end').start === 59,
  'a section starts on the bar nearest its cut when that is a beat away or less (title 2, answer 8, results 22), else on its cut (command 17, quotes 45, end 59)');
// the keys the score plays are the keys the rig types (both read ReelScript.queries)
const keys = A.events.filter(e => e.track === 'keys').map(e => e.t);
const typed = RS.queries(edit).flatMap(q => q.times.filter((_, i) => q.text[i] !== ' '));
ok(keys.length === typed.length && keys.every((t, i) => Math.abs(t - typed[i]) < 1e-9), `the keys track clicks on all ${typed.length} typed letters, at the rig's times`);
// ReelScript.queries is the rig's old formula, moved: same numbers
{
  const hash01 = i => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  let acc = 0; const SC = edit.scenes.map((s, i) => { const o = Object.assign({}, s, { i, start: acc, end: acc + s.dur }); acc += s.dur; return o; });
  const QS = SC.filter(s => s.query), old = QS.map((sc, k) => { const t0 = sc.start + (k === 0 ? 0.1 : -0.08); const times = []; let tt = t0; const CPS = RS.cue(sc, 'typing'); for (let i = 0; i < sc.query.length; i++) { tt += (1 / CPS) * (0.6 + 0.8 * hash01(i + 31 * sc.i)); times.push(tt); } return { times, enter: tt + 0.06 }; });
  const now = RS.queries(edit);
  ok(now.length === old.length && now.every((q, k) => q.enter === old[k].enter && q.times.every((t, i) => t === old[k].times[i])), 'ReelScript.queries gives the rig\'s typing times to the bit');
}
// everything goes round on the reel's own clock (2026-10-02): the chords, the steps, the tune
const round = P.score.chords.map(c => c.name), chordOn = t => round[Math.floor(t / 2 + 1e-9) % round.length];
ok(A.sections.filter(s => !s.own).every(s => s.harmony.every(h => h.chord.name === chordOn(h.t + 1e-6))),
  `the chords go round on the reel's own bars, one a bar, across every cut (${round.join(' ')}): no section starts them again`);
ok(at('results').harmony.map(h => h.chord.name + '@' + h.t).join() === 'Am@22,F@24,C@26,G@28,Am@30,F@32', 'the results, from 22 s: Am F C G Am F, the loop where it stands');
ok(at('quotes').harmony.map(h => h.chord.name + '@' + h.t).join() === 'G@45,Am@46,F@48,C@50,G@52', 'a section starting mid-bar takes the bar\'s chord (the quotes: G at 45, then Am at 46)');
ok(at('end').own && at('end').harmony.every(h => h.chord.name === 'Am') && at('end').harmony[0].t === 59, 'a section with its own chords plays them from its start (the end holds Am from 59 s)');
{
  // a part that plays on across a seam is one part: the chords held over the art's seam at 17 s
  const held = band.filter(e => e.track === 'chords' && e.t <= 16 + 1e-9 && e.t + e.dur >= 18 - 1e-9);
  ok(held.length === 3 && !band.some(e => e.track === 'chords' && Math.abs(e.t - 17) < 1e-9), 'the chords hold over a seam inside a bar (F from 16 to 18 s, across the cut at 17): never struck again');
  // the tune goes round from 0 with the chords: the results' first note is the loop's fourth bar's
  const lead = P.score.tracks.find(t => t.name === 'lead'), n0 = band.find(e => e.track === 'lead' && Math.abs(e.t - 22) < 1e-9);
  ok(n0 && n0.midi === RM.noteMidi(lead.notes[(22 / STEP) % lead.notes.length]), `the tune goes round from the reel's 0: at 22 s it plays ${lead.notes[(22 / STEP) % lead.notes.length]}, its fourth bar's first note`);
  const tune = band.filter(e => e.track === 'lead' && e.t >= 22 - 1e-9 && e.t < 24 - 1e-9).map(e => +(e.dur / STEP).toFixed(3)).join();
  ok(tune === '4,2,2,4,4', `a note lasts until the next one, len steps at most (the bar from 22 s: ${tune} steps)`);
}
{
  const B = 22, fill = band.filter(e => e.bypass && e.track === 'clap' && e.t >= B - 2 - 1e-9 && e.t < B);
  const eighths = fill.filter(e => e.t < B - 1), sixteenths = fill.filter(e => e.t >= B - 1);
  ok(eighths.length === 4 && sixteenths.length === 8 && fill.every((e, i) => !i || e.vel > fill[i - 1].vel),
    `a build into the results: a fill on the clap of ${eighths.length} eighths then ${sixteenths.length} sixteenths, louder all the way`);
  ok(!band.some(e => !e.bypass && e.track === 'clap' && e.t >= B - 2 - 1e-9 && e.t < B), 'the fill stands in for the clap\'s own pattern there');
  const D = 59, dropped = band.filter(e => ['kick', 'hat', 'clap', 'bass'].includes(e.track) && !e.bypass && e.t >= D - 0.5 - 1e-9 && e.t < D);
  ok(!dropped.length && levelAt(A.levels.kick, D - 0.25) === 0 && levelAt(A.levels.chords, D - 0.25) > 0, 'a drop into the end: no drum and no bass in the beat before it (the chords hold)');
  const hat = A.levels.hat, F = 12;
  ok(Math.abs(levelAt(hat, F - 0.5) - 1) < 1e-9 && Math.abs(levelAt(hat, F) - 0.85) < 1e-9 && Math.abs(levelAt(hat, F + 0.5) - 0.7) < 1e-9,
    'a fade into the art: the hat moves from 1 to 0.7 across the seam, a beat either side of it');
  const lead = band.filter(e => e.track === 'lead' && e.t >= 34 - 1e-9 && e.t < 34.5);
  ok(lead.length > 0 && levelAt(A.levels.lead, 34.25) > 0 && levelAt(A.levels.lead, 34.25) < 1, 'the lead rings on past the chorus while it fades (its notes after 34 s, its level going down)');
  ok(P.score.tracks.filter(t => !t.on).map(t => t.name).join() === 'kick,clap,hat,bass,chords,lead' && P.score.tracks.filter(t => t.on).length === 4,
    'six parts (kick, clap, hat, bass, chords, lead) and four sound effects');
}

// ── one line at a time ───────────────────────────────────────────────────
{
  const out = RM.setArg(SCORE, 'FX', 'reverb', 'return', 0, 0.65);
  const d = diff(SCORE, out);
  ok(d.length === 1 && /^ {2}return {3}0\.65$/.test(d[0][2]) && RM.parse(out).score.fx.reverb.return === 0.65, 'setArg: one number on one line (FX reverb return 0.65)');
  const v = RM.setArg(SCORE, 'SYNTH', 'chords', 'voice', 1, 12, 1);
  ok(diff(SCORE, v).length === 1 && RM.parse(v).score.tracks.find(t => t.name === 'chords').voices[1].cents === 12, 'setArg: the second voice of the chords, by index');
  const add = RM.setArg(SCORE, 'DRUM', 'kick', 'send', 0, 0.2);
  ok(lines(add).length === lines(SCORE).length + 1 && RM.parse(add).score.tracks.find(t => t.name === 'kick').send[0] === 0.2, 'setArg on a missing line adds it to its block, from the defaults');
  const off = RM.toggleTrack(SCORE, 'art', 'hat');
  const on = RM.toggleTrack(off, 'art', 'hat');
  ok(!RM.parse(off).score.sections.find(s => s.ref === 'art').play.some(p => p.name === 'hat') && on === SCORE.replace('hat:0.7 bass:0.7 chords\n', 'bass:0.7 chords hat\n'), 'toggleTrack: off, then on again at full level, at the end of the line');
  const st = RM.setLine(SCORE, 'DRUM', 'kick', 'steps', 'X.x.X.x.X.x.X.x.');
  ok(diff(SCORE, st).length === 1 && RM.parse(st).score.tracks.find(t => t.name === 'kick').steps === 'X.x.X.x.X.x.X.x.', 'setLine: a new steps line in place');
  ok(RM.setLine(RM.setLine(SCORE, 'SYNTH', 'chords', 'lfo', null), 'SYNTH', 'chords', 'lfo', 'filter 0.18 380') !== SCORE && RM.parse(RM.setLine(SCORE, 'SYNTH', 'chords', 'lfo', null)).score.tracks.find(t => t.name === 'chords').lfo === null, 'setLine null removes a line (the chords\' lfo)');
}
throws(() => RM.parse(SCORE.replace('voice    saw -9 0.45', 'voice    sawz -9 0.45')), /line \d+: a voice's wave is/, 'a bad wave is named by line');
throws(() => RM.parse(SCORE.replace('play     chords:0.8', 'play     chords:0.8 tuba')), /no track called that/, 'a section playing a track that is not there');
throws(() => RM.parse(SCORE.replace('into     swell', 'into     wobble')), /into wants how the music arrives/, 'into wants a way the music arrives');
throws(() => RM.parse(SCORE.replace('into     swell', 'into     swell 40')), /its beats are a number, 0-16/, 'into: its beats in range');
throws(() => RM.parse(SCORE.replace('into     swell', 'into     swell\n  start    later')), /start wants auto, bar, cut/, 'start wants auto, bar or cut');
throws(() => RM.parse(SCORE.replace('steps    X...x...X...x...', 'steps    X...y...X...x...')), /steps are X, x, o and \./, 'steps with a stray letter');
throws(() => RM.setArg(SCORE, 'SYNTH', 'chords', 'env', 0, 'soon'), /not a number/, 'setArg refuses a change that breaks the score');
throws(() => RM.arrange(RM.parse(SCORE.replace('SECTION end', 'SECTION 12')).score, scenes, mom), /the script has no scene 12/, 'a section for a scene the script does not have');

// ── the rig, the dev server, the rack, the renderer ─────────────────────
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const stats = wav => {                             // peak and rms (dBFS) of a stretch of a 16-bit wav via ffmpeg
  const run = (ss, t) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(ss), '-t', String(t), '-i', wav, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const g = k => +(new RegExp(k + ': (-?[\\d.]+|-inf) dB').exec(r.stderr) || [0, '-inf'])[1]; return { mean: g('mean_volume'), max: g('max_volume') }; };
  return run;
};
let dev, browser;
try {
  writeFileSync(join(ROOT, T_SCRIPT), SCRIPT);
  writeFileSync(join(ROOT, T_SCORE), SCORE);

  // the soundtrack alone, twice: the same bytes
  const audio = () => spawnSync(process.execPath, [join(ROOT, 'scripts/render-sizzle-reel.mjs'), `--script=${T_SCRIPT}`, '--audio-only', `--out=${join(OUT, 'music.mp4')}`], { encoding: 'utf8' });
  let r = audio();
  const wav = join(OUT, 'music-music.wav');
  ok(r.status === 0 && existsSync(wav), '--audio-only writes <name>-music.wav' + (r.status ? ': ' + r.stderr.slice(-300) : ''));
  // Two mixes agree to the last bit or two: the noise is seeded and the clock is offline, but
  // Chromium sums a node's inputs in an order that varies run to run, so float sums differ in
  // the 7th digit (-120 dB) and flips a 16-bit rounding here and there, a few steps at most.
  const w1 = readFileSync(wav);
  r = audio();
  const w2 = readFileSync(wav);
  let most = 0; for (let i = 44; i + 1 < Math.min(w1.length, w2.length); i += 2) most = Math.max(most, Math.abs(w1.readInt16LE(i) - w2.readInt16LE(i)));
  ok(r.status === 0 && w1.length === w2.length && most <= 10, `two mixes of the same score agree to ${most} of 32768, under -70 dBFS (seeded noise, offline clock)`);
  const dur = (w1.length - 44) / (48000 * 4);
  ok(Math.abs(dur - CUT) < 0.01, `the mix is the cut's ${CUT} s (${dur.toFixed(3)} s)`);
  const at = stats(wav);
  const loud = A.sections.map(s => ({ s, v: at(s.start + 0.1, Math.min(1.5, s.end - s.start - 0.2)) }));
  ok(loud.every(x => x.v.mean > -40), 'every section sounds: ' + loud.map(x => `${x.s.type} ${x.v.mean}`).join(', '));
  ok(loud.every(x => x.v.max < -0.5), `no section clips (loudest peak ${Math.max(...loud.map(x => x.v.max))} dBFS)`);
  const tail = at(CUT - 0.2, 0.2), res = loud.find(x => x.s.type === 'results').v.mean, art = loud.find(x => x.s.type === 'art').v.mean;
  ok(tail.mean < res - 12, `the end fades out (last 0.2 s ${tail.mean} dB against the results' ${res})`);
  ok(res > art, `the results hit harder than the art (${res} against ${art} dB)`);

  // a short film carries its stretch of the soundtrack
  r = spawnSync(process.execPath, [join(ROOT, 'scripts/render-sizzle-reel.mjs'), `--script=${T_SCRIPT}`, '--from=19.5', '--to=21', '--fps=30', `--out=${join(OUT, 'part.mp4')}`], { encoding: 'utf8' });
  // (no ffprobe here: ffmpeg names the streams, and decoding each one says how long it runs)
  const part = join(OUT, 'part.mp4'), has = existsSync(part);
  const info = has ? spawnSync('ffmpeg', ['-hide_banner', '-i', part], { encoding: 'utf8' }).stderr : '';
  const len = map => { const e = spawnSync('ffmpeg', ['-hide_banner', '-i', part, '-map', map, '-f', 'null', '-'], { encoding: 'utf8' }).stderr; const m = [...e.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop(); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; };
  const aLen = has ? len('0:a') : 0, vLen = has ? len('0:v') : 0;
  ok(r.status === 0 && /Audio: aac/.test(info) && /Video: h264/.test(info) && Math.abs(aLen - 1.5) < 0.08 && Math.abs(vLen - 1.5) < 0.08, `a part (19.5-21 s) has its AAC soundtrack, as long as its picture (${aLen.toFixed(2)} / ${vLen.toFixed(2)} s)${r.status ? ': ' + r.stderr.slice(-300) : ''}`);

  // the dev server saves a score after parsing it
  const port = await freePort();
  dev = spawn(process.execPath, [join(ROOT, 'scripts/reel-dev.mjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('dev server did not start')), 8000); dev.stdout.on('data', d => { if (/reel-dev: http/.test(String(d))) { clearTimeout(t); res(); } }); });
  const post = body => fetch(`http://127.0.0.1:${port}/__reel/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async x => ({ status: x.status, j: await x.json() }));
  let s = await post({ file: T_SCORE, text: SCORE.replace('steps    X...x...X...x...', 'steps    X...y') });
  ok(s.status === 422 && /line \d+/.test((s.j.errors || [])[0]) && readFileSync(join(ROOT, T_SCORE), 'utf8') === SCORE, 'a score with a mistake: 422 with its line, the file untouched');
  s = await post({ file: T_SCORE, text: SCORE.replace('return   0.5', 'return   0.55') });
  ok(s.status === 200 && readFileSync(join(ROOT, T_SCORE), 'utf8').includes('return   0.55'), 'a good score: 200, written');
  writeFileSync(join(ROOT, T_SCORE), SCORE);

  // the rack in the preview: open with M, a knob, a step, a cell, undo, all through the file
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/\.mp4(\?.*)?$/i, rt => rt.fulfill({ status: 404, body: '' }));        // the clips don't matter here
  await page.goto(`http://127.0.0.1:${port}/Assets/sizzle-reel-2.html?script=zz-music-test.script.txt#t=21&pause=1`);
  await page.waitForFunction(() => window.REEL_RACK && window.REEL_RACK.parsed, null, { timeout: 60000 });
  await page.mouse.click(200, 200);
  await page.keyboard.press('m');
  await page.waitForSelector('#reel-rack:not([hidden]) .rk-mod');
  const box = await page.evaluate(() => { const r = document.getElementById('reel-rack').getBoundingClientRect(); return { x: r.x, w: r.width, stage: document.getElementById('stage').getBoundingClientRect().right }; });
  ok(box.w > 400 && box.stage <= box.x + 1, `M opens the rack at the right and the preview shrinks beside it (stage right ${Math.round(box.stage)}, rack at ${Math.round(box.x)})`);
  ok(await page.evaluate(() => REEL_RACK.ctx && REEL_RACK.ctx.state === 'running'), 'sound starts after a click');
  const waitFile = (fn, what) => page.waitForFunction(() => true).then(async () => { for (let i = 0; i < 40; i++) { const t = readFileSync(join(ROOT, T_SCORE), 'utf8'); if (fn(t)) return t; await new Promise(r => setTimeout(r, 100)); } return null; });
  // the reverb's return knob: drag it up
  const knob = page.locator('#reel-rack .rk-mod', { hasText: 'reverb' }).filter({ hasText: 'size' }).locator('.rk-knob', { hasText: 'return' });
  await knob.scrollIntoViewIfNeeded();
  const kb = await knob.boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + 15); await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2, kb.y - 25, { steps: 6 }); await page.mouse.up();
  let t = await waitFile(x => !x.includes('  return   0.5\n'));
  const d1 = t ? diff(SCORE, t) : [];
  ok(t && d1.length === 1 && /^ {2}return {3}0\.\d+$/.test(d1[0][2]) && +d1[0][2].split(/\s+/)[2] > 0.5, `dragging the reverb's return knob up changes that one line of the score (${d1.map(x => x[2].trim()).join()})`);
  const heard = await page.evaluate(() => REEL_RACK.parsed.score.fx.reverb.return);
  ok(t && heard === +d1[0][2].split(/\s+/)[2], 'the engine plays the value the file now holds');
  // the kick's first step: X → o
  const step = page.locator('#reel-rack .rk-mod', { hasText: 'kick' }).locator('.rk-step').first();
  await step.scrollIntoViewIfNeeded(); await step.click();
  t = await waitFile(x => x.includes('steps    o...x...X...x...'));
  ok(!!t, 'clicking a step cycles it in the file (X → o)');
  // the arrangement: the art stops playing the hat
  const cell = page.locator('#reel-rack .rk-arr .rk-lane', { hasText: 'hat' }).locator('.rk-cell').nth(3);
  await cell.scrollIntoViewIfNeeded(); await cell.click();
  t = await waitFile(x => /SECTION art\n {2}play {5}bass:0\.7 chords\n/.test(x));
  if (!t) console.log('   art is now: ' + (/SECTION art\n(.*)\n/.exec(readFileSync(join(ROOT, T_SCORE), 'utf8')) || [])[1]);
  ok(!!t, 'clicking a lit cell of the arrangement takes the track out of that section');
  // undo, three times: back to the score we started from
  for (let i = 0; i < 3; i++) await page.evaluate(() => REEL_RACK.undo());
  t = await waitFile(x => x === SCORE);
  ok(t === SCORE, 'three undos: the file is the score we started from, byte for byte');
  // Seeking every frame while it plays (a scrub, from any tool): the sound starts again once and
  // waits, silent, for the scrub to end. It used to start again at every step, and the pop on a
  // beat nearby played over and over.
  const scrub = await page.evaluate(async () => {
    const E = REEL_RACK.engine, L = REEL_LIVE, beat = REEL_RACK.arrangement.events.find(e => e.track === 'pop' && e.t > 5);
    if (!beat) return null;
    let pops = 0, gens = 0;
    const play = E.play, ng = E.newGeneration;
    E.play = (ev, ...a) => { if (ev.track === 'pop') pops++; return play(ev, ...a); };
    E.newGeneration = () => { gens++; return ng(); };
    const frame = () => new Promise(r => requestAnimationFrame(r));
    L.seek(beat.t - 1.5); L.setPlaying(true);
    for (let k = 0; k < 20; k++) await frame();
    const g0 = gens, p0 = pops;
    for (let k = 0; k < 90; k++) { L.seek(beat.t - 0.6 + 1.2 * (0.5 - 0.5 * Math.cos(k / 6))); await frame(); }
    const during = { gens: gens - g0, pops: pops - p0 };
    L.seek(beat.t - 0.6);                        // let go before the beat: it plays on through it
    for (let k = 0; k < 70; k++) await frame();
    const after = { pops: pops - p0 - during.pops, t: L.now() };
    L.setPlaying(false); await frame();
    E.play = play; E.newGeneration = ng;
    return { beat: beat.t, during, after };
  });
  ok(scrub && scrub.during.gens <= 2 && scrub.during.pops <= 1, `seeking every frame while it plays (90 steps): the sound starts again once and waits (${scrub && scrub.during.gens} restarts, ${scrub && scrub.during.pops} pops; it was a restart a step)`);
  ok(scrub && scrub.after.pops === 1 && scrub.after.t > scrub.beat, `let go before a beat (${scrub && scrub.beat} s), it plays on through it, and its pop sounds once (${scrub && scrub.after.pops})`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} finally {
  if (browser) await browser.close();
  if (dev) dev.kill();
  for (const f of [T_SCRIPT, T_SCORE]) rmSync(join(ROOT, f), { force: true });
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
