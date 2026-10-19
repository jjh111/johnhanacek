// The editor walkthrough as a square film (1080×1080): the whole story, each caption's moment
// shown through a window onto the 1920×1080 screen where its work happens, the caption drawn
// again above it (larger, wrapped to the square), the site under it. The square social cut's
// grammar (scripts/stitch-social.mjs) over every chapter.
//   node scripts/square-walkthrough.mjs [--walk=<mp4>] [--out=<mp4>] [--crf=17]
//     walk  the walkthrough (default .local/walk/reel-editor-walkthrough.mp4) and its captions
//           beside it (<walk>.captions.json, written by scripts/record-walkthrough.mjs)
//     → .local/walk/reel-editor-walkthrough-square.mp4 (1080×1080, the walkthrough's frame rate,
//       its sound copied as it is)
// A window is a left edge and a width onto the page under the walkthrough's caption band, as
// tall as the band between the square's two bands allows, standing on the page's foot (the
// timeline and the panels live at the foot). The window cuts with its caption.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const WALK = path.resolve(arg('walk', path.join(ROOT, '.local/walk/reel-editor-walkthrough.mp4')));
const CAPS = WALK.replace(/\.mp4$/, '') + '.captions.json';
const OUT = path.resolve(arg('out', WALK.replace(/\.mp4$/, '') + '-square.mp4'));
const CRF = arg('crf', '17');
for (const f of [WALK, CAPS]) if (!fs.existsSync(f)) throw new Error('missing ' + path.relative(ROOT, f) + ' (record it: node scripts/record-walkthrough.mjs)');
const TMP = path.join(ROOT, '.local/walk/square'); fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });

const S = 1080, BAND = 162, WIN_H = S - 2 * BAND;   // the square, its bands, the window between them
// each caption's window, by its section (the first that matches its words wins): the stage and the
// timeline (x 240), the panels at the left (x 0), the inspector and the rack at the right (x 480),
// the piano roll at the stage's own width (x 432, w 1056: any wider shows the page's empty margin)
const WINDOWS = [
  { h: 'Pictures and clips', x: 480, w: 1440 },
  { h: 'Shot list', x: 0, w: 1440 },
  { h: 'Fish', t: /^Direct/, x: 0, w: 1440 },
  { h: 'Music', t: /pads/, x: 480, w: 1440 },
  { h: 'Notes', x: 432, w: 1056 },
  { h: 'Synth rack', x: 480, w: 1440 },
  { x: 240, w: 1440 },
];
const windowOf = c => WINDOWS.find(o => (!o.h || o.h === c.h) && (!o.t || o.t.test(c.t)));

const { duration: DUR, captions } = JSON.parse(fs.readFileSync(CAPS, 'utf8'));
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });

// ── the bands, drawn by the browser in the site's fonts ─────────────────
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
const page = await browser.newPage({ viewport: { width: S, height: BAND } });
const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&display=swap">`;
const band = async (file, html) => {
  await page.setContent(`<html><head>${FONTS}</head><body style="margin:0;width:${S}px;height:${BAND}px;background:#020a12;display:flex;align-items:center;justify-content:center;gap:20px;box-sizing:border-box;padding:0 48px">${html}</body></html>`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(["500 27px 'JetBrains Mono'", "600 18px 'JetBrains Mono'"].map(f => document.fonts.load(f))); });
  await page.screenshot({ path: file });
};
const caps = [];
for (const [i, c] of captions.entries()) {
  const file = path.join(TMP, `cap-${String(i).padStart(2, '0')}.png`);
  await band(file, (c.k ? `<span style="flex:none;font:600 30px/1 'JetBrains Mono',monospace;color:#020a12;background:#d4af37;border-radius:9px;padding:10px 14px">${c.k}</span>` : '')
    + `<span style="display:flex;flex-direction:column;gap:10px;min-width:0"><span style="font:600 18px/1 'JetBrains Mono',monospace;letter-spacing:0.18em;text-transform:uppercase;color:#d4af37">${c.h}</span>`
    + `<span style="font:500 27px/1.22 'JetBrains Mono',monospace;color:#eaf5fa;text-wrap:balance">${c.t}</span></span>`);
  caps.push({ ...c, file, to: i + 1 < captions.length ? captions[i + 1].at : DUR, win: windowOf(c) });
}
await band(path.join(TMP, 'foot.png'), `<span style="font:600 18px/1 'JetBrains Mono',monospace;letter-spacing:0.22em;text-transform:uppercase;color:#d4af37">The reel editor</span>`
  + `<span style="font:500 22px/1 'JetBrains Mono',monospace;color:#a5d5e6">· johnhanacek.com</span>`);
await browser.close();

// ── each caption's span, windowed and scaled, its band over it, as a near-lossless piece (one
// filter graph over the whole film holds every frame a later branch waits for, and ran out of
// memory); counted in frames, so the pieces join to the walkthrough's length exactly ──
caps[0].at = 0;                                   // the frames before the first caption go with it
let probe = '';
try { execFileSync('ffmpeg', ['-hide_banner', '-i', WALK], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { probe = String(e.stderr); }
const FPS = Math.round(+(/([\d.]+) fps/.exec(probe) || [0, 30])[1]);
const list = [];
caps.forEach((c, i) => {
  const { x, w } = c.win, h = Math.round(WIN_H * w / S);
  const f0 = Math.round(c.at * FPS), f1 = i + 1 < caps.length ? Math.round(c.to * FPS) : Math.round(DUR * FPS), file = path.join(TMP, `piece-${String(i).padStart(2, '0')}.mkv`);
  ff('-ss', (f0 / FPS).toFixed(4), '-i', WALK, '-i', c.file, '-i', path.join(TMP, 'foot.png'),
    '-filter_complex', `[0:v]crop=${w}:${h}:${x}:${1080 - h},scale=${S}:${WIN_H}:flags=lanczos,pad=${S}:${S}:0:${BAND}:color=0x020a12[w];[w][1:v]overlay=0:0[c];[c][2:v]overlay=0:${S - BAND},setsar=1,format=yuv420p[vo]`,
    '-map', '[vo]', '-an', '-frames:v', String(f1 - f0), '-c:v', 'libx264', '-preset', 'medium', '-crf', '8', file);
  list.push(`file '${file}'`);
});
fs.writeFileSync(path.join(TMP, 'pieces.txt'), list.join('\n') + '\n');
ff('-f', 'concat', '-safe', '0', '-i', path.join(TMP, 'pieces.txt'), '-i', WALK, '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-tune', 'animation', '-x264-params', 'aq-mode=3', '-r', String(FPS),
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'copy', '-t', DUR.toFixed(3), '-movflags', '+faststart', OUT);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${DUR.toFixed(1)} s, ${caps.length} windows, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
