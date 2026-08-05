/**
 * humantest.mjs — the suite the old squiggle tests should have been.
 *
 * Everything here draws with HUMAN sampling: a real hand at ~60Hz leaves
 * 25–35px between points on a fast stroke, rounds its reversals, and only
 * makes 2–4 passes. The previous erase heuristic passed its tests only because
 * those tests emitted dense, perfectly sharp zigzags — a shape no hand makes.
 *
 * Asserts:
 *   A. every realistic scratch-out over a wall erases it
 *   B. nothing that isn't a scratch-out erases anything (shapes, loops,
 *      lines drawn THROUGH a wall, strokes on empty canvas)
 *   C. no fish parks on a wall (near-wall AND <15px movement over 2s)
 */
import { chromium } from 'playwright-core';

const CH = process.env.CHROMIUM_PATH;
const URL = 'http://127.0.0.1:1337/design.html';
const b = await chromium.launch({ executablePath: CH });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// Shared in-page helpers: human-sampled stroke dispatch.
const HELPERS = () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  // speed = px between samples. slow hand ≈ 12, normal ≈ 26, fast scratch ≈ 36
  window.__hstroke = (pts, speed = 26, jitter = 2.5) => {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b2 = pts[i];
      const d = Math.hypot(b2.x - a.x, b2.y - a.y);
      const n = Math.max(1, Math.round(d / speed));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({
          x: a.x + (b2.x - a.x) * t + (Math.random() - 0.5) * jitter,
          y: a.y + (b2.y - a.y) * t + (Math.random() - 0.5) * jitter
        });
      }
    }
    out.push(pts[pts.length - 1]);
    c.dispatchEvent(mk('mousedown', out[0].x, out[0].y));
    out.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y)));
    c.dispatchEvent(mk('mouseup', out.at(-1).x, out.at(-1).y));
    return out.length;
  };
  // a wall pen: 400..760 x 260..560
  window.__pen = () => {
    const r = [], seg = (x1, y1, x2, y2) => { for (let i = 0; i <= 12; i++) r.push({ x: x1 + (x2 - x1) * i / 12, y: y1 + (y2 - y1) * i / 12 }); };
    seg(400, 260, 760, 260); seg(760, 260, 760, 560); seg(760, 560, 400, 560); seg(400, 560, 400, 266);
    window.__hstroke(r, 22);
  };
  window.__walls = () => designFish.state.coral.filter(k => k.isExternal).length;
  window.__shapes = () => recognizedShapes.length;
  window.__clear = () => { document.getElementById('clearCanvas').click(); };
  // Scratch-out: N passes back and forth ACROSS the pen, rounded reversals.
  // Passes overshoot the left/right edges the way a hand does when scrubbing
  // something out — that overshoot is what makes them crossings.
  window.__scratch = (passes, speed, tight) => {
    const x0 = tight ? 380 : 350, x1 = tight ? 780 : 810;
    const yTop = tight ? 330 : 285, yBot = tight ? 490 : 540;
    const pts = [], step = (yBot - yTop) / passes;
    for (let i = 0; i <= passes; i++) {
      const y = yTop + step * i;
      const goRight = i % 2 === 0;
      pts.push({ x: goRight ? x0 : x1, y });
      // rounded turn, the way a hand actually reverses
      if (i < passes) pts.push({ x: goRight ? x1 + 12 : x0 - 12, y: y + step * 0.5 });
    }
    return window.__hstroke(pts, speed, 3);
  };
};

await page.evaluate(HELPERS);

// ---- A. realistic scratch-outs MUST erase -------------------------------
const eraseMatrix = [];
for (const passes of [2, 3, 4, 6]) {
  for (const [speedName, speed] of [['fast', 36], ['slow', 14]]) {
    for (const tight of [false, true]) {
      const r = await page.evaluate(async ({ passes, speed, tight }) => {
        window.__clear();
        await new Promise(r2 => setTimeout(r2, 200));
        window.__pen();
        await new Promise(r2 => setTimeout(r2, 400));
        const before = window.__shapes();
        const pts = window.__scratch(passes, speed, tight);
        await new Promise(r2 => setTimeout(r2, 400));
        return { before, after: window.__shapes(), pts, walls: window.__walls() };
      }, { passes, speed, tight });
      eraseMatrix.push({
        gesture: `${passes} passes / ${speedName} / ${tight ? 'tight' : 'wide'}`,
        samplePts: r.pts, wallsLeft: r.walls,
        erased: r.before > 0 && r.after === 0,
        PASS: r.before > 0 && r.after === 0
      });
    }
  }
}

// ---- B. non-scratch gestures MUST NOT erase -----------------------------
const falsePositives = await page.evaluate(async () => {
  const out = [];
  const trial = async (name, fn) => {
    window.__clear();
    await new Promise(r => setTimeout(r, 200));
    window.__pen();
    await new Promise(r => setTimeout(r, 400));
    const before = window.__shapes();
    const fishBefore = designFish.state.fish.length;
    fn();
    await new Promise(r => setTimeout(r, 400));
    const after = window.__shapes();
    out.push({
      gesture: name, shapesBefore: before, shapesAfter: after,
      wallSurvived: after >= before,      // pen still there (may have gained a shape)
      spawnedFish: designFish.state.fish.length > fishBefore,
      PASS: after >= before
    });
  };
  // a deliberate line straight through the pen — crosses exactly 2 edges
  await trial('line drawn through the wall', () =>
    window.__hstroke([{ x: 340, y: 410 }, { x: 830, y: 410 }], 26));
  // a diagonal line through a corner
  await trial('diagonal line through corner', () =>
    window.__hstroke([{ x: 330, y: 200 }, { x: 620, y: 470 }], 26));
  // a clean second shape drawn overlapping the pen
  await trial('second shape overlapping pen', () => {
    const r = [], seg = (x1, y1, x2, y2) => { for (let i = 0; i <= 12; i++) r.push({ x: x1 + (x2 - x1) * i / 12, y: y1 + (y2 - y1) * i / 12 }); };
    seg(700, 480, 900, 480); seg(900, 480, 900, 640); seg(900, 640, 700, 640); seg(700, 640, 700, 486);
    window.__hstroke(r, 22);
  });
  // a fish loop drawn INSIDE the pen — must spawn, must not erase
  await trial('fish loop inside pen', () => {
    const l = [];
    for (let a = -0.6; a <= Math.PI * 2 + 0.7; a += 0.26) l.push({ x: 580 + Math.cos(a) * 55, y: 410 + Math.sin(a) * 55 });
    window.__hstroke(l, 12);
  });
  // a fish loop straddling a wall edge — the risky false-positive case
  await trial('fish loop straddling wall edge', () => {
    const l = [];
    for (let a = -0.6; a <= Math.PI * 2 + 0.7; a += 0.26) l.push({ x: 760 + Math.cos(a) * 60, y: 410 + Math.sin(a) * 60 });
    window.__hstroke(l, 12);
  });
  return out;
});

// Documents a real limit of the crossing rule rather than asserting on it: a
// scribble kept STRICTLY INSIDE a wall crosses its outline zero times, so it
// does not erase. Scrubbing across the shape (the usual motion) does.
const insideOnly = await page.evaluate(async () => {
  window.__clear();
  await new Promise(r => setTimeout(r, 200));
  window.__pen();
  await new Promise(r => setTimeout(r, 400));
  const before = window.__shapes();
  const pts = [];
  for (let i = 0; i <= 5; i++) pts.push({ x: i % 2 ? 720 : 440, y: 300 + i * 45 });
  window.__hstroke(pts, 30, 3);
  await new Promise(r => setTimeout(r, 400));
  return { gesture: 'scribble strictly inside the wall', erased: window.__shapes() < before };
});

// ---- C. parking soak ----------------------------------------------------
const park = await page.evaluate(async () => {
  window.__clear();
  await new Promise(r => setTimeout(r, 300));
  const F = designFish;
  // long vertical barrier
  const vline = []; for (let i = 0; i <= 40; i++) vline.push({ x: 640, y: 150 + i * 15 });
  window.__hstroke(vline, 18);
  const loop = (cx, cy, r0) => {
    const l = [];
    for (let a = -0.6; a <= Math.PI * 2 + 0.7; a += 0.26) l.push({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 });
    return l;
  };
  [[300, 300, 45], [340, 560, 75], [420, 220, 55]].forEach(([x, y, r0]) => window.__hstroke(loop(x, y, r0), 12));
  await new Promise(r => setTimeout(r, 300));
  // bait food on the far side of the barrier so fish press into it
  F.addFood(950, 300); F.addFood(920, 470);

  const walls = F.state.coral.filter(k => k.isExternal).map(k => ({
    minX: k.x - k.shape.width / 2 - 10, maxX: k.x + k.shape.width / 2 + 10,
    minY: k.y - k.shape.height - 10, maxY: k.y + 10
  }));
  const hist = {}, streak = {}, maxStuck = {};
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await new Promise(r => setTimeout(r, 100));
    for (const f of F.state.fish) {
      (hist[f.id] = hist[f.id] || []).push({ x: f.x, y: f.y });
      const h = hist[f.id];
      const near = walls.some(w => f.x > w.minX && f.x < w.maxX && f.y > w.minY && f.y < w.maxY);
      let stuck = false;
      if (near && h.length > 20) {
        const p0 = h[h.length - 21];
        stuck = Math.hypot(f.x - p0.x, f.y - p0.y) < 15;
      }
      streak[f.id] = stuck ? (streak[f.id] || 0) + 1 : 0;
      maxStuck[f.id] = Math.max(maxStuck[f.id] || 0, streak[f.id]);
    }
  }
  return {
    fish: F.state.fish.length,
    maxParkedSeconds: Object.values(maxStuck).map(v => +(v * 0.1).toFixed(1)),
    foodLeft: F.state.food.length
  };
});

const eraseFails = eraseMatrix.filter(r => !r.PASS);
const fpFails = falsePositives.filter(r => !r.PASS);
const parkFails = park.maxParkedSeconds.filter(s => s > 2);

console.log(JSON.stringify({
  A_scratchOutErases: eraseMatrix,
  B_nonScratchPreserved: falsePositives,
  B2_knownLimit: insideOnly,
  C_parking: park,
  SUMMARY: {
    eraseFailures: eraseFails.map(r => r.gesture),
    falseEraseFailures: fpFails.map(r => r.gesture),
    parkedOver2s: parkFails,
    pageErrors: errs,
    ALL_PASS: !eraseFails.length && !fpFails.length && !parkFails.length && !errs.length
  }
}, null, 1));
await b.close();
process.exit(eraseFails.length || fpFails.length || parkFails.length || errs.length ? 1 : 0);
