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
ok(P.score.tempo === 120 && P.score.tracks.length >= 10 && A.sections.length === scenes.length, `the score parses: ${P.score.tracks.length} tracks, a section for each of the ${scenes.length} scenes`);
ok(A.events.every(e => e.t >= 0 && e.t < CUT && e.dur > 0 && e.vel > 0), `${A.events.length} events, every one inside the ${CUT} s cut`);
const band = A.events.filter(e => !P.score.tracks.find(t => t.name === e.track).on);
ok(A.sections.every(s => band.filter(e => e.t >= s.start - 1e-9 && e.t < s.end - 1e-9).every(e => s.play.some(p => p.name === e.track))), 'each section plays only the tracks its play line names');
// patterns start again at every cut: a section with the kick has a kick on its first frame
const kick = A.sections.filter(s => s.play.some(p => p.name === 'kick'));
ok(kick.length > 3 && kick.every(s => A.events.some(e => e.track === 'kick' && Math.abs(e.t - s.start) < 1e-9)), `the kick lands on the cut of all ${kick.length} sections that play it`);
ok(band.every(e => Math.abs((e.t - A.sections.find(s => e.t >= s.start - 1e-9 && e.t < s.end - 1e-9).start) / 0.125 - Math.round((e.t - A.sections.find(s => e.t >= s.start - 1e-9 && e.t < s.end - 1e-9).start) / 0.125)) < 1e-6),
  'every note of the band sits on a sixteenth of its section (0.125 s at 120 BPM)');
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
ok(A.sections.find(s => s.type === 'results').chords.map(c => c.name).join() === 'Am,F,C,G' && A.sections.find(s => s.type === 'end').chords[0].name === 'Am9', 'chords: the CHORDS line where a section writes none, its own where it does');

// ── one line at a time ───────────────────────────────────────────────────
{
  const out = RM.setArg(SCORE, 'FX', 'reverb', 'return', 0, 0.65);
  const d = diff(SCORE, out);
  ok(d.length === 1 && /^ {2}return {3}0\.65$/.test(d[0][2]) && RM.parse(out).score.fx.reverb.return === 0.65, 'setArg: one number on one line (FX reverb return 0.65)');
  const v = RM.setArg(SCORE, 'SYNTH', 'pad', 'voice', 1, 12, 1);
  ok(diff(SCORE, v).length === 1 && RM.parse(v).score.tracks.find(t => t.name === 'pad').voices[1].cents === 12, 'setArg: the second voice of the pad, by index');
  const add = RM.setArg(SCORE, 'DRUM', 'kick', 'send', 0, 0.2);
  ok(lines(add).length === lines(SCORE).length + 1 && RM.parse(add).score.tracks.find(t => t.name === 'kick').send[0] === 0.2, 'setArg on a missing line adds it to its block, from the defaults');
  const off = RM.toggleTrack(SCORE, 'art', 'hat');
  const on = RM.toggleTrack(off, 'art', 'hat');
  ok(!RM.parse(off).score.sections.find(s => s.ref === 'art').play.some(p => p.name === 'hat') && on === SCORE.replace('pad glass bass:0.7 hat:0.6', 'pad glass bass:0.7 hat'), 'toggleTrack: off, then on again at full level');
  const st = RM.setLine(SCORE, 'DRUM', 'kick', 'steps', 'X.x.X.x.X.x.X.x.');
  ok(diff(SCORE, st).length === 1 && RM.parse(st).score.tracks.find(t => t.name === 'kick').steps === 'X.x.X.x.X.x.X.x.', 'setLine: a new steps line in place');
  ok(RM.setLine(RM.setLine(SCORE, 'SYNTH', 'pad', 'lfo', null), 'SYNTH', 'pad', 'lfo', 'filter 0.18 380') !== SCORE && RM.parse(RM.setLine(SCORE, 'SYNTH', 'pad', 'lfo', null)).score.tracks.find(t => t.name === 'pad').lfo === null, 'setLine null removes a line (the pad\'s lfo)');
}
throws(() => RM.parse(SCORE.replace('voice    saw -9 0.45', 'voice    sawz -9 0.45')), /line \d+: a voice's wave is/, 'a bad wave is named by line');
throws(() => RM.parse(SCORE.replace('play     glass pad:0.6 riser', 'play     glass pad:0.6 riser tuba')), /no track called that/, 'a section playing a track that is not there');
throws(() => RM.parse(SCORE.replace('steps    X...x...X...x...', 'steps    X...y...X...x...')), /steps are X, x, o and \./, 'steps with a stray letter');
throws(() => RM.setArg(SCORE, 'SYNTH', 'pad', 'env', 0, 'soon'), /not a number/, 'setArg refuses a change that breaks the score');
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
  t = await waitFile(x => /SECTION art\n {2}play {5}pad glass bass:0\.7\n/.test(x));
  if (!t) console.log('   art is now: ' + (/SECTION art\n(.*)\n/.exec(readFileSync(join(ROOT, T_SCORE), 'utf8')) || [])[1]);
  ok(!!t, 'clicking a lit cell of the arrangement takes the track out of that section');
  // undo, three times: back to the score we started from
  for (let i = 0; i < 3; i++) await page.evaluate(() => REEL_RACK.undo());
  t = await waitFile(x => x === SCORE);
  ok(t === SCORE, 'three undos: the file is the score we started from, byte for byte');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} finally {
  if (browser) await browser.close();
  if (dev) dev.kill();
  for (const f of [T_SCRIPT, T_SCORE]) rmSync(join(ROOT, f), { force: true });
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
