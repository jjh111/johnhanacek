/**
 * schooltest.mjs — do the medium fish actually school?
 *
 * Spawns N medium fish on index.html's hero canvas and samples the school for
 * SECS seconds. Reports what a viewer would notice:
 *   coherence  — |mean unit heading| over the school (1 = all pointing one way)
 *   turn sync  — coherence measured only while the school is turning
 *   spacing    — mean nearest-neighbour distance (px) and the share of samples
 *                with any pair overlapping (bodies touching)
 *   speed      — mean px/s of the school centre (listless = low)
 *   phases     — how many scatter→reform cycles happened (window.debugSchoolPhase)
 *
 *   node "Agent Reference/maze-tests/schooltest.mjs" [N=7] [SECS=40] [BASE]
 */
import { chromium } from 'playwright-core';
const N = +(process.argv[2] || 7), SECS = +(process.argv[3] || 40), BASE = process.argv[4] || process.env.BASE || 'http://127.0.0.1:1337';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });
const [VW, VH] = (process.env.VIEW || '1440x900').split('x').map(Number);
const page = await (await b.newContext({ viewport: { width: VW, height: VH }, hasTouch: VW < 600, isMobile: VW < 600 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await page.waitForTimeout(800);
await page.evaluate((N) => {
  const c = document.getElementById('heroCanvas'); const r = c.getBoundingClientRect();
  const mk = (t, x, y) => new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true });
  const stroke = (pts) => { c.dispatchEvent(mk('mousedown', pts[0].x, pts[0].y)); pts.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y))); c.dispatchEvent(mk('mouseup', pts.at(-1).x, pts.at(-1).y)); };
  // the spiral idletest draws: r0 40–55 classifies as a medium fish (bodyWidth ≈ r0)
  const dense = (pts, step = 12) => { const o = []; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], q = pts[i]; const d = Math.hypot(q.x - a.x, q.y - a.y), n = Math.max(1, Math.round(d / step)); for (let k = 0; k < n; k++) { const t = k / n; o.push({ x: a.x + (q.x - a.x) * t, y: a.y + (q.y - a.y) * t }); } } o.push(pts.at(-1)); return o; };
  const fishAt = (cx, cy, r0) => { const l = []; for (let a = -0.6; a <= Math.PI * 2 + 0.7; a += 0.26) l.push({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 }); stroke(dense(l)); };
  for (let i = 0; i < N; i++) fishAt(r.width * (0.2 + 0.6 * ((i * 0.37) % 1)), r.height * (0.25 + 0.4 * ((i * 0.61) % 1)), 42 + (i % 3) * 4);
  window.__samples = []; window.__prevC = null;
  window.__tick = setInterval(() => {
    const g = window.heroFish; const meds = g.state.fish.filter(f => (f.bodyWidth || 20) >= 35 && (f.bodyWidth || 20) < 60);
    if (meds.length < 2) return;
    let ux = 0, uy = 0; meds.forEach(f => { ux += Math.cos(f.heading); uy += Math.sin(f.heading); });
    const coh = Math.hypot(ux, uy) / meds.length;
    let nn = 0, overlap = false, pairs = 0, touching = 0; meds.forEach((f, i) => { let best = Infinity; meds.forEach((o, j) => { if (o === f) return; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < best) best = d; if (j > i) { pairs++; if (d < (f.bodyWidth + o.bodyWidth) * 0.9) { overlap = true; touching++; } } }); nn += best; });
    const cx = meds.reduce((s, f) => s + f.x, 0) / meds.length, cy = meds.reduce((s, f) => s + f.y, 0) / meds.length;
    const spread = Math.max(...meds.map(f => Math.hypot(f.x - cx, f.y - cy)));
    const sp = window.__prevC ? Math.hypot(cx - window.__prevC.x, cy - window.__prevC.y) * 4 : 0; window.__prevC = { x: cx, y: cy };
    const fishSpeed = meds.reduce((s, f) => s + Math.hypot(f.vx || 0, f.vy || 0), 0) / meds.length * 60;
    window.__samples.push({ t: performance.now(), n: meds.length, coh, nn: nn / meds.length, overlap, touching: touching / pairs, spread, centreSpeed: sp, fishSpeed, phase: window.debugSchoolPhase || window.debugSchoolReason || '', heading: window.debugSchoolHeading || 0 });
  }, 250);
}, N);
const SHOTS = process.env.SHOTS; // directory: save a hero screenshot every 8 s
for (let t = 0; t < SECS; t += 8) { await page.waitForTimeout(Math.min(8, SECS - t) * 1000); if (SHOTS) await page.screenshot({ path: `${SHOTS}/school-${String(t + 8).padStart(3, '0')}s.png`, clip: { x: 0, y: 0, width: VW, height: VH } }); }
const s = await page.evaluate(() => { clearInterval(window.__tick); return window.__samples; });
await b.close();
const avg = (a, k) => a.reduce((x, y) => x + y[k], 0) / a.length;
const turning = s.filter((x, i) => i > 0 && Math.abs(Math.atan2(Math.sin(x.heading - s[i - 1].heading), Math.cos(x.heading - s[i - 1].heading))) > 0.02);
const phases = []; s.forEach(x => { if (!phases.length || phases.at(-1) !== x.phase) phases.push(x.phase); });
const cycles = phases.filter(p => p === 'scatter').length;
console.log(`medium fish: ${s.at(-1)?.n} · samples ${s.length} over ${SECS}s`);
for (const ph of ['schooling', 'regroup', 'scatter']) { const q = s.filter(x => x.phase === ph); if (q.length) console.log(`  ${ph.padEnd(9)} ${String(q.length).padStart(3)} samples · coherence ${avg(q, 'coh').toFixed(2)} · nn ${avg(q, 'nn').toFixed(0)}px · pairs touching ${(100 * avg(q, 'touching')).toFixed(0)}% · spread ${avg(q, 'spread').toFixed(0)}px · speed ${avg(q, 'fishSpeed').toFixed(0)}px/s`); }
console.log(`coherence ${avg(s, 'coh').toFixed(2)} · while turning ${turning.length ? avg(turning, 'coh').toFixed(2) : '—'} (${turning.length} samples)`);
console.log(`nearest-neighbour ${avg(s, 'nn').toFixed(0)}px · overlapping ${(100 * s.filter(x => x.overlap).length / s.length).toFixed(0)}% of samples · spread ${avg(s, 'spread').toFixed(0)}px`);
console.log(`fish speed ${avg(s, 'fishSpeed').toFixed(0)} px/s · centre speed ${avg(s, 'centreSpeed').toFixed(0)} px/s`);
console.log(`phases: ${phases.join(' → ').slice(0, 200)} · scatter cycles ${cycles}`);
console.log('errors:', errs.length ? errs : 'none');
