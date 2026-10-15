// Renders Assets/sizzle-reel.html to MP4, one frame at a time, on the rig's virtual clock.
//   node scripts/render-sizzle-reel.mjs                         → Assets/media-kit/video/sizzle-reel.mp4 (1920×1080, 60 fps)
//   node scripts/render-sizzle-reel.mjs --cut=2                 → cut 2 instead: Assets/sizzle-reel-2.html playing its
//                                                                 script, Assets/sizzle-reel-2.script.txt,
//                                                                 → Assets/media-kit/video/sizzle-reel-2.mp4
//   node scripts/render-sizzle-reel.mjs --script=Assets/x.script.txt → any script through cut 2's player
//                                                                 (→ Assets/media-kit/video/x.mp4)
//   node scripts/render-sizzle-reel.mjs --fps=30                → half the frames, for a quick proof
//   node scripts/render-sizzle-reel.mjs --from=17.5 --to=27.5   → a stretch while you cut (the tank is
//                                                                 still simulated from 0, so it matches)
//   node scripts/render-sizzle-reel.mjs --cut=2 --scene=results → one scene, by its kind or its number (6).
//                                                                 A part renders to its own file
//                                                                 (…-scene6-results.mp4), never over the cut's
//   node scripts/render-sizzle-reel.mjs --stills=2.4,9,21       → PNGs at those seconds, no video
//   node scripts/render-sizzle-reel.mjs --seed=11               → grow a different tank
//   --crf=18 (x264 quality, lower is better) · --out=path.mp4
//   node scripts/render-sizzle-reel.mjs --cut=2 --jobs=3        → the frames in 3 contiguous chunks, each in its own
//                                                                 page and its own x264, joined without re-encoding
//                                                                 (stills ignore it). Chunks join seamlessly because
//                                                                 the rig keeps all tank work in EVENTS and TICKS,
//                                                                 never in paint: a page that skips to its chunk
//                                                                 grows the same tank as one that painted every frame.
//   node scripts/render-sizzle-reel.mjs --cut=2 --deliver       → also, next to the MP4: <name>-web.mp4 (two-pass
//                                                                 x264 to 14 MB at most, or a copy if the master fits),
//                                                                 <name>-poster.jpg (--poster=<seconds>; default the
//                                                                 middle of the title scene, else 1 s) and
//                                                                 <name>-chapters.json (one chapter per scene of the edit)
//   node scripts/render-sizzle-reel.mjs --cut=2 --format=square  → the same script in a 1080×1080 frame (vertical: 1080×1920),
//                                                                 → sizzle-reel-2-square.mp4. Every output of a format is
//                                                                 suffixed (parts, stills, --deliver's), so the wide files
//                                                                 are never overwritten; every other flag works with it
//   node scripts/render-sizzle-reel.mjs --cut=2 --audio-only    → just the soundtrack: <name>-music.wav
//   --mute                                                      → no soundtrack in the MP4
//
// The soundtrack: a script's music is the .score.txt with its name (Assets/sizzle-reel-2.score.txt).
// When there is one, the film's audio is mixed offline by the same synths the preview plays
// (scripts/reel-music.js arranges the score against the edit, scripts/reel-synth.js plays it in
// an OfflineAudioContext), written next to the MP4 as <name>-music.wav and muxed in as AAC.
// A part (--from/--to, --scene) carries its own stretch of the soundtrack.
//
// Why frame by frame: a screen recording (render-media-kit.mjs --video) keeps whatever the
// browser manages in real time, so a heavy frame is a dropped frame. Here the rig's clock only
// moves when REEL.frame(t) is called: the fish engine gets exactly one 60 Hz tick per 1/60 s of
// reel, every clip is SEEKED to its exact frame, and only then is the page captured. A slow
// machine makes the same film, just later.
//
// Chromium as Playwright ships it cannot decode H.264, so every .mp4 the rig asks for is answered
// with a short-GOP VP9 transcode from .local/sizzle-cache/ (made on first use, reused while the
// source file is unchanged), with byte ranges so the page can seek it. The page itself keeps
// pointing at the real .mp4 files.
//
// Google Fonts are asked once per URL for the whole render and every page is given that answer
// (scripts/font-pin.mjs): a parallel render opens a context per chunk, and Google does not always
// answer the same stylesheet with the same bytes, so two chunks of one film could set its words
// with different files. REEL_FONT_CACHE=<dir> keeps the answers on disk for later renders too;
// the reel's suites set it, so a still compared with one from an earlier run was set with the
// same font files.
// Needs ffmpeg with libx264 and libvpx-vp9. Output lands in Assets/media-kit/ (gitignored).
import { chromium } from 'playwright-core';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, writeFileSync, readFileSync, rmSync, copyFileSync, mkdtempSync, renameSync } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { createRequire } from 'node:module';
import { serveVerified } from './serve-verified.mjs';
import { FONT_URLS, fontPin } from './font-pin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, '.local/sizzle-cache');
const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const FPS = +flag('fps', 60);
let FROM = +flag('from', 0);
let TO = flag('to', null);
const SEED = flag('seed', null);
const CRF = flag('crf', '18');
const JOBS = Math.max(1, Math.floor(+flag('jobs', 1)) || 1);
const DELIVER = args.includes('--deliver');
const POSTER = flag('poster', null);
// --format: the rig lays the same script out for another frame (its FORMATS table)
const FORMATS = { wide: [1920, 1080], square: [1080, 1080], vertical: [1080, 1920] };
const FORMAT = flag('format', 'wide');
if (!FORMATS[FORMAT]) throw new Error(`--format must be one of ${Object.keys(FORMATS).join(', ')}`);
const [VW, VH] = FORMATS[FORMAT];
const FMT = FORMAT === 'wide' ? '' : '-' + FORMAT;
const STILLS = flag('stills', '').split(',').filter(Boolean).map(Number).sort((a, b) => a - b);
// Each cut is a rig page plus its edit: cut 1's is a block of media-kit.json (it stays renderable
// as it was), cut 2's is a plain-text script that scripts/reel-script.js reads.
const CUTS = { 1: { page: 'Assets/sizzle-reel.html', edit: 'reel', name: 'sizzle-reel' },
               2: { page: 'Assets/sizzle-reel-2.html', script: 'Assets/sizzle-reel-2.script.txt', name: 'sizzle-reel-2' } };
// --script=Assets/name.script.txt plays another script through cut 2's player: a new cut is a new script
const SCRIPT_FLAG = flag('script', null);
const CUT = SCRIPT_FLAG ? (() => {
  const f = resolve(ROOT, SCRIPT_FLAG);
  if (!/^[\w.-]+\.script\.txt$/.test(basename(f)) || dirname(f) !== resolve(ROOT, 'Assets')) throw new Error('--script must name a .script.txt file in Assets/');
  if (!existsSync(f)) throw new Error(`--script: there is no ${SCRIPT_FLAG}`);
  return { page: CUTS[2].page, script: 'Assets/' + basename(f), name: basename(f, '.script.txt'), query: 'script=' + basename(f) };
})() : CUTS[flag('cut', '1')];
if (!CUT) throw new Error(`--cut must be one of ${Object.keys(CUTS).join(', ')}`);
if (FMT && !CUT.script) throw new Error('--format: only cut 2 (a script) has square and vertical layouts');
// the edit (a script with a mistake stops here, with its line numbers, before a browser starts)
const reel = CUT.script
  ? createRequire(import.meta.url)('./reel-script.js').parse(readFileSync(resolve(ROOT, CUT.script), 'utf8')).edit
  : JSON.parse(readFileSync(resolve(ROOT, 'Assets/media-kit.json'), 'utf8'))[CUT.edit];
// the score, when the script has one: read and arranged now, so a score with a mistake also
// stops here, before a browser starts
const MUTE = args.includes('--mute'), AUDIO_ONLY = args.includes('--audio-only');
const SCORE = CUT.script ? CUT.script.replace(/\.script\.txt$/, '.score.txt') : null;
const music = SCORE && existsSync(resolve(ROOT, SCORE)) && !MUTE ? (() => {
  const req = createRequire(import.meta.url), RM = req('./reel-music.js'), RS = req('./reel-script.js');
  const parsed = RM.parse(readFileSync(resolve(ROOT, SCORE), 'utf8'));
  const when = RS.spans(reel);
  const scenes = when.map((c, i) => ({ type: reel.scenes[i].type, start: c.start, end: c.end }));
  return { parsed, A: RM.arrange(parsed.score, scenes, RM.moments(reel, RS)) };
})() : null;
if (AUDIO_ONLY && !music) throw new Error(`--audio-only: ${SCORE ? (MUTE ? '--mute says no music' : `there is no ${SCORE}`) : 'cut 1 has no score'}`);
// --scene=6 or --scene=results: that scene alone, timed from the edit
let part = '';
const SCENE = flag('scene', null);
if (SCENE != null) {
  let t = 0;
  const spans = reel.scenes.map((s, i) => { const r = { i, type: s.type, start: t, end: t + s.dur }; t += s.dur; return r; });
  const hit = /^\d+$/.test(SCENE) ? spans[+SCENE - 1] : spans.find(x => x.type === SCENE);
  if (!hit) throw new Error(`--scene=${SCENE}: the scenes are ${spans.map(x => `${x.i + 1} ${x.type}`).join(', ')}`);
  FROM = hit.start; TO = String(hit.end); part = `-scene${hit.i + 1}-${hit.type}`;
} else if (FROM > 0 || TO != null) part = `-${FROM}-${TO == null ? 'end' : TO}s`;
// a part of the cut never lands on the full cut's file unless --out says so
const OUT = resolve(ROOT, flag('out', `Assets/media-kit/video/${CUT.name}${part}${FMT}.mp4`));
const CHROMIUM = process.env.CHROMIUM_PATH || chromium.executablePath();
if (!(FPS > 0 && FPS <= 60 && 60 % FPS === 0)) throw new Error('--fps must divide 60 (60, 30, 20, 15…): the engine ticks at 60 Hz');

mkdirSync(CACHE, { recursive: true });
function webmFor(mp4) {
  const st = statSync(mp4);
  const out = resolve(CACHE, `${basename(mp4, '.mp4').replace(/[^\w.-]+/g, '_')}-${st.size}-${Math.round(st.mtimeMs)}.webm`);
  if (!existsSync(out)) {
    console.log(`transcoding ${basename(mp4)} → VP9 (first use only)`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-an', '-c:v', 'libvpx-vp9', '-g', '6',
      '-crf', '20', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', out]);
  }
  return out;
}
// Transcode every clip the edit names BEFORE the browser starts: done inside the route handler,
// a long encode would block Node's event loop mid-load and time the page out.
// Cut 2 nests beats inside a scene's items, so walk both.
for (const sc of reel.scenes) for (const b of [sc, ...(sc.items || [])].flatMap(x => x.beats || [])) if (b.video) webmFor(resolve(ROOT, 'Assets', b.video));

const srv = await serveVerified(ROOT);            // proves the port is ours before a frame is drawn
const FONTS = fontPin({ dir: process.env.REEL_FONT_CACHE ? resolve(ROOT, process.env.REEL_FONT_CACHE) : null });
// The page loads its type from Google Fonts. Where outbound HTTPS must go through a proxy (a CI
// box, a cloud session), hand Chromium the proxy for https:// only, so the local http server the
// rig is served from stays direct.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true,
  args: proxy ? [`--proxy-server=https=${new URL(proxy).host}`] : [] });
const rel = f => f.replace(ROOT + '/', '');
const mb = f => `${(statSync(f).size / 1e6).toFixed(1)} MB`;

// Clips are answered with byte ranges. A media element only seeks a progressive file it can
// range-request: served whole (and python's http.server answers no ranges either), `seekable`
// is empty and every seek snaps back to 0, so each clip filmed as its first frame. Until
// 2026-09-26 both cuts did exactly that, and only the CSS push-in moved.
// One buffer per clip, shared by every chunk's page.
const clips = new Map();
function answerClip(route) {
  const file = resolve(ROOT, decodeURIComponent(new URL(route.request().url()).pathname.slice(1)));
  if (!existsSync(file)) return route.continue();
  const webm = webmFor(file);
  if (!clips.has(webm)) clips.set(webm, readFileSync(webm));
  const buf = clips.get(webm), size = buf.length;
  const headers = { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes' };
  const r = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers().range || '');
  if (!r || (r[1] === '' && r[2] === '')) return route.fulfill({ status: 200, headers, body: buf });
  const from = r[1] === '' ? Math.max(0, size - +r[2]) : +r[1];
  const to = r[1] !== '' && r[2] !== '' ? Math.min(+r[2], size - 1) : size - 1;
  if (from >= size || from > to) return route.fulfill({ status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` }, body: '' });
  return route.fulfill({ status: 206, headers: { ...headers, 'Content-Range': `bytes ${from}-${to}/${size}` }, body: buf.subarray(from, to + 1) });
}

// One rig: its own context and page, loaded, checked and ready for REEL.frame. A parallel
// render opens one per chunk, all on the same verified server.
async function openRig() {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, answerClip);
  await ctx.route(FONT_URLS, FONTS.route);      // every chunk's page sets its words with the same files
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `http://127.0.0.1:${srv.port}/${CUT.page}?render=1${CUT.query ? '&' + CUT.query : ''}${FMT ? '&format=' + FORMAT : ''}${SEED ? '&seed=' + SEED : ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  // polling by interval: in render mode the rig owns requestAnimationFrame, so rAF polling never fires
  await page.waitForFunction(() => window.REEL || document.getElementById('err'), null, { timeout: 60000, polling: 100 });
  const failed = await page.$eval('#err', e => e.textContent).catch(() => null);
  if (failed) throw new Error(failed);
  await page.evaluate(() => window.REEL.ready);
  // A reel in fallback fonts is worse than no reel: refuse instead of rendering Times.
  const fonts = await page.evaluate(() => ['200 80px Raleway', '500 20px "JetBrains Mono"'].map(f => document.fonts.check(f)));
  if (fonts.includes(false)) throw new Error('web fonts did not load (Raleway / JetBrains Mono) — check the network, nothing was rendered');
  if (errors.length) throw new Error('the rig reported errors before the first frame:\n  ' + errors.join('\n  '));
  // the frame the rig laid out must be the one we film (cut 1's rig knows only wide, and says nothing)
  const size = await page.evaluate(() => window.REEL.size || null);
  if (size && (size[0] !== VW || size[1] !== VH)) throw new Error(`the rig laid out ${size.join('×')}, not ${VW}×${VH} (--format=${FORMAT})`);
  const duration = await page.evaluate(() => window.REEL.duration);
  const cdp = await ctx.newCDPSession(page);
  const capture = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
  const frame = t => page.evaluate(t => window.REEL.frame(t), t);
  return { ctx, errors, duration, capture, frame };
}

// The master's encode, the same for a whole film and for every chunk of one
const x264 = out => ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  // PNG frames are RGB; tag and convert as BT.709 so the deep-sea blacks don't shift in players
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-pix_fmt', 'yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-x264-params', 'aq-mode=3',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-movflags', '+faststart', out];
const ffs = new Set();                            // every live encoder, so a failure can kill them all
let abort = null;                                 // the first chunk's failure stops the others

// Frames [a, b) of the film into `out`, through its own ffmpeg. A chunk that starts after 0
// first runs the three frames before its first (REEL.frame simulates the tank from 0 on the
// way): a clip that only just became visible is seeked but not painted until then, and its
// first frame would show the pane black.
// REEL_RENDER_FAIL_AT=<frame> is a test hook: the chunk holding that frame throws there.
const FAIL_AT = process.env.REEL_RENDER_FAIL_AT == null ? -1 : +process.env.REEL_RENDER_FAIL_AT;
async function renderChunk(rig, a, b, out, tick) {
  const ff = spawn('ffmpeg', x264(out), { stdio: ['pipe', 'inherit', 'inherit'] });
  ffs.add(ff);
  ff.stdin.on('error', () => {});                 // a killed or failed encoder shows as its exit code, below
  const closed = once(ff, 'close');
  try {
    for (let k = 3; k >= 1; k--) if (a - k >= 0 && FROM + (a - k) / FPS > 0) await rig.frame(FROM + (a - k) / FPS);
    for (let i = a; i < b; i++) {
      if (abort) throw new Error('stopped: another chunk failed');
      const t = FROM + i / FPS;
      await rig.frame(t);
      if (i === FAIL_AT) throw new Error(`REEL_RENDER_FAIL_AT: failing on purpose at frame ${i}`);
      if (!ff.stdin.write(await rig.capture())) await Promise.race([once(ff.stdin, 'drain'), closed]);
      if (ff.exitCode != null) throw new Error('ffmpeg exited ' + ff.exitCode);
      if (rig.errors.length) throw new Error(`the rig reported errors at ${t.toFixed(2)} s:\n  ` + rig.errors.join('\n  '));
      tick(t);
    }
    ff.stdin.end();
    const [code] = await closed;
    if (code !== 0) throw new Error('ffmpeg exited ' + code);
  } finally { if (ff.exitCode == null) ff.kill('SIGKILL'); ffs.delete(ff); }
}

// ffmpeg for everything after the master: fails loudly with its own message
const ffmpeg = argv => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...argv], { stdio: ['ignore', 'inherit', 'inherit'] });

// --deliver: the web copy, the poster and the chapter list, read from the master and the edit
function deliver(out, filmDur) {
  const stem = resolve(dirname(out), basename(out, '.mp4'));
  const web = stem + '-web.mp4', poster = stem + '-poster.jpg', chapters = stem + '-chapters.json';
  // A master that already fits is the web copy; otherwise two passes land on the budget
  // (3% under it for the container and x264's overshoot). REEL_WEB_CAP_BYTES lowers the budget
  // so a test can drive the two-pass path with a few seconds of film.
  const CAP = +process.env.REEL_WEB_CAP_BYTES || 14e6;
  if (statSync(out).size <= CAP) copyFileSync(out, web);
  else {
    const AUDIO = music ? 128000 : 0;              // the web copy keeps the soundtrack, at 128 kb/s
    const rate = Math.floor(CAP * 8 / filmDur * 0.97) - AUDIO;
    const logs = mkdtempSync(resolve(dirname(out), '.x264-2pass-'));
    try {
      const common = (r, pass) => ['-i', out, ...(music && pass === 2 ? ['-c:a', 'aac', '-b:a', String(AUDIO)] : ['-an']), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-b:v', String(r),
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-passlogfile', resolve(logs, 'pass')];
      ffmpeg([...common(rate, 1), '-pass', '1', '-f', 'null', '/dev/null']);
      // x264 lands near the rate, not under it: on a short film it can overshoot the 3%. Then
      // pass 2 runs again at the rate scaled by how far over it came (pass 1's log still holds).
      let r = rate;
      for (let k = 0; k < 3; k++) {
        ffmpeg([...common(r, 2), '-pass', '2', '-movflags', '+faststart', web]);
        if (statSync(web).size <= CAP) break;
        if (k === 2) console.log(`web copy: still ${mb(web)} after three tries, over the ${(CAP / 1e6).toFixed(1)} MB budget`);
        r = Math.floor(r * CAP / statSync(web).size * 0.97);
      }
    } finally { rmSync(logs, { recursive: true, force: true }); }
  }
  // The poster, in film seconds. The edit's title is the natural cover; a part that does not
  // hold the time asked for takes its nearest frame instead.
  let t = 0; const spans = reel.scenes.map(s => { const r = { s, start: t }; t += s.dur; return r; });
  const title = spans.find(x => x.s.type === 'title');
  const want = POSTER != null ? +POSTER : title ? title.start + title.s.dur / 2 : 1;
  const at = Math.min(Math.max(want - FROM, 0), Math.max(0, filmDur - 1 / FPS));
  if (at !== want - FROM) console.log(`poster: ${want} s is outside this render, using ${(FROM + at).toFixed(2)} s`);
  // JPEG is BT.601 full range; the master is BT.709 tv range, so say both or the blacks lift
  ffmpeg(['-ss', at.toFixed(4), '-i', out, '-frames:v', '1', '-vf', 'scale=in_color_matrix=bt709:in_range=tv:out_color_matrix=bt601:out_range=pc',
    '-pix_fmt', 'yuvj420p', '-q:v', '2', poster]);
  // The chapters are the edit's scenes, in the edit's seconds (a part carries its own span too)
  const what = s => s.query || s.name || s.caption || s.line || '';
  writeFileSync(chapters, JSON.stringify({ duration: +t.toFixed(3),
    ...(part ? { part: { from: FROM, to: +(FROM + filmDur).toFixed(3) } } : {}),
    chapters: spans.map(x => ({ t: +x.start.toFixed(3), kind: x.s.type, what: what(x.s) })) }, null, 2) + '\n');
  for (const f of [web, poster, chapters]) console.log(`wrote ${rel(f)} (${mb(f)})`);
}

// The soundtrack of [from, to), mixed offline in a blank page of the same browser: the score's
// synths in an OfflineAudioContext, returned as a 16-bit WAV. Seeded noise, so the same score
// mixes the same bytes every time.
async function renderMusic(from, to, wav) {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    for (const f of ['reel-music.js', 'reel-synth.js']) await page.addScriptTag({ content: readFileSync(resolve(ROOT, 'scripts', f), 'utf8') });
    const t0 = Date.now();
    const res = await page.evaluate(async ({ parsed, A, from, to }) => {
      const buf = await ReelSynth.renderOffline(parsed, A, { from, to });
      const bytes = new Uint8Array(ReelSynth.toWav(buf));
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { b64: btoa(bin), stats: ReelSynth.stats(buf) };
    }, { parsed: { score: music.parsed.score }, A: music.A, from, to });
    writeFileSync(wav, Buffer.from(res.b64, 'base64'));
    const st = res.stats;
    console.log(`wrote ${rel(wav)} (${mb(wav)}, ${(to - from).toFixed(1)} s mixed in ${((Date.now() - t0) / 1000).toFixed(1)} s, peak ${st.peakDb.toFixed(1)} dBFS, rms ${st.rmsDb.toFixed(1)} dBFS)`);
    if (st.peak >= 0.999) console.log('music: the mix touches 0 dBFS; lower FX master level or a track');
    // loudness as the platforms measure it (web video sits around -16 to -14 LUFS)
    const lufs = [...(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '').matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();   // the summary's, last
    if (lufs) console.log(`music: ${lufs[1]} LUFS integrated`);
  } finally { await ctx.close(); }
}
// the soundtrack into the MP4, in place (the video stream is copied, not re-encoded)
function mux(out, wav) {
  const tmp = out.replace(/\.mp4$/, '.mux-tmp.mp4');
  try { ffmpeg(['-i', out, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmp]); }
  catch (e) { rmSync(tmp, { force: true }); throw e; }
  renameSync(tmp, out);
}
const wavFor = out => out.replace(/\.mp4$/, '-music.wav');

const rigs = [];
let partsDir = null;
try {
  if (AUDIO_ONLY) {
    mkdirSync(dirname(OUT), { recursive: true });
    await renderMusic(FROM, Math.min(music.A.duration, TO == null ? music.A.duration : +TO), wavFor(OUT));
  } else if (STILLS.length) {
    if (JOBS > 1 || DELIVER) console.log('stills: --jobs and --deliver do not apply');
    const rig = await openRig(); rigs.push(rig);
    const dir = resolve(dirname(OUT), 'stills');
    mkdirSync(dir, { recursive: true });
    let prev = -1;
    for (const t of STILLS) {
      // A clip that only just became visible has been seeked but not yet painted, so a lone
      // frame shows its pane black. Run the three frames before it first, as the film does.
      // (on the engine's own 60 Hz grid: an off-grid time can read as a hair earlier than the last tick)
      const f = Math.round(t * 60);
      for (let k = 3; k >= 1; k--) if ((f - k) / 60 > prev) await rig.frame((f - k) / 60);
      await rig.frame(t);
      prev = t;
      const file = resolve(dir, `${CUT.name.replace('-reel', '')}${FMT}-${t.toFixed(2)}s.png`);
      writeFileSync(file, await rig.capture());
      console.log('wrote', rel(file));
    }
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    // every chunk's page loads at once; the first says how long the film is
    rigs.push(...await Promise.all(Array.from({ length: JOBS }, openRig)));
    const duration = rigs[0].duration;
    const end = Math.min(duration, TO == null ? duration : +TO);
    const frames = Math.round((end - FROM) * FPS);
    const n = Math.max(1, Math.min(JOBS, frames));
    const cuts = Array.from({ length: n + 1 }, (_, k) => Math.floor(k * frames / n));
    // Chunks start where the film cuts: each inner boundary moves to the nearest scene start.
    // A page opened mid-scene rasterises a layer still animating in a hair differently for a
    // second (logo edges on the client wall, 36 dB against the one-page film); at a cut,
    // everything on screen is starting fresh in both.
    let at = 0;
    const sceneFrames = reel.scenes.map(s => { const f = Math.round((at - FROM) * FPS); at += s.dur; return f; });
    for (let k = 1; k < n; k++) {
      const even = Math.floor(k * frames / n), next = Math.floor((k + 1) * frames / n);
      const near = sceneFrames.filter(f => f > cuts[k - 1] && f < next).sort((x, y) => Math.abs(x - even) - Math.abs(y - even))[0];
      if (near != null) cuts[k] = near;
    }
    if (n > 1) console.log(`${n} jobs, cut at ${cuts.slice(1, -1).map(f => (FROM + f / FPS).toFixed(2) + ' s').join(', ')}`);
    // one combined progress line: frames done of all, the whole render's rate
    const t0 = Date.now();
    let done = 0;
    const tick = t => {
      done++;
      if (done % FPS && done !== frames) return;
      const rate = done / ((Date.now() - t0) / 1000);
      process.stdout.write(`\r  ${n > 1 ? `${n} jobs` : `${t.toFixed(1)} s`}  frame ${done}/${frames}  ${rate.toFixed(1)} fps  eta ${Math.round((frames - done) / rate)} s   `);
    };
    if (n === 1) await renderChunk(rigs[0], 0, frames, OUT, tick);    // one job writes the master directly, as it always has
    else {
      // parts live in a temp folder next to OUT and never outlive the render, whatever happens
      partsDir = mkdtempSync(resolve(dirname(OUT), `.${basename(OUT, '.mp4')}-parts-`));
      const parts = cuts.slice(0, -1).map((_, k) => resolve(partsDir, `part${k}.mp4`));
      const runs = parts.map((p, k) => renderChunk(rigs[k], cuts[k], cuts[k + 1], p, tick).catch(e => {
        // the first failure stops the rest: their encoders die now, their pages when the browser closes
        if (!abort) { abort = e; for (const f of ffs) f.kill('SIGKILL'); for (const r of rigs) r.ctx.close().catch(() => {}); }
        throw e;
      }));
      await Promise.allSettled(runs);
      if (abort) throw abort;
      writeFileSync(resolve(partsDir, 'list.txt'), parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
      try { ffmpeg(['-f', 'concat', '-safe', '0', '-i', resolve(partsDir, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', OUT]); }
      catch (e) { rmSync(OUT, { force: true }); throw e; }
    }
    console.log(`\nwrote ${rel(OUT)} (${mb(OUT)}, ${(frames / FPS).toFixed(1)} s at ${FPS} fps${n > 1 ? `, ${n} jobs` : ''}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (music) { await renderMusic(FROM, FROM + frames / FPS, wavFor(OUT)); mux(OUT, wavFor(OUT)); console.log(`muxed the soundtrack into ${rel(OUT)} (${mb(OUT)})`); }
    if (DELIVER) deliver(OUT, frames / FPS);
  }
} finally {
  for (const f of ffs) f.kill('SIGKILL');
  if (partsDir) rmSync(partsDir, { recursive: true, force: true });
  await browser.close();
  srv.stop();
}
