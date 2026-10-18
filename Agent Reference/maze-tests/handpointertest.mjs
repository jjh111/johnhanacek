// handpointertest — scripts/hand-pointer.js on the real pages.
//
// Part 1 drives the module's feed() seam with synthetic hands (21 landmarks,
// a nib and a pinch gap), so every stroke goes through the module's own
// mapping, filter, pinch hysteresis and MouseEvent dispatch into the page's
// real startDraw/draw/endDraw, and asserts:
//   1. the Webcam toggle is on both pages (fine pointer) and hidden on touch
//   2. an open hand hovers: mousemoves reach the canvas, the pen stays up
//   3. a pinched loop spawns a fish (index) / a pinched box makes a wall (design)
//   4. a quick pinch in place drops food (index)
//   5. a hand lost mid-stroke lifts the pen; stop() takes the layer and HUD away
// Part 2 turns the toggle on for real with Chromium's fake camera and the
// MediaPipe bundle + model served from .local/handpointer/ (this environment
// refuses jsDelivr): camera starts, the model loads, detection runs on frames
// and the status reaches "show your hand". Skipped when that cache is absent:
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

// In the page: a hand whose nib lands on screen point (x, y) with a given pinch
// gap, fed at 30 fps through the module's own seam.
const HELPERS = () => {
    window.__hand = (hp, aspect = 4 / 3) => {
        const T = window.JHHandPointer.T, B = T.BOX;
        const rect = document.getElementById('heroCanvas').getBoundingClientRect();
        const a = { x0: Math.max(rect.left, 0), y0: Math.max(rect.top, 0), x1: Math.min(rect.right, innerWidth), y1: Math.min(rect.bottom, innerHeight) };
        const marks = (x, y, pinch) => {
            const u = B.x0 + (x - a.x0) / (a.x1 - a.x0) * (B.x1 - B.x0);
            const v = B.y0 + (y - a.y0) / (a.y1 - a.y0) * (B.y1 - B.y0);
            const S = 0.12, gap = pinch * S;                    // square units, mirrored
            const X = u * aspect, Y = v;
            const sq = [];
            const wrist = { x: X + 0.02, y: Y + 0.2 };
            for (let i = 0; i < 21; i++) sq.push({ x: wrist.x - 0.01 * i, y: wrist.y - 0.009 * i });
            sq[0] = wrist;
            sq[9] = { x: wrist.x, y: wrist.y - S };
            sq[4] = { x: X - gap / 2, y: Y };
            sq[8] = { x: X + gap / 2, y: Y };
            return sq.map(p => ({ x: 1 - p.x / aspect, y: p.y, z: 0 }));
        };
        return {
            // Real time, 30 fps: the engine's classifier reads stroke timing,
            // and the module's rAF loop retires a hand that stops arriving
            async frame(x, y, pinch) { hp.feed(marks(x, y, pinch), performance.now()); await new Promise(r => setTimeout(r, 33)); },
        };
    };
};

async function play(pg, path, pinchOf) {
    return pg.evaluate(async ([path, pinchSrc]) => {
        const hp = document.querySelector('[data-hand-pointer]')._handPointer;
        const h = window.__hand(hp);
        const pinchOf = new Function('i', 'n', `return (${pinchSrc})(i, n)`);
        for (let i = 0; i < path.length; i++) await h.frame(path[i].x, path[i].y, pinchOf(i, path.length));
        return hp.down;
    }, [path, pinchOf.toString()]);
}

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
const still = (x, y, n) => Array.from({ length: n }, () => ({ x, y }));

const browser = await chromium.launch({ executablePath: exe });

// ---------------------------------------------------------------- part 1
for (const file of ['index.html', 'design.html']) {
    console.log(`\n${file} — synthetic hands`);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await pg.addInitScript(HELPERS);
    await pg.goto(`${BASE}/${file}`, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => document.querySelector('[data-hand-pointer]')?._handPointer, null, { timeout: 15000 });
    await pg.waitForTimeout(1200);

    const vis = await pg.evaluate(() => { const l = document.querySelector('.hand-toggle'); return !!l && getComputedStyle(l).display !== 'none' && !l.hidden; });
    check(vis, 'Webcam toggle shows on a mouse device');
    const cmd = await pg.evaluate(() => (window.JH_COMMANDS || []).some(c => c.id === 'hand.draw'));
    check(cmd, 'the command bar knows "Draw with your hand"');

    await pg.evaluate(() => {
        const c = document.getElementById('heroCanvas');
        window.__ev = { move: 0, down: 0, up: 0 };
        c.addEventListener('mousemove', () => window.__ev.move++);
        c.addEventListener('mousedown', () => window.__ev.down++);
        c.addEventListener('mouseup', () => window.__ev.up++);
        document.querySelector('[data-hand-pointer]')._handPointer.start({ camera: false });
    });
    const layer = await pg.evaluate(() => !!document.querySelector('.hand-layer') && !!document.querySelector('.hand-hud'));
    check(layer, 'start() mounts the presence layer and HUD');

    // 2. hover
    const hoverDown = await play(pg, Array.from({ length: 20 }, (_, i) => ({ x: 300 + i * 20, y: 600 })), () => 1.0);
    const ev = await pg.evaluate(() => window.__ev);
    check(!hoverDown && ev.move >= 18 && ev.down === 0, `an open hand hovers (${ev.move} moves, ${ev.down} downs)`);
    // The layer actually paints the ghost: non-empty pixels near the nib
    await play(pg, still(680, 600, 6), () => 1.0);
    const inked = await pg.evaluate(() => {
        const l = document.querySelector('.hand-layer'); const c = l.getContext('2d');
        const s = l.width / innerWidth;
        const d = c.getImageData(Math.round(600 * s), Math.round(520 * s), Math.round(160 * s), Math.round(160 * s)).data;
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
        const path = [...still(fishMark[0].x, fishMark[0].y, 3), ...fishMark, ...still(end.x, end.y, 4)];
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
        const path = [...still(500, 380, 3), ...box(500, 380, 260, 200), ...still(500, 382, 4)];
        await play(pg, path, (i, n) => (i < 2 || i >= n - 3) ? 1.0 : 0.1);
        await pg.waitForTimeout(800);
        const shapes = await pg.evaluate(() => window.JH_SCENE.census().shapes);
        check(shapes.length === s0 + 1, `a pinched box becomes a wall (${s0} → ${shapes.length}: ${shapes.map(s => s.type).join(',')})`);
    }

    // 5. lost mid-stroke
    const midDown = await play(pg, [...still(400, 300, 3), ...Array.from({ length: 8 }, (_, i) => ({ x: 400 + i * 15, y: 300 }))], (i) => i < 2 ? 1.0 : 0.1);
    await pg.waitForTimeout(400);    // no frames: the module's own loop retires the hand
    const lost = await pg.evaluate(() => document.querySelector('[data-hand-pointer]')._handPointer.down);
    check(midDown && !lost, 'a hand lost mid-stroke lifts the pen');
    const ev2 = await pg.evaluate(() => window.__ev);
    check(ev2.down === ev2.up, `every mousedown got its mouseup (${ev2.down}/${ev2.up})`);

    await pg.evaluate(() => document.querySelector('[data-hand-pointer]')._handPointer.stop());
    const gone = await pg.evaluate(() => !document.querySelector('.hand-layer') && !document.querySelector('.hand-hud'));
    check(gone, 'stop() takes the layer and HUD away');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
}

{
    console.log('\nindex.html — touch device');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(800);
    const hidden = await pg.evaluate(() => { const l = document.querySelector('.hand-toggle'); return !l || getComputedStyle(l).display === 'none'; });
    check(hidden, 'the Webcam toggle is hidden on a coarse pointer');
    await ctx.close();
}
await browser.close();

// ---------------------------------------------------------------- part 2
const haveMP = existsSync(resolve(MP, 'tasks-vision/vision_bundle.mjs')) && existsSync(resolve(MP, 'hand_landmarker.task'));
if (!haveMP) {
    console.log('\n(part 2 skipped: no .local/handpointer cache)');
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
    await pg.click('.hand-toggle');
    let state = null;
    try {
        await pg.waitForFunction(() => ['seek', 'track', 'error'].includes(document.querySelector('[data-hand-pointer]')._handPointer.status), null, { timeout: 60000 });
    } catch (e) { /* reported below */ }
    state = await pg.evaluate(() => ({ s: document.querySelector('[data-hand-pointer]')._handPointer.status, note: document.querySelector('.hand-hud-note')?.textContent, vw: document.querySelector('.hand-hud video')?.videoWidth }));
    check(state.s === 'seek' || state.s === 'track', `camera + model start (${state.s}: "${state.note}", ${state.vw}px video)`);
    await pg.waitForTimeout(1500);
    const still2 = await pg.evaluate(() => document.querySelector('[data-hand-pointer]')._handPointer.status);
    check(still2 === 'seek', `detection runs on the fake feed without finding a hand (${still2})`);
    await pg.click('.hand-toggle');
    await pg.waitForTimeout(200);
    const off = await pg.evaluate(() => ({ on: document.querySelector('[data-hand-pointer]')._handPointer.on, hud: !!document.querySelector('.hand-hud') }));
    check(!off.on && !off.hud, 'turning it off stops the camera and clears the HUD');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await cam.close();
}

srv.stop();
console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
