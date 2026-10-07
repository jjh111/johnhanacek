// swipelab — false-positive budget for scripts/swipe-offer.js, before any threshold moves.
//
// Pure: loads the module with a stub window and replays a seeded synthetic corpus
// through JHSwipeOffer.read(prev, cur). No browser. Two numbers matter:
//   recall — gestures that ARE someone trying to scroll, which should offer
//   false   — things people draw on the tanks, which should not
// Each class is run with the shipped thresholds and with VERTICAL: null
// (MetaMedium's any-axis, either-direction read), so the cost of the vertical gate is visible.
//
//   node "Agent Reference/maze-tests/swipelab.mjs"          (exit 1 if a budget fails)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const window = {};
new Function('window', readFileSync(resolve(ROOT, 'scripts/swipe-offer.js'), 'utf8'))(window);
const { read, summarize, T } = window.JHSwipeOffer;

// Seeded RNG so a threshold change is compared against the same strokes.
let seed = 20261002;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const R = (a, b) => a + rnd() * (b - a);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

// A stroke from a to b sampled at ~60 Hz over `dur` ms, bowed by `bow` (fraction
// of length, the thumb's arc) with hand jitter. Returns the summarized record.
function stroke(a, b, { t0, dur = R(120, 350), bow = R(-0.08, 0.08), jitter = 1.5 } = {}) {
    const n = Math.max(4, Math.round(dur / 16));
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const u = i / n, k = 4 * u * (1 - u) * bow * len;
        pts.push({ x: a.x + (b.x - a.x) * u + nx * k + R(-jitter, jitter),
                   y: a.y + (b.y - a.y) * u + ny * k + R(-jitter, jitter) });
    }
    return summarize(pts, t0, t0 + dur);
}
function curve(cx, cy, r, { t0, turns = 1, open = 0 } = {}) {   // circles and loops: never straight
    const pts = [];
    for (let i = 0; i <= 60; i++) {
        const th = (i / 60) * Math.PI * 2 * turns - open;
        pts.push({ x: cx + Math.cos(th) * r * (1 + 0.3 * Math.sin(th * 2)), y: cy + Math.sin(th) * r });
    }
    return summarize(pts, t0, t0 + 600);
}
const at = (x, y) => ({ x, y });
const polar = (p, ang, len) => at(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len);
const W = 390, H = 844;   // a phone, where the offer lives

// Each generator returns [prev, cur] — the two most recent strokes.
const SCROLL = {
    'repeat swipe, same spot': () => {
        const x = R(80, 310), y = R(500, 700), L = R(120, 320), dir = -1, slant = R(-0.35, 0.35);
        const s1 = stroke(at(x, y), polar(at(x, y), dir * Math.PI / 2 + slant, L), { t0: 0 });
        const g = R(80, 900);
        const x2 = x + R(-25, 25), y2 = y + R(-50, 50), L2 = L * R(0.75, 1.25);
        return [s1, stroke(at(x2, y2), polar(at(x2, y2), dir * Math.PI / 2 + slant + R(-0.2, 0.2), L2), { t0: s1.t1 + g })];
    },
    'side by side': () => {
        const x = R(60, 250), y = R(450, 700), L = R(120, 300), up = -Math.PI / 2 + R(-0.3, 0.3);
        const s1 = stroke(at(x, y), polar(at(x, y), up, L), { t0: 0 });
        const x2 = x + R(25, 110);
        return [s1, stroke(at(x2, y + R(-40, 40)), polar(at(x2, y), up + R(-0.2, 0.2), L * R(0.75, 1.2)), { t0: s1.t1 + R(100, 1000) })];
    },
    'two fingers at once': () => {
        const x = R(80, 250), y = R(500, 700), L = R(120, 300), up = -Math.PI / 2 + R(-0.25, 0.25);
        const s1 = stroke(at(x, y), polar(at(x, y), up, L), { t0: 0, dur: 250 });
        const x2 = x + R(30, 70);
        return [s1, stroke(at(x2, y + R(-20, 20)), polar(at(x2, y), up + R(-0.08, 0.08), L * R(0.85, 1.15)), { t0: R(-40, 40), dur: 250 })];
    },
};

const DRAWN = {
    'box from 4 strokes': () => {
        const x = R(40, 200), y = R(200, 600), w = R(60, 180), h = R(60, 180);
        const c = [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h)];
        const i = Math.floor(R(0, 3));   // any consecutive pair of sides
        const s1 = stroke(c[i], c[i + 1], { t0: 0, bow: R(-0.04, 0.04) });
        return [s1, stroke(c[i + 1], c[(i + 2) % 4], { t0: s1.t1 + R(100, 600), bow: R(-0.04, 0.04) })];
    },
    'triangle from 3 strokes': () => {
        const p = [at(R(50, 300), R(300, 700)), at(R(50, 300), R(300, 700)), at(R(50, 300), R(300, 700))];
        const s1 = stroke(p[0], p[1], { t0: 0 });
        return [s1, stroke(p[1], p[2], { t0: s1.t1 + R(100, 600) })];
    },
    'equals sign': () => {
        const x = R(60, 220), y = R(300, 650), L = R(60, 160);
        const s1 = stroke(at(x, y), at(x + L, y + R(-8, 8)), { t0: 0 });
        return [s1, stroke(at(x + R(-10, 10), y + R(20, 50)), at(x + L * R(0.85, 1.1), y + R(20, 50)), { t0: s1.t1 + R(100, 500) })];
    },
    'letter H (uprights top-down)': () => {
        const x = R(60, 250), y = R(300, 600), h = R(60, 140);
        const s1 = stroke(at(x, y), at(x, y + h), { t0: 0, bow: R(-0.03, 0.03) });
        const x2 = x + h * R(0.5, 0.8);
        return [s1, stroke(at(x2, y), at(x2, y + h), { t0: s1.t1 + R(150, 600), bow: R(-0.03, 0.03) })];
    },
    'dash then dash (end to end)': () => {
        const x = R(80, 300), y = R(150, 400), L = R(50, 140), ang = R(0, Math.PI);
        const a = at(x, y), b = polar(a, ang, L);
        const s1 = stroke(a, b, { t0: 0 });
        const c = polar(b, ang, R(15, 50));
        return [s1, stroke(c, polar(c, ang + R(-0.15, 0.15), L * R(0.8, 1.2)), { t0: s1.t1 + R(100, 500) })];
    },
    'arrow (shaft, then head)': () => {
        const a = at(R(60, 300), R(300, 700)), ang = R(0, 2 * Math.PI), tip = polar(a, ang, R(100, 250));
        const s1 = stroke(a, tip, { t0: 0 });
        const back = ang + Math.PI + pick([-1, 1]) * R(0.4, 0.8);
        return [s1, stroke(tip, polar(tip, back, R(25, 60)), { t0: s1.t1 + R(100, 500) })];
    },
    'X (crossing pair)': () => {
        const c = at(R(80, 300), R(300, 700)), L = R(60, 160), ang = R(0, Math.PI), d = R(0.6, 1.4);
        const s1 = stroke(polar(c, ang, -L / 2), polar(c, ang, L / 2), { t0: 0 });
        return [s1, stroke(polar(c, ang + d, -L / 2), polar(c, ang + d, L / 2), { t0: s1.t1 + R(100, 600) })];
    },
    'fish loop / circle after a line': () => {
        const s1 = stroke(at(R(60, 300), R(300, 700)), at(R(60, 300), R(300, 700)), { t0: 0 });
        return [s1, curve(R(80, 300), R(300, 700), R(30, 90), { t0: s1.t1 + 300, turns: R(0.9, 1.25) })];
    },
    'long wall then short parallel': () => {
        const x = R(60, 250), y = R(200, 500), L = R(200, 400);
        const s1 = stroke(at(x, y), at(x, y + L), { t0: 0 });
        return [s1, stroke(at(x + 40, y), at(x + 40, y + L * R(0.15, 0.5)), { t0: s1.t1 + R(100, 600) })];
    },
    'walls on opposite sides': () => {
        const y = R(150, 400), L = R(100, 250);
        const s1 = stroke(at(R(20, 60), y), at(R(20, 60), y + L), { t0: 0 });
        return [s1, stroke(at(W - R(20, 60), y), at(W - R(20, 60), y + L * R(0.8, 1.2)), { t0: s1.t1 + R(100, 600) })];
    },
    'corridor, built slowly (>1.2 s)': () => {
        const x = R(60, 250), y = R(200, 500), L = R(120, 300);
        const s1 = stroke(at(x, y), at(x, y + L), { t0: 0, dur: R(300, 900) });
        return [s1, stroke(at(x + R(40, 100), y), at(x + R(40, 100), y + L), { t0: s1.t1 + R(1300, 4000), dur: R(300, 900) })];
    },
    'random maze building': () => {
        const mk = t0 => {
            const a = at(R(20, W - 20), R(80, H - 80));
            return stroke(a, polar(a, R(0, 2 * Math.PI), R(50, 300)), { t0, dur: R(200, 900), bow: R(-0.05, 0.05) });
        };
        const s1 = mk(0);
        return [s1, mk(s1.t1 + R(150, 2500))];
    },
};

// Known-ambiguous: identical in form to the gesture. Reported, not budgeted.
const AMBIGUOUS = {
    'corridor, quick, drawn bottom-up': () => {
        const x = R(60, 250), y = R(200, 500), L = R(120, 300);
        const s1 = stroke(at(x, y + L), at(x, y), { t0: 0, dur: R(200, 600) });
        const x2 = x + R(40, 100);
        return [s1, stroke(at(x2, y + L), at(x2, y), { t0: s1.t1 + R(150, 1100), dur: R(200, 600) })];
    },
    'corridor, quick, 75% drawn top-down': () => {
        const x = R(60, 250), y = R(200, 500), L = R(120, 300), x2 = x + R(40, 100);
        const v = x0 => rnd() < 0.75 ? [at(x0, y), at(x0, y + L)] : [at(x0, y + L), at(x0, y)];
        const s1 = stroke(...v(x), { t0: 0, dur: R(200, 600) });
        return [s1, stroke(...v(x2), { t0: s1.t1 + R(150, 1100), dur: R(200, 600) })];
    },
    'letter H, uprights bottom-up': () => {
        const x = R(60, 250), y = R(300, 600), h = R(60, 140);
        const s1 = stroke(at(x, y + h), at(x, y), { t0: 0, bow: R(-0.03, 0.03) });
        const x2 = x + h * R(0.5, 0.8);
        return [s1, stroke(at(x2, y + h), at(x2, y), { t0: s1.t1 + R(150, 600), bow: R(-0.03, 0.03) })];
    },
    'downward swipes (scrolling UP — not offered)': () => {
        const x = R(80, 310), y = R(150, 350), L = R(120, 320);
        const s1 = stroke(at(x, y), polar(at(x, y), Math.PI / 2 + R(-0.3, 0.3), L), { t0: 0 });
        const x2 = x + R(-25, 25);
        return [s1, stroke(at(x2, y), polar(at(x2, y), Math.PI / 2 + R(-0.3, 0.3), L), { t0: s1.t1 + R(80, 900) })];
    },
};

const N = 2000;
const rate = (gen, t) => { let k = 0; for (let i = 0; i < N; i++) { const [p, q] = gen(); if (read(p, q, t)) k++; } return k / N; };
const ANY = { ...T, VERTICAL: null, UPWARD: false };   // MetaMedium's read, plus the overlap and time gates
const pct = x => (x * 100).toFixed(1).padStart(5) + '%';

let fail = 0;
const row = (name, gen, budget, wantHigh) => {
    seed = 20261002;
    const s = rate(gen, T);
    seed = 20261002;
    const a = rate(gen, ANY);
    const ok = budget == null ? true : wantHigh ? s >= budget : s <= budget;
    if (!ok) fail++;
    console.log(`${ok ? '  ' : '✗ '}${name.padEnd(46)} shipped ${pct(s)}   any-axis ${pct(a)}${budget == null ? '   (reported)' : `   budget ${wantHigh ? '≥' : '≤'} ${pct(budget).trim()}`}`);
};

console.log(`swipelab — ${N} pairs per class, seed 20261002\n\nSHOULD OFFER (someone trying to scroll)`);
for (const [k, g] of Object.entries(SCROLL)) row(k, g, 0.85, true);
console.log('\nSHOULD NOT OFFER (things people draw)');
for (const [k, g] of Object.entries(DRAWN)) row(k, g, 0.02, false);
console.log('\nREPORTED (same form as the gesture, or deliberately excluded)');
for (const [k, g] of Object.entries(AMBIGUOUS)) row(k, g, null);
console.log(fail ? `\n${fail} budget(s) failed` : '\nALL BUDGETS MET');
process.exit(fail ? 1 : 0);
