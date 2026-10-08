// One video for socials: the sizzle reel, then a short look at the editor it was made in.
//   node scripts/stitch-social.mjs [--reel=<mp4>] [--walk=<mp4>] [--out=<mp4>]
//     reel  the rendered cut with its soundtrack (default Assets/media-kit/video/sizzle-reel-2.mp4)
//     walk  the editor walkthrough (default .local/walk/reel-editor-walkthrough.mp4, from
//           scripts/record-walkthrough.mjs)
//     → Assets/media-kit/video/sizzle-reel-2-social.mp4 (1920×1080, 30 fps, AAC)
// The reel plays whole; a card says what comes next; the walkthrough's moments in SEGMENTS (the
// timeline, the shot list, the fish, the notes) follow, each joined by a short dissolve, the
// walkthrough's sound loudness-matched to the reel's; an end card points at the site. The cards
// are drawn by the browser in the site's fonts and colours.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REEL = path.resolve(arg('reel', path.join(ROOT, 'Assets/media-kit/video/sizzle-reel-2.mp4')));
const WALK = path.resolve(arg('walk', path.join(ROOT, '.local/walk/reel-editor-walkthrough.mp4')));
const OUT = path.resolve(arg('out', path.join(ROOT, 'Assets/media-kit/video/sizzle-reel-2-social.mp4')));
const TMP = path.join(ROOT, '.local/social'); fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
for (const f of [REEL, WALK]) if (!fs.existsSync(f)) throw new Error('missing ' + path.relative(ROOT, f));

// the walkthrough's moments, in seconds of the walkthrough (its story's clock)
const SEGMENTS = [
  [5.2, 9.6],     // the timeline: a card's edge dragged, the film retimed
  [21.3, 24.6],   // the shot list: a shot dragged into another order
  [28.7, 32.6],   // the fish: an idle, a spot to swim to
  [43.2, 59.4],   // the notes: a note heard, moved and held longer, a phrase's level, Q, the roll following
];
const CARD = 2.6, END = 3.2, XF = 0.5, XS = 0.3, FPS = 30;
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
const durOf = f => {
  let o = '';
  try { execFileSync('ffmpeg', ['-hide_banner', '-i', f], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { o = String(e.stderr); }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(o); if (!m) throw new Error('no duration for ' + f);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
};

// ── the cards ──────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const card = async (file, eyebrow, head, sub) => {
  await page.setContent(`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Raleway:wght@200;300&family=JetBrains+Mono:wght@500;600&display=swap"></head>
<body style="margin:0;width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 45%,#071a26 0%,#020a12 70%);display:flex;align-items:center;justify-content:center">
<div style="text-align:center">
 <div style="font:600 22px/1 'JetBrains Mono',monospace;letter-spacing:0.28em;text-transform:uppercase;color:#d4af37">${eyebrow}</div>
 <div style="margin-top:34px;font:200 104px/1.08 Raleway,sans-serif;color:#eaf5fa;letter-spacing:-0.01em">${head}</div>
 <div style="margin:40px auto 0;width:84px;height:2px;background:#d4af37"></div>
 <div style="margin-top:36px;font:500 28px/1.4 'JetBrains Mono',monospace;color:#a5d5e6">${sub}</div>
</div></body></html>`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(["200 104px Raleway", "500 28px 'JetBrains Mono'"].map(f => document.fonts.load(f))); });
  await page.screenshot({ path: file });
};
await card(path.join(TMP, 'card.png'), 'Behind the reel', 'The editor it was made in', 'script · timeline · shots · fish · score · piano roll');
await card(path.join(TMP, 'end.png'), 'John Hanacek', 'Science x Craft = Design', 'johnhanacek.com');
await browser.close();

// ── the pieces, each to one format: 1920×1080, 30 fps, yuv420p, stereo 48 kHz ──
const V = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x020a12,fps=${FPS},format=yuv420p,setsar=1`;
const A = 'aresample=48000,aformat=channel_layouts=stereo';
const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k'];
const pieces = [];
const reelP = path.join(TMP, 'p0-reel.mp4');
ff('-i', REEL, '-vf', V, '-af', A, ...enc, reelP); pieces.push(reelP);
const still = (png, secs, name) => { const f = path.join(TMP, name); ff('-loop', '1', '-t', String(secs), '-i', png, '-f', 'lavfi', '-t', String(secs), '-i', 'anullsrc=r=48000:cl=stereo', '-vf', V, '-af', A, ...enc, '-shortest', f); return f; };
pieces.push(still(path.join(TMP, 'card.png'), CARD, 'p1-card.mp4'));
// the walkthrough's sound brought to the reel's loudness (the reel mixes to about -14 LUFS)
SEGMENTS.forEach(([a, b], i) => {
  const f = path.join(TMP, `p${2 + i}-walk.mp4`);
  ff('-ss', String(a), '-t', String(b - a), '-i', WALK, '-vf', V, '-af', `${A},loudnorm=I=-16:TP=-1.5:LRA=11`, ...enc, f);
  pieces.push(f);
});
pieces.push(still(path.join(TMP, 'end.png'), END, `p${2 + SEGMENTS.length}-end.mp4`));

// ── joined: a dissolve at every join, longer around the cards ───────────
const durs = pieces.map(durOf);
const fades = pieces.slice(1).map((_, i) => (i === 0 || i === 1 || i === pieces.length - 2 ? XF : XS));
let fc = '', vPrev = '[0:v]', aPrev = '[0:a]', t = durs[0];
for (let i = 1; i < pieces.length; i++) {
  const d = fades[i - 1], off = (t - d).toFixed(3), vo = `[v${i}]`, ao = `[a${i}]`;
  fc += `${vPrev}[${i}:v]xfade=transition=fade:duration=${d}:offset=${off}${vo};`;
  fc += `${aPrev}[${i}:a]acrossfade=d=${d}${ao};`;
  vPrev = vo; aPrev = ao; t = t - d + durs[i];
}
fc = fc.replace(/;$/, '');
ff(...pieces.flatMap(p => ['-i', p]), '-filter_complex', fc, '-map', vPrev, '-map', aPrev,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${t.toFixed(1)} s, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB (the reel ${durs[0].toFixed(1)} s, then ${(t - durs[0]).toFixed(1)} s of the editor)`);
