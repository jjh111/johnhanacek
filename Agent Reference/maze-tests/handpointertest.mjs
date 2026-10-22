// handpointertest — scripts/hand-pointer.js on the real pages.
//
// Part 1 drives the module's feed() seam with synthetic hands (21 landmarks
// laid out like an open right hand, the nib between thumb and index tip, a
// pinch gap), so every stroke goes through the module's own mapping, filters,
// pinch hysteresis, string and MouseEvent dispatch into the page's real
// startDraw/draw/endDraw, and asserts:
//   1. the webcam button is on both pages (fine pointer), unpressed, and the
//      command bar knows "Draw with your hand"
//   2. an open hand hovers: mousemoves reach the canvas, the pen stays up
//   3. a pinched loop spawns a fish (index) / a pinched box makes a wall (design)
//   4. a quick pinch in place drops food (index)
//   5. a hand lost mid-stroke lifts the pen; the HUD's off switch turns it all off
//   6. one scale: a circle drawn arrives round on a 4:3 window
//   7. steady ink: a shaking hand draws a straight line straight
//   8. no hook: fingers parting to lift do not drag the stroke's end
//   9. depth: the drawn hand doubles when the hand comes twice as near, and
//      stops at GHOST_MAX
//  10. on a touch device the button stays hidden and the command is absent
// Part 2 turns the button on with Chromium's fake camera and no model (the
// downloads refused or held): the camera must end when the model fails, and
// end at once when the button goes off mid-load.
// Part 3 turns it on for real, with the MediaPipe bundle + model served from
// .local/handpointer/ (an environment that refuses jsDelivr): camera starts,
// the model loads, detection runs on frames and the status reaches "show your
// hand". Skipped when that cache is absent:
//   npm pack @mediapipe/tasks-vision@0.10.14 → .local/handpointer/tasks-vision/
//   hand_landmarker.task                     → .local/handpointer/
//
//   node "Agent Reference/maze-tests/handpointertest.mjs"   (exit 1 on any failure)

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { serveVerified } from '../../scripts/serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MP = resolve(ROOT, '.local/handpointer');
const srv = await serveVerified(ROOT);
const BASE = `http://127.0.0.1:${srv.port}`;
const exe = process.env.CHROMIUM_PATH || chromium.executablePath();

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failures++; };

// In the page: a hand whose nib lands on screen point (x, y), fed at 30 fps
// through the module's own seam. S is the palm (wrist to middle knuckle) in
// frame heights: bigger is nearer the camera. lean 1 keeps the thumb tip on
// (x, y) and moves only the index finger, as a real pinch does. noise shakes
// every landmark by up to that many screen px, the way a tracker does.
const HELPERS = () => {
    const J = [[0, 0], [-0.35, -0.15], [-0.6, -0.35], [-0.75, -0.55], null,
        [-0.35, -0.9], [-0.4, -1.25], [-0.42, -1.45], null,
        [0, -1], [0, -1.4], [0, -1.65], [0, -1.85],
        [0.3, -0.92], [0.32, -1.3], [0.33, -1.5], [0.34, -1.68],
        [0.35, -0.8], [0.42, -1.05], [0.45, -1.22], [0.48, -1.38]];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    window.__hand = (hp, aspect = 4 / 3) => {
        hp.setAspect(aspect);
        const marks = (x, y, pinch, { S = 0.12, lean = 0, noise = 0 } = {}) => {
            const n = hp.fromScreen(x, y);
            const perPx = (hp.fromScreen(x + 100, y).u - n.u) * aspect / 100;
            const X = n.u * aspect, Y = n.v, gap = pinch * S;
            const tx = X - gap / 2 + lean * gap / 2, ix = tx + gap;
            const wrist = { x: ix + 0.44 * S, y: Y + 1.62 * S };
            const sq = J.map(j => j && { x: wrist.x + j[0] * S, y: wrist.y + j[1] * S });
            sq[4] = { x: tx, y: Y };
            sq[8] = { x: ix, y: Y };
            return sq.map(p => ({ x: 1 - (p.x + 2 * rnd() * noise * perPx) / aspect, y: p.y + 2 * rnd() * noise * perPx, z: 0 }));
        };
        return {
            // Real time, 30 fps: the engine's classifier reads stroke timing,
            // and the module's rAF loop retires a hand that stops arriving
            async frame(x, y, pinch, opts) { hp.feed(marks(x, y, pinch, opts), performance.now()); await new Promise(r => setTimeout(r, 33)); },
        };
    };
    // Every pointer event the canvas receives, in order
    window.__track = () => {
        const c = document.getElementById('heroCanvas');
        window.__ev = { move: 0, down: 0, up: 0, pts: [] };
        for (const type of ['mousemove', 'mousedown', 'mouseup']) {
            c.addEventListener(type, e => {
                window.__ev[type.slice(5)]++;
                window.__ev.pts.push({ type, x: e.clientX, y: e.clientY });
            });
        }
    };
    // The stroke between the last mousedown and the mouseup after it
    window.__lastStroke = () => {
        const p = window.__ev.pts;
        let d = -1;
        for (let i = p.length - 1; i >= 0; i--) if (p[i].type === 'mousedown') { d = i; break; }
        if (d < 0) return [];
        const out = [];
        for (let i = d; i < p.length; i++) { out.push(p[i]); if (p[i].type === 'mouseup') break; }
        return out;
    };
};

// Plays a path of { x, y, pinch?, S?, lean?, noise? } frames; `pinchOf(i, n)` fills a missing pinch
async function play(pg, path, pinchOf = () => 1.0) {
    return pg.evaluate(async ([path, pinchSrc]) => {
        const hp = document.querySelector('[data-hand-pointer]')._handPointer;
        const h = window.__hand(hp);
        const pinchOf = new Function('i', 'n', `return (${pinchSrc})(i, n)`);
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            await h.frame(p.x, p.y, p.pinch ?? pinchOf(i, path.length), { S: p.S, lean: p.lean, noise: p.noise });
        }
        return hp.down;
    }, [path, pinchOf.toString()]);
}
const hp = (pg, expr) => pg.evaluate(new Function(`const hp = document.querySelector('[data-hand-pointer]')._handPointer; return (${expr});`));

const box = (x, y, w, h) => {
    const c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + 2]];
    const out = [];
    for (let k = 0; k < 4; k++) for (let i = 0; i < 12; i++) {
        const [ax, ay] = c[k], [bx, by] = c[k + 1];
        out.push({ x: ax + (bx - ax) * i / 12, y: ay + (by - ay) * i / 12 });
    }
    out.push({ x, y: y + 2 });
    return out;
};
const still = (x, y, n, extra = {}) => Array.from({ length: n }, () => ({ x, y, ...extra }));
const ready = async (pg, file) => {
    await pg.addInitScript(HELPERS);
    await pg.goto(`${BASE}/${file}`, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => document.querySelector('[data-hand-pointer]')?._handPointer, null, { timeout: 15000 });
    await pg.waitForTimeout(1200);
};

const browser = await chromium.launch({ executablePath: exe });

// ---------------------------------------------------------------- part 1
for (const file of ['index.html', 'design.html']) {
    console.log(`\n${file} — synthetic hands`);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await ready(pg, file);

    const btn = await pg.evaluate(() => {
        const b = document.querySelector('.hero-cam-toggle'), t = document.querySelector('.hero-theme-toggle');
        if (!b) return null;
        const r = b.getBoundingClientRect(), q = t && t.getBoundingClientRect();
        return { shown: !b.hidden && getComputedStyle(b).display !== 'none', pressed: b.getAttribute('aria-pressed'),
            leftOfTheme: !!q && Math.round(r.top) === Math.round(q.top) && r.right <= q.left && q.left - r.right < 16,
            oldSwitch: !!document.querySelector('.hand-toggle') };
    });
    check(btn && btn.shown && btn.pressed === 'false' && btn.leftOfTheme && !btn.oldSwitch,
        `the webcam button shows beside the theme toggle, unpressed (${JSON.stringify(btn)})`);
    const cmd = await pg.evaluate(() => (window.JH_COMMANDS || []).some(c => c.id === 'hand.draw'));
    check(cmd, 'the command bar knows "Draw with your hand"');

    await pg.evaluate(() => { window.__track(); document.querySelector('[data-hand-pointer]')._handPointer.start({ camera: false }); });
    const layer = await pg.evaluate(() => !!document.querySelector('.hand-layer') && !!document.querySelector('.hand-hud .hand-hud-off'));
    check(layer, 'start() mounts the presence layer and the HUD with its off switch');

    // 2. hover
    const hoverDown = await play(pg, Array.from({ length: 20 }, (_, i) => ({ x: 300 + i * 20, y: 600 })));
    const ev = await pg.evaluate(() => window.__ev);
    check(!hoverDown && ev.move >= 18 && ev.down === 0, `an open hand hovers (${ev.move} moves, ${ev.down} downs)`);
    // The layer actually paints the ghost: non-empty pixels around the nib
    await play(pg, still(680, 600, 6));
    const inked = await pg.evaluate(() => {
        const l = document.querySelector('.hand-layer'); const c = l.getContext('2d');
        const s = l.width / innerWidth;
        const d = c.getImageData(Math.round(560 * s), Math.round(480 * s), Math.round(240 * s), Math.round(300 * s)).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
        return n;
    });
    check(inked > 40, `the ghost hand and nib are drawn (${inked} px)`);

    if (file === 'index.html') {
        // 3. loop → fish
        const before = await pg.evaluate(() => window.heroFish.state.fish.length);
        // The guide's own fish mark (jh-strokes.js): an open loop whose ends cross into a tail
        const fishMark = await pg.evaluate(() => window.JHStrokes.points.loop(900, 500, 2));
        const end = fishMark[fishMark.length - 1];
        const path = [...still(fishMark[0].x, fishMark[0].y, 5), ...fishMark, ...still(end.x, end.y, 4)];
        const n = path.length;
        await play(pg, path, (i, n) => (i < 2 || i >= n - 3) ? 1.0 : 0.1);
        await pg.waitForTimeout(400);
        const after = await pg.evaluate(() => window.heroFish.state.fish.length);
        check(after === before + 1, `a pinched loop spawns a fish (${before} → ${after}, ${n} frames)`);

        // 4. quick pinch in place → food
        const food0 = await pg.evaluate(() => window.heroFish.state.food.length);
        await play(pg, still(500, 450, 8), (i) => (i >= 2 && i < 5) ? 0.1 : 1.0);
        await pg.waitForTimeout(100);
        const food1 = await pg.evaluate(() => window.heroFish.state.food.length);
        check(food1 > food0, `a quick pinch drops food (${food0} → ${food1})`);
    } else {
        // 3. box → wall
        const s0 = await pg.evaluate(() => window.JH_SCENE.census().shapes.length);
        const path = [...still(500, 380, 5), ...box(500, 380, 260, 200), ...still(500, 382, 4)];
        await play(pg, path, (i, n) => (i < 2 || i >= n - 3) ? 1.0 : 0.1);
        await pg.waitForTimeout(800);
        const shapes = await pg.evaluate(() => window.JH_SCENE.census().shapes);
        check(shapes.length === s0 + 1, `a pinched box becomes a wall (${s0} → ${shapes.length}: ${shapes.map(s => s.type).join(',')})`);
    }

    // 5. lost mid-stroke
    const midDown = await play(pg, [...still(400, 300, 4), ...Array.from({ length: 8 }, (_, i) => ({ x: 400 + i * 15, y: 300 }))], (i) => i < 2 ? 1.0 : 0.1);
    await pg.waitForTimeout(400);    // no frames: the module's own loop retires the hand
    const lost = await hp(pg, 'hp.down');
    check(midDown && !lost, 'a hand lost mid-stroke lifts the pen');
    const ev2 = await pg.evaluate(() => window.__ev);
    check(ev2.down === ev2.up, `every mousedown got its mouseup (${ev2.down}/${ev2.up})`);

    await pg.click('.hand-hud-off');
    const off = await pg.evaluate(() => ({
        on: document.querySelector('[data-hand-pointer]')._handPointer.on,
        layer: !!document.querySelector('.hand-layer'), hud: !!document.querySelector('.hand-hud'),
        pressed: document.querySelector('.hero-cam-toggle').getAttribute('aria-pressed'),
    }));
    check(!off.on && !off.layer && !off.hud && off.pressed === 'false', `the HUD's off switch turns it all off (${JSON.stringify(off)})`);
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
}

{
    // A 4:3 window, where a box stretched to the canvas would squash a circle
    console.log('\nindex.html — one scale, steady ink, no hook, depth (1200 × 900)');
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await ready(pg, 'index.html');
    await pg.evaluate(() => { window.__track(); document.querySelector('[data-hand-pointer]')._handPointer.start({ camera: false }); });
    const T = await pg.evaluate(() => window.JHHandPointer.T);

    // 6. a circle
    const ring = Array.from({ length: 64 }, (_, i) => ({ x: 600 + 150 * Math.cos(i / 60 * 2 * Math.PI), y: 450 + 150 * Math.sin(i / 60 * 2 * Math.PI) }));
    await play(pg, [...still(750, 450, 5), ...ring, ...still(ring[63].x, ring[63].y, 5)], (i, n) => (i < 2 || i >= n - 3) ? 1.0 : 0.1);
    const round = await pg.evaluate(() => {
        const s = window.__lastStroke().filter(p => p.type !== 'mouseup');
        const xs = s.map(p => p.x), ys = s.map(p => p.y);
        return { n: s.length, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    });
    const ratio = round.w / round.h;
    check(round.n > 20 && ratio > 0.94 && ratio < 1.06, `a circle arrives round (${round.w.toFixed(0)} × ${round.h.toFixed(0)} px, ${ratio.toFixed(3)})`);
    await pg.waitForTimeout(600);

    // 7. a shaking hand on a straight line
    const NOISE = 6;
    const line = Array.from({ length: 50 }, (_, i) => ({ x: 380 + i * 9, y: 300, noise: NOISE }));
    await play(pg, [...still(380, 300, 6, { noise: NOISE }), ...line, ...still(380 + 49 * 9, 300, 5, { noise: NOISE })], (i, n) => (i < 2 || i >= n - 3) ? 1.0 : 0.1);
    const steady = await pg.evaluate(() => {
        const s = window.__lastStroke().filter(p => p.type === 'mousemove');
        const inner = s.slice(Math.floor(s.length * 0.15), Math.ceil(s.length * 0.85));
        const rms = Math.sqrt(inner.reduce((a, p) => a + (p.y - 300) ** 2, 0) / Math.max(1, inner.length));
        let maxStep = 0;
        for (let i = 1; i < inner.length; i++) maxStep = Math.max(maxStep, Math.abs(inner[i].y - inner[i - 1].y));
        return { n: inner.length, rms, maxStep };
    });
    check(steady.n > 15 && steady.rms < 1.5 && steady.maxStep < 1.5,
        `a hand shaking ±${NOISE} px draws a straight line (off the line ${steady.rms.toFixed(2)} px RMS, steps ≤ ${steady.maxStep.toFixed(2)} px, ${steady.n} points)`);
    await pg.waitForTimeout(600);

    // 8. lift: the index opens away from a still thumb, which drags the nib right
    const lift = [
        ...still(300, 650, 5),
        ...Array.from({ length: 20 }, (_, i) => ({ x: 300 + i * 10, y: 650, pinch: 0.1, lean: 1 })),
        ...still(490, 650, 4, { pinch: 0.1, lean: 1 }),
        ...[0.2, 0.3, 0.45, 0.6, 0.8, 1.0, 1.0, 1.0].map(p => ({ x: 490, y: 650, pinch: p, lean: 1 })),
    ];
    await play(pg, lift, (i) => i < 2 ? 1.0 : 0.1);
    const hook = await pg.evaluate(() => {
        const s = window.__lastStroke();
        const up = s[s.length - 1], held = s.filter(p => p.type === 'mousemove');
        return { up: up && up.type, x: up && up.x, maxX: Math.max(...held.map(p => p.x)) };
    });
    // The nib at full opening sits gap/2 to the thumb's right: where an unheld pen would have gone
    const drag = await pg.evaluate(() => {
        const hp = document.querySelector('[data-hand-pointer]')._handPointer;
        const a = hp.fromScreen(490, 650), perPx = (hp.fromScreen(590, 650).u - a.u) * (4 / 3) / 100;
        return 1.0 * 0.12 / 2 / perPx;
    });
    check(hook.up === 'mouseup' && hook.maxX < 490 + 4,
        `fingers parting to lift draw no hook (the stroke ends at x ${hook.x.toFixed(0)}, furthest ${hook.maxX.toFixed(0)}; the thumb is at 490, an unheld pen would reach ${(490 + drag).toFixed(0)})`);
    await pg.waitForTimeout(400);

    // 9. depth
    const palmAt = async S => { await play(pg, still(600, 450, 24, { S })); return hp(pg, 'hp.palm'); };
    const near = await palmAt(0.16), far = await palmAt(0.08), closest = await palmAt(0.6);
    const maxPalm = T.GHOST_MAX * 900;
    check(far > 30 && near / far > 1.85 && near / far < 2.15,
        `the drawn hand grows as the hand nears the camera (palm ${far.toFixed(0)} px → ${near.toFixed(0)} px, ×${(near / far).toFixed(2)})`);
    check(Math.abs(closest - maxPalm) < 1, `and stops at GHOST_MAX (${closest.toFixed(0)} px of ${maxPalm.toFixed(0)})`);
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
}

{
    console.log('\nindex.html — touch device');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(1200);
    const t = await pg.evaluate(() => {
        const b = document.querySelector('.hero-cam-toggle');
        return { hidden: !b || b.hidden || getComputedStyle(b).display === 'none', cmd: (window.JH_COMMANDS || []).some(c => c.id === 'hand.draw') };
    });
    check(t.hidden, 'the webcam button stays hidden on a coarse pointer');
    check(!t.cmd, 'and the command bar does not offer "Draw with your hand" there');
    await ctx.close();
}
await browser.close();

// ---------------------------------------------------------------- part 2
{
    console.log('\nindex.html — fake camera, the camera\'s life when the model is not there');
    const cam = await chromium.launch({ executablePath: exe, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const run = async (name, routeFn, act) => {
        const ctx = await cam.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera'] });
        await ctx.route(/cdn\.jsdelivr\.net|storage\.googleapis\.com/, routeFn);
        const pg = await ctx.newPage();
        const errors = [];
        pg.on('pageerror', e => errors.push(e.message));
        await pg.addInitScript(() => {
            window.__tracks = [];
            const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async c => { const s = await gum(c); window.__tracks.push(...s.getTracks()); return s; };
        });
        await pg.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
        await pg.waitForFunction(() => document.querySelector('[data-hand-pointer]')?._handPointer, null, { timeout: 15000 });
        await pg.click('.hero-cam-toggle');
        const r = await act(pg);
        check(errors.length === 0, `${name}: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
        await ctx.close();
        return r;
    };
    const state = pg => pg.evaluate(() => ({
        tracks: window.__tracks.map(t => t.readyState), note: document.querySelector('.hand-hud-note')?.textContent || '',
        pressed: document.querySelector('.hero-cam-toggle').getAttribute('aria-pressed'),
    }));

    const failed = await run('model refused', r => r.abort(), async pg => {
        await pg.waitForFunction(() => document.querySelector('[data-hand-pointer]')._handPointer.status === 'error', null, { timeout: 15000 }).catch(() => {});
        await pg.waitForTimeout(300);
        return state(pg);
    });
    check(failed.tracks.length > 0 && failed.tracks.every(t => t === 'ended') && failed.pressed === 'false' && /could not start/.test(failed.note),
        `the model fails to load: the camera ends, the button is up, the HUD says so (${JSON.stringify(failed)})`);

    const held = await run('model held', () => { /* never answered: the model is still loading */ }, async pg => {
        await pg.waitForFunction(() => window.__tracks.length > 0 && window.__tracks[0].readyState === 'live', null, { timeout: 15000 }).catch(() => {});
        const before = await state(pg);
        await pg.click('.hero-cam-toggle');
        await pg.waitForTimeout(150);
        return { before, after: await state(pg) };
    });
    check(held.before.tracks[0] === 'live' && held.after.tracks.every(t => t === 'ended') && held.after.pressed === 'false',
        `off while the model is still loading ends the camera at once (${JSON.stringify(held)})`);
    await cam.close();
}

// ---------------------------------------------------------------- part 3
const haveMP = existsSync(resolve(MP, 'tasks-vision/vision_bundle.mjs')) && existsSync(resolve(MP, 'hand_landmarker.task'));
if (!haveMP) {
    console.log('\n(part 3 skipped: no .local/handpointer cache)');
} else {
    console.log('\nindex.html — fake camera, real MediaPipe');
    const cam = await chromium.launch({
        executablePath: exe,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    });
    const ctx = await cam.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera'] });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    const types = { mjs: 'text/javascript', js: 'text/javascript', wasm: 'application/wasm' };
    await pg.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@*/**', route => {
        const rel = new URL(route.request().url()).pathname.replace(/^\/npm\/@mediapipe\/tasks-vision@[^/]+\//, '');
        const f = resolve(MP, 'tasks-vision', rel);
        if (!existsSync(f)) return route.fulfill({ status: 404, body: 'missing ' + rel });
        route.fulfill({ status: 200, body: readFileSync(f), headers: { 'content-type': types[rel.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
    });
    await pg.route('https://storage.googleapis.com/mediapipe-models/**', route =>
        route.fulfill({ status: 200, body: readFileSync(resolve(MP, 'hand_landmarker.task')), headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' } }));
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => document.querySelector('[data-hand-pointer]')?._handPointer, null, { timeout: 15000 });
    await pg.waitForTimeout(800);
    await pg.click('.hero-cam-toggle');
    let state = null;
    try {
        await pg.waitForFunction(() => ['seek', 'track', 'error'].includes(document.querySelector('[data-hand-pointer]')._handPointer.status), null, { timeout: 60000 });
    } catch (e) { /* reported below */ }
    state = await pg.evaluate(() => ({ s: document.querySelector('[data-hand-pointer]')._handPointer.status, note: document.querySelector('.hand-hud-note')?.textContent, vw: document.querySelector('.hand-hud video')?.videoWidth, pressed: document.querySelector('.hero-cam-toggle').getAttribute('aria-pressed') }));
    check((state.s === 'seek' || state.s === 'track') && state.pressed === 'true', `camera + model start, the button pressed (${state.s}: "${state.note}", ${state.vw}px video)`);
    await pg.waitForTimeout(1500);
    const still2 = await pg.evaluate(() => document.querySelector('[data-hand-pointer]')._handPointer.status);
    check(still2 === 'seek', `detection runs on the fake feed without finding a hand (${still2})`);
    await pg.click('.hero-cam-toggle');
    await pg.waitForTimeout(200);
    const off = await pg.evaluate(() => ({ on: document.querySelector('[data-hand-pointer]')._handPointer.on, hud: !!document.querySelector('.hand-hud'), pressed: document.querySelector('.hero-cam-toggle').getAttribute('aria-pressed') }));
    check(!off.on && !off.hud && off.pressed === 'false', 'turning it off stops the camera and clears the HUD');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await cam.close();
}

srv.stop();
console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
