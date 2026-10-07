// Contract test for the renderer's --jobs and --deliver (scripts/render-sizzle-reel.mjs), driven
// as a child process exactly as a person runs it.
//   node "Agent Reference/reel-tests/rendertest.mjs"
// 1. --jobs=1 and --jobs=3 over 36–46 s at 30 fps: the same frame count and duration; the chunk
//    boundaries move to the scene starts inside (38.0 s and 41.5 s: chunks start where the film
//    cuts); and the frames either side of each (plus the ends and the middle) match by PSNR, at
//    45 dB or better (x264 on both sides; a boundary left mid-scene on a playing clip can dip to
//    36-40 dB from video decoding alone, which is why boundaries go to cuts). Both wall times are
//    printed: this is where the speedup is measured.
// 2. --deliver over 0–6 s: web copy, poster (JPEG magic bytes) and chapters (every scene of the
//    edit, at the edit's starts). Run twice: once as it ships (the master fits, so the web copy is
//    a copy) and once with REEL_WEB_CAP_BYTES lowered so the two-pass encode runs and must land
//    under the cap.
// 3. A chunk that fails (REEL_RENDER_FAIL_AT) exits non-zero and leaves no part files and no OUT.
// Output goes to RENDER_SCRATCH (default: .local/reel-tests/render/, gitignored), never Assets/.
// ffprobe is not installed, so frames and durations are read from ffmpeg's own stderr.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTDIR = process.env.RENDER_SCRATCH || resolve(ROOT, '.local/reel-tests/render');
mkdirSync(OUTDIR, { recursive: true });
const R = createRequire(import.meta.url)(resolve(ROOT, 'scripts/reel-script.js'));

let fails = 0;
const ok = (cond, what, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${detail ? '  ' + detail : ''}`); if (!cond) fails++; };

// REEL_FONT_CACHE: every render sets its words with the same font files (scripts/font-pin.mjs), so
// the frames of one film compared with another's differ only by how they were rendered
function render(flags, env = {}) {
  const t0 = Date.now();
  const r = spawnSync('node', [resolve(ROOT, 'scripts/render-sizzle-reel.mjs'), '--cut=2', ...flags],
    { cwd: ROOT, env: { ...process.env, REEL_FONT_CACHE: '.local/reel-tests/fonts', ...env }, encoding: 'utf8', maxBuffer: 64e6, timeout: 900000 });
  const secs = (Date.now() - t0) / 1000;
  if (r.status !== 0) console.log(`  (exit ${r.status})\n  ` + (r.stderr || '').trim().split('\n').slice(-6).join('\n  '));
  return { status: r.status, secs, out: (r.stdout || '').replace(/\r/g, '\n'), err: r.stderr || '' };
}
const ff = argv => spawnSync('ffmpeg', ['-hide_banner', ...argv], { encoding: 'utf8', maxBuffer: 64e6 }).stderr;
// frames by decoding the video stream to nowhere; duration from the container header
const frameCount = f => +([...ff(['-i', f, '-map', '0:v', '-f', 'null', '-']).matchAll(/frame=\s*(\d+)/g)].pop() || [0, 0])[1];
const duration = f => { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(ff(['-i', f])); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN; };
function psnr(a, b, n) {
  const e = ff(['-i', a, '-i', b, '-lavfi', `[0:v]select=eq(n\\,${n})[x];[1:v]select=eq(n\\,${n})[y];[x][y]psnr`, '-f', 'null', '-']);
  const m = /average:(inf|[\d.]+)/.exec(e);
  return m ? (m[1] === 'inf' ? Infinity : +m[1]) : NaN;
}
const leftovers = () => readdirSync(OUTDIR).filter(f => /-parts-|\.x264-2pass-/.test(f));

try {
  // the scenes' starts, from the script as it is now (the cut's timings change as it is edited)
  const edit = R.parse(readFileSync(resolve(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8')).edit;
  let t = 0; const starts = edit.scenes.map(s => { const x = t; t += s.dur; return +x.toFixed(3); });
  const total = t;

  // ── 1. parallel equals serial ──────────────────────────────────────────
  const A = resolve(OUTDIR, 'jobs1.mp4'), B = resolve(OUTDIR, 'jobs3.mp4');
  const FROM = 36, TO = 46, range = [`--from=${FROM}`, `--to=${TO}`, '--fps=30'];
  const inside = starts.filter(x => x > FROM + 1e-6 && x < TO - 1e-6);
  const r1 = render([...range, '--jobs=1', `--out=${A}`]);
  ok(r1.status === 0 && existsSync(A), '--jobs=1 renders', `${r1.secs.toFixed(1)} s wall`);
  const r3 = render([...range, '--jobs=3', `--out=${B}`]);
  ok(r3.status === 0 && existsSync(B), '--jobs=3 renders', `${r3.secs.toFixed(1)} s wall`);
  if (r1.status === 0 && r3.status === 0) {
    const fa = frameCount(A), fb = frameCount(B), da = duration(A), db = duration(B);
    ok(fa === 300 && fb === 300, 'both have 300 frames', `${fa} / ${fb}`);
    ok(Math.abs(da - db) < 0.02 && Math.abs(da - 10) < 0.05, 'same duration', `${da} / ${db}`);
    ok(/3 jobs\s+frame 300\/300/.test(r3.out), 'one combined progress line reaches 300/300');
    // the chunks start at scene cuts inside the range: as many as there are jobs after the first
    const cutAt = ((/3 jobs, cut at ([^\n]*)/.exec(r3.out) || [])[1] || '').split(',').map(x => parseFloat(x)).filter(Number.isFinite);
    // (a cut between two frames starts its chunk on the frame after it: John's order cuts on quarter
    // seconds, half a frame at this test's 30 fps, and the log rounds to hundredths)
    ok(cutAt.length === Math.min(2, inside.length) && cutAt.every(c => inside.some(x => Math.abs(x - c) < 1 / 30)),
      `the chunks start at the scene cuts inside the range (${inside.join(', ')} s)`, (r3.out.match(/\d jobs, cut at [^\n]*/) || [''])[0]);
    // the frames either side of each cut, and a few between
    const near_ = cutAt.flatMap(c => { const n = Math.round((c - FROM) * 30); return [n - 1, n, n + 1]; });
    for (const n of [...new Set([0, 60, 120, ...near_, 299])].filter(n => n >= 0 && n < 300).sort((a, b) => a - b)) {
      const p = psnr(A, B, n);
      ok(p >= 45, `frame ${n} matches by PSNR`, `${p === Infinity ? 'identical' : p.toFixed(1) + ' dB'}`);
    }
    console.log(`  wall: --jobs=1 ${r1.secs.toFixed(1)} s, --jobs=3 ${r3.secs.toFixed(1)} s → ${(r1.secs / r3.secs).toFixed(2)}x (4 cores, page loads included)`);
  }
  ok(leftovers().length === 0, 'no part folders left after success', leftovers().join(' '));

  // ── 2. delivery ────────────────────────────────────────────────────────
  for (const cap of [null, 300000]) {
    const name = cap ? 'deliver-2pass' : 'deliver';
    const M = resolve(OUTDIR, `${name}.mp4`);
    const web = resolve(OUTDIR, `${name}-web.mp4`), poster = resolve(OUTDIR, `${name}-poster.jpg`), chap = resolve(OUTDIR, `${name}-chapters.json`);
    for (const f of [M, web, poster, chap]) rmSync(f, { force: true });
    const r = render(['--from=0', '--to=6', '--fps=30', '--deliver', `--out=${M}`], cap ? { REEL_WEB_CAP_BYTES: String(cap) } : {});
    ok(r.status === 0, `${name}: renders`, `${r.secs.toFixed(1)} s wall`);
    if (r.status !== 0) continue;
    ok(existsSync(web) && frameCount(web) === 180, `${name}: web copy is a 180-frame video`);
    if (cap) ok(statSync(web).size <= cap, `${name}: two-pass web copy is under the cap`, `${statSync(web).size} ≤ ${cap} (master ${statSync(M).size})`);
    else ok(statSync(web).size === statSync(M).size, `${name}: a master under 14 MB is copied as the web copy`);
    ok(/wrote .*-web\.mp4 \([\d.]+ MB\)/.test(r.out) && /wrote .*-poster\.jpg \(/.test(r.out) && /wrote .*-chapters\.json \(/.test(r.out), `${name}: prints each path with its size`);
    const head = existsSync(poster) ? readFileSync(poster).subarray(0, 3) : Buffer.alloc(0);
    ok(head.length === 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff, `${name}: poster is a JPEG`, `${existsSync(poster) ? statSync(poster).size + ' bytes' : 'missing'}`);
    ok(/1920x1080/.test(ff(['-i', poster])), `${name}: poster is 1920×1080`);
    let c = null; try { c = JSON.parse(readFileSync(chap, 'utf8')); } catch (e) { ok(false, `${name}: chapters parse`, e.message); continue; }
    ok(c.chapters.length === 12 && c.chapters.length === edit.scenes.length, `${name}: 12 chapters`, `${c.chapters.length}`);
    ok(JSON.stringify(c.chapters.map(x => x.t)) === JSON.stringify(starts) && starts[0] === 0, `${name}: chapter starts from the scene lengths`, c.chapters.map(x => x.t).join(' '));
    ok(c.chapters.map(x => x.kind).join() === edit.scenes.map(s => s.type).join(), `${name}: chapter kinds are the scene kinds`);
    // each chapter says what its own scene says, in whatever order the scenes are
    const says = sc => sc.query || sc.name || sc.caption || sc.line || '';
    ok(c.chapters.every((x, i) => typeof x.what === 'string' && x.what === says(edit.scenes[i])) && c.chapters.some(x => x.what === 'who is john?'),
      `${name}: chapter what = query || name || caption || line`, c.chapters.map(x => x.what).slice(0, 4).join(' · '));
    ok(Math.abs(c.duration - total) < 1e-6, `${name}: chapters duration is the edit's`, `${c.duration}`);
  }
  ok(leftovers().length === 0, 'no pass-log folders left', leftovers().join(' '));

  // ── 3. a failing chunk leaves nothing behind ───────────────────────────
  const F = resolve(OUTDIR, 'fail.mp4');
  rmSync(F, { force: true });
  const rf = render(['--from=20', '--to=23', '--fps=30', '--jobs=3', `--out=${F}`], { REEL_RENDER_FAIL_AT: '40' });
  ok(rf.status !== 0, 'a failing chunk fails the render', `exit ${rf.status}`);
  ok(/failing on purpose at frame 40/.test(rf.err), 'the failure names the chunk\'s own error, not a knock-on');
  ok(!existsSync(F), 'no OUT after a failed parallel render');
  ok(leftovers().length === 0, 'no part files after a failed render', leftovers().join(' '));
  const stray = spawnSync('pgrep', ['-f', `${OUTDIR}/.fail-parts-`], { encoding: 'utf8' }).stdout.trim();
  ok(!stray, 'no ffmpeg left writing parts', stray);
} finally {
  // the scratch films stay for a look; only the stray scratch folders go
  for (const f of leftovers()) rmSync(resolve(OUTDIR, f), { recursive: true, force: true });
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
