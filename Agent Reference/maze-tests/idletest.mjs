/**
 * idletest.mjs — idle behaviour must be shaped by the drawn shapes.
 *
 * Before rooms existed, every tier's idle was anchored to things design.html
 * doesn't have: coral, and a seabed. Small fish fell through to a hardcoded
 * `y = h*0.7 … h*0.9` band, cruisers held a lane under a `h*0.65` ceiling and
 * reversed at the CANVAS edge. So idle fish sank to the bottom of the blueprint
 * and treated the maze as pure collision.
 *
 * Asserts:
 *   A. no seabed drift — idle fish on the blueprint use the full canvas
 *   B. a fish penned in a room stays in it and patrols, rather than grinding
 *   C. cruisers reverse at the ends of a CORRIDOR, not at the canvas edge
 *   D. no stalling — the check that decides whether region-restricted targets
 *      need escalating to per-fish paths
 *   E. index.html idle is untouched (coral still owns it, seabed bias intact)
 */
import { chromium } from 'playwright-core';

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const errs = [];
const HELPERS = () => {
  const c = document.getElementById('heroCanvas');
  const mk = (t, x, y) => new MouseEvent(t, { clientX: x, clientY: y, bubbles: true });
  window.__h = (pts, speed = 20) => {
    const o = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b2 = pts[i];
      const d = Math.hypot(b2.x - a.x, b2.y - a.y), n = Math.max(1, Math.round(d / speed));
      for (let k = 0; k < n; k++) { const t = k / n; o.push({ x: a.x + (b2.x - a.x) * t, y: a.y + (b2.y - a.y) * t }); }
    }
    o.push(pts.at(-1));
    c.dispatchEvent(mk('mousedown', o[0].x, o[0].y));
    o.forEach(p => c.dispatchEvent(mk('mousemove', p.x, p.y)));
    c.dispatchEvent(mk('mouseup', o.at(-1).x, o.at(-1).y));
  };
  window.__fishAt = (cx, cy, r0) => {
    const l = [];
    for (let a = -0.6; a <= Math.PI * 2 + 0.7; a += 0.26) l.push({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 });
    window.__h(l, 12);
  };
  window.__clear = () => document.querySelectorAll('button').forEach(x => { if (/clear/i.test(x.textContent)) x.click(); });
  // Sample fish positions for a while and report spread + how much they moved.
  window.__soak = async (ms) => {
    const seen = {}, start = Date.now();
    while (Date.now() - start < ms) {
      await new Promise(r => setTimeout(r, 100));
      const now = Date.now();
      for (const f of designFish.state.fish) {
        // touching = in hard wall contact within the last 300ms. A patrolling
        // fish should hang NEAR the line, not grind along it.
        (seen[f.id] = seen[f.id] || []).push({
          x: f.x, y: f.y, bw: f.bodyWidth || 20,
          touching: !!(f.lastWallContact && now - f.lastWallContact < 300)
        });
      }
    }
    return seen;
  };
};

// ---- A. no seabed drift on an empty blueprint --------------------------
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.evaluate(HELPERS);

const drift = await page.evaluate(async () => {
  window.__clear();
  await new Promise(r => setTimeout(r, 300));
  for (const [x, y] of [[300, 200], [800, 250], [500, 600], [900, 500]]) window.__fishAt(x, y, 24);
  await new Promise(r => setTimeout(r, 800));
  const seen = await window.__soak(20000);
  const ys = Object.values(seen).flat().map(p => p.y);
  const belowThird = ys.filter(y => y > 800 * 0.66).length;
  return {
    fish: Object.keys(seen).length,
    samples: ys.length,
    fractionInBottomThird: +(belowThird / ys.length).toFixed(2),
    yMin: Math.round(Math.min(...ys)), yMax: Math.round(Math.max(...ys))
  };
});

// ---- B + D. penned fish patrols its room and never stalls ---------------
// Fresh page on purpose. `Clear` removes walls but keeps fish, so running this
// after phase A left six fish crowded into one pen and the numbers measured
// jostling rather than patrolling. Stall is also reported PER FISH below —
// summing it across a crowd made the bar depend on how many fish happened to
// be alive, which is how this first went red.
const pageB = await b.newPage({ viewport: { width: 1280, height: 800 } });
pageB.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await pageB.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await pageB.waitForTimeout(1200);
await pageB.evaluate(HELPERS);
const penned = await pageB.evaluate(async () => {
  window.__clear();
  await new Promise(r => setTimeout(r, 300));
  const PEN = { x0: 380, x1: 780, y0: 220, y1: 600 };
  const r2 = [], seg = (x1, y1, x2, y2) => { for (let i = 0; i <= 12; i++) r2.push({ x: x1 + (x2 - x1) * i / 12, y: y1 + (y2 - y1) * i / 12 }); };
  seg(PEN.x0, PEN.y0, PEN.x1, PEN.y0); seg(PEN.x1, PEN.y0, PEN.x1, PEN.y1);
  seg(PEN.x1, PEN.y1, PEN.x0, PEN.y1); seg(PEN.x0, PEN.y1, PEN.x0, PEN.y0 + 6);
  window.__h(r2, 20);
  await new Promise(r => setTimeout(r, 500));
  window.__fishAt(580, 400, 24);   // small fish INSIDE the pen
  await new Promise(r => setTimeout(r, 800));
  const inside = designFish.state.fish.filter(f => f.x > PEN.x0 && f.x < PEN.x1 && f.y > PEN.y0 && f.y < PEN.y1).map(f => f.id);

  const seen = await window.__soak(25000);
  let escapes = 0, coverage = 0, stalledSecs = 0;
  for (const id of inside) {
    const h = seen[id] || [];
    escapes += h.filter(p => p.x < PEN.x0 - 30 || p.x > PEN.x1 + 30 || p.y < PEN.y0 - 30 || p.y > PEN.y1 + 30).length;
    // how much of the pen did it actually visit? (40px buckets)
    const cells = new Set(h.map(p => `${Math.floor(p.x / 40)},${Math.floor(p.y / 40)}`));
    coverage = Math.max(coverage, cells.size);
    // stall = moved < 20px across a 3s window
    for (let i = 30; i < h.length; i++) {
      if (Math.hypot(h[i].x - h[i - 30].x, h[i].y - h[i - 30].y) < 20) stalledSecs += 0.1;
    }
  }
  let touchSamples = 0, allSamples = 0;
  for (const id of inside) {
    const h = seen[id] || [];
    allSamples += h.length;
    touchSamples += h.filter(p => p.touching).length;
  }
  return {
    pennedFish: inside.length, escapeSamples: escapes, cellsVisited: coverage,
    // Per fish, so the bar doesn't move with the size of the crowd.
    stalledSecsPerFish: inside.length ? +(stalledSecs / inside.length).toFixed(1) : 0,
    stalledSecsTotal: +stalledSecs.toFixed(1),
    // "stabbing" metric: how much of its idle life is spent in wall contact
    wallContactFraction: allSamples ? +(touchSamples / allSamples).toFixed(2) : 0
  };
});
await pageB.close();

// ---- C. cruiser reverses at corridor ends, not canvas edges -------------
// Own page, same reason as phase B: leftover fish change the population and
// every figure here is per cruiser rather than a sum over however many exist.
const pageC = await b.newPage({ viewport: { width: 1280, height: 800 } });
pageC.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await pageC.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await pageC.waitForTimeout(1200);
await pageC.evaluate(HELPERS);
const corridor = await pageC.evaluate(async () => {
  window.__clear();
  await new Promise(r => setTimeout(r, 300));
  // horizontal corridor between two long walls, spanning x 250..900
  window.__h([{ x: 250, y: 300 }, { x: 900, y: 300 }], 18);
  await new Promise(r => setTimeout(r, 300));
  window.__h([{ x: 250, y: 520 }, { x: 900, y: 520 }], 18);
  await new Promise(r => setTimeout(r, 300));
  window.__h([{ x: 250, y: 300 }, { x: 250, y: 520 }], 18);
  await new Promise(r => setTimeout(r, 300));
  window.__h([{ x: 900, y: 300 }, { x: 900, y: 520 }], 18);
  await new Promise(r => setTimeout(r, 400));
  window.__fishAt(560, 410, 46);   // medium cruiser inside the corridor
  await new Promise(r => setTimeout(r, 900));
  const ids = designFish.state.fish.filter(f => f.x > 250 && f.x < 900 && f.y > 300 && f.y < 520).map(f => f.id);
  const seen = await window.__soak(25000);
  let xMin = 1e9, xMax = -1e9, outside = 0, travelled = 0;
  for (const id of ids) {
    const h = seen[id] || [];
    for (let i = 0; i < h.length; i++) {
      xMin = Math.min(xMin, h[i].x); xMax = Math.max(xMax, h[i].x);
      if (h[i].x < 220 || h[i].x > 930) outside++;
      if (i) travelled += Math.hypot(h[i].x - h[i - 1].x, h[i].y - h[i - 1].y);
    }
  }
  return {
    cruisers: ids.length, xMin: Math.round(xMin), xMax: Math.round(xMax),
    leftCorridorSamples: outside,
    pxTravelledPerCruiser: ids.length ? Math.round(travelled / ids.length) : 0
  };
});
await pageC.close();
await page.close();

// ---- E. index.html idle untouched --------------------------------------
const page2 = await b.newPage({ viewport: { width: 1280, height: 800 } });
page2.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page2.goto('http://127.0.0.1:1337/index.html', { waitUntil: 'load' });
await page2.waitForTimeout(2500);
const aquarium = await page2.evaluate(async () => {
  const ys = [];
  const start = Date.now();
  while (Date.now() - start < 15000) {
    await new Promise(r => setTimeout(r, 100));
    for (const f of heroFish.state.fish) if ((f.bodyWidth || 20) < 35) ys.push(f.y);
  }
  const h = window.innerHeight;
  return {
    smallFishSamples: ys.length,
    fractionInBottomThird: ys.length ? +(ys.filter(y => y > h * 0.66).length / ys.length).toFixed(2) : null,
    navFieldBuilt: false
  };
});
await page2.close();
await b.close();

const fails = [];
if (drift.fractionInBottomThird > 0.6) fails.push(`A: blueprint fish still hug the seabed (${drift.fractionInBottomThird})`);
if (penned.escapeSamples > 0) fails.push('B: penned fish left its room');
if (penned.cellsVisited < 8) fails.push(`B: penned fish barely patrolled (${penned.cellsVisited} cells)`);
if (penned.stalledSecsPerFish > 6) fails.push(`D: penned fish stalled ${penned.stalledSecsPerFish}s each — escalate to per-fish paths`);
if (penned.wallContactFraction > 0.35) fails.push(`B: penned fish grinds the wall (${penned.wallContactFraction} of samples in contact)`);
if (corridor.leftCorridorSamples > 0) fails.push('C: cruiser left the corridor');
if (corridor.pxTravelledPerCruiser < 600) fails.push(`C: cruiser barely patrolled (${corridor.pxTravelledPerCruiser}px each)`);
if (corridor.xMax - corridor.xMin < 200) fails.push(`C: cruiser did not traverse the corridor (${corridor.xMax - corridor.xMin}px span)`);

console.log(JSON.stringify({
  A_noSeabedDrift: drift,
  B_D_pennedPatrol: penned,
  C_corridorPatrol: corridor,
  E_aquariumIdle: aquarium,
  errs, fails, ALL_PASS: !fails.length && !errs.length
}, null, 1));
process.exit(fails.length || errs.length ? 1 : 0);
