// handpointertest — scripts/hand-pointer.js on the real pages.
//
// Part 1 drives the module's feed() seam with synthetic hands (21 landmarks
// laid out like an open right hand, the nib between thumb and index tip, a
// pinch gap), so every stroke goes through the module's own mapping, filters,
// pinch hysteresis, string and MouseEvent dispatch into the page's real
// startDraw/draw/endDraw, and asserts:
//   1. the Webcam toggle is on both pages (fine pointer), off, and the
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
//  10. on a touch device the toggle stays hidden and the command is absent
//  11. two hands: the second scrolls (pinch and drag; an open one does not;
//      let go moving and it coasts, then stops), the first still draws, the
//      scroll hand never draws, the pen hand gone the other picks up the pen
//      only after it opens, and two arriving at once give the pen to the right
// Part 2 turns the toggle on with three of Chromium's fake cameras and no model
// (the downloads refused or held): the camera must end when the model fails
// and at once when the toggle goes off mid-load; the request names a device
// and nothing else (a size or frame-rate wish let a virtual camera beat the
// real one, 2026-10-22); the preview shows before the model is in; the picker
// lists the cameras, switches live, and its choice is the next start's, or the
// default when that camera is gone.
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
        // cam: x, y are the nib in the camera's own (mirrored) units, which
        // no scroll moves; else screen px through the module's own map
        const marks = (x, y, pinch, { S = 0.12, lean = 0, noise = 0, cam = false } = {}) => {
            const n = cam ? { u: x, v: y } : hp.fromScreen(x, y);
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
            // Several hands in one frame, as MediaPipe hands them over
            async hands(list) { hp.feed(list.map(h => marks(h.x, h.y, h.pinch, { ...h, cam: true })), performance.now()); await new Promise(r => setTimeout(r, 33)); },
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

    const tog = await pg.evaluate(() => {
        const l = document.querySelector('.canvas-controls .hand-toggle');
        return l && { shown: !l.hidden && getComputedStyle(l).display !== 'none', on: l.querySelector('input').checked, label: l.textContent.trim() };
    });
    check(tog && tog.shown && !tog.on && tog.label === 'Webcam', `the Webcam toggle shows in the canvas controls, off (${JSON.stringify(tog)})`);
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
        toggle: document.querySelector('input[data-hand-pointer]').checked,
    }));
    check(!off.on && !off.layer && !off.hud && !off.toggle, `the HUD's off switch turns it all off (${JSON.stringify(off)})`);
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
    // Two hands, placed in camera units: the pen at u .65 (your right), the scroll hand at u .30
    console.log('\nindex.html — two hands (1440 × 900)');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await ready(pg, 'index.html');
    await pg.evaluate(() => { window.__track(); document.querySelector('[data-hand-pointer]')._handPointer.start({ camera: false }); });
    // frames: [[pen, scroll], ...]; a null hand is out of view
    const two = (frames) => pg.evaluate(async frames => {
        const hp = document.querySelector('[data-hand-pointer]')._handPointer;
        const h = window.__hand(hp);
        for (const f of frames) await h.hands(f.filter(Boolean));
    }, frames);
    const at = () => pg.evaluate(() => {
        const hp = document.querySelector('[data-hand-pointer]')._handPointer;
        return { y: Math.round(scrollY), hands: hp.hands, scrolling: hp.scrolling, coasting: hp.coasting, down: hp.down, downs: window.__ev.down, note: document.querySelector('.hand-hud-note').textContent };
    });
    const PEN = (v = 0.4, pinch = 1.0) => ({ x: 0.65, y: v, pinch });
    const SCR = (v, pinch) => ({ x: 0.30, y: v, pinch });
    const steps = (n, f) => Array.from({ length: n }, (_, i) => f(i, n));

    await two(steps(6, () => [PEN()]));
    await two(steps(5, () => [PEN(), SCR(0.55, 1.0)]));
    const s0 = await at();
    check(s0.hands === 2 && /other pinches and drags to scroll/.test(s0.note), `a second hand in view joins as the scroll hand (${s0.hands} hands, "${s0.note}")`);
    await two(steps(10, i => [PEN(), SCR(0.55 - i * 0.02, 1.0)]));
    const s1 = await at();
    check(s1.y === 0 && !s1.scrolling, `an open scroll hand moving does not scroll (scrollY ${s1.y})`);

    // The pen still draws beside it
    await two([...steps(4, () => [PEN(0.4, 0.1), SCR(0.35, 1.0)]), ...steps(10, i => [PEN(0.4 + i * 0.01, 0.1), SCR(0.35, 1.0)]), ...steps(4, () => [PEN(0.5, 1.0), SCR(0.35, 1.0)])]);
    const s2 = await at();
    check(s2.downs >= 1 && !s2.down, `the pen hand still draws beside it (${s2.downs} stroke)`);

    // Pinch and drag up: the page follows
    const downsBefore = s2.downs;
    await two([...steps(4, () => [PEN(), SCR(0.55, 0.1)]), ...steps(12, i => [PEN(), SCR(0.55 - (i + 1) * 0.25 / 12, 0.1)]), ...steps(8, () => [PEN(), SCR(0.30, 0.1)])]);
    const s3 = await at();
    const expect = Math.round(0.25 * 900 / 0.64 * 1.5);
    check(s3.scrolling && Math.abs(s3.y - expect) < expect * 0.15, `pinch and drag up scrolls the page down with the hand (${s3.y} px, the hand's sweep × 1.5 is ${expect})`);
    check(!s3.coasting, 'holding still, it holds');
    await two(steps(4, i => [PEN(), SCR(0.30 + (i + 1) * 0.05, 0.1)]));
    const s3b = await at();
    check(s3b.y < s3.y, `dragging back down scrolls back up (${s3.y} → ${s3b.y})`);

    // Let go mid-move: it coasts, then stops
    await two([...steps(3, i => [PEN(), SCR(0.50 - (i + 1) * 0.04, 0.1)]), ...steps(3, i => [PEN(), SCR(0.38 - (i + 1) * 0.04, 1.0)])]);
    const r0 = await at();
    await pg.waitForTimeout(250);
    const r1 = await at();
    await pg.waitForTimeout(2000);
    const r2 = await at();
    await pg.waitForTimeout(300);
    const r3 = await at();
    check(!r0.scrolling && r1.y > r0.y && !r2.coasting && r3.y === r2.y, `let go moving, it coasts on and stops (${r0.y} → ${r1.y} → ${r2.y})`);
    check(r3.downs === downsBefore, `the scroll hand never draws (${r3.downs - downsBefore} strokes from it)`);

    // The pen hand leaves: the other picks up the pen, but only after it opens
    await pg.evaluate(() => window.scrollTo(0, 0));
    await pg.waitForTimeout(200);
    await two(steps(4, () => [PEN(), SCR(0.5, 0.1)]));
    await two(steps(10, () => [null, SCR(0.5, 0.1)]));
    const p0 = await at();
    check(p0.hands === 1 && !p0.scrolling && p0.downs === downsBefore, `the pen hand gone, the scroll hand takes the pen without drawing while still pinched (${p0.hands} hand, ${p0.downs - downsBefore} strokes)`);
    await two([...steps(3, () => [SCR(0.5, 1.0)]), ...steps(4, () => [SCR(0.5, 0.1)]), ...steps(6, i => [SCR(0.5 + i * 0.01, 0.1)]), ...steps(3, () => [SCR(0.56, 1.0)])]);
    const p1 = await at();
    check(p1.downs === downsBefore + 1, `opened, then pinched, it draws (${p1.downs - downsBefore} stroke)`);
    await pg.waitForTimeout(400);    // everyone leaves

    // Two at once: the one on your right draws
    await two([...steps(3, () => [SCR(0.4, 1.0), PEN(0.4, 1.0)]), ...steps(4, () => [SCR(0.4, 1.0), PEN(0.4, 0.1)])]);
    const both = await pg.evaluate(() => {
        const hp = document.querySelector('[data-hand-pointer]')._handPointer;
        return { down: hp.down, nibX: Math.round(hp.nib.x), hands: hp.hands };
    });
    check(both.hands === 2 && both.down && both.nibX > 720, `two hands arriving together: the one on your right draws (pen at x ${both.nibX})`);
    await pg.waitForTimeout(400);
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
        const l = document.querySelector('.hand-toggle');
        return { hidden: !l || l.hidden || getComputedStyle(l).display === 'none', cmd: (window.JH_COMMANDS || []).some(c => c.id === 'hand.draw') };
    });
    check(t.hidden, 'the Webcam toggle stays hidden on a coarse pointer');
    check(!t.cmd, 'and the command bar does not offer "Draw with your hand" there');
    await ctx.close();
}
await browser.close();

// ---------------------------------------------------------------- part 2
{
    console.log('\nindex.html — three fake cameras, no model: the camera\'s life and choice');
    const cam = await chromium.launch({ executablePath: exe, args: ['--use-fake-device-for-media-stream=device-count=3', '--use-fake-ui-for-media-stream'] });
    const ctx = await cam.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera'] });
    let answer = 'refuse';
    await ctx.route(/cdn\.jsdelivr\.net|storage\.googleapis\.com/, r => { if (answer === 'refuse') r.abort(); /* else held: never answered */ });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    // Every camera request and every track it opened
    await pg.addInitScript(() => {
        window.__tracks = []; window.__asks = [];
        const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async c => { window.__asks.push(c); const s = await gum(c); window.__tracks.push(...s.getTracks()); return s; };
    });
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => document.querySelector('[data-hand-pointer]')?._handPointer, null, { timeout: 15000 });
    const state = () => pg.evaluate(() => ({
        tracks: window.__tracks.map(t => `${t.label}:${t.readyState}`), note: document.querySelector('.hand-hud-note')?.textContent || '',
        toggle: document.querySelector('input[data-hand-pointer]').checked, status: document.querySelector('[data-hand-pointer]')._handPointer.status,
    }));
    const live = () => pg.evaluate(() => window.__tracks.filter(t => t.readyState === 'live').map(t => t.label));
    const toggle = () => pg.click('.hand-toggle');
    const asked = () => pg.evaluate(() => JSON.stringify(window.__asks[window.__asks.length - 1]));

    // the model refused
    await toggle();
    await pg.waitForFunction(() => document.querySelector('[data-hand-pointer]')._handPointer.status === 'error', null, { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(300);
    const failed = await state();
    check(failed.tracks.length > 0 && failed.tracks.every(t => t.endsWith(':ended')) && !failed.toggle && /could not start/.test(failed.note),
        `the model fails to load: the camera ends, the toggle goes off, the HUD says so (${JSON.stringify(failed)})`);
    check(await asked() === '{"video":true,"audio":false}', `the first request names no camera, size or rate: the system's default (${await asked()})`);
    await pg.waitForTimeout(4200);    // the error note leaves

    // the model held: everything below happens while it loads
    answer = 'hold';
    await pg.evaluate(() => { window.__tracks = []; });
    await toggle();
    await pg.waitForFunction(() => window.__tracks.some(t => t.readyState === 'live'), null, { timeout: 15000 }).catch(() => {});
    await pg.waitForFunction(() => document.querySelector('.hand-hud video')?.videoWidth > 0, null, { timeout: 5000 }).catch(() => {});
    const early = await pg.evaluate(() => ({ status: document.querySelector('[data-hand-pointer]')._handPointer.status, vw: document.querySelector('.hand-hud video')?.videoWidth || 0 }));
    check(early.status === 'load', `after a failed start the next one tries the download again (${early.status}; a failed import() is cached per URL)`);
    check(early.vw > 0, `the preview shows the camera while the model still loads (${early.vw}px wide)`);
    await pg.waitForFunction(() => document.querySelectorAll('.hand-hud-cam option').length === 3, null, { timeout: 5000 }).catch(() => {});
    const picker = await pg.evaluate(() => { const p = document.querySelector('.hand-hud-cam'); return { shown: !p.hidden, options: [...p.options].map(o => o.textContent), chosen: p.selectedOptions[0]?.textContent }; });
    check(picker.shown && picker.options.length === 3 && picker.chosen === 'fake_device_0', `the picker lists the cameras, the one in use chosen (${JSON.stringify(picker)})`);

    await pg.selectOption('.hand-hud-cam', { label: 'fake_device_2' });
    await pg.waitForFunction(() => window.__tracks.some(t => t.label === 'fake_device_2' && t.readyState === 'live'), null, { timeout: 5000 }).catch(() => {});
    await pg.waitForTimeout(200);
    const switched = { live: await live(), saved: await pg.evaluate(() => localStorage.getItem('jh-hand-camera')), chosen: await pg.evaluate(() => document.querySelector('.hand-hud-cam').selectedOptions[0]?.textContent) };
    check(switched.live.length === 1 && switched.live[0] === 'fake_device_2' && !!switched.saved && switched.chosen === 'fake_device_2',
        `picking another camera switches to it live, the old one ends, the choice is kept (${JSON.stringify(switched)})`);

    await toggle();
    await pg.waitForTimeout(150);
    const offNow = await state();
    check(offNow.tracks.every(t => t.endsWith(':ended')) && !offNow.toggle, `off while the model is still loading ends the camera at once (${JSON.stringify(offNow.tracks)})`);

    await toggle();
    await pg.waitForFunction(() => window.__tracks.filter(t => t.readyState === 'live').length === 1, null, { timeout: 5000 }).catch(() => {});
    const again = { asked: JSON.parse(await asked()), live: await live() };
    check(!!again.asked.video.deviceId?.exact && Object.keys(again.asked.video).length === 1 && again.live[0] === 'fake_device_2',
        `the next start opens the camera picked last time, by device alone (${JSON.stringify(again)})`);
    await toggle();
    await pg.waitForTimeout(150);

    await pg.evaluate(() => localStorage.setItem('jh-hand-camera', 'a-camera-since-unplugged'));
    await toggle();
    await pg.waitForFunction(() => window.__tracks.filter(t => t.readyState === 'live').length === 1, null, { timeout: 5000 }).catch(() => {});
    const gone = await live();
    check(gone.length === 1 && gone[0] === 'fake_device_0', `a remembered camera that is gone falls back to the default (${JSON.stringify(gone)})`);
    await toggle();
    await pg.waitForTimeout(150);
    check((await live()).length === 0, 'and off ends it');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
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
    await pg.click('.hand-toggle');
    let state = null;
    try {
        await pg.waitForFunction(() => ['seek', 'track', 'error'].includes(document.querySelector('[data-hand-pointer]')._handPointer.status), null, { timeout: 60000 });
    } catch (e) { /* reported below */ }
    state = await pg.evaluate(() => ({ s: document.querySelector('[data-hand-pointer]')._handPointer.status, note: document.querySelector('.hand-hud-note')?.textContent, vw: document.querySelector('.hand-hud video')?.videoWidth, toggle: document.querySelector('input[data-hand-pointer]').checked }));
    check((state.s === 'seek' || state.s === 'track') && state.toggle, `camera + model start, the toggle on (${state.s}: "${state.note}", ${state.vw}px video)`);
    await pg.waitForTimeout(1500);
    const still2 = await pg.evaluate(() => document.querySelector('[data-hand-pointer]')._handPointer.status);
    check(still2 === 'seek', `detection runs on the fake feed without finding a hand (${still2})`);
    await pg.click('.hand-toggle');
    await pg.waitForTimeout(200);
    const off = await pg.evaluate(() => ({ on: document.querySelector('[data-hand-pointer]')._handPointer.on, hud: !!document.querySelector('.hand-hud'), toggle: document.querySelector('input[data-hand-pointer]').checked }));
    check(!off.on && !off.hud && !off.toggle, 'turning it off stops the camera and clears the HUD');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await cam.close();
}

srv.stop();
console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
