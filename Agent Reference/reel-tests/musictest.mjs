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
import { inOrder } from './inorder.mjs';   // the scenes in the order the suite was written for

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const req = createRequire(import.meta.url);
const RM = req(join(ROOT, 'scripts/reel-music.js')), RS = req(join(ROOT, 'scripts/reel-script.js'));
const OUT = join(ROOT, '.local/reel-tests/music');
mkdirSync(OUT, { recursive: true });
const SCRIPT = inOrder(readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8'));
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
const CUT = scenes[scenes.length - 1].end;                          // the cut's length, as the script says (60 s, then 63.5, then 61.75)
const STEP = 0.125, SPB = 16;
const partOf = name => P.score.parts.find(p => p.tracks.includes(name));
ok(P.score.tempo === 120 && P.score.beatsPerBar === 4 && P.score.parts.map(p => p.name).join() === 'drums,bass,chords,arp,lead,fx',
  `the score parses: ${P.score.beatsPerBar}/4 at ${P.score.tempo}, six parts (${P.score.parts.map(p => p.name).join(', ')}), ${P.score.clips.length} clips`);
ok(A.events.every(e => e.t >= 0 && e.t < CUT && e.dur > 0 && e.vel > 0), `${A.events.length} events, every one inside the ${CUT} s cut`);
const band = A.events.filter(e => !P.score.tracks.find(t => t.name === e.track).on);
// every note of a part sits inside one of the part's clips, on the music's own sixteenths
const strays = band.filter(e => { const p = partOf(e.track); return !p || !A.clips.some(c => c.part === p.name && e.t >= c.t0 - 1e-9 && e.t < c.t1 - 1e-9); });
ok(!strays.length, `every note of every part sits inside one of its clips${strays.length ? ' (' + strays.slice(0, 3).map(e => e.track + '@' + e.t).join(' ') + ')' : ''}`);
ok(band.every(e => Math.abs(e.t / STEP - Math.round(e.t / STEP)) < 1e-6), 'every note sits on the music\'s sixteenths (0.125 s from 0)');
ok(A.clips.length === P.score.clips.length && A.clips.every(c => Math.abs(c.t0 - c.from * STEP) < 1e-9 && Math.abs(c.t1 - c.to * STEP) < 1e-9),
  `the ${A.clips.length} clips sit on their bars (bar 1 at 0 s, a bar 2 s)`);
// the chords go round from bar 1, one a bar, and a stretch of bars may have its own
const loop = P.score.chords.map(c => c.name);
ok(A.harmony.length === A.bars && A.harmony.every((h, b) => h.chord.name === (b >= 29 ? 'Am' : loop[b % loop.length])),
  `the chords go round from bar 1 (${loop.join(' ')}), a bar each, and bars 30-32 hold Am (${A.bars} bars)`);
{
  const kickSteps = P.score.parts.find(p => p.name === 'drums').pads.find(d => d.name === 'beat').voices.find(v => v.track === 'kick').steps;
  const beat = A.clips.find(c => c.part === 'drums' && c.pad === 'beat' && c.from === 11 * SPB);
  const kicks = band.filter(e => e.track === 'kick' && e.t >= beat.t0 - 1e-9 && e.t < beat.t1 - 1e-9);
  ok(kicks.length === 6 * 4 && kicks.every(e => kickSteps[Math.round(e.t / STEP) % 16] !== '.'), `a clip plays its pad on the bars: the results' beat (bars 12-17) kicks on all ${kicks.length} beats its pad marks`);
  const fill = band.filter(e => e.track === 'clap' && e.t >= 20 - 1e-9 && e.t < 22);
  ok(fill.length === 12 && fill.every((e, i) => !i || e.vel >= fill[i - 1].vel) && fill[0].vel < fill[11].vel, `a fill in bar 11: ${fill.length} claps, louder all the way in`);
  const crash = band.filter(e => e.track === 'crash' && e.t >= 22 - 1e-9 && e.t < 24);
  ok(crash.length === 1 && Math.abs(crash[0].t - 22) < 1e-9, 'a "once" pad plays once from its clip\'s start (the crash on bar 12, at 22 s)');
  const rise = band.filter(e => e.track === 'riser');
  ok(rise.length === 2 && rise.every(e => e.rise && Math.abs(e.dur - 2) < 1e-9) && Math.abs(rise[0].t - 20) < 1e-9, 'a riser rises across its clip (bars 11 and 27, 2 s each)');
  const lead = P.score.parts.find(p => p.name === 'lead').pads.find(d => d.name === 'hook').voices[0].notes, n0 = band.find(e => e.track === 'lead' && Math.abs(e.t - 22) < 1e-9);
  ok(n0 && n0.midi === RM.noteMidi(lead[(22 / STEP) % lead.length]), `a pad goes round on the bars, so the tune keeps time with the chords: at 22 s the lead plays ${lead[(22 / STEP) % lead.length]}`);
  const tune = band.filter(e => e.track === 'lead' && e.t >= 22 - 1e-9 && e.t < 24 - 1e-9).map(e => +(e.dur / STEP).toFixed(3)).join();
  ok(tune === '4,2,2,4,4', `a note lasts until the next one, len steps at most (the bar from 22 s: ${tune} steps)`);
  const held = band.filter(e => e.track === 'chords' && e.midi === RM.noteMidi('A3') && e.t <= 58 + 1e-9 && e.t + e.dur >= Math.min(64, CUT) - 1e-9);
  ok(held.length === 1, 'a chord that carries on is held, not struck again (Am from bar 30 to the end, one note a voice)');
  const lv = A.levels.lead;
  ok(RM.levelAt(lv, 45) === 0 && Math.abs(RM.levelAt(lv, 46) - 0.35) < 1e-9 && Math.abs(RM.levelAt(lv, 47) - 0.7) < 1e-9 && RM.levelAt(lv, 54.01) === 1,
    'a clip\'s level and fades are its sounds\' level: the lead fades in over 4 beats to 0.7 at the quotes, then plays full at the offer');
  ok(RM.levelAt(A.levels.kick, 25) === 1 && RM.levelAt(A.levels.clap, 25) === 1 && RM.levelAt(A.levels.kick, 47) === 0, 'a part\'s clips set the level of each of its sounds (the drums\' kick and clap together)');
  ok(P.score.parts.find(p => p.name === 'drums').tracks.join() === 'kick,clap,hat' && P.score.tracks.filter(t => t.on).length === 4, 'the drums are a kick, a clap and a hat; four sound effects');
}
// the keys the score plays are the keys the rig types (both read ReelScript.queries)
const keys = A.events.filter(e => e.track === 'keys').map(e => e.t);
const typed = RS.queries(edit).flatMap(q => q.times.filter((_, i) => q.text[i] !== ' '));
ok(keys.length === typed.length && keys.every((t, i) => Math.abs(t - typed[i]) < 1e-9), `the keys track clicks on all ${typed.length} typed letters, at the rig's times`);
{
  // ReelScript.queries is the rig's old formula, moved: same numbers
  const hash01 = i => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  let acc = 0; const SC = edit.scenes.map((s, i) => { const o = Object.assign({}, s, { i, start: acc, end: acc + s.dur }); acc += s.dur; return o; });
  const QS = SC.filter(s => s.query), old = QS.map((sc, k) => { const t0 = sc.start + (k === 0 ? 0.1 : -0.08); const times = []; let tt = t0; const CPS = RS.cue(sc, 'typing'); for (let i = 0; i < sc.query.length; i++) { tt += (1 / CPS) * (0.6 + 0.8 * hash01(i + 31 * sc.i)); times.push(tt); } return { times, enter: tt + 0.06 }; });
  const now = RS.queries(edit);
  ok(now.length === old.length && now.every((q, k) => q.enter === old[k].enter && q.times.every((t, i) => t === old[k].times[i])), 'ReelScript.queries gives the rig\'s typing times to the bit');
}
{
  // a pad heard on its own: one turn of it, from 0, over the chords where the playhead is
  const pv = RM.padPreview(P.score, A, 'drums', 'beat', 22.3);
  ok(pv.length === 4 + 2 + 4 && pv.every(e => e.t >= 0 && e.t < 2), `padPreview: one turn of the drums' beat (${pv.length} hits in a bar, from 0)`);
}

// ── positions on the bars, and one line at a time ───────────────────────
{
  const round = ['5', '5-8', '4.4-6', '9.3', '11', '23.3-27', '28-30.1', '2-4.3', '5.2.3', '5.2.3-5.3', '1-32'];
  ok(round.every(r => { const g = RM.readRange(r, SPB); return g && RM.rangeText(g.from, g.to, SPB) === r; }), `bars read and write back as written (${round.join(', ')})`);
  const g = RM.readRange('4.4-6', SPB);
  ok(g.from === 60 && g.to === 96, '"4.4-6" is from bar 4\'s last beat (7.5 s) to the end of bar 6 (12 s)');
  const ln = P.score.clips.find(c => c.part === 'lead' && c.from === 16).ln;
  const moved = RM.setClip(SCORE, ln, { to: 6 * SPB });
  ok(diff(SCORE, moved).length === 1 && /^CLIP lead +2-6 +hook +0\.5$/.test(lines(moved)[ln - 1]), `setClip: one line, the lead's title clip to bar 6 ("${lines(moved)[ln - 1]}")`);
  const faded = RM.setClip(SCORE, ln, { fadeIn: 2, level: 0.75 });
  ok(/^CLIP lead +2-4 +hook +0\.75  in 2$/.test(lines(faded)[ln - 1]), `setClip: a level and a fade ("${lines(faded)[ln - 1]}")`);
  const added = RM.addClip(SCORE, { part: 'drums', from: 23 * SPB, to: 26 * SPB, pad: 'half' });
  const al = lines(added), at = al.indexOf('CLIP drums   24-26     half'), before = al[at - 1], after = al[at + 1];
  ok(at > 0 && /^CLIP drums +21-23\.2 /.test(before) && /^CLIP drums +27 /.test(after) && al.length === lines(SCORE).length + 1, `addClip: a new line among its part's clips, in the order they play (after "${before.trim()}")`);
  const removed = RM.removeClip(added, at + 1);
  ok(removed === SCORE, 'removeClip: the line goes, the rest as it was');
  const pad = RM.setPad(SCORE, 'drums', 'beat', 'kick', 'X.......X.......');
  const pd = diff(SCORE, pad);
  ok(pd.length === 1 && /^ {2}pad {6}beat {5}kick X\.{7}X\.{7} {2}clap \.{4}x\.{7}x\.{3} {2}hat \.\.x\.\.\.x\.\.\.x\.\.\.x\.$/.test(pd[0][2]), `setPad: one sound's steps in one pad, the line as it was otherwise ("${pd.length && pd[0][2].trim()}")`);
  const out = RM.setArg(SCORE, 'FX', 'reverb', 'return', 0, 0.65);
  const d = diff(SCORE, out);
  ok(d.length === 1 && /^ {2}return {3}0\.65$/.test(d[0][2]) && RM.parse(out).score.fx.reverb.return === 0.65, 'setArg: one number on one line (FX reverb return 0.65)');
  const v = RM.setArg(SCORE, 'SYNTH', 'chords', 'voice', 1, 12, 1);
  ok(diff(SCORE, v).length === 1 && RM.parse(v).score.tracks.find(t => t.name === 'chords').voices[1].cents === 12, 'setArg: the second voice of the chords, by index');
  const add = RM.setArg(SCORE, 'DRUM', 'kick', 'send', 0, 0.2);
  ok(lines(add).length === lines(SCORE).length + 1 && RM.parse(add).score.tracks.find(t => t.name === 'kick').send[0] === 0.2, 'setArg on a missing line adds it to its block, from the defaults');
  ok(RM.setLine(RM.setLine(SCORE, 'SYNTH', 'chords', 'lfo', null), 'SYNTH', 'chords', 'lfo', 'filter 0.18 380') !== SCORE && RM.parse(RM.setLine(SCORE, 'SYNTH', 'chords', 'lfo', null)).score.tracks.find(t => t.name === 'chords').lfo === null, 'setLine null removes a line (the chords\' lfo)');
}
throws(() => RM.parse(SCORE.replace('voice    saw -9 0.45', 'voice    sawz -9 0.45')), /line \d+: a voice's wave is/, 'a bad wave is named by line');
throws(() => RM.parse(SCORE.replace('CLIP drums   5-6       groove', 'CLIP drums   5-7       groove')), /starts before the one on line \d+ ends/, 'two clips of one part may not overlap');
throws(() => RM.parse(SCORE.replace('CLIP drums   5-6       groove', 'CLIP drums   5-6       tango')), /the drums part has no pad "tango"/, 'a clip names one of its part\'s pads');
throws(() => RM.parse(SCORE.replace('CLIP drums   5-6       groove', 'CLIP drums   0-6       groove')), /is not a stretch of bars/, 'bars count from 1');
throws(() => RM.parse(SCORE.replace('CLIP fx      11        rise', 'CLIP fx      11        rise  in 9')), /fades .* are longer than the clip/, 'a clip\'s fades fit inside it');
throws(() => RM.parse(SCORE.replace('  pad      pulse    x...x...x...x...', '  pad      pulse    kick x...x...x...x...')), /kick plays in the drums part already/, 'a sound belongs to one part');
throws(() => RM.parse(SCORE + '\nSECTION open\n  play     chords\n'), /SECTION is gone .* CLIP lines/, 'an old SECTION line says what took its place');
throws(() => RM.parse(SCORE.replace('  decay    0.32\n  level    0.55', '  decay    0.32\n  steps    X...x...X...x...\n  level    0.55')), /no longer carries its steps/, 'steps on a sound say where they live now');
throws(() => RM.parse(SCORE.replace('TIME   4/4', 'TIME   9/8')), /TIME wants beats a bar over 4/, 'TIME wants n/4');
throws(() => RM.parse(SCORE.replace('steps    x.x.x.x.x.x.x.x.', '').replace('  pad      eighths  x.x.x.x.x.x.x.x.', '  pad      eighths  x.x.y.x.x.x.x.x.')), /plays steps: X loud, x, o soft/, 'steps with a stray letter');
throws(() => RM.setArg(SCORE, 'SYNTH', 'chords', 'env', 0, 'soon'), /not a number/, 'setArg refuses a change that breaks the score');

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
  const loud = scenes.map(s => ({ s, v: at(s.start + 0.1, Math.min(1.5, s.end - s.start - 0.2)) }));   // a stretch a scene
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
  let s = await post({ file: T_SCORE, text: SCORE.replace('CLIP drums   5-6       groove', 'CLIP drums   5-6       tango') });
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
  // a pad's step: the drums' beat, its kick's first step, X → o
  await page.locator('#reel-rack .rk-prow[data-part="drums"] .rk-tile', { hasText: 'beat' }).first().click();
  const step = page.locator('#reel-rack .rk-paded .rk-pvoice', { hasText: 'kick' }).locator('.rk-step').first();
  await step.scrollIntoViewIfNeeded(); await step.click();
  t = await waitFile(x => /^ {2}pad {6}beat {5}kick o\.\.\.x\.\.\.X\.\.\.x\.\.\. {2}clap /m.test(x));
  ok(!!t, 'clicking a pad\'s step cycles it in the file (the beat\'s first kick, X → o), its other sounds as they were');
  // a tune: the lead's hook, its first note
  await page.locator('#reel-rack .rk-prow[data-part="lead"] .rk-tile', { hasText: 'hook' }).first().click();
  const tuneIn = page.locator('#reel-rack .rk-paded .rk-pvoice', { hasText: 'lead' }).locator('input');
  await tuneIn.scrollIntoViewIfNeeded();
  const tv = await tuneIn.inputValue();
  await tuneIn.fill(tv.replace(/^C5/, 'D5')); await tuneIn.press('Enter');
  t = await waitFile(x => /^ {2}pad {6}hook {5}D5 \. \. \. C5 \. D5/m.test(x));
  ok(!!t, 'typing a tune writes the pad\'s line (the hook starts on D5 now), its bars kept');
  // ▶ on a tile: the pad heard on its own, past the clips' levels
  const preview = await page.evaluate(async () => {
    const E = REEL_RACK.engine; let n = 0, bypass = 0;
    const play = E.play; E.play = (ev, ...a) => { n++; if (ev.bypass) bypass++; return play(ev, ...a); };
    document.querySelector('#reel-rack .rk-prow[data-part="bass"] .rk-tile:nth-child(2) button').click();
    await new Promise(r => setTimeout(r, 60)); E.play = play; return { n, bypass };
  });
  ok(preview.n >= 4 && preview.bypass === preview.n, `▶ on a pad plays one turn of it on its own, past the clips' levels (${preview.n} notes)`);
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
