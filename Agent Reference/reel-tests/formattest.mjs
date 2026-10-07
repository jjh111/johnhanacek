// Formats: one script, three frames (Assets/sizzle-reel-2.html ?format=wide|square|vertical).
//   node "Agent Reference/reel-tests/formattest.mjs"
// 1. The rig lays out the frame it was asked for: REEL.size and the #stage box are 1920×1080,
//    1080×1080 and 1080×1920, and an unknown format falls back to wide.
// 2. Square and vertical are laid out, not letterboxed. Every half second of the cut, every
//    piece of copy that has settled (a line at rest in its mask, a chip or card fully in) must lie
//    inside the frame, inside the side margins, and unclipped by its own mask; no two may
//    overlap; and none may overlap a window, port, card or panel it does not belong to.
//    Wide gets the same measurement, printed for information (it is the frame the cut was made
//    in, and its reference is the stills below).
// 3. Wide films exactly as it did before formats existed. The renderer's --stills at one or more
//    moments inside every scene are compared with reference stills in FORMAT_REF (default
//    .local/reel-tests/format/wide-ref/, filmed from the rig before formats; a run that finds
//    none records one from the current rig and says so). A still passes byte-identical, or under
//    2000 pixels off, or at 45 dB PSNR or better. A still with a clip on screen is judged outside
//    the clip's window: the same rig decodes a video frame a little differently run to run
//    (38-43 dB over the whole frame, measured on two runs of the unchanged rig), so the window
//    itself is not evidence either way. The same goes, more mildly, for 1.6 s: the reveal line
//    mid-slide under the zooming camera rasters one of two ways (3712 pixels, 51 dB); the rig
//    before formats does it too, in 2 runs of 4, and each variant is byte-identical across rigs.
// 4. The live preview takes ?format= too: in a 1440×900 window a square or vertical stage scales to
//    fit above the HUD, E opens the timeline and the stage refits above it, and #t= resumes.
// Writes only to .local/reel-tests/format/. One renderer at a time (the machine is shared).
// --layout-only runs 1 and 2 alone (no renders), for the loop of laying a format out.
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVerified } from '../../scripts/serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, '.local/reel-tests/format');
const REF = process.env.FORMAT_REF || join(OUT, 'wide-ref');
const NOW = join(OUT, 'wide-now');
const STILLS = [0.8, 1.6, 4.5, 8.5, 12, 14.5, 17.2, 18.5, 21.2, 21.8, 23.5, 25.5, 27.5, 30.5, 32, 34.5, 36.5, 40, 43, 45, 47, 49, 53.5, 58.5];
const SIZES = { wide: [1920, 1080], square: [1080, 1080], vertical: [1080, 1920] };
mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (c, m, detail = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`); if (!c) fails++; };
const info = m => console.log(`info ${m}`);

const srv = await serveVerified(ROOT);
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true,
  args: proxy ? [`--proxy-server=https=${new URL(proxy).host}`] : [] });

async function openRig(format, [w, h]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());          // layout needs no clips; an aborted clip is ready at once
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?render=1${format ? '&format=' + format : ''}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.REEL || document.getElementById('err'), null, { timeout: 60000, polling: 100 });
  const failed = await page.$eval('#err', e => e.textContent).catch(() => null);
  if (failed) throw new Error(failed);
  await page.evaluate(() => window.REEL.ready);
  // with the clips aborted, a seek never lands; answer it at once so REEL.frame does not wait out its timeout
  await page.evaluate(() => document.querySelectorAll('video').forEach(v => Object.defineProperty(v, 'currentTime', {
    get() { return this.__ct || 0; }, set(x) { this.__ct = x; this.dispatchEvent(new Event('seeked')); } })));
  return { ctx, page, errors };
}

// Everything on screen at time t that reads as copy, and every block copy must keep off.
// Settled: visible, fully opaque, and (for a masked line) at rest in its mask.
function measure() {
  const stage = document.getElementById('stage');
  const S = stage.getBoundingClientRect();
  const on = [...document.querySelectorAll('.seg.on')];
  const opacity = el => { let o = 1; for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none') return 0; o *= +cs.opacity; } return o; };
  const shown = el => getComputedStyle(el).visibility === 'visible' && opacity(el) > 0.97;
  const r = el => { const b = el.getBoundingClientRect(); return { x: b.left - S.left, y: b.top - S.top, w: b.width, h: b.height }; };
  const name = el => (el.className && el.className.baseVal == null ? el.className : el.tagName) + ': ' + (el.textContent || '').trim().slice(0, 36);
  const texts = [], blocks = [];
  let id = 0;
  const tag = el => el.__fid || (el.__fid = ++id);
  // what shows of a box inside a window or port is what the window lets through (a pane pushed half out)
  const seen = (el, b) => { const w = el.closest('.win, .port'); if (!w) return b; const c = r(w);
    const x0 = Math.max(b.x, c.x), y0 = Math.max(b.y, c.y), x1 = Math.min(b.x + b.w, c.x + c.w), y1 = Math.min(b.y + b.h, c.y + c.h);
    return x1 - x0 > 1 && y1 - y0 > 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; };
  for (const seg of on) {
    for (const lm of seg.querySelectorAll('.lm')) {
      const li = lm.querySelector(':scope > .li') || lm;
      if (!shown(li)) continue;
      const tf = getComputedStyle(li).transform;
      if (tf !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(tf)) continue;       // still moving
      if (lm.parentElement.closest('.lm')) continue;                                // a line inside a line is measured with it
      const box = seen(lm, r(li)), mask = r(lm);
      if (!box) continue;
      // a mask cuts its line off: too long for it, or squeezed shorter than the line (a flex column out of room)
      const clipped = (!lm.classList.contains('inl') && getComputedStyle(lm).display === 'block' && box.x + box.w > mask.x + mask.w + 1)
        || box.y < mask.y - 1 || box.y + box.h > mask.y + mask.h + 1;
      const host = lm.closest('.win, .port, .plan, .panel, .intent');
      texts.push({ id: tag(lm), what: name(lm), box, clipped, owner: host ? tag(host) : 0, hostBox: host && !host.matches('.win, .port') ? r(host) : null });
    }
    for (const el of seg.querySelectorAll('.stat .num, .wall li, .wbadge, .status')) {
      if (!shown(el)) continue;
      const tf = getComputedStyle(el).transform;
      if (tf !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(tf)) continue;
      const host = el.closest('.win, .port, .plan, .panel, .intent'), box = seen(el, r(el));
      if (!box) continue;
      texts.push({ id: tag(el), what: name(el), box, clipped: false, owner: host ? tag(host) : 0, free: el.classList.contains('wbadge') });
    }
    for (const el of seg.querySelectorAll('.win, .port, .plan, .panel, .intent')) {
      if (getComputedStyle(el).visibility !== 'visible' || opacity(el) < 0.5) continue;
      const b = r(el);
      if (b.w > 20 && b.h > 20) blocks.push({ id: tag(el), what: el.className, box: b });
    }
  }
  for (const el of document.querySelectorAll('#tiers .tier, #bar .q')) {
    if (!shown(el)) continue;
    const tf = getComputedStyle(el).transform;
    if (tf !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(tf)) continue;       // a chip mid-pop (its overshoot is motion)
    texts.push({ id: tag(el), what: name(el), box: r(el), clipped: false, owner: -1 });
  }
  return { S: { w: S.width, h: S.height }, texts, blocks };
}

const overlap = (a, b, pad = 2) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > pad && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > pad;
const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const f1 = b => `[${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}]`;

const clipRects = {};                                        // wide, per still: where clips play
try {
  // ── 1. the frame per format ────────────────────────────────────────
  for (const [fmt, size] of [...Object.entries(SIZES), ['bogus', SIZES.wide]]) {
    const { ctx, page } = await openRig(fmt === 'wide' ? null : fmt, size);
    const got = await page.evaluate(() => ({ size: window.REEL.size, format: window.REEL.format, box: (b => [b.width, b.height])(document.getElementById('stage').getBoundingClientRect()) }));
    const want = fmt === 'bogus' ? 'wide' : fmt;
    ok(got.format === want && got.size[0] === size[0] && got.size[1] === size[1] && got.box[0] === size[0] && got.box[1] === size[1],
      `${fmt === 'wide' ? 'no format' : '?format=' + fmt}: the rig lays out ${want} at ${size.join('×')}`, `(REEL ${got.format} ${got.size.join('×')}, stage ${got.box.join('×')})`);
    await ctx.close();
  }

  // ── 2. every settled piece of copy in the frame, apart ────────────
  for (const fmt of ['square', 'vertical', 'wide']) {
    const size = SIZES[fmt], M = fmt === 'wide' ? 96 : 72;
    const { ctx, page, errors } = await openRig(fmt === 'wide' ? null : fmt, size);
    const dur = await page.evaluate(() => window.REEL.duration);
    const scenes = await page.evaluate(() => window.REEL.debug.scenes.map(s => ({ type: s.type, start: s.start, end: s.end })));
    const bad = [];
    let measured = 0;
    const times = [];
    for (let t = 0.5; t < dur; t += 0.5) times.push(t);
    if (fmt === 'wide') for (const t of STILLS) times.push(t);
    times.sort((a, b) => a - b);
    for (const t of [...new Set(times)]) {
      await page.evaluate(t => window.REEL.frame(t), t);
      const m = await page.evaluate(measure);
      if (fmt === 'wide' && STILLS.includes(t)) clipRects[t] = await page.evaluate(() => {
        const S = document.getElementById('stage').getBoundingClientRect();
        return [...document.querySelectorAll('.seg.on video')].filter(v => v.closest('.layer') && getComputedStyle(v.closest('.layer')).visibility === 'visible')
          .map(v => (v.closest('.win, .port, .thumb') || v).getBoundingClientRect()).map(b => ({ x: b.left - S.left, y: b.top - S.top, w: b.width, h: b.height }));
      });
      if (fmt === 'wide' && !Number.isInteger(t * 2)) continue;   // the stills' extra moments are for the clips only
      const sc = scenes.find(s => t >= s.start && t < s.end);
      const at = `${t.toFixed(1)} s ${sc ? sc.type : ''}`;
      const frame = { x: 0, y: 0, w: size[0], h: size[1] }, band = { x: M, y: 0, w: size[0] - 2 * M, h: size[1] };
      for (const x of m.texts) {
        measured++;
        if (!inside(x.box, frame)) bad.push(`${at}: out of frame ${x.what} ${f1(x.box)}`);
        else if (!inside(x.box, band)) bad.push(`${at}: outside the margins ${x.what} ${f1(x.box)}`);
        if (x.hostBox && !inside(x.box, x.hostBox)) bad.push(`${at}: spills out of its card ${x.what} ${f1(x.box)}`);
        if (x.clipped) bad.push(`${at}: clipped by its mask ${x.what} ${f1(x.box)}`);
      }
      for (let i = 0; i < m.texts.length; i++) for (let j = i + 1; j < m.texts.length; j++) {
        const a = m.texts[i], b = m.texts[j];
        if (overlap(a.box, b.box) && !inside(a.box, b.box) && !inside(b.box, a.box)) bad.push(`${at}: ${a.what} ${f1(a.box)} overlaps ${b.what} ${f1(b.box)}`);
      }
      for (const x of m.texts) for (const b of m.blocks) if (x.owner !== b.id && !x.free && overlap(x.box, b.box, 4)) bad.push(`${at}: ${x.what} ${f1(x.box)} overlaps the ${b.what} ${f1(b.box)}`);
    }
    const uniq = [...new Set(bad)];
    if (fmt === 'wide') { info(`wide: ${measured} settled boxes measured, ${uniq.length} findings${uniq.length ? ':\n       ' + uniq.slice(0, 12).join('\n       ') : ''}`); }
    else {
      ok(measured > 400, `${fmt}: ${measured} settled pieces of copy measured across ${times.length} moments`);
      ok(uniq.length === 0, `${fmt}: every piece inside the frame and its margins, unclipped, apart from each other and from the work`,
        uniq.length ? '\n       ' + uniq.slice(0, 30).join('\n       ') + (uniq.length > 30 ? `\n       … ${uniq.length - 30} more` : '') : '');
    }
    ok(errors.length === 0, `${fmt}: the rig ran without page errors`, errors.join('; '));
    await ctx.close();
  }
  // ── 4. the live preview fits any format in the window, with its HUD and timeline ──
  for (const fmt of ['vertical', 'square']) {
    const [w, h] = SIZES[fmt];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?format=${fmt}#t=24&pause=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.REEL_LIVE && document.getElementById('reel-tl'), null, { timeout: 60000 });
    const box = () => page.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(), hud = document.getElementById('hud');
      return { x: b.left, y: b.top, w: b.width, h: b.height, hud: !hud.hidden, hudTop: hud.getBoundingClientRect().top }; });
    const a = await box();
    // the HUD's strip is kept clear: the stage fits the window above it (the HUD never covers the tank)
    ok(a.hud && Math.abs(a.w / a.h - w / h) < 0.01 && a.x >= -0.5 && a.y >= -0.5 && a.x + a.w <= 1440.5 && a.y + a.h <= a.hudTop + 0.5 && (Math.abs(a.h - a.hudTop) < 1 || Math.abs(a.w - 1440) < 1),
      `live ?format=${fmt}: the ${w}×${h} stage scales to fit a 1440×900 window above the HUD`, `(stage ${Math.round(a.x)},${Math.round(a.y)} ${Math.round(a.w)}×${Math.round(a.h)}, HUD from ${Math.round(a.hudTop)})`);
    await page.keyboard.press('e');
    await page.waitForFunction(() => !document.getElementById('reel-tl').hidden, null, { timeout: 5000 }).catch(() => {});
    // the music lanes join the panel when the synth rack has read the score (a moment later, and
    // longer for a longer score: John's sung take, 2026-10-05), and the stage refits again then;
    // so wait for the rack, and read the stage and the panel in the same frame
    await page.waitForFunction(() => window.REEL_RACK, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const [b, tl] = await page.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(), hud = document.getElementById('hud'), r = document.getElementById('reel-tl').getBoundingClientRect();
      return [{ x: s.left, y: s.top, w: s.width, h: s.height, hud: !hud.hidden, hudTop: hud.getBoundingClientRect().top },
        { top: r.top, hidden: document.getElementById('reel-tl').hidden, blocks: document.querySelectorAll('#reel-tl .tl-scene, #reel-tl [class*=scene]').length }]; });
    ok(!tl.hidden && b.y + b.h <= tl.top + 0.5 && Math.abs(b.w / b.h - w / h) < 0.01 && b.h < a.h,
      `live ?format=${fmt}: E opens the timeline and the stage refits above it`, `(stage bottom ${Math.round(b.y + b.h)}, panel top ${Math.round(tl.top)})`);
    await page.screenshot({ path: join(OUT, `live-${fmt}-timeline.png`) });
    const t = await page.evaluate(() => window.REEL_LIVE.now());
    ok(Math.abs(t - 24) < 0.01 && errors.length === 0, `live ?format=${fmt}: resumed paused at #t=24 without page errors`, `(t ${t}${errors.length ? ', ' + errors.join('; ') : ''})`);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.stop();
}

// ── 3. wide films as it did ─────────────────────────────────────────
if (process.argv.includes('--layout-only')) {            // while laying out: parts 1 and 2 alone
  console.log(fails ? `\n${fails} failed (layout only)` : '\nall passed (layout only)');
  process.exit(fails ? 1 : 0);
}
const pngs = dir => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.png')).sort() : [];
rmSync(NOW, { recursive: true, force: true });
// REEL_FONT_CACHE: the stills are set with the font files the references were (scripts/font-pin.mjs):
// a reference filmed in an earlier run, with whatever Google answered then, is still comparable
const r = spawnSync('node', ['scripts/render-sizzle-reel.mjs', '--cut=2', '--stills=' + STILLS.join(','), '--out=' + join(NOW, 'x.mp4')],
  { cwd: ROOT, env: { ...process.env, REEL_FONT_CACHE: '.local/reel-tests/fonts' }, encoding: 'utf8', timeout: 600000 });
ok(r.status === 0, 'wide stills rendered', r.status ? (r.stderr || '').trim().split('\n').slice(-4).join(' / ') : '');
if (!pngs(REF).length) {
  mkdirSync(REF, { recursive: true });
  cpSync(join(NOW, 'stills'), REF, { recursive: true });
  info(`no reference stills in ${REF}: recorded the current rig's as the reference (later runs compare with them)`);
}
const raw = f => spawnSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 27 }).stdout;
const W = 1920;
for (const f of pngs(join(NOW, 'stills'))) {
  const t = parseFloat(f.match(/-([\d.]+)s\.png$/)[1]), g = join(REF, f);
  if (!existsSync(g)) { ok(false, `wide ${t} s: no reference still ${f}`); continue; }
  if (readFileSync(join(NOW, 'stills', f)).equals(readFileSync(g))) { ok(true, `wide ${t} s: byte-identical`); continue; }
  const x = raw(join(NOW, 'stills', f)), y = raw(g);
  if (!x || !y || x.length !== y.length) { ok(false, `wide ${t} s: the stills differ in size`); continue; }
  const clips = (clipRects[t] || []).map(c => ({ x: c.x - 3, y: c.y - 3, w: c.w + 6, h: c.h + 6 }));
  const inClip = (px, py) => clips.some(c => px >= c.x && px < c.x + c.w && py >= c.y && py < c.y + c.h);
  let n = 0, nOut = 0, se = 0;
  for (let i = 0, p = 0; i < x.length; i += 3, p++) {
    let d = 0;
    for (let c = 0; c < 3; c++) { const e = x[i + c] - y[i + c]; se += e * e; if (Math.abs(e) > d) d = Math.abs(e); }
    if (d) { n++; if (!inClip(p % W, Math.floor(p / W))) nOut++; }
  }
  const psnr = 10 * Math.log10(255 * 255 / (se / x.length));
  if (n < 2000 || psnr >= 45) ok(true, `wide ${t} s: ${n} pixels off, ${psnr.toFixed(1)} dB (noise)`);
  else ok(clips.length > 0 && nOut < 2000, `wide ${t} s: ${n} pixels off (${psnr.toFixed(1)} dB), ${nOut} of them outside the ${clips.length} clip window${clips.length === 1 ? '' : 's'}`,
    clips.length ? '' : '(no clip on screen: a real change)');
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
