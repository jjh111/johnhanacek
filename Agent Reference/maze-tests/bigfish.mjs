import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await (await b.newContext({viewport:{width:1280,height:860}})).newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:1337/design.html', {waitUntil:'load'});
await p.waitForFunction(() => window.designFish, null, {timeout:15000});
await p.waitForTimeout(500);

const out = await p.evaluate(async () => {
  const g = window.designFish;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const W = innerWidth, H = innerHeight;
  const mkfish = (x,y,r) => { const pts=[];
    for (let a=0.6; a<=Math.PI*2+1.4; a+=0.18) pts.push({x:x+Math.cos(a)*r, y:y+Math.sin(a)*r*0.72});
    g.processStroke(pts, ['fish']); };

  const rows = [];
  for (const [label, radius] of [['small', 22], ['medium', 46], ['large', 92]]) {
    g.clearFish(); g.setObstacles([]); await sleep(80);
    // A box in the middle: fish have to get round it.
    g.setObstacles([
      { id:1, x: W*0.5, y: H*0.66, width: 320, height: 26 },
      { id:2, x: W*0.5 - 160, y: H*0.66, width: 26, height: 240 },
      { id:3, x: W*0.5 + 160, y: H*0.66, width: 26, height: 240 },
    ]);
    mkfish(W*0.22, H*0.5, radius);
    await sleep(150);
    const f = g.state.fish[g.state.fish.length-1];
    if (!f) { rows.push({label, err:'no fish'}); continue; }
    const bw = f.bodyWidth;
    // Sample: contact fraction, stall fraction, and heading-into-wall while touching
    let samples=0, contact=0, stalled=0, intoWall=0, pathLen=0;
    let px=f.x, py=f.y;
    g.addFood(W*0.80, H*0.5);
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      await sleep(50);
      samples++;
      const sp = Math.hypot(f.vx||0, f.vy||0);
      pathLen += Math.hypot(f.x-px, f.y-py); px=f.x; py=f.y;
      const touching = f.lastWallContact && Date.now()-f.lastWallContact < 120;
      if (touching) {
        contact++;
        if (sp < 0.6) stalled++;
      }
      if (sp < 0.35) stalled += 0; // counted above only when touching
    }
    const fd = g.state.food[0];
    rows.push({ label, bw: Math.round(bw), samples,
      contactPct: Math.round(100*contact/samples),
      stalledWhileTouchingPct: contact ? Math.round(100*stalled/contact) : 0,
      pathPx: Math.round(pathLen), ateFood: !fd,
      distToFood: fd ? Math.round(Math.hypot(fd.x-f.x, fd.y-f.y)) : 0,
      simpleMode: f.state === 'idle' && bw >= 60 });
  }
  return rows;
});
console.log('tier    bw   contact%  stalledWhileTouching%  pathPx  ate  distLeft');
out.forEach(r => r.err ? console.log(r.label, r.err) : console.log(
  `${r.label.padEnd(7)} ${String(r.bw).padEnd(4)} ${String(r.contactPct).padStart(7)}%  ${String(r.stalledWhileTouchingPct).padStart(20)}%  ${String(r.pathPx).padStart(6)}  ${String(r.ateFood).padEnd(4)} ${r.distToFood}`));
await b.close();
