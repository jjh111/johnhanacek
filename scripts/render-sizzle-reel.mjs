// Renders Assets/sizzle-reel.html to MP4, one frame at a time, on the rig's virtual clock.
//   node scripts/render-sizzle-reel.mjs                         → Assets/media-kit/video/sizzle-reel.mp4 (1920×1080, 60 fps)
//   node scripts/render-sizzle-reel.mjs --cut=2                 → cut 2 instead: Assets/sizzle-reel-2.html playing its
//                                                                 script, Assets/sizzle-reel-2.script.txt,
//                                                                 → Assets/media-kit/video/sizzle-reel-2.mp4
//   node scripts/render-sizzle-reel.mjs --fps=30                → half the frames, for a quick proof
//   node scripts/render-sizzle-reel.mjs --from=17.5 --to=27.5   → a stretch while you cut (the tank is
//                                                                 still simulated from 0, so it matches)
//   node scripts/render-sizzle-reel.mjs --cut=2 --scene=results → one scene, by its kind or its number (6).
//                                                                 A part renders to its own file
//                                                                 (…-scene6-results.mp4), never over the cut's
//   node scripts/render-sizzle-reel.mjs --stills=2.4,9,21       → PNGs at those seconds, no video
//   node scripts/render-sizzle-reel.mjs --seed=11               → grow a different tank
//   --crf=18 (x264 quality, lower is better) · --out=path.mp4
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
// Needs ffmpeg with libx264 and libvpx-vp9. Output lands in Assets/media-kit/ (gitignored).
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { createRequire } from 'node:module';
import { serveVerified } from './serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, '.local/sizzle-cache');
const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const FPS = +flag('fps', 60);
let FROM = +flag('from', 0);
let TO = flag('to', null);
const SEED = flag('seed', null);
const CRF = flag('crf', '18');
const STILLS = flag('stills', '').split(',').filter(Boolean).map(Number).sort((a, b) => a - b);
// Each cut is a rig page plus its edit: cut 1's is a block of media-kit.json (it stays renderable
// as it was), cut 2's is a plain-text script that scripts/reel-script.js reads.
const CUTS = { 1: { page: 'Assets/sizzle-reel.html', edit: 'reel', name: 'sizzle-reel' },
               2: { page: 'Assets/sizzle-reel-2.html', script: 'Assets/sizzle-reel-2.script.txt', name: 'sizzle-reel-2' } };
const CUT = CUTS[flag('cut', '1')];
if (!CUT) throw new Error(`--cut must be one of ${Object.keys(CUTS).join(', ')}`);
// the edit (a script with a mistake stops here, with its line numbers, before a browser starts)
const reel = CUT.script
  ? createRequire(import.meta.url)('./reel-script.js').parse(readFileSync(resolve(ROOT, CUT.script), 'utf8')).edit
  : JSON.parse(readFileSync(resolve(ROOT, 'Assets/media-kit.json'), 'utf8'))[CUT.edit];
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
const OUT = resolve(ROOT, flag('out', `Assets/media-kit/video/${CUT.name}${part}.mp4`));
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
// The page loads its type from Google Fonts. Where outbound HTTPS must go through a proxy (a CI
// box, a cloud session), hand Chromium the proxy for https:// only, so the local http server the
// rig is served from stays direct.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true,
  args: proxy ? [`--proxy-server=https=${new URL(proxy).host}`] : [] });
let ff = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  // Clips are answered with byte ranges. A media element only seeks a progressive file it can
  // range-request: served whole (and python's http.server answers no ranges either), `seekable`
  // is empty and every seek snaps back to 0, so each clip filmed as its first frame. Until
  // 2026-09-26 both cuts did exactly that, and only the CSS push-in moved.
  const clips = new Map();
  await ctx.route(/\.mp4(\?.*)?$/i, route => {
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
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `http://127.0.0.1:${srv.port}/${CUT.page}?render=1${SEED ? '&seed=' + SEED : ''}`;
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
  const duration = await page.evaluate(() => window.REEL.duration);
  const end = Math.min(duration, TO == null ? duration : +TO);
  const cdp = await ctx.newCDPSession(page);
  const capture = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');
  const frame = t => page.evaluate(t => window.REEL.frame(t), t);

  if (STILLS.length) {
    const dir = resolve(dirname(OUT), 'stills');
    mkdirSync(dir, { recursive: true });
    let prev = -1;
    for (const t of STILLS) {
      // A clip that only just became visible has been seeked but not yet painted, so a lone
      // frame shows its pane black. Run the three frames before it first, as the film does.
      // (on the engine's own 60 Hz grid: an off-grid time can read as a hair earlier than the last tick)
      const f = Math.round(t * 60);
      for (let k = 3; k >= 1; k--) if ((f - k) / 60 > prev) await frame((f - k) / 60);
      await frame(t);
      prev = t;
      const file = resolve(dir, `${CUT.name.replace('-reel', '')}-${t.toFixed(2)}s.png`);
      writeFileSync(file, await capture());
      console.log('wrote', file.replace(ROOT + '/', ''));
    }
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      // PNG frames are RGB; tag and convert as BT.709 so the deep-sea blacks don't shift in players
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-x264-params', 'aq-mode=3',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const frames = Math.round((end - FROM) * FPS);
    const t0 = Date.now();
    for (let i = 0; i < frames; i++) {
      const t = FROM + i / FPS;
      await frame(t);
      if (!ff.stdin.write(await capture())) await once(ff.stdin, 'drain');
      if (i % FPS === FPS - 1 || i === frames - 1) {
        const rate = (i + 1) / ((Date.now() - t0) / 1000);
        process.stdout.write(`\r  ${t.toFixed(1)} s  frame ${i + 1}/${frames}  ${rate.toFixed(1)} fps  eta ${Math.round((frames - i - 1) / rate)} s   `);
      }
      if (errors.length) throw new Error(`the rig reported errors at ${t.toFixed(2)} s:\n  ` + errors.join('\n  '));
    }
    ff.stdin.end();
    const [code] = await once(ff, 'close');
    if (code !== 0) throw new Error('ffmpeg exited ' + code);
    ff = null;
    console.log(`\nwrote ${OUT.replace(ROOT + '/', '')} (${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${(end - FROM).toFixed(1)} s at ${FPS} fps)`);
  }
} finally {
  if (ff) ff.kill();
  await browser.close();
  srv.stop();
}
