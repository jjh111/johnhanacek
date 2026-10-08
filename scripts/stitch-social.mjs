// One video for socials: the sizzle reel, then a short look at the editor it was made in.
//   node scripts/stitch-social.mjs [--format=wide|square] [--reel=<mp4>] [--walk=<mp4>] [--out=<mp4>]
//     reel  the rendered cut with its soundtrack (default Assets/media-kit/video/sizzle-reel-2.mp4,
//           or sizzle-reel-2-square.mp4 for square: render-sizzle-reel.mjs --format=square)
//     walk  the editor walkthrough (default .local/walk/reel-editor-walkthrough.mp4, from
//           scripts/record-walkthrough.mjs)
//     → Assets/media-kit/video/sizzle-reel-2-social.mp4 (1920×1080, 30 fps, AAC), or
//       sizzle-reel-2-social-square.mp4 (1080×1080)
// Square: the walkthrough is a 1920×1080 screen, so each moment shows a window of it
// (CROP: where the work happens, the panels at the left), its caption band left out and the
// captions drawn again, larger, above it (SQ_CAPS), the site under it.
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
const FORMAT = arg('format', 'wide'), SQ = FORMAT === 'square';
if (!['wide', 'square'].includes(FORMAT)) throw new Error('--format: wide or square');
const W = SQ ? 1080 : 1920, H = 1080;
const REEL = path.resolve(arg('reel', path.join(ROOT, `Assets/media-kit/video/sizzle-reel-2${SQ ? '-square' : ''}.mp4`)));
const WALK = path.resolve(arg('walk', path.join(ROOT, '.local/walk/reel-editor-walkthrough.mp4')));
const OUT = path.resolve(arg('out', path.join(ROOT, `Assets/media-kit/video/sizzle-reel-2-social${SQ ? '-square' : ''}.mp4`)));
const TMP = path.join(ROOT, '.local/social'); fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
for (const f of [REEL, WALK]) if (!fs.existsSync(f)) throw new Error('missing ' + path.relative(ROOT, f));

// the walkthrough's moments, in seconds of the walkthrough (its story's clock)
const SEGMENTS = [
  [5.2, 9.6],     // the timeline: a card's edge dragged, the film retimed
  [21.3, 24.6],   // the shot list: a shot dragged into another order
  [28.7, 32.6],   // the fish: an idle, a spot to swim to
  [43.2, 59.4],   // the notes: a note heard, moved and held longer, a phrase's level, Q, the roll following
];
// square: each moment's window onto the walkthrough (its left edge and width; it keeps the band's
// shape and sits on the page's foot, so a narrower one is the piano roll closer), and its
// captions, by the walkthrough's clock: [from, key, section, words]
const CROP = [{ x: 240, w: 1440 }, { x: 0, w: 1440 }, { x: 0, w: 1440 }, { x: 0, w: 1260 }];
const SQ_CAPS = [
  [[5.2, 'E', 'Timeline', 'Every scene is a card'], [7.0, 'E', 'Timeline', 'Drag a card\'s edge to retime it']],
  [[21.3, 'S', 'Shot list', 'Drag a shot to reorder the reel']],
  [[28.7, 'F', 'Fish', 'Direct the fish: an idle, a spot to swim to']],
  [[43.2, 'N', 'Notes', 'The melody as a piano roll'], [45.6, 'N', 'Notes', 'Click a note to hear it, drag to move it'],
   [48.8, 'N', 'Notes', 'Drag its edge to hold it longer'], [52.4, 'N', 'Notes', 'Box a phrase, set its level'],
   [56.0, 'Q', 'Notes', 'Q snaps it to the grid; the roll follows']],
];
const BAND = 162;                                 // square: the bands above and below the window
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
const page = await browser.newPage({ viewport: { width: W, height: H } });
const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Raleway:wght@200;300&family=JetBrains+Mono:wght@500;600&display=swap">`;
const fontsIn = () => page.evaluate(async () => { await document.fonts.ready; await Promise.all(["200 104px Raleway", "500 28px 'JetBrains Mono'", "600 22px 'JetBrains Mono'"].map(f => document.fonts.load(f))); });
const card = async (file, eyebrow, head, sub) => {
  await page.setContent(`<html><head>${FONTS}</head>
<body style="margin:0;width:${W}px;height:${H}px;background:radial-gradient(ellipse at 50% 45%,#071a26 0%,#020a12 70%);display:flex;align-items:center;justify-content:center">
<div style="text-align:center;max-width:${W - 120}px">
 <div style="font:600 22px/1 'JetBrains Mono',monospace;letter-spacing:0.28em;text-transform:uppercase;color:#d4af37">${eyebrow}</div>
 <div style="margin-top:34px;font:200 ${SQ ? 84 : 104}px/1.08 Raleway,sans-serif;color:#eaf5fa;letter-spacing:-0.01em">${head}</div>
 <div style="margin:40px auto 0;width:84px;height:2px;background:#d4af37"></div>
 <div style="margin-top:36px;font:500 ${SQ ? 24 : 28}px/1.5 'JetBrains Mono',monospace;color:#a5d5e6">${sub}</div>
</div></body></html>`);
  await fontsIn();
  await page.screenshot({ path: file });
};
await card(path.join(TMP, 'card.png'), 'Behind the reel', 'The editor it was made in', 'script · timeline · shots · fish · score · piano roll');
await card(path.join(TMP, 'end.png'), 'John Hanacek', 'Science x Craft = Design', 'johnhanacek.com');
// square: a caption band for each caption, and the band under the window
const bandPng = async (file, html) => {
  await page.setViewportSize({ width: W, height: BAND });
  await page.setContent(`<html><head>${FONTS}</head><body style="margin:0;width:${W}px;height:${BAND}px;background:#020a12;display:flex;align-items:center;justify-content:center;gap:18px">${html}</body></html>`);
  await fontsIn();
  await page.screenshot({ path: file });
};
const capPngs = [];
if (SQ) {
  for (const [i, caps] of SQ_CAPS.entries()) {
    capPngs[i] = [];
    for (const [j, [from, k, head, words]] of caps.entries()) {
      const file = path.join(TMP, `cap-${i}-${j}.png`);
      await bandPng(file, `<span style="font:600 30px/1 'JetBrains Mono',monospace;color:#020a12;background:#d4af37;border-radius:9px;padding:10px 14px">${k}</span>`
        + `<span style="display:flex;flex-direction:column;gap:10px"><span style="font:600 18px/1 'JetBrains Mono',monospace;letter-spacing:0.18em;text-transform:uppercase;color:#d4af37">${head}</span>`
        + `<span style="font:500 30px/1.15 'JetBrains Mono',monospace;color:#eaf5fa">${words}</span></span>`);
      capPngs[i].push({ file, from });
    }
  }
  await bandPng(path.join(TMP, 'foot.png'), `<span style="font:600 18px/1 'JetBrains Mono',monospace;letter-spacing:0.22em;text-transform:uppercase;color:#d4af37">Behind the reel</span>`
    + `<span style="font:500 22px/1 'JetBrains Mono',monospace;color:#a5d5e6">· johnhanacek.com</span>`);
}
await browser.close();

// ── the pieces, each to one format: W×H, 30 fps, yuv420p, stereo 48 kHz ──
const V = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x020a12,fps=${FPS},format=yuv420p,setsar=1`;
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
  const af = `${A},loudnorm=I=-16:TP=-1.5:LRA=11`;
  if (!SQ) ff('-ss', String(a), '-t', String(b - a), '-i', WALK, '-vf', V, '-af', af, ...enc, f);
  else {
    // a 1440 px window of the page (under its caption band), its captions above, the site below
    const caps = capPngs[i], { x, w } = CROP[i], h = Math.round((H - 2 * BAND) * w / W);
    let fc = `[0:v]crop=${w}:${h}:${x}:${1080 - h},scale=${W}:${H - 2 * BAND},pad=${W}:${H}:0:${BAND}:color=0x020a12[w0]`;
    caps.forEach((c, j) => { const t0 = Math.max(0, c.from - a), t1 = j + 1 < caps.length ? caps[j + 1].from - a : b - a + 1;
      fc += `;[w${j}][${j + 1}:v]overlay=0:0:enable='between(t,${t0.toFixed(2)},${t1.toFixed(2)})'[w${j + 1}]`; });
    fc += `;[w${caps.length}][${caps.length + 1}:v]overlay=0:${H - BAND},fps=${FPS},format=yuv420p,setsar=1[vo]`;
    ff('-ss', String(a), '-t', String(b - a), '-i', WALK, ...caps.flatMap(c => ['-loop', '1', '-i', c.file]), '-loop', '1', '-i', path.join(TMP, 'foot.png'),
      '-filter_complex', fc, '-map', '[vo]', '-map', '0:a', '-af', af, '-t', String(b - a), ...enc, f);
  }
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
