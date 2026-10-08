// A walkthrough of the reel editor (about 77 s): every control set, captioned, with its sound,
// recorded from the build claude.ai hosts (scripts/build-reel-editor.mjs) with a stand-in for
// claude.ai's store, save dialog and comments, so every control is the one John uses.
//   node scripts/record-walkthrough.mjs [--dry] [--nobuild] [--film=<mp4>] [--out=<mp4>]
//     → .local/walk/reel-editor-walkthrough.mp4 (1920×1080, 30 fps, AAC), about 77 s
// The story: the preview and its transport; the timeline (a card's edge dragged, its inspector);
// words retyped on the stage; a picture picked from the library; the shot list (a shot dragged,
// its transitions); the Fish panel and the fish lanes; the music lanes (a fade, a level, a clip's
// pads heard); the notes as a piano roll (a note heard, moved, held longer, a phrase's level, Q,
// the roll following the playhead); the synth rack (a pad heard, a knob turned); one Undo for all of it; Export (the
// film played in the panel). Each step is timed against the story's clock and waits if early.
// Frames come from the browser's own screencast, with their times (about 15 a second here: the
// page draws about 25 with the timeline open, and the cast costs the rest), held to a constant
// 30 fps; the sound is the editor's master bus, recorded in the page; both are cut to the story.
// Captions are drawn by the browser in the site's font into a 72 px band above the page, so they
// never cover the film's own search bar. This Chromium has no H.264: each clip is answered with
// the renderer's VP9 transcode (.local/sizzle-cache, made by a render), and the film Export plays
// is a VP9 copy of --film (default: the last render's web copy), made once and kept.
// --dry runs the story without recording, and leaves a picture and the panels' state after each
// step in .local/walk/dry-*.png. A click that would land on anything but its target stops the take.
import { chromium } from 'playwright-core';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = path.join(ROOT, '.local/walk'), SITE = path.join(W, 'editor'), FR = path.join(W, 'frames');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DRY = process.argv.includes('--dry');
const OUT = path.resolve(arg('out', path.join(W, 'reel-editor-walkthrough.mp4')));
const CACHE = path.join(ROOT, '.local/sizzle-cache');
fs.mkdirSync(W, { recursive: true });
// the film Export lists and plays: the last render's web copy, as VP9 for this Chromium (made once)
const FILM = path.resolve(arg('film', path.join(ROOT, 'Assets/media-kit/video/sizzle-reel-2-web.mp4')));
let FILM_WEBM = '', FILM_MB = 0;
if (fs.existsSync(FILM)) {
  const st = fs.statSync(FILM);
  FILM_MB = +(st.size / 1e6).toFixed(1);
  FILM_WEBM = path.join(W, `film-${st.size}-${Math.round(st.mtimeMs)}.webm`);
  if (!fs.existsSync(FILM_WEBM)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', FILM, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '2500k', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k', FILM_WEBM]);
} else console.log(`no film at ${path.relative(ROOT, FILM)}: Export lists one, but Play shows nothing (render with --deliver first)`);
const VW = 1920, VH = 1008, BAND = 72;            // the page, and the caption band above it in the film
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();
const log = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(1).padStart(6), ...a);

if (!process.argv.includes('--nobuild')) {
  const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-reel-editor.mjs'), '--out=' + SITE], { encoding: 'utf8' });
  if (b.status) throw new Error('build: ' + b.stderr);
}
fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });

// ── a plain static server for the build ────────────────────────────────
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', txt: 'text/plain', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', mp4: 'video/mp4' };
const port = await new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const f = path.join(SITE, rel);
  if (!f.startsWith(SITE + '/') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  const t = TYPES[f.split('.').pop().toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': /^(text|application\/json|image\/svg)/.test(t) ? t + '; charset=utf-8' : t });
  res.end(fs.readFileSync(f));
}).listen(port, '127.0.0.1');
const URL0 = `http://127.0.0.1:${port}/index.html`;

// ── what the page gets before its own scripts ──────────────────────────
// claude.ai's capabilities, granted already (a store that remembers, a save dialog that says yes,
// comments that reach Claude); the how-to card seen; films/latest is written later, once the
// page can say which version it plays
const FAKE = () => {
  try { localStorage.setItem('reel-editor-seen', '1'); } catch (e) { /* none */ }
  const K = 'fake-db:';
  const doc = p => ({
    async get() { const v = localStorage.getItem(K + p); return v ? { exists: true, id: p, data: () => JSON.parse(v) } : { exists: false, id: p, data: () => undefined }; },
    async set(d) { localStorage.setItem(K + p, JSON.stringify(d)); },
    async delete() { localStorage.removeItem(K + p); },
  });
  const comments = { canSendToClaude: async () => 'available', anchorFor: async () => ({ path: 'body', x: 1, y: 1 }), sendToClaude: async () => ({ threadId: 't1', commentId: 'c1' }) };
  window.claude = { use: async name => name === 'db' ? { doc }
    : name === 'permissions' ? { state: async () => 'granted', request: async () => ({ db: 'granted' }) }
    : name === 'downloads' ? { save: async () => ({ status: 'saved' }) }
    : name === 'comments' ? comments : null };
};
// a pointer the recording can see, a caption, and the key just pressed
const OVERLAY = () => {
  const mk = () => {
    if (document.getElementById('walk-ptr')) return;
    const st = document.createElement('style');
    st.textContent = `
#walk-ptr { position: fixed; left: -40px; top: -40px; width: 22px; height: 22px; margin: -11px 0 0 -11px; border: 2px solid #d4af37; border-radius: 50%;
  background: rgba(212,175,55,0.16); box-shadow: 0 0 0 2px rgba(2,10,18,0.55), 0 0 14px rgba(212,175,55,0.55); pointer-events: none; z-index: 2147483647;
  transition: transform 0.12s ease-out; box-sizing: border-box; }
#walk-ptr.down { transform: scale(0.62); background: rgba(212,175,55,0.38); }
#walk-cap { position: fixed; left: 50%; top: 18px; transform: translateX(-50%); z-index: 2147483646; pointer-events: none; display: flex; align-items: center; gap: 14px;
  padding: 11px 20px 11px 14px; border-radius: 13px; background: rgba(2,10,18,0.9); border: 1px solid rgba(212,175,55,0.55);
  box-shadow: 0 10px 34px rgba(0,0,0,0.55); max-width: 1500px; transition: opacity 0.25s; white-space: nowrap; }
#walk-cap[hidden] { display: none; }
#walk-cap .k { font: 600 20px/1 'JetBrains Mono', monospace; color: #020a12; background: #d4af37; border-radius: 7px; padding: 7px 10px; min-width: 18px; text-align: center; }
#walk-cap .k:empty { display: none; }
#walk-cap .h { font: 600 15px/1 'JetBrains Mono', monospace; letter-spacing: 0.12em; text-transform: uppercase; color: #d4af37; }
#walk-cap .t { font: 500 21px/1.25 'JetBrains Mono', monospace; color: #eaf5fa; }
#walk-key { position: fixed; right: 28px; top: 22px; z-index: 2147483646; pointer-events: none; font: 600 22px/1 'JetBrains Mono', monospace; color: #020a12;
  background: #d4af37; border-radius: 8px; padding: 9px 13px; box-shadow: 0 6px 20px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.2s; }
#walk-key.on { opacity: 1; }`;
    document.documentElement.appendChild(st);
    const p = document.createElement('div'); p.id = 'walk-ptr'; document.documentElement.appendChild(p);
    const c = document.createElement('div'); c.id = 'walk-cap'; c.hidden = true; c.innerHTML = '<span class="k"></span><span class="h"></span><span class="t"></span>'; document.documentElement.appendChild(c);
    const k = document.createElement('div'); k.id = 'walk-key'; document.documentElement.appendChild(k);
    const at = e => { p.style.left = e.clientX + 'px'; p.style.top = e.clientY + 'px'; };
    addEventListener('pointermove', at, true); addEventListener('mousemove', at, true);
    addEventListener('pointerdown', () => p.classList.add('down'), true);
    addEventListener('pointerup', () => p.classList.remove('down'), true);
    window.__walkCap = (key, head, text) => { c.hidden = !text; c.querySelector('.k').textContent = key || ''; c.querySelector('.h').textContent = head || ''; c.querySelector('.t').textContent = text || ''; };
    let kt; window.__walkKey = s => { k.textContent = s; k.classList.add('on'); clearTimeout(kt); kt = setTimeout(() => k.classList.remove('on'), 900); };
  };
  if (document.documentElement) mk(); else document.addEventListener('DOMContentLoaded', mk);
  document.addEventListener('DOMContentLoaded', mk);
};

// ── the browser ────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, colorScheme: 'dark' });
await ctx.addInitScript(FAKE);
await ctx.addInitScript(OVERLAY);
// the clips: this Chromium has no H.264, so each is answered with its VP9 transcode (the renderer's
// cache), with byte ranges so a clip seeks; the film for Export's Play the same way
const bufs = new Map();
const webmFor = name => {
  if (name === 'walk-film.mp4') return FILM_WEBM || null;
  const src = path.join(SITE, name);
  if (!fs.existsSync(src)) return null;
  const size = fs.statSync(src).size, stem = name.replace(/\.mp4$/, '').replace(/[^\w.-]+/g, '_');
  const hit = fs.readdirSync(CACHE).filter(f => f.startsWith(`${stem}-${size}-`) && f.endsWith('.webm')).sort().pop();
  return hit ? path.join(CACHE, hit) : null;
};
await ctx.route(/\.mp4(\?.*)?$/i, route => {
  const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
  const webm = webmFor(name);
  if (!webm) return route.fulfill({ status: 404, body: '' });
  if (!bufs.has(webm)) bufs.set(webm, fs.readFileSync(webm));
  const buf = bufs.get(webm), size = buf.length, headers = { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes' };
  const r = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers().range || '');
  if (!r || (r[1] === '' && r[2] === '')) return route.fulfill({ status: 200, headers, body: buf });
  const from = r[1] === '' ? Math.max(0, size - +r[2]) : +r[1], to = r[1] !== '' && r[2] !== '' ? Math.min(+r[2], size - 1) : size - 1;
  if (from >= size || from > to) return route.fulfill({ status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` }, body: '' });
  return route.fulfill({ status: 206, headers: { ...headers, 'Content-Range': `bytes ${from}-${to}/${size}` }, body: buf.subarray(from, to + 1) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

// ── helpers ────────────────────────────────────────────────────────────
let mx = VW / 2, my = VH / 2;
// moves are timed by the clock, not by steps: a busy page makes fewer steps, never a slower move
const glide = async (x, y, ms = 450) => {
  const x0 = mx, y0 = my, t0 = Date.now();
  for (;;) { const k = Math.min(1, (Date.now() - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); if (k >= 1) break; await sleep(12); }
  mx = x; my = y;
};
const box = async sel => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('not on screen: ' + sel); return b; };
const centre = async sel => { const b = await box(sel); return [b.x + b.width / 2, b.y + b.height / 2]; };
const clickAt = async (x, y, ms = 420) => { await glide(x, y, ms); await sleep(90); await page.mouse.down(); await sleep(70); await page.mouse.up(); };
// a click on what a selector names: measured again at the end of the move, since a panel can
// redraw (and its buttons shift) while the pointer travels
const clickSel = async (sel, ms) => {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();               // a panel's own scroll, so the target is in its view
  let [x, y] = await centre(sel);
  await glide(x, y, ms);
  await loc.scrollIntoViewIfNeeded();
  const [x2, y2] = await centre(sel);
  if (Math.hypot(x2 - x, y2 - y) > 2) { await glide(x2, y2, 160); x = x2; y = y2; }
  const h = await loc.elementHandle();
  const hit = await h.evaluate((e, [x, y]) => { const at = document.elementFromPoint(x, y); return { ok: !!at && (e === at || e.contains(at)), at: at && (at.outerHTML || '').slice(0, 90) }; }, [x, y]);
  if (!hit.ok) throw new Error(`a click on ${sel} would land on ${hit.at}`);
  await sleep(90); await page.mouse.down(); await sleep(70); await page.mouse.up();
};
const drag = async (x, y, dx, dy, ms = 700, mod) => {
  await glide(x, y, 380); await sleep(120);
  if (mod) await page.keyboard.down(mod);
  await page.mouse.down(); await sleep(90);
  const t0 = Date.now();
  for (;;) { const k = Math.min(1, (Date.now() - t0) / ms), e = 1 - Math.pow(1 - k, 2); await page.mouse.move(x + dx * e, y + dy * e); if (k >= 1) break; await sleep(12); }
  mx = x + dx; my = y + dy; await sleep(140);
  await page.mouse.up();
  if (mod) await page.keyboard.up(mod);
};
const key = async k => { await page.keyboard.press(k); };
// the captions, timed against the story; drawn into the band afterwards
const CAPS = [];
const cap = async (k, h, t) => { CAPS.push({ at: S0 ? (Date.now() - S0) / 1000 : 0, k, h, t }); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const settled = () => page.evaluate(() => REEL_LIVE.settled());
const xAt = t => page.evaluate(t => { const r = document.querySelector('#reel-tl .tl-lane').getBoundingClientRect(); return r.left + t * (r.width / REEL_LIVE.duration); }, t);
const sceneOf = type => page.evaluate(type => REEL_LIVE.scenes.findIndex(s => s.type === type), type);
// in a dry run, a picture and the panels' state after each step
const snap = async name => { if (!DRY) return; await page.screenshot({ path: path.join(W, `dry-${name}.png`) });
  log(name, JSON.stringify(await ev(() => ({ t: +REEL_LIVE.now().toFixed(2), playing: REEL_LIVE.playing, shots: REEL_SHOTS.isOpen, sel: REEL_SHOTS.selected, fish: !document.getElementById('reel-fish').hidden,
    focus: document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName), text: window.REEL_TEXT && REEL_TEXT.editing ? 'editing' : '' })))); };
// keep each beat of the story to its time: wait until `at` seconds into the story
let S0 = 0;
const until = async at => { const left = S0 + at * 1000 - Date.now(); if (left > 0) await sleep(left); else if (left < -400) log(`  (running ${(-left / 1000).toFixed(1)} s behind at ${at} s)`); };

// ── the screencast and the sound ───────────────────────────────────────
const frames = [], pending = [];
let cdp = null;
const startCast = async () => {
  cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', f => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});   // the next frame may come at once
    const file = path.join(FR, String(frames.length).padStart(6, '0') + '.jpg');
    frames.push({ file, t: f.metadata.timestamp });
    pending.push(fs.promises.writeFile(file, Buffer.from(f.data, 'base64')));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 84, maxWidth: VW, maxHeight: VH, everyNthFrame: 1 });
};

// each caption as a 1920×72 image: its key, its section, its words, on the reel's dark ground
async function drawCaptions(caps, dur) {
  const dir = path.join(W, 'caps'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const p = await ctx.newPage();
  await p.setViewportSize({ width: VW, height: BAND });
  await p.setContent(`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"></head><body style="margin:0;background:#020a12;overflow:hidden">
<div id="b" style="box-sizing:border-box;width:${VW}px;height:${BAND}px;display:flex;align-items:center;justify-content:center;gap:16px;border-bottom:1px solid rgba(212,175,55,0.45);
 background:linear-gradient(180deg,#051018,#020a12)"></div></body></html>`);
  const fonted = await p.evaluate(async () => { await Promise.all(["500 24px 'JetBrains Mono'", "600 16px 'JetBrains Mono'"].map(f => document.fonts.load(f))); return document.fonts.check("500 24px 'JetBrains Mono'"); });
  if (!fonted) log('the captions\' font did not load: they fall back to the system monospace');
  const out = [];
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i], to = i + 1 < caps.length ? caps[i + 1].at : dur;
    await p.evaluate(c => {
      const kb = c.k ? `<span style="font:600 22px/1 'JetBrains Mono',monospace;color:#020a12;background:#d4af37;border-radius:7px;padding:8px 12px">${c.k}</span>` : '';
      document.getElementById('b').innerHTML = kb + `<span style="font:600 16px/1 'JetBrains Mono',monospace;letter-spacing:0.14em;text-transform:uppercase;color:#d4af37">${c.h}</span>`
        + `<span style="font:500 24px/1 'JetBrains Mono',monospace;color:#eaf5fa">${c.t}</span>`;
    }, c);
    const file = path.join(dir, String(i).padStart(2, '0') + '.png');
    await p.screenshot({ path: file });
    out.push({ file, from: c.at, to });
  }
  await p.close();
  return out;
}

try {
  await page.goto(URL0 + '#t=3.4&pause=1');
  await page.waitForFunction(() => window.REEL_LIVE && window.REEL_TIMELINE && window.REEL_RACK && REEL_RACK.parsed && window.REEL_SHOTS && window.REEL_FISH && window.REEL_EXPORT && !document.getElementById('boot'), null, { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => REEL_TIMELINE.music.open(false));   // the music lanes open in their own part of the story
  await page.mouse.move(mx, my);
  // sound: the engine starts on a gesture; then the page records its own master bus
  await page.mouse.click(VW * 0.5, VH * 0.3);
  await page.evaluate(() => { REEL_LIVE.setPlaying(false); REEL_LIVE.seek(3.4); });
  await page.waitForFunction(() => REEL_RACK.ctx && REEL_RACK.ctx.state === 'running', null, { timeout: 15000 }).catch(() => log('the sound did not start'));
  const recAt = DRY ? 0 : await page.evaluate(() => {
    const E = REEL_RACK.engine, c = REEL_RACK.ctx, d = c.createMediaStreamDestination();
    E.master.connect(d); window.__dest = d;
    const rec = new MediaRecorder(d.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
    window.__chunks = []; rec.ondataavailable = e => e.data.size && window.__chunks.push(e.data);
    window.__rec = rec; rec.start(500);
    return performance.timeOrigin + performance.now();
  });
  // the film Claude rendered, as Export will list it: from the version the page plays
  const ver = await page.evaluate(() => REEL_EXPORT.version);
  await page.evaluate(([ver, mb]) => localStorage.setItem('fake-db:films/latest', JSON.stringify({ renderedAt: new Date().toISOString(), from: ver,
    items: [{ format: 'wide', url: 'walk-film.mp4', mb, seconds: +REEL_LIVE.duration.toFixed(2), fps: 30 }] })), [ver, FILM_MB]);
  if (!DRY) await startCast();
  await sleep(600);
  // the answer's first line, and a moment it is all the way in (found before the story, so the
  // recording never scrubs looking for it)
  const ANS = await sceneOf('answer');
  const FIRST = await ev(() => REEL_LIVE.parsed.fields.find(x => x.key === 'line' && x.index === 0 && x.owner.type === 'answer').ln);
  const ansSc = await ev(i => REEL_LIVE.scenes[i], ANS);
  let LINE_AT = null;
  for (let t = ansSc.start + 0.8; t < ansSc.end - 0.3 && LINE_AT == null; t += 0.25) {
    const hit = await ev(([t, ln]) => { REEL_LIVE.setPlaying(false); REEL_LIVE.seek(t); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector(`#stage [data-ln="${ln}"]`); if (!el) return r(false);
      const li = el.querySelector(':scope > .li'); if (!li) return r(true);
      const a = el.getBoundingClientRect(), b = li.getBoundingClientRect(); r(b.top >= a.top - 1 && b.bottom <= a.bottom + 1);
    }))); }, [+t.toFixed(2), FIRST]);
    if (hit) LINE_AT = +(t - ansSc.start + 0.3).toFixed(2);
  }
  if (LINE_AT == null) throw new Error('the answer\'s first line never comes all the way in');
  log('the answer\'s first line is in from', LINE_AT, 's into its scene');
  await page.evaluate(() => { REEL_LIVE.setPlaying(false); REEL_LIVE.seek(3.4); });
  await sleep(400);
  const story0 = Date.now() / 1000;
  S0 = Date.now();

  // 0 ── the preview, and the keys that are buttons ──────────────────────
  await cap('', 'Sizzle reel editor', 'The film plays live in the page. Every edit plays in place.');
  await ev(() => REEL_LIVE.setPlaying(true));
  await glide(...(await centre('#hud [data-do="play"]')), 900);
  await until(2.4);
  await cap('', 'Transport', 'Every key is a button: Space plays, [ and ] jump a scene, L loops one');
  await glide(...(await centre('#hud [data-do="next"]')), 500);
  await until(3.9);
  await clickSel('#hud [data-do="next"]', 250);
  await until(5.0); await snap('s0');

  // 1 ── the timeline ──────────────────────────────────────────────────
  await cap('E', 'Timeline', 'Every scene is a card: its works, its moments, its exit');
  await key('e');
  await sleep(500);
  const ans = await sceneOf('answer');
  await glide(...(await centre(`#reel-tl .tl-sc[data-scene="${ans}"]`)), 700);
  await until(7.0);
  await cap('E', 'Timeline', 'Drag a card\'s edge to retime it: the film plays the change at once');
  await ev(() => REEL_LIVE.setPlaying(false));
  const grip = await box(`#reel-tl .tl-sc[data-scene="${ans}"] .tl-grip`);
  const pxs = await ev(() => document.querySelector('#reel-tl .tl-lane').clientWidth / REEL_LIVE.duration);
  await drag(grip.x + grip.width / 2, grip.y + grip.height / 2, 1 * pxs, 0, 750, 'Shift');
  await settled();
  await until(9.6);
  await cap('E', 'Timeline', 'Click a card for its inspector: every line and cue of the scene');
  await clickSel(`#reel-tl .tl-sc[data-scene="${ans}"] b`, 400);
  await until(11.8); await snap('s1');

  // 2 ── words on the stage ─────────────────────────────────────────────
  await cap('', 'Words on the stage', 'Paused, double-click any line on the stage and type');
  const sc = await ev(i => REEL_LIVE.scenes[i], ans);
  await ev(t => { REEL_LIVE.setPlaying(false); REEL_LIVE.seek(t); }, sc.start + LINE_AT);
  await sleep(350);
  const lineXY = await ev(ln => { const t = document.querySelector(`#stage [data-ln="${ln}"]`); const r = (t.querySelector(':scope > .li') || t).getBoundingClientRect(); return [r.left + r.width * 0.35, r.top + r.height / 2]; }, FIRST);
  await glide(...lineXY, 500); await sleep(450);
  await page.mouse.dblclick(...lineXY); await sleep(250);
  const editing = await ev(() => window.REEL_TEXT && REEL_TEXT.editing);
  if (!editing || editing.ln !== FIRST) throw new Error('a double-click on the stage did not start editing the line: ' + JSON.stringify(editing));
  await page.keyboard.press('Control+a'); await sleep(120);
  await page.keyboard.type('Freehand drawing', { delay: 45 });
  await sleep(250);
  await page.keyboard.press('Enter');
  await settled();
  await until(16.4); await snap('s2');

  // 3 ── the media picker ───────────────────────────────────────────────
  await cap('', 'Pictures and clips', 'A picture in the inspector opens the library: pick by thumbnail');
  const art = await sceneOf('art');
  await clickSel(`#reel-tl .tl-sc[data-scene="${art}"] b`, 450);
  await sleep(450);
  await clickSel('#reel-tl .tl-insp-col .tl-mchip', 450);
  await page.waitForSelector('#reel-pk .pk-tile', { timeout: 8000 });
  await sleep(400);
  await clickSel('#reel-pk input[type=search]', 300);
  await page.keyboard.type('jhana', { delay: 60 });
  await sleep(500);
  await clickSel('#reel-pk .pk-tile >> nth=2', 450);
  await settled();
  const artSc = await ev(i => REEL_LIVE.scenes[i], art);
  await ev(t => { REEL_LIVE.seek(t); }, artSc.start + 1.4);
  await until(21.2); await snap('s3');

  // 4 ── the shot list ──────────────────────────────────────────────────
  await cap('S', 'Shot list', 'Drag a shot to put the scenes in any order');
  await key('s');
  await sleep(450);
  if (!(await ev(() => REEL_SHOTS.isOpen))) throw new Error('S did not open the shot list');
  await snap('s4-open');
  const rowBox = async i => box(`#reel-shots .sh-row[data-i="${i}"]`);
  const cmd = await sceneOf('command'), ansNow = await sceneOf('answer');
  await ev(() => { document.querySelector('#reel-shots .sh-body').scrollTop = 0; });
  const b0 = await rowBox(ansNow), bt = await rowBox(cmd);
  await drag(b0.x + 150, b0.y + b0.height / 2, 0, (bt.y + bt.height * 0.25) - (b0.y + b0.height / 2), 900);
  await settled();
  await snap('s4-dragged');
  await until(24.6);
  await cap('S', 'Shot list', 'Each shot\'s transitions: when it arrives, how it leaves, its curve');
  const moved = await ev(() => REEL_SHOTS.selected);
  if (moved == null) throw new Error('the dragged shot is not the one open: ' + JSON.stringify(await ev(() => REEL_SHOTS.rows())));
  const sel = moved;
  const ed = `#reel-shots .sh-ed[data-shot="${sel}"]`;
  await page.waitForSelector(ed, { timeout: 5000 });
  await glide(...(await centre(`${ed} select[data-cue="ease"]`)), 450);
  await page.locator(`${ed} select[data-cue="ease"]`).selectOption('back');
  await settled();
  await sleep(300);
  await clickSel(`${ed} input[data-cue="arrive"]`, 350);
  await page.keyboard.press('Control+a'); await page.keyboard.type('0.3', { delay: 70 }); await page.keyboard.press('Enter');
  await settled();
  await clickSel(`${ed} [data-act="play"]`, 400);    // Play here: the shot arrives, faster, on its new curve
  await snap('s4-ed');
  await until(28.6);

  // 5 ── the fish ───────────────────────────────────────────────────────
  await cap('F', 'Fish', 'Direct the fish at the playhead: an idle, a look, a spot to swim to');
  await ev(() => REEL_LIVE.setPlaying(false));
  const res = await sceneOf('results');
  const rsc = await ev(i => REEL_LIVE.scenes[i], res);
  await ev(t => REEL_LIVE.seek(t), rsc.start + 4);
  await key('f');
  await sleep(500);
  if (!(await ev(() => !document.getElementById('reel-fish').hidden))) throw new Error('F did not open the Fish panel');
  await clickSel('#reel-fish [data-fish="circle"]', 450);
  await settled();
  await sleep(250);
  await clickSel('#reel-fish [data-fish="to"]', 400);
  const v = await ev(() => REEL_LIVE.view());
  await clickAt(v.x + 1920 * 0.62 * v.s, v.y + 1080 * 0.78 * v.s, 500);   // a fraction of the reel's own 1920×1080 frame
  await settled();
  await ev(() => REEL_LIVE.setPlaying(true));
  await snap('s5-fish');
  await until(32.8);
  await cap('F', 'Fish', 'In the timeline, gold where a line directs them, cyan the reel\'s own');
  const lane = await box('#reel-tl .tl-fl');
  await glide(await xAt(rsc.start + 5), lane.y + lane.height / 2, 600);
  await snap('s5-lane');
  await until(35.2);

  // 6 ── the music lanes ────────────────────────────────────────────────
  await cap('', 'Music', 'The score on its own bars, the chords over them, a gold line at every cut');
  await key('f');                                   // the Fish panel shut: the stage gets its side back
  await clickSel('#reel-tl button.tl-mtog', 450);   // the chevron: the music's lanes open under the scenes
  await sleep(450);
  const clipBox = part => ev(part => { const k = document.querySelector(`#reel-tl .tl-mk[data-part="${part}"]`); if (!k) return null; k.scrollIntoView({ block: 'nearest' }); const r = k.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, part);
  const voiceClip = await clipBox('voice');
  if (!voiceClip) throw new Error('no voice clip in the timeline');
  await glide(voiceClip.x + voiceClip.w * 0.3, voiceClip.y + voiceClip.h / 2, 700);
  await until(37.6);
  await cap('', 'Music', 'Drag a clip, its edges, its fades; drag it up or down for its level');
  const drumsClip = await clipBox('drums');
  await drag(drumsClip.x + drumsClip.w - 4, drumsClip.y - 1, -2 * pxs, 0, 650);   // its fade out, a little longer
  await settled().catch(() => {});
  const bassClip = await clipBox('bass');
  await drag(bassClip.x + Math.min(bassClip.w * 0.3, 260), bassClip.y + bassClip.h - 4, 0, -14, 500);
  await snap('s6-drags');
  await until(40.4);
  await cap('', 'Music', 'Click a clip: its pads, each one ready to hear');
  const drums2 = await clipBox('drums');
  await clickAt(drums2.x + Math.min(drums2.w * 0.4, 300), drums2.y + drums2.h / 2, 450);
  await page.waitForSelector('#reel-tl .tl-insp-col:not([hidden]) .tl-pad', { timeout: 5000 });
  await sleep(300);
  await clickSel('#reel-tl .tl-insp-col .tl-pad[data-pad="groove"] button', 450).catch(() => clickSel('#reel-tl .tl-insp-col .tl-pad >> nth=1', 450));
  await snap('s6-pads');
  await until(43.0);

  // 7 ── the notes: the melody as a piano roll ───────────────────────────
  await cap('N', 'Notes', 'The melody as a piano roll, on the reel\'s own bars and chords');
  await page.keyboard.press('Escape');
  await ev(() => { REEL_LIVE.setPlaying(false); REEL_LIVE.seek(15.5); });
  await sleep(200);
  await key('n');
  await page.waitForFunction(() => REEL_NOTES.open && REEL_NOTES.model && !REEL_NOTES.model.none, null, { timeout: 8000 });
  await sleep(500);
  // a little closer: a sixteenth wide enough to grab
  await glide(VW * 0.55, VH - 170, 500);
  for (let i = 0; i < 2; i++) { await key('='); await sleep(160); }
  await sleep(300);
  await snap('s7-open');
  // a note in view: a played, sung one, an eighth or longer, in the left half of the roll
  const NV = await ev(() => { const v = REEL_NOTES.view, M = REEL_NOTES.model, r = document.querySelector('#reel-notes .nt-roll canvas').getBoundingClientRect();
    const w = (r.width - v.keyW) / v.pxs;
    const inView = M.notes.filter(n => !n.out && n.len >= 2 && n.step * M.step > v.t0 + w * 0.2 && n.step * M.step < v.t0 + w * 0.55);
    return { step: M.step, pxs: v.pxs, lns: inView.map(n => n.ln) }; });
  if (NV.lns.length < 3) throw new Error('fewer than three notes in view: ' + JSON.stringify(NV));
  const nb = ln => ev(ln => REEL_NOTES.box(ln), ln);
  await until(45.6);
  await cap('N', 'Notes', 'Click a note to hear it; drag it later, or up to the next note of the key');
  let b1 = await nb(NV.lns[0]);
  await clickAt(b1.x + Math.min(10, b1.w / 2), b1.y + b1.h / 2, 500);
  await sleep(450);
  b1 = await nb(NV.lns[0]);
  await drag(b1.x + Math.min(10, b1.w / 2), b1.y + b1.h / 2, 2 * NV.step * NV.pxs, -b1.h, 700);
  await settled().catch(() => {});
  await sleep(250);
  const movedNote = (await ev(() => REEL_NOTES.selection))[0];
  await until(48.8);
  await cap('N', 'Notes', 'Drag its edge to hold it longer; faint under every note, what was sung');
  const b2 = await nb(movedNote);
  await drag(b2.x + b2.w - 3, b2.y + b2.h / 2, 2 * NV.step * NV.pxs, 0, 600);
  await settled().catch(() => {});
  await sleep(300);
  await clickSel('#reel-notes .nt-bar button[title^="what was sung"]', 400);   // Sung off, then on: the reference under the notes
  await sleep(500);
  await clickSel('#reel-notes .nt-bar button[title^="what was sung"]', 250);
  await snap('s7-edit');
  await until(52.4);
  await cap('N', 'Notes', 'Box a phrase, then set its level at the foot, all of it together');
  const ba = await nb(NV.lns[1]), bz = await nb(NV.lns[NV.lns.length - 1]);
  const bx0 = Math.min(ba.x, bz.x) - 8, bx1 = Math.max(ba.x + ba.w, bz.x + bz.w) + 8, by0 = Math.min(ba.y, bz.y) - 10, by1 = Math.max(ba.y, bz.y) + 22;
  await drag(bx0, by0, bx1 - bx0, by1 - by0, 650);
  await sleep(250);
  const stem = await ev(ln => { const b = REEL_NOTES.box(ln), r = document.querySelector('#reel-notes .nt-roll canvas').getBoundingClientRect(), v = REEL_NOTES.view; return { x: b.x + 1, y: r.bottom - v.velH / 2 }; }, NV.lns[1]);
  await drag(stem.x, stem.y, 0, 12, 500);
  await settled().catch(() => {});
  await snap('s7-velocity');
  await until(56.0);
  await cap('Q', 'Notes', 'Q snaps the starts to the grid; play it, and the roll follows');
  await key('q');
  await settled().catch(() => {});
  await sleep(300);
  await ev(() => REEL_LIVE.setPlaying(true));
  await glide(VW * 0.5, VH - 60, 900);
  await snap('s7-play');
  await until(61.0);

  // 8 ── the synth rack ─────────────────────────────────────────────────
  await cap('M', 'Synth rack', 'Every sound is built from numbers: hear a pad, turn a knob');
  await key('n');                                   // the notes shut
  await ev(() => REEL_LIVE.setPlaying(false));
  await key('m');
  await sleep(500);
  await clickSel('#reel-rack .rk-prow[data-part="drums"] .rk-tile >> nth=0 >> button', 400);
  await sleep(450);
  const knob = page.locator('#reel-rack .rk-knob').filter({ has: page.locator('.l', { hasText: /^freq$/ }) }).first();
  await knob.scrollIntoViewIfNeeded();
  const kb = await knob.boundingBox();
  await drag(kb.x + kb.width / 2, kb.y + 16, 0, -60, 560);
  await snap('s8-rack');
  await until(65.2);

  // 9 ── one undo ───────────────────────────────────────────────────────
  await cap('⌘Z', 'Undo', 'One Undo takes back every edit: words, scenes, fish, music, notes');
  await key('m');
  await sleep(300);
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Control+z'); await sleep(70); }
  await settled();
  await snap('s9-undo');
  await until(68.0);

  // 10 ── export ────────────────────────────────────────────────────────
  await cap('X', 'Export', 'Ask Claude to render what you saved; play or download the film');
  await key('x');
  await page.waitForSelector('#reel-ex .ex-film [data-film="play"]', { timeout: 8000 });
  await glide(...(await centre('#reel-ex .ex-go')), 500);
  await sleep(900);
  await ev(() => REEL_LIVE.setPlaying(false));      // the preview rests while the film plays
  await clickSel('#reel-ex .ex-film [data-film="play"]', 500);
  // the film's own sound, into the recording too
  await ev(() => { const v = document.querySelector('#reel-ex .ex-film video'); if (!v) return;
    try { v.currentTime = 2.6; } catch (e) { /* not loaded yet */ }      // from the title: the film's first seconds are the dark opening
    if (!window.__dest) return; try { const c = REEL_RACK.ctx, src = c.createMediaElementSource(v); src.connect(window.__dest); src.connect(c.destination); } catch (e) { console.warn('film sound', e); } });
  await snap('s10-export');
  await until(77.0);
  const story1 = Date.now() / 1000;
  log(`story: ${(story1 - story0).toFixed(1)} s`);

  // ── stop, collect, join ──────────────────────────────────────────────
  if (!DRY) {
    await cdp.send('Page.stopScreencast');
    await sleep(300);
    await Promise.all(pending);
    const b64 = await page.evaluate(() => new Promise(res => { window.__rec.onstop = async () => { const blob = new Blob(window.__chunks, { type: 'audio/webm' }); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); res(btoa(s)); }; window.__rec.stop(); }));
    fs.writeFileSync(path.join(W, 'audio.webm'), Buffer.from(b64, 'base64'));
    // frames to a constant 30 fps over the story: each output frame shows the last frame drawn by then
    const FPS = 30, N = Math.round((story1 - story0) * FPS);
    const shown = [];
    let j = 0;
    for (let k = 0; k < N; k++) {
      const t = story0 + k / FPS;
      while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
      shown.push(frames[j].file);
    }
    const list = [];
    for (let k = 0; k < shown.length;) { let n = 1; while (k + n < shown.length && shown[k + n] === shown[k]) n++; list.push(`file '${shown[k]}'\nduration ${(n / FPS).toFixed(6)}`); k += n; }
    list.push(`file '${shown[shown.length - 1]}'`);
    fs.writeFileSync(path.join(W, 'frames.txt'), list.join('\n') + '\n');
    const used = frames.filter(f => f.t >= story0 && f.t <= story1).length;
    log(`${frames.length} frames cast, ${used} in the story (${(used / (story1 - story0)).toFixed(1)} a second)`);
    const off = (story0 * 1000 - recAt) / 1000;
    const out = OUT, DUR = story1 - story0;
    const pngs = await drawCaptions(CAPS, DUR);
    const ins = pngs.flatMap(c => ['-loop', '1', '-t', DUR.toFixed(3), '-i', c.file]);
    let fc = `[0:v]fps=${FPS},pad=${VW}:${VH + BAND}:0:${BAND}:color=0x020a12[v0]`;
    pngs.forEach((c, i) => { fc += `;[v${i}][${i + 2}:v]overlay=0:0:enable='between(t,${c.from.toFixed(3)},${c.to.toFixed(3)})'[v${i + 1}]`; });
    fc += `;[v${pngs.length}]format=yuv420p[vout]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(W, 'frames.txt'),
      '-ss', off.toFixed(3), '-i', path.join(W, 'audio.webm'), ...ins,
      '-filter_complex', fc, '-map', '[vout]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'animation', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '160k', '-af', 'afade=t=out:st=' + Math.max(0, DUR - 1.2).toFixed(2) + ':d=1.2',
      '-t', DUR.toFixed(3), '-movflags', '+faststart', out], { stdio: 'inherit' });
    log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB');
  }
  const own = errors.filter(e => !/NotSupportedError|no supported source|play\(\) request was interrupted|The element has no supported sources/i.test(e));
  log(own.length ? 'page errors: ' + own.join(' | ') : 'no page errors');
} catch (e) {
  console.log('FAIL ' + (e.stack || e));
  await page.screenshot({ path: path.join(W, 'fail.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  srv.close();
}
